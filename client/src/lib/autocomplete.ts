import type { PlannedCourse, StudentPlan, Term } from "../types";

/**
 * DEMO / HARDCODED degree autocomplete.
 *
 * Fills in the courses needed to turn every CS BS requirement green, given
 * the demo import (James Scanga's What-If report). Verified against the
 * requirement engine: adding CS 1503 (ML Foundations), three upper-level
 * electives, and the CS 1980 capstone satisfies the Mathematical Foundations,
 * Upper-Level Electives (6/6), and Capstone requirements — everything else is
 * already satisfied by the imported plan.
 *
 * Placement: courses are dropped into the earliest EMPTY real term blocks
 * (e.g. Spring 2027, Summer 2027) so they read as a sensible finish to the
 * timeline, skipping the special "Other" row.
 *
 * This is intentionally not a general solver — it's a canned completion for
 * the demo. A production version would derive the missing set from the live
 * evaluation rather than hardcoding it.
 */

// The exact set that turns the imported demo plan fully green.
const AUTOCOMPLETE_COURSES: string[] = [
  "CS 1503", // Mathematical Foundations of Machine Learning
  "CS 1530", // Software Engineering        (elective)
  "CS 1550", // Intro to Operating Systems  (elective)
  "CS 1555", // Database Management Systems (elective)
  "CS 1980", // Team Project (capstone)
];

const MAX_CREDITS_PER_TERM = 15; // don't overload a single term when filling

/**
 * Returns a new plan with the autocomplete courses added. Courses already
 * present anywhere in the plan are skipped. Remaining courses are placed into
 * empty (or lightly loaded) real term blocks, preferring the earliest; if
 * there isn't room in existing terms, a new academic-year row is appended.
 */
export function autocompleteDegree(
  plan: StudentPlan,
  catalog: Record<string, { credits: number }>
): StudentPlan {
  const present = new Set(
    plan.semesters.flatMap((s) => s.courses.map((c) => c.code))
  );
  const toAdd = AUTOCOMPLETE_COURSES.filter((c) => !present.has(c));

  // Work on a deep-ish copy of the semesters (courses arrays cloned).
  const semesters = plan.semesters.map((s) => ({ ...s, courses: [...s.courses] }));

  const creditsOf = (code: string) => catalog[code]?.credits ?? 3;
  const termCredits = (courses: PlannedCourse[]) =>
    courses.reduce((sum, c) => sum + creditsOf(c.code), 0);

  const realTerms = () => semesters.filter((s) => !s.rowLabel);

  // Terms that were empty BEFORE autocompletion are the preferred targets
  // (per the demo: fill open future terms like Spring/Summer 2027). Capture
  // their ids up front so they stay "preferred" even after we drop the first
  // course into them.
  const preferredIds = new Set(
    realTerms()
      .filter((s) => s.courses.length === 0)
      .map((s) => s.id)
  );

  function tryPlaceIn(pool: typeof semesters, code: string): boolean {
    const planned: PlannedCourse = { code, source: "native" };
    for (const s of pool) {
      if (termCredits(s.courses) + creditsOf(code) <= MAX_CREDITS_PER_TERM) {
        s.courses.push(planned);
        return true;
      }
    }
    return false;
  }

  function placeCourse(code: string) {
    // 1) preferred (originally-empty) terms first
    const preferred = realTerms().filter((s) => preferredIds.has(s.id));
    if (tryPlaceIn(preferred, code)) return;
    // 2) any other real term with room
    if (tryPlaceIn(realTerms(), code)) return;
    // 3) no room anywhere — append a new academic-year row before "Other"
    const reals = realTerms();
    const baseYear = reals.length ? reals[reals.length - 1].year : new Date().getFullYear();
    const startIdx = reals.length;
    const blocks: Array<{ term: Term; year: number }> = [
      { term: "Fall", year: baseYear },
      { term: "Spring", year: baseYear + 1 },
      { term: "Summer", year: baseYear + 1 },
    ];
    const otherRows = semesters.filter((s) => s.rowLabel);
    const newRow = blocks.map((b, i) => ({
      id: `sem-${startIdx + i}`,
      term: b.term,
      year: b.year,
      courses: [] as PlannedCourse[],
    }));
    newRow[0].courses.push({ code, source: "native" });
    newRow.forEach((r) => preferredIds.add(r.id)); // new terms are also preferred
    const realOnly = semesters.filter((s) => !s.rowLabel);
    semesters.length = 0;
    semesters.push(...realOnly, ...newRow, ...otherRows);
  }

  for (const code of toAdd) placeCourse(code);

  return { ...plan, semesters, updatedAt: new Date().toISOString() };
}
