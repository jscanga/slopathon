import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { StudentPlan, Term } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAN_PATH = path.join(__dirname, "data", "student-plan.json");

function emptyPlan(): StudentPlan {
  // 12 blocks: Fall / Spring / Summer across 4 years.
  const terms: Array<{ term: Term; year: number }> = [];
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

export async function loadPlan(): Promise<StudentPlan> {
  try {
    const raw = await readFile(PLAN_PATH, "utf-8");
    const plan = JSON.parse(raw) as StudentPlan;
    // Migrate older 8-block plans (Fall/Spring only) to the 12-block
    // Fall/Spring/Summer layout, preserving any courses already placed.
    const hasSummer = plan.semesters.some((s) => s.term === "Summer");
    if (!hasSummer) {
      const fresh = emptyPlan();
      // copy courses from old semesters into the matching term/year if we
      // can, otherwise leave them in order into the first same-term slots.
      const byId = new Map(plan.semesters.map((s) => [s.id, s]));
      fresh.semesters = fresh.semesters.map((s) => {
        const old = byId.get(s.id);
        return old && old.term === s.term ? { ...s, courses: old.courses } : s;
      });
      await savePlan(fresh);
      return fresh;
    }
    return plan;
  } catch {
    const fresh = emptyPlan();
    await savePlan(fresh);
    return fresh;
  }
}

export async function savePlan(plan: StudentPlan): Promise<StudentPlan> {
  plan.updatedAt = new Date().toISOString();
  await writeFile(PLAN_PATH, JSON.stringify(plan, null, 2), "utf-8");
  return plan;
}
