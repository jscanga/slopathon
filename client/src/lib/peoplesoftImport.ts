import type { PlannedCourse, StudentPlan, Semester, Term } from "../types";

/**
 * Parses a University of Pittsburgh PeopleSoft "Academic Advisement What-If"
 * report PDF into a StudentPlan.
 *
 * Approach: we read the "Course History" table (the master list of every
 * course on the report), not the per-requirement sections, because history
 * lists each course exactly once with its term, subject, catalog number,
 * units, and grade — and the grade column tells us whether it's a transfer
 * or a Pitt-native course.
 *
 * Robustness notes / assumptions (documented so they're easy to revisit):
 *  - Term strings look like "2025Fall", "2026Spring", "2026Summer".
 *  - "Grade" is "Transfer" for transferred credit, "In Progress" for
 *    current/planned, or a letter/S for completed Pitt courses.
 *  - Generic transfer placeholders (catalog number "0000", e.g. "CS 0000",
 *    "ENGLIT 0000") are treated as transfer credit per the product decision.
 *  - Retaken courses appear more than once (e.g. CS 0447 with a C- and again
 *    In Progress). We keep the LATEST attempt by term and drop earlier ones,
 *    since the planner models one slot per course.
 *  - We can't recover which external school transfer credit came from (the
 *    report doesn't say), so transferFrom.school is left as "Transfer credit".
 */

const TERM_RE = /(\d{4})(Fall|Spring|Summer)/;

export interface ParsedCourseRow {
  term: string; // raw, e.g. "2025Fall"
  subject: string; // e.g. "CS"
  catalogNbr: string; // e.g. "0445"
  code: string; // "CS 0445"
  title?: string;
  units: number;
  grade: string; // "Transfer" | "In Progress" | "A" | "B+" | "S" | ...
  isTransfer: boolean;
}

export interface ParseResult {
  studentName?: string;
  rows: ParsedCourseRow[];
  warnings: string[];
}

function seasonOf(term: string): Term | null {
  const m = term.match(TERM_RE);
  if (!m) return null;
  return m[2] as Term;
}

function yearOf(term: string): number | null {
  const m = term.match(TERM_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** The Fall calendar year that begins the academic-year row a term belongs to.
 *  Fall 2025 / Spring 2026 / Summer 2026 all belong to row "Fall 2025". */
function academicYearStart(term: string): number | null {
  const y = yearOf(term);
  const s = seasonOf(term);
  if (y == null || s == null) return null;
  return s === "Fall" ? y : y - 1;
}

function isTransferGrade(grade: string, catalogNbr: string): boolean {
  if (/transfer/i.test(grade)) return true;
  // generic department placeholder => transfer credit (product decision)
  if (catalogNbr === "0000") return true;
  return false;
}

/**
 * Extract course rows from the concatenated text of the whole PDF.
 * pdf.js gives us text items; we join them per line. Course History rows are
 * the most reliable, but to be safe we scan the entire text for the row
 * pattern and de-duplicate.
 *
 * A row, once line-joined, looks like:
 *   "2025Fall BIOSC 0150 FOUNDATIONS OF BIOLOGY 1 3.00 Transfer"
 *   "2026Spring CS 0441 DISCRETE STRUCTURES FOR CS 3.00 B+"
 * i.e. TERM SUBJECT CATALOG [TITLE...] UNITS GRADE
 */
export function parseReportText(lines: string[]): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedCourseRow[] = [];

  // grade token at end: a letter grade (A, A-, B+, C-, S), "Transfer",
  // or "In Progress"
  const ROW_RE = new RegExp(
    String.raw`^(\d{4}(?:Fall|Spring|Summer))\s+` + // term
      String.raw`([A-Z]{2,8})\s+` + // subject
      String.raw`(\d{4}[A-Z]?)\s+` + // catalog nbr (e.g. 0447, 0101L)
      String.raw`(?:(.*?)\s+)?` + // optional title (non-greedy)
      String.raw`(\d+\.\d{2})\s+` + // units like 3.00
      String.raw`(Transfer|In Progress|[A-DFSWIN][+\-]?)\s*$` // grade
  );

  let studentName: string | undefined;
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;

    // student name appears near the top: "James Scanga"
    if (!studentName && /^Student ID:/i.test(line)) {
      // name is usually the line just before; handled by caller if needed
    }

    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, term, subject, catalogNbr, titleRaw, unitsStr, grade] = m;
    const title = (titleRaw ?? "").trim() || undefined;
    const units = parseFloat(unitsStr);
    rows.push({
      term,
      subject,
      catalogNbr,
      code: `${subject} ${catalogNbr}`,
      title,
      units,
      grade: grade.trim(),
      isTransfer: isTransferGrade(grade, catalogNbr),
    });
  }

  if (rows.length === 0) {
    warnings.push(
      "No course rows were recognized. Is this a Pitt PeopleSoft What-If report PDF?"
    );
  }

  return { studentName, rows, warnings };
}

