import type {
  CourseCatalog,
  GenEdRequirements,
  MajorRequirements,
  PlanEvaluation,
  StudentPlan,
  TransferEquivalencyWithCost,
  TransferSortKey,
} from "../types";
import { evaluatePlan as runEvaluate } from "../engine/evaluatePlan";

/**
 * Static, server-less data layer.
 *
 * All reference data ships as static JSON in /public/data and is fetched from
 * the CDN. The requirement/cost engine runs in the browser, and the student's
 * plan is persisted to localStorage — so the whole app is a static site with
 * no backend to deploy or fail, and the plan survives page refreshes.
 */

const DATA = (name: string) => `/data/${name}.json`;
const PLAN_KEY = "transfr:plan:v1";

async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(DATA(name));
  if (!res.ok) throw new Error(`Failed to load ${name}.json: ${res.status}`);
  return res.json() as Promise<T>;
}

/* ---- cached reference data ---- */

interface CoreData {
  catalog: CourseCatalog;
  major: MajorRequirements;
  genEd: GenEdRequirements;
  cost: Record<string, any>;
}
let corePromise: Promise<CoreData> | null = null;
function loadCore(): Promise<CoreData> {
  if (!corePromise) {
    corePromise = Promise.all([
      fetchJson<CourseCatalog>("courses-catalog"),
      fetchJson<MajorRequirements>("major-requirements"),
      fetchJson<GenEdRequirements>("gen-ed-requirements"),
      fetchJson<Record<string, any>>("school-cost-data").catch(() => ({})),
    ]).then(([catalog, major, genEd, cost]) => ({ catalog, major, genEd, cost }));
  }
  return corePromise;
}

// The transfer table is large (~10MB), so only load it when actually needed.
let transferPromise: Promise<any[]> | null = null;
function loadTransfer(): Promise<any[]> {
  if (!transferPromise) {
    transferPromise = fetchJson<any[]>("transfer-equivalencies");
  }
  return transferPromise;
}

/* ---- plan persistence (localStorage) ---- */

function emptyPlan(): StudentPlan {
  const terms: Array<{ term: string; year: number }> = [];
  const startYear = new Date().getFullYear();
  for (let y = 0; y < 4; y++) {
    terms.push({ term: "Fall", year: startYear + y });
    terms.push({ term: "Spring", year: startYear + y + 1 });
    terms.push({ term: "Summer", year: startYear + y + 1 });
  }
  return {
    id: "default",
    majorId: "cs-bs-2023",
    updatedAt: new Date().toISOString(),
    semesters: terms.map((t, idx) => ({
      id: `sem-${idx}`,
      term: t.term,
      year: t.year,
      courses: [],
    })),
  } as StudentPlan;
}

function loadPlan(): StudentPlan {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (raw) {
      const plan = JSON.parse(raw) as StudentPlan;
      if (plan?.semesters?.some((s) => s.term === "Summer")) return plan;
    }
  } catch {
    /* ignore unavailable/corrupt storage */
  }
  return emptyPlan();
}

/* ---- transfer helpers (mirror the old server) ---- */

const withCost = (cost: Record<string, any>) => (eq: any) => ({
  ...eq,
  cost: cost[eq.externalSchool] ?? null,
});

function sortEquivalencies(rows: any[], key: TransferSortKey): any[] {
  const costOf = (r: any) => r.cost?.costPerCreditInState ?? null;
  const onlineOf = (r: any) => r.cost?.onlineSharePct ?? null;
  return [...rows].sort((a, b) => {
    if (key === "school") return a.externalSchool.localeCompare(b.externalSchool);
    if (key === "online-desc") {
      const oa = onlineOf(a), ob = onlineOf(b);
      if (oa == null && ob == null) return 0;
      if (oa == null) return 1;
      if (ob == null) return -1;
      return ob - oa;
    }
    const ca = costOf(a), cb = costOf(b);
    if (ca == null && cb == null) return 0;
    if (ca == null) return 1;
    if (cb == null) return -1;
    return key === "cost-asc" ? ca - cb : cb - ca;
  });
}

/* ---- public API (same shape as before) ---- */

export const api = {
  getMajorRequirements: async () => (await loadCore()).major,
  getGenEdRequirements: async () => (await loadCore()).genEd,
  getCourseCatalog: async () => (await loadCore()).catalog,

  getPlan: async (): Promise<StudentPlan> => loadPlan(),

  savePlan: async (plan: StudentPlan): Promise<StudentPlan> => {
    plan.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    } catch {
      /* storage may be unavailable (private mode); keep working in-memory */
    }
    return plan;
  },

  evaluatePlan: async (plan: StudentPlan): Promise<PlanEvaluation> => {
    const { catalog, major, genEd, cost } = await loadCore();
    return runEvaluate(
      plan as any,
      major as any,
      genEd as any,
      catalog as any,
      cost as any
    ) as PlanEvaluation;
  },

  getTransferEquivalencies: async (): Promise<TransferEquivalencyWithCost[]> => {
    const [rows, core] = await Promise.all([loadTransfer(), loadCore()]);
    return rows.map(withCost(core.cost));
  },

  searchTransferEquivalencies: async (
    q: string,
    sort: TransferSortKey = "cost-asc"
  ): Promise<TransferEquivalencyWithCost[]> => {
    const [rows, core] = await Promise.all([loadTransfer(), loadCore()]);
    const qq = q.trim().toUpperCase();
    let matched = rows;
    if (qq) {
      matched = rows.filter(
        (eq: any) =>
          eq.externalSchool.toUpperCase().includes(qq) ||
          eq.externalCourse.code.toUpperCase().includes(qq) ||
          eq.externalCourse.title.toUpperCase().includes(qq) ||
          eq.pittCourse.code.toUpperCase().includes(qq) ||
          (eq.pittCourse.title ?? "").toUpperCase().includes(qq)
      );
    }
    return sortEquivalencies(matched.map(withCost(core.cost)), sort).slice(0, 100);
  },
};
