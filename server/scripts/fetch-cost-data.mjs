/**
 * Fetches cost + online-learning data from the U.S. Dept. of Education
 * College Scorecard API for every school named in the transfer
 * equivalency file, and writes it to
 *   server/src/data/school-cost-data.json
 *
 * WHY THIS IS A STANDALONE SCRIPT (not part of the server):
 * - It hits an external API with rate limits (1,000 req/hr) and takes a
 *   while to run. You run it once (or occasionally to refresh), not on
 *   every server boot.
 * - It needs a free data.gov API key.
 *
 * SETUP:
 *   1. Get a free key at https://api.data.gov/signup/  (instant email).
 *   2. Run from the server/ directory:
 *        SCORECARD_API_KEY=your_key_here node scripts/fetch-cost-data.mjs
 *
 * RESUMABLE:
 *   Progress is checkpointed to school-cost-data.json every 10 schools and
 *   on Ctrl-C. The script skips schools already present in that file on
 *   startup, so you can stop anytime (e.g. when rate-limited) and re-run
 *   the same command later to pick up where you left off. The rate limit
 *   is 1,000 requests/hour per IP and this makes up to 2 requests/school,
 *   so a full ~1,800-school run realistically spans a few sessions.
 *
 * IMPORTANT DATA CAVEAT — "cost per credit" is DERIVED, not native:
 *   College Scorecard reports ANNUAL tuition, not a per-credit rate. There
 *   is no official per-credit field. This script derives an estimate as
 *   (in-state annual tuition) / ASSUMED_CREDITS_PER_YEAR. That's an
 *   approximation: real per-credit tuition varies by part/full-time status,
 *   residency, and program. The stored object keeps the raw annual figures
 *   too, so the UI can be honest about what's an estimate.
 *
 * MATCHING CAVEAT:
 *   Your equivalency file has ALL-CAPS school names with no IDs. Scorecard
 *   is matched by fuzzy name search, so not every school will resolve —
 *   unmatched schools are written with nulls and the app shows "—" for
 *   them (and sorts them last), exactly as intended.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const EQUIV_PATH = path.join(DATA_DIR, "transfer-equivalencies.json");
const OUT_PATH = path.join(DATA_DIR, "school-cost-data.json");

const API_KEY = process.env.SCORECARD_API_KEY;
if (!API_KEY) {
  console.error(
    "Missing SCORECARD_API_KEY. Get a free key at https://api.data.gov/signup/\n" +
      "Then run: SCORECARD_API_KEY=your_key node scripts/fetch-cost-data.mjs"
  );
  process.exit(1);
}

const ASSUMED_CREDITS_PER_YEAR = 30; // 15 credits/semester × 2 semesters

const BASE = "https://api.data.gov/ed/collegescorecard/v1/schools";
// Fields we pull. Names per the Scorecard data dictionary:
// - latest.cost.tuition.in_state / out_of_state : annual tuition $
// - latest.student.demographics.... not needed
// - latest.academics ... not needed
// - latest.student.enrollment.all : total enrollment (context)
// - latest.programs... not needed
// - latest.student.share_firstgeneration ... not needed
// Distance-only share: latest.student.students_with_pell... no —
//   distance learning share lives at
//   latest.student.enrollment.grad_12_month / ... varies; we use
//   latest.academics.program_available.distance_learning? Not reliable.
//   The stable field is:
//   latest.student.demographics.... none. We use
//   "latest.student.enrollment.distance_education" style via the
//   aid/enrollment block. The documented field is:
//   latest.student.share_distance_education (fraction 0..1).
const FIELDS = [
  "id",
  "school.name",
  "school.state",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.student.size",
  "latest.student.share_distance_education",
].join(",");

/** Normalize a school name for fuzzy comparison. */
function norm(s) {
  return s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\bUNIV\b/g, "UNIVERSITY")
    .replace(/\bCC\b/g, "COMMUNITY COLLEGE")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchSchool(name) {
  // Try an exact-ish name search first, then fall back to the first
  // significant words.
  const attempts = [name, name.split(/\s+/).slice(0, 4).join(" ")];
  for (const attempt of attempts) {
    const url =
      `${BASE}?api_key=${API_KEY}` +
      `&school.name=${encodeURIComponent(attempt)}` +
      `&fields=${FIELDS}&per_page=20`;
    const res = await fetch(url);
    if (res.status === 429) {
      console.error("Rate limited (429). Waiting 60s…");
      await new Promise((r) => setTimeout(r, 60000));
      return searchSchool(name);
    }
    if (!res.ok) continue;
    const json = await res.json();
    if (json.results && json.results.length > 0) {
      // pick the best fuzzy match by normalized name
      const target = norm(name);
      let best = null;
      let bestScore = -1;
      for (const r of json.results) {
        const candidate = norm(r["school.name"] ?? "");
        let score = 0;
        if (candidate === target) score = 100;
        else if (candidate.includes(target) || target.includes(candidate)) score = 50;
        else {
          const a = new Set(target.split(" "));
          const b = new Set(candidate.split(" "));
          const overlap = [...a].filter((w) => b.has(w)).length;
          score = overlap;
        }
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (best && bestScore > 0) return best;
    }
  }
  return null;
}

async function main() {
  const raw = JSON.parse(await readFile(EQUIV_PATH, "utf-8"));
  const schools = [...new Set(raw.map((e) => e.externalSchool))].sort();

  // Resume: load whatever we've already written and skip those schools, so
  // stopping (Ctrl-C, crash, or rate-limit give-up) and re-running later
  // picks up where it left off rather than starting over.
  let out = {};
  try {
    out = JSON.parse(await readFile(OUT_PATH, "utf-8"));
    console.log(`Resuming — ${Object.keys(out).length} schools already saved.`);
  } catch {
    console.log("Starting fresh (no existing output file).");
  }

  const remaining = schools.filter((name) => !(name in out));
  console.log(
    `${remaining.length} of ${schools.length} schools left to fetch.`
  );

  let matched = Object.values(out).filter(Boolean).length;

  async function checkpoint() {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
  }

  // Save on Ctrl-C too, so an interrupt mid-batch still flushes what's in
  // memory since the last checkpoint.
  let interrupted = false;
  process.on("SIGINT", async () => {
    if (interrupted) process.exit(1);
    interrupted = true;
    console.log("\nInterrupted — saving progress before exit…");
    await checkpoint();
    console.log(`Saved ${Object.keys(out).length} schools. Re-run to resume.`);
    process.exit(0);
  });

  for (let i = 0; i < remaining.length; i++) {
    if (interrupted) break;
    const name = remaining[i];
    try {
      const r = await searchSchool(name);
      if (r) {
        const inState = r["latest.cost.tuition.in_state"] ?? null;
        const outState = r["latest.cost.tuition.out_of_state"] ?? null;
        const distanceShare = r["latest.student.share_distance_education"] ?? null;
        out[name] = {
          matchedName: r["school.name"] ?? null,
          state: r["school.state"] ?? null,
          annualTuitionInState: inState,
          annualTuitionOutState: outState,
          costPerCreditInState:
            inState != null ? Math.round(inState / ASSUMED_CREDITS_PER_YEAR) : null,
          costPerCreditOutState:
            outState != null ? Math.round(outState / ASSUMED_CREDITS_PER_YEAR) : null,
          onlineSharePct:
            distanceShare != null ? Math.round(distanceShare * 100) : null,
          creditsPerYearAssumed: ASSUMED_CREDITS_PER_YEAR,
          source: "college-scorecard",
        };
        matched++;
      } else {
        out[name] = null;
      }
    } catch (err) {
      console.error(`Error on "${name}":`, err.message);
      out[name] = null;
    }

    // Checkpoint every 10 schools, so an unclean stop loses at most ~10.
    if (i % 10 === 0) {
      await checkpoint();
      console.log(
        `  ${i}/${remaining.length} this run (${matched} matched total)`
      );
    }
    // gentle pacing to stay under the rate limit
    await new Promise((r) => setTimeout(r, 120));
  }

  await checkpoint();
  console.log(
    `Done. ${matched}/${schools.length} schools matched. Wrote ${OUT_PATH}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