/** De-duplicate rows: keep one entry per course code. When a course appears
 *  multiple times (retakes), prefer the latest term; among same term, prefer
 *  a non-"In Progress" completed grade if present. */
function dedupe(rows: ParsedCourseRow[]): ParsedCourseRow[] {
  const termRank = (t: string) => {
    const y = yearOf(t) ?? 0;
    const s = seasonOf(t);
    const seasonRank = s === "Spring" ? 0 : s === "Summer" ? 1 : 2; // within a calendar year
    return y * 10 + seasonRank;
  };
  const byCode = new Map<string, ParsedCourseRow>();
  for (const r of rows) {
    const existing = byCode.get(r.code);
    if (!existing) {
      byCode.set(r.code, r);
      continue;
    }
    // pick the later term; if equal, prefer the one that's NOT in progress
    const better =
      termRank(r.term) > termRank(existing.term) ||
      (termRank(r.term) === termRank(existing.term) &&
        existing.grade === "In Progress" &&
        r.grade !== "In Progress");
    if (better) byCode.set(r.code, r);
  }
  return [...byCode.values()];
}

/**
 * Build a StudentPlan from parsed rows. Terms are mapped to real
 * academic-year rows (Fall/Spring/Summer), adding as many year-rows as the
 * report spans. Generic placeholder courses ("CS 0000") are included as
 * transfer credit but flagged; duplicate retakes are collapsed.
 */
export function buildPlanFromRows(
  rows: ParsedCourseRow[],
  majorId = "cs-bs-2023"
): { plan: StudentPlan; warnings: string[] } {
  const warnings: string[] = [];
  const deduped = dedupe(rows);

  // Determine the span of academic-year rows.
  const startYears = deduped
    .map((r) => academicYearStart(r.term))
    .filter((y): y is number => y != null);
  if (startYears.length === 0) {
    return {
      plan: emptyFallbackPlan(majorId),
      warnings: ["Could not read any valid terms from the report."],
    };
  }
  const minYear = Math.min(...startYears);
  const maxYear = Math.max(...startYears);

  // Build ordered (season, calendarYear) slots for each academic year.
  const semesters: Semester[] = [];
  const slotIndex = new Map<string, number>(); // "season|calYear" -> index
  let idx = 0;
  for (let ay = minYear; ay <= maxYear; ay++) {
    const blocks: Array<{ term: Term; year: number }> = [
      { term: "Fall", year: ay },
      { term: "Spring", year: ay + 1 },
      { term: "Summer", year: ay + 1 },
    ];
    for (const b of blocks) {
      const id = `sem-${idx}`;
      semesters.push({ id, term: b.term, year: b.year, courses: [] });
      slotIndex.set(`${b.term}|${b.year}`, idx);
      idx++;
    }
  }

  // Place each course into its matching block.
  for (const r of deduped) {
    const season = seasonOf(r.term);
    const calYear = yearOf(r.term);
    if (season == null || calYear == null) {
      warnings.push(`Skipped ${r.code}: unrecognized term "${r.term}".`);
      continue;
    }
    const key = `${season}|${calYear}`;
    const si = slotIndex.get(key);
    if (si == null) {
      warnings.push(`Skipped ${r.code}: no timeline slot for ${r.term}.`);
      continue;
    }
    const planned: PlannedCourse = r.isTransfer
      ? {
          code: r.code,
          source: "transfer",
          transferFrom: {
            school: "Transfer credit",
            code: r.code,
            title: r.title,
            credits: r.units,
          },
        }
      : { code: r.code, source: "native" };
    semesters[si].courses.push(planned);
  }

  const genericCount = deduped.filter((r) => r.catalogNbr === "0000").length;
  if (genericCount > 0) {
    warnings.push(
      `${genericCount} generic transfer placeholder course(s) (e.g. "CS 0000") were imported as transfer credit and won't match a specific requirement.`
    );
  }

  const plan: StudentPlan = {
    id: "default",
    majorId,
    updatedAt: new Date().toISOString(),
    semesters,
  };
  return { plan, warnings };
}

function emptyFallbackPlan(majorId: string): StudentPlan {
  const startYear = new Date().getFullYear();
  const semesters: Semester[] = [];
  let idx = 0;
  for (let y = 0; y < 4; y++) {
    const blocks: Array<{ term: Term; year: number }> = [
      { term: "Fall", year: startYear + y },
      { term: "Spring", year: startYear + y + 1 },
      { term: "Summer", year: startYear + y + 1 },
    ];
    for (const b of blocks) {
      semesters.push({ id: `sem-${idx++}`, term: b.term, year: b.year, courses: [] });
    }
  }
  return { id: "default", majorId, updatedAt: new Date().toISOString(), semesters };
}
