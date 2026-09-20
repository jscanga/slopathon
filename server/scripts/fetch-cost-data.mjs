/**
 * Populates cost-per-credit + % online for every school in the transfer
 * equivalency file, from the U.S. Dept. of Education College Scorecard API.
 *
 * STRATEGY (fast): instead of a fuzzy name-search per school (~3,600 requests,
 * hours), this ENUMERATES every institution once via paginated requests
 * (~60 requests, seconds), builds a normalized-name index, then matches the
 * ~1,800 school names locally. Way under the 1,000 req/hr limit.
 *
 * SETUP:
 *   1. Get a free key at https://api.data.gov/signup/  (instant email).
 *   2. From the server/ directory:
 *        Windows PowerShell:
 *          $env:SCORECARD_API_KEY="your_key"; node scripts/fetch-cost-data.mjs
 *        macOS/Linux:
 *          SCORECARD_API_KEY=your_key node scripts/fetch-cost-data.mjs
 *
 * OUTPUT: writes school-cost-data.json to BOTH
 *   - server/src/data/school-cost-data.json      (server copy)
 *   - client/public/data/school-cost-data.json   (what the deployed app reads)
 *
 * DATA CAVEAT — "cost per credit" is DERIVED, not native. College Scorecard
 * reports ANNUAL tuition; there is no official per-credit field. We estimate
 * (in-state annual tuition) / ASSUMED_CREDITS_PER_YEAR. The raw annual figures
 * are kept too so the UI can stay honest. "% online" is the Scorecard
 * share_distance_education field (students enrolled exclusively in distance ed).
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DATA = path.join(__dirname, "..", "src", "data");
const CLIENT_DATA = path.join(__dirname, "..", "..", "client", "public", "data");
const EQUIV_PATH = path.join(SERVER_DATA, "transfer-equivalencies.json");
const OUT_PATHS = [
  path.join(SERVER_DATA, "school-cost-data.json"),
  path.join(CLIENT_DATA, "school-cost-data.json"),
];

const API_KEY = process.env.SCORECARD_API_KEY;
if (!API_KEY) {
  console.error(
    "Missing SCORECARD_API_KEY. Get a free key at https://api.data.gov/signup/\n" +
      'PowerShell:  $env:SCORECARD_API_KEY="your_key"; node scripts/fetch-cost-data.mjs\n' +
      "bash:        SCORECARD_API_KEY=your_key node scripts/fetch-cost-data.mjs"
  );
  process.exit(1);
}

const ASSUMED_CREDITS_PER_YEAR = 30; // 15 credits/semester × 2 semesters
const BASE = "https://api.data.gov/ed/collegescorecard/v1/schools";
const FIELDS = [
  "school.name",
  "school.state",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.student.share_distance_education",
].join(",");

/** Normalize a school name for fuzzy comparison. */
function norm(s) {
  return String(s)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\bUNIV\b/g, "UNIVERSITY")
    .replace(/\bCC\b/g, "COMMUNITY COLLEGE")
    .replace(/\s+/g, " ")
    .trim();
}

async function getPage(page) {
  const url =
    `${BASE}?api_key=${API_KEY}` + `&fields=${FIELDS}&per_page=100&page=${page}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      console.error("Rate limited (429). Waiting 60s…");
      await new Promise((r) => setTimeout(r, 60000));
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status} on page ${page}`);
    return res.json();
  }
  throw new Error(`Giving up on page ${page} after repeated 429s`);
}

async function enumerateAll() {
  const first = await getPage(0);
  const total = first.metadata?.total ?? 0;
  const perPage = first.metadata?.per_page ?? 100;
  const pages = Math.ceil(total / perPage);
  console.log(`College Scorecard: ${total} institutions across ${pages} pages.`);

  const all = [...(first.results ?? [])];
  for (let p = 1; p < pages; p++) {
    const json = await getPage(p);
    all.push(...(json.results ?? []));
    if (p % 10 === 0) console.log(`  fetched page ${p}/${pages - 1}…`);
    await new Promise((r) => setTimeout(r, 80)); // gentle pacing
  }
  console.log(`Fetched ${all.length} institution records.`);
  return all;
}

function buildIndex(records) {
  const index = new Map(); // normalized name -> best record
  for (const r of records) {
    const name = r["school.name"];
    if (!name) continue;
    const key = norm(name);
    const hasTuition = r["latest.cost.tuition.in_state"] != null;
    const existing = index.get(key);
    if (!existing || (hasTuition && existing["latest.cost.tuition.in_state"] == null)) {
      index.set(key, r);
    }
  }
  return index;
}

function bestMatch(name, index) {
  const target = norm(name);
  if (index.has(target)) return index.get(target);
  let best = null, bestScore = 0;
  for (const [key, rec] of index) {
    let score = 0;
    if (key.includes(target) || target.includes(key)) score = 50;
    else {
      const a = new Set(target.split(" "));
      const b = new Set(key.split(" "));
      score = [...a].filter((w) => b.has(w)).length;
    }
    if (score > bestScore) { bestScore = score; best = rec; }
  }
  return bestScore > 0 ? best : null;
}

function toCostRecord(r) {
  if (!r) return null;
  const inState = r["latest.cost.tuition.in_state"] ?? null;
  const outState = r["latest.cost.tuition.out_of_state"] ?? null;
  const distanceShare = r["latest.student.share_distance_education"] ?? null;
  return {
    matchedName: r["school.name"] ?? null,
    state: r["school.state"] ?? null,
    annualTuitionInState: inState,
    annualTuitionOutState: outState,
    costPerCreditInState:
      inState != null ? Math.round(inState / ASSUMED_CREDITS_PER_YEAR) : null,
    costPerCreditOutState:
      outState != null ? Math.round(outState / ASSUMED_CREDITS_PER_YEAR) : null,
    onlineSharePct: distanceShare != null ? Math.round(distanceShare * 100) : null,
    creditsPerYearAssumed: ASSUMED_CREDITS_PER_YEAR,
    source: "college-scorecard",
  };
}

async function main() {
  const equiv = JSON.parse(await readFile(EQUIV_PATH, "utf-8"));
  const schools = [...new Set(equiv.map((e) => e.externalSchool))].sort();
  console.log(`${schools.length} distinct schools to match.`);

  const records = await enumerateAll();
  const index = buildIndex(records);

  const out = {};
  let matched = 0, withCost = 0, withOnline = 0;
  for (const name of schools) {
    const rec = toCostRecord(bestMatch(name, index));
    out[name] = rec;
    if (rec) {
      matched++;
      if (rec.costPerCreditInState != null) withCost++;
      if (rec.onlineSharePct != null) withOnline++;
    }
  }

  for (const p of OUT_PATHS) {
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(out, null, 2), "utf-8");
    console.log(`Wrote ${p}`);
  }
  console.log(
    `Done. matched ${matched}/${schools.length} | cost/credit for ${withCost} | %online for ${withOnline}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
