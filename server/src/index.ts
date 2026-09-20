import express from "express";
import cors from "cors";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlan, savePlan } from "./planStore.js";
import { evaluatePlan } from "./engine/evaluatePlan.js";
import type {
  CourseCatalog,
  GenEdRequirements,
  MajorRequirements,
  StudentPlan,
  TransferEquivalency,
  TransferEquivalencyWithCost,
  SchoolCostMap,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

async function loadJson<T>(filename: string): Promise<T> {
  const raw = await readFile(path.join(DATA_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

const app = express();
app.use(cors());
app.use(express.json());

// Cache the static reference data in memory at startup.
let majorRequirements: MajorRequirements;
let genEdRequirements: GenEdRequirements;
let courseCatalog: CourseCatalog;
let transferEquivalencies: TransferEquivalency[];
let schoolCostData: SchoolCostMap;

async function loadReferenceData() {
  majorRequirements = await loadJson<MajorRequirements>("major-requirements.json");
  genEdRequirements = await loadJson<GenEdRequirements>("gen-ed-requirements.json");
  courseCatalog = await loadJson<CourseCatalog>("courses-catalog.json");
  transferEquivalencies = await loadJson<TransferEquivalency[]>(
    "transfer-equivalencies.json"
  );
  try {
    schoolCostData = await loadJson<SchoolCostMap>("school-cost-data.json");
  } catch {
    schoolCostData = {};
  }
}

function withCost(eq: TransferEquivalency): TransferEquivalencyWithCost {
  return { ...eq, cost: schoolCostData[eq.externalSchool] ?? null };
}

type SortKey = "cost-asc" | "cost-desc" | "school" | "online-desc";

/** Sorts equivalencies. Rows with no known cost always sink to the bottom
 *  regardless of asc/desc, so "cheapest first" never surfaces unknowns. */
function sortEquivalencies(
  rows: TransferEquivalencyWithCost[],
  key: SortKey
): TransferEquivalencyWithCost[] {
  const costOf = (r: TransferEquivalencyWithCost) =>
    r.cost?.costPerCreditInState ?? null;
  const onlineOf = (r: TransferEquivalencyWithCost) => r.cost?.onlineSharePct ?? null;

  return [...rows].sort((a, b) => {
    if (key === "school") return a.externalSchool.localeCompare(b.externalSchool);

    if (key === "online-desc") {
      const oa = onlineOf(a);
      const ob = onlineOf(b);
      if (oa == null && ob == null) return 0;
      if (oa == null) return 1;
      if (ob == null) return -1;
      return ob - oa;
    }

    // cost-asc / cost-desc
    const ca = costOf(a);
    const cb = costOf(b);
    if (ca == null && cb == null) return 0;
    if (ca == null) return 1; // unknown always last
    if (cb == null) return -1;
    return key === "cost-asc" ? ca - cb : cb - ca;
  });
}

app.get("/api/major-requirements", (_req, res) => {
  res.json(majorRequirements);
});

app.get("/api/gen-ed-requirements", (_req, res) => {
  res.json(genEdRequirements);
});

app.get("/api/courses", (_req, res) => {
  res.json(courseCatalog);
});

app.get("/api/courses/search", (req, res) => {
  const q = String(req.query.q ?? "").trim().toUpperCase();
  if (!q) {
    res.json([]);
    return;
  }
  const results = Object.entries(courseCatalog)
    .filter(
      ([code, info]) =>
        code.toUpperCase().includes(q) || info.name.toUpperCase().includes(q)
    )
    .slice(0, 50)
    .map(([code, info]) => ({ code, ...info }));
  res.json(results);
});

app.get("/api/plan", async (_req, res) => {
  const plan = await loadPlan();
  res.json(plan);
});

app.put("/api/plan", async (req, res) => {
  const incoming = req.body as StudentPlan;
  const saved = await savePlan(incoming);
  res.json(saved);
});

app.get("/api/plan/evaluation", async (_req, res) => {
  const plan = await loadPlan();
  const evaluation = evaluatePlan(plan, majorRequirements, genEdRequirements, courseCatalog, schoolCostData);
  res.json(evaluation);
});

app.post("/api/plan/evaluation", async (req, res) => {
  // Evaluate an arbitrary (not-yet-saved) plan, e.g. for live preview.
  const plan = req.body as StudentPlan;
  const evaluation = evaluatePlan(plan, majorRequirements, genEdRequirements, courseCatalog, schoolCostData);
  res.json(evaluation);
});

app.get("/api/transfer-equivalencies", (_req, res) => {
  res.json(transferEquivalencies.map(withCost));
});

app.get("/api/transfer-equivalencies/search", (req, res) => {
  const q = String(req.query.q ?? "").trim().toUpperCase();
  const sort = (String(req.query.sort ?? "cost-asc") as SortKey) || "cost-asc";

  let matched = transferEquivalencies;
  if (q) {
    matched = transferEquivalencies.filter((eq) => {
      return (
        eq.externalSchool.toUpperCase().includes(q) ||
        eq.externalCourse.code.toUpperCase().includes(q) ||
        eq.externalCourse.title.toUpperCase().includes(q) ||
        eq.pittCourse.code.toUpperCase().includes(q) ||
        (eq.pittCourse.title ?? "").toUpperCase().includes(q)
      );
    });
  }

  const enriched = matched.map(withCost);
  const sorted = sortEquivalencies(enriched, sort);
  res.json(sorted.slice(0, 100));
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

loadReferenceData()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`transfr API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to load reference data:", err);
    process.exit(1);
  });
