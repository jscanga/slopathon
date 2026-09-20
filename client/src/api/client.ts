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
import {
  autocompletePlan as runAutocomplete,
  type AutocompleteResult,
  type TransferIndex,
} from "../engine/autocomplete";
import { effectiveRate } from "../lib/residency";

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

// Attach the school's cost record, enriched with the residency-aware effective
// per-credit rate (PA resident: in-state at PA schools, out-of-state elsewhere).
const withCost = (costMap: Record<string, any>) => (eq: any) => {
  const raw = costMap[eq.externalSchool] ?? null;
  const cost = raw ? { ...raw, ...effectiveRate(raw) } : null;
  return { ...eq, cost };
};

function sortEquivalencies(rows: any[], key: TransferSortKey): any[] {
  const costOf = (r: any) => r.cost?.effectivePerCredit ?? null;
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

/* ---- cheapest transfer option per Pitt course ---- */

/**
 * Collapses the 43k-row equivalency table into one row per Pitt course: the
 * cheapest school you could take it at. Generic department placeholders
 * (e.g. MATH 0000) are skipped — they transfer as unallocated credit and
 * satisfy no specific requirement, so autocomplete must not treat them as a
 * way to tick a box. Built once, then cached.
 */
let indexPromise: Promise<TransferIndex> | null = null;
function loadTransferIndex(): Promise<TransferIndex> {
  if (!indexPromise) {
    indexPromise = Promise.all([loadTransfer(), loadCore()]).then(([rows, core]) => {
      const index: TransferIndex = {};
      for (const eq of rows) {
        if (eq.isGenericPlaceholder) continue;
        const pittCode = eq.pittCourse?.code;
        if (!pittCode) continue;
        const { effectivePerCredit } = effectiveRate(core.cost[eq.externalSchool]);
        if (effectivePerCredit == null) continue;
        // Bill the same credits computeCost() would: the sending school's
        // figure when it stated one, else the Pitt catalog's.
        const billed = eq.externalCourse?.credits ?? core.catalog[pittCode]?.credits ?? 3;
        const totalCost = effectivePerCredit * billed;
        const current = index[pittCode];
        if (current && current.totalCost <= totalCost) continue;
        index[pittCode] = {
          school: eq.externalSchool,
          code: eq.externalCourse?.code ?? "",
          title: eq.externalCourse?.title,
          credits: eq.externalCourse?.credits,
          perCredit: effectivePerCredit,
          onlineSharePct: core.cost[eq.externalSchool]?.onlineSharePct ?? null,
          totalCost,
        };
      }
      return index;
    });
  }
  return indexPromise;
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

  /**
   * Fills every unsatisfied requirement and lays the result across the 12
   * terms, routing courses to cheaper schools where that lowers the total.
   * Returns a proposal — the caller decides whether to commit it.
   */
  autocompletePlan: async (plan: StudentPlan): Promise<AutocompleteResult> => {
    const [core, index] = await Promise.all([loadCore(), loadTransferIndex()]);
    return runAutocomplete(
      plan,
      core.major,
      core.genEd,
      core.catalog,
      index,
      core.cost
    );
  },

  /** `minOnlinePct` filters to schools whose online share is at least that
   *  percentage. It is applied across ALL matches, before the 100-row cap —
   *  filtering the capped page instead would only ever search the cheapest
   *  100 rows for online options. Schools with no online data are excluded
   *  once a threshold is set (unknown is not "meets the bar"). */
  searchTransferEquivalencies: async (
    q: string,
    sort: TransferSortKey = "cost-asc",
    minOnlinePct = 0
  ): Promise<TransferEquivalencyWithCost[]> => {
    const [rows, core] = await Promise.all([loadTransfer(), loadCore()]);
    const qq = q.trim().toUpperCase();
    let matched = rows;
    if (qq) {
      // Search by the PITT course you need — code, title, or catalog name.
      matched = rows.filter((eq: any) => {
        const code = (eq.pittCourse?.code ?? "").toUpperCase();
        const title = (eq.pittCourse?.title ?? "").toUpperCase();
        const name = (core.catalog[eq.pittCourse?.code]?.name ?? "").toUpperCase();
        return code.includes(qq) || title.includes(qq) || name.includes(qq);
      });
    }
    let priced = matched.map(withCost(core.cost));
    if (minOnlinePct > 0) {
      priced = priced.filter((eq) => (eq.cost?.onlineSharePct ?? -1) >= minOnlinePct);
    }
    return sortEquivalencies(priced, sort).slice(0, 100);
  },
};
