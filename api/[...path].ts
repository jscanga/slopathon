// @ts-nocheck
/**
 * Vercel serverless API for transfr — a single catch-all function that serves
 * every /api/* route. Everything is bundled at build time: the reference data
 * is imported as JSON (esbuild inlines it, so there is no filesystem read at
 * runtime) and the evaluation engine is imported directly from the server
 * package. The plan is held in memory per warm instance — Vercel's filesystem
 * is read-only, so saves do not persist across cold starts (fine for a demo;
 * the client keeps the working plan in React state during a session).
 */
import { evaluatePlan } from "../server/src/engine/evaluatePlan";
import majorRequirements from "../server/src/data/major-requirements.json";
import genEdRequirements from "../server/src/data/gen-ed-requirements.json";
import courseCatalog from "../server/src/data/courses-catalog.json";
import transferEquivalencies from "../server/src/data/transfer-equivalencies.json";
import schoolCostData from "../server/src/data/school-cost-data.json";

/* ---------- in-memory plan (per warm instance) ---------- */

function emptyPlan() {
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
  };
}

let currentPlan: any = emptyPlan();

/* ---------- transfer helpers (mirrors server/src/index.ts) ---------- */

const withCost = (eq: any) => ({
  ...eq,
  cost: (schoolCostData as any)[eq.externalSchool] ?? null,
});

function sortEquivalencies(rows: any[], key: string): any[] {
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

/* ---------- request helpers ---------- */

async function readBody(req: any): Promise<any> {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(res: any, status: number, data: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

/* ---------- handler ---------- */

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = (req.method || "GET").toUpperCase();

  try {
    if (method === "GET" && p === "/major-requirements") return send(res, 200, majorRequirements);
    if (method === "GET" && p === "/gen-ed-requirements") return send(res, 200, genEdRequirements);
    if (method === "GET" && p === "/courses") return send(res, 200, courseCatalog);

    if (method === "GET" && p === "/courses/search") {
      const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
      if (!q) return send(res, 200, []);
      const results = Object.entries(courseCatalog as any)
        .filter(([code, info]: any) =>
          code.toUpperCase().includes(q) || info.name.toUpperCase().includes(q))
        .slice(0, 50)
        .map(([code, info]: any) => ({ code, ...info }));
      return send(res, 200, results);
    }

    if (p === "/plan") {
      if (method === "GET") return send(res, 200, currentPlan);
      if (method === "PUT") {
        const incoming = await readBody(req);
        incoming.updatedAt = new Date().toISOString();
        currentPlan = incoming;
        return send(res, 200, currentPlan);
      }
    }

    if (p === "/plan/evaluation") {
      const plan = method === "POST" ? await readBody(req) : currentPlan;
      const evaluation = evaluatePlan(
        plan, majorRequirements as any, genEdRequirements as any,
        courseCatalog as any, schoolCostData as any
      );
      return send(res, 200, evaluation);
    }

    if (method === "GET" && p === "/transfer-equivalencies") {
      return send(res, 200, (transferEquivalencies as any[]).map(withCost));
    }

    if (method === "GET" && p === "/transfer-equivalencies/search") {
      const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
      const sort = url.searchParams.get("sort") || "cost-asc";
      let matched = transferEquivalencies as any[];
      if (q) {
        matched = matched.filter((eq) =>
          eq.externalSchool.toUpperCase().includes(q) ||
          eq.externalCourse.code.toUpperCase().includes(q) ||
          eq.externalCourse.title.toUpperCase().includes(q) ||
          eq.pittCourse.code.toUpperCase().includes(q) ||
          (eq.pittCourse.title ?? "").toUpperCase().includes(q));
      }
      const sorted = sortEquivalencies(matched.map(withCost), sort);
      return send(res, 200, sorted.slice(0, 100));
    }

    return send(res, 404, { error: `No route for ${method} ${p}` });
  } catch (err: any) {
    return send(res, 500, { error: String(err?.message ?? err) });
  }
}
