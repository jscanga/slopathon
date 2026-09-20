import type { PlannedCourse, StudentPlan, Term } from "../types";

/**
 * Demo/sample plans for demonstrations. Built dynamically off the current
 * year so the semester ids and years always line up with the app's own
 * emptyPlan() layout (4 years x Fall/Spring/Summer = sem-0 .. sem-11).
 *
 * Two scenarios:
 *  - "standard-4yr": a vanilla four-year Pitt CS degree, everything taken
 *    at Pitt, no transfers. Summers empty. The baseline.
 *  - "transfer-3yr": the same degree finished in three years and cheaper,
 *    by knocking out intro CS, calculus, composition and a couple of gen
 *    eds at CCAC ($252/cr in-state vs Pitt's $1,026/cr) — several over the
 *    summer — then loading the remaining Pitt terms. Demonstrates the whole
 *    point of the tool.
 *
 * Transfer courses use REAL equivalencies from the transfer-equivalencies
 * data (Community College of Allegheny County → Pitt), so they resolve
 * against the cost data and requirement engine exactly like a user-added
 * transfer would.
 */

export type SampleScenarioId = "standard-4yr" | "transfer-3yr";

export interface SampleScenario {
  id: SampleScenarioId;
  label: string;
  description: string;
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: "standard-4yr",
    label: "Standard 4-year",
    description: "Vanilla Pitt CS degree, all courses at Pitt, no transfers.",
  },
  {
    id: "transfer-3yr",
    label: "Optimized 3-year (transfers)",
    description:
      "Same degree in 3 years and cheaper — intro courses transferred from CCAC.",
  },
];

const CCAC = "COMMUNITY COLLEGE OF ALLEGHENY COUNTY-PITTSBURGH";

function native(code: string): PlannedCourse {
  return { code, source: "native" };
}

function transfer(
  code: string,
  extCode: string,
  extTitle: string
): PlannedCourse {
  return {
    code,
    source: "transfer",
    transferFrom: { school: CCAC, code: extCode, title: extTitle },
  };
}

/** Builds the 12-semester skeleton matching emptyPlan(), then lets a filler
 *  drop courses into specific slots by index. */
function buildPlan(
  fill: (slots: PlannedCourse[][]) => void
): StudentPlan {
  const startYear = new Date().getFullYear();
  const terms: Array<{ term: Term; year: number }> = [];
  for (let y = 0; y < 4; y++) {
    terms.push({ term: "Fall", year: startYear + y });
    terms.push({ term: "Spring", year: startYear + y + 1 });
    terms.push({ term: "Summer", year: startYear + y + 1 });
  }
  const slots: PlannedCourse[][] = terms.map(() => []);
  fill(slots);
  return {
    id: "default",
    majorId: "cs-bs-2023",
    updatedAt: new Date().toISOString(),
    semesters: terms.map((t, idx) => ({
      id: `sem-${idx}`,
      term: t.term,
      year: t.year,
      courses: slots[idx],
    })),
  };
}

// Slot index legend (from buildPlan / emptyPlan):
//  0 F1  1 Sp1  2 Su1   3 F2  4 Sp2  5 Su2
//  6 F3  7 Sp3  8 Su3   9 F4 10 Sp4 11 Su4

function standardFourYear(): StudentPlan {
  return buildPlan((s) => {
    // Year 1
    s[0] = [native("CMPINF 0401"), native("MATH 0220"), native("ENGCMP 0200"), native("BIOSC 0150")];
    s[1] = [native("CS 0441"), native("CS 0445"), native("BIOSC 0160"), native("MATH 0280")];
    // Year 2
    s[3] = [native("CS 0447"), native("CS 1501"), native("MATH 0120"), native("ENGCMP 0400")];
    s[4] = [native("CS 0449"), native("CS 1502"), native("ENGR 0020"), native("COMMRC 0500")];
    // Year 3
    s[6] = [native("CS 1503"), native("CS 1550"), native("AFRCNA 0031"), native("ANTH 0630")];
    s[7] = [native("CS 1520"), native("CS 1530"), native("AFRCNA 0150")];
    // Year 4
    s[9] = [native("CS 1555"), native("CS 1566"), native("AFRCNA 0120")];
    s[10] = [native("CS 1571"), native("CS 1900")];
  });
}

function transferThreeYear(): StudentPlan {
  return buildPlan((s) => {
    // Intro courses that CCAC genuinely articulates come in as transfers
    // (verified against the equivalency data); the Biology sequence has no
    // clean CCAC equivalent, so it stays native at Pitt — realistic, since
    // lab sciences often don't transfer as the majors' sequence.
    // Year 1
    s[0] = [
      native("CMPINF 0401"),
      native("CS 0441"),
      transfer("MATH 0220", "MAT 201", "CALCULUS 1"),
      transfer("ENGCMP 0200", "ENG 101", "ENGLISH COMPOSITION 1"),
    ];
    s[1] = [native("CS 0445"), native("CS 0447"), native("CS 1501"), native("MATH 0280")];
    s[2] = [
      transfer("MATH 0120", "MAT 220", "BUSINESS CALCULUS"),
      transfer("ENGCMP 0400", "ENG106", "REPORT WRITING"),
      transfer("COMMRC 0500", "SPH201", "ARGUMENTATION AND DEBATE"),
    ];
    // Year 2
    s[3] = [native("CS 0449"), native("CS 1502"), native("CS 1550"), native("BIOSC 0150")];
    s[4] = [native("CS 1503"), native("CS 1520"), native("CS 1530"), native("BIOSC 0160")];
    s[5] = [
      native("ENGR 0020"),
      native("AFRCNA 0031"),
      native("ANTH 0630"),
    ];
    // Year 3
    s[6] = [native("CS 1555"), native("CS 1566"), native("AFRCNA 0150")];
    s[7] = [native("CS 1571"), native("CS 1900"), native("AFRCNA 0120")];
  });
}

export function getSamplePlan(id: SampleScenarioId): StudentPlan {
  return id === "standard-4yr" ? standardFourYear() : transferThreeYear();
}
