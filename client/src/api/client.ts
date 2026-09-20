import type {
  CourseCatalog,
  GenEdRequirements,
  MajorRequirements,
  PlanEvaluation,
  StudentPlan,
  TransferEquivalencyWithCost,
  TransferSortKey,
} from "../types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getMajorRequirements: () => getJson<MajorRequirements>("/api/major-requirements"),
  getGenEdRequirements: () => getJson<GenEdRequirements>("/api/gen-ed-requirements"),
  getCourseCatalog: () => getJson<CourseCatalog>("/api/courses"),
  getPlan: () => getJson<StudentPlan>("/api/plan"),
  savePlan: (plan: StudentPlan) => putJson<StudentPlan>("/api/plan", plan),
  evaluatePlan: (plan: StudentPlan) =>
    postJson<PlanEvaluation>("/api/plan/evaluation", plan),
  getTransferEquivalencies: () =>
    getJson<TransferEquivalencyWithCost[]>("/api/transfer-equivalencies"),
  searchTransferEquivalencies: (q: string, sort: TransferSortKey = "cost-asc") =>
    getJson<TransferEquivalencyWithCost[]>(
      `/api/transfer-equivalencies/search?q=${encodeURIComponent(q)}&sort=${sort}`
    ),
};
