import type {
  CourseCatalog,
  CourseCode,
  GenEdRequirements,
  MajorRequirements,
  StudentPlan,
  TopLevelRequirement,
  GroupChild,
  SchoolCostMap,
} from "./serverTypes";
import { effectiveRate } from "../lib/residency";

// Pitt cost constants (from the user's figures):
// - Full-time (>= 12 credits in a term): flat per-semester charge.
// - Part-time (1-11 credits): per-credit rate.
const PITT_FULLTIME_SEMESTER_COST = 12322;
const PITT_PER_CREDIT_COST = 1026;
const PITT_FULLTIME_THRESHOLD = 12;

// Capstone/internship/co-op codes are excluded from the upper-level elective
// pool. The source data doesn't carry per-course tags, so this list is
// hardcoded from the major requirements' capstone options.
const CAPSTONE_CODES = new Set(["CS 1900", "CS 1950", "CS 1980", "CS 1906"]);

export interface RequirementStatus {
  id: string;
  label: string;
  kind: string;
  satisfied: boolean;
  matchedCourses: CourseCode[];
  creditsEarned: number;
  creditsRequired?: number;
  detail?: string;
}

export interface PlanEvaluation {
  totalCreditsPlanned: number;
  totalCreditsRequiredMajor: number;
  /** Sum of credits from courses matched to a major requirement
   *  (deduped via the `consumed` set during evaluation). */
  majorCreditsPlanned: number;
  /** University-wide graduation credit total (e.g. 120), distinct from
   *  the major-specific total above. */
  totalCreditsRequiredDegree: number;
  majorRequirementStatuses: RequirementStatus[];
  genEdCategoryStatuses: RequirementStatus[];
  unknownCourses: CourseCode[];
  cost: CostBreakdown;
}

export interface CostBreakdown {
  /** Cost from Pitt (native) courses, summed across terms. */
  pittCost: number;
  /** Cost from transfer courses (their home school's per-credit rate). */
  transferCost: number;
  totalCost: number;
  /** True if any transfer course in the plan had no known per-credit cost,
   *  so transferCost (and total) is an underestimate. */
  hasUnknownTransferCost: boolean;
  perTermPitt: Array<{
    semesterId: string;
    nativeCredits: number;
    charged: number;
    basis: "full-time-flat" | "per-credit" | "none";
  }>;
}

function creditsFor(catalog: CourseCatalog, code: CourseCode, fallback = 0): number {
  return catalog[code]?.credits ?? fallback;
}

function numericPart(code: CourseCode): number {
  const match = code.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

function departmentPart(code: CourseCode): string {
  return code.split(" ")[0];
}

/** Evaluates a single group child (sequence / course / chooseOne). */
function evaluateGroupChild(
  child: GroupChild,
  planCodes: Set<CourseCode>,
  catalog: CourseCatalog,
  consumed: Set<CourseCode>
): RequirementStatus {
  if (child.kind === "sequence") {
    const matched = child.courses
      .map((c) => c.code)
      .filter((code) => planCodes.has(code));
    matched.forEach((c) => consumed.add(c));
    return {
      id: `sequence:${child.label}`,
      label: child.label,
      kind: "sequence",
      satisfied: matched.length === child.courses.length,
      matchedCourses: matched,
      creditsEarned: matched.reduce((sum, c) => sum + creditsFor(catalog, c), 0),
      creditsRequired: child.courses.reduce((sum, c) => sum + c.credits, 0),
    };
  }

  if (child.kind === "course") {
    const matched = planCodes.has(child.course.code) ? [child.course.code] : [];
    matched.forEach((c) => consumed.add(c));
    return {
      id: `course:${child.course.code}`,
      label: child.course.title,
      kind: "course",
      satisfied: matched.length === 1,
      matchedCourses: matched,
      creditsEarned: matched.length ? creditsFor(catalog, child.course.code) : 0,
      creditsRequired: child.course.credits,
    };
  }

  // chooseOne
  for (const option of child.options) {
    if (planCodes.has(option.course.code)) {
      consumed.add(option.course.code);
      return {
        id: `chooseOne:${child.label}`,
        label: child.label,
        kind: "chooseOne",
        satisfied: true,
        matchedCourses: [option.course.code],
        creditsEarned: creditsFor(catalog, option.course.code),
        creditsRequired: option.course.credits,
        detail: `Satisfied via ${option.course.code}`,
      };
    }
  }
  return {
    id: `chooseOne:${child.label}`,
    label: child.label,
    kind: "chooseOne",
    satisfied: false,
    matchedCourses: [],
    creditsEarned: 0,
    creditsRequired: child.options[0]?.course.credits,
    detail: `Options: ${child.options.map((o) => o.course.code).join(", ")}`,
  };
}

function evaluateTopLevel(
  req: TopLevelRequirement,
  planCodes: Set<CourseCode>,
  catalog: CourseCatalog,
  consumed: Set<CourseCode>
): RequirementStatus {
  if (req.kind === "group") {
    const childStatuses = req.children.map((child) =>
      evaluateGroupChild(child, planCodes, catalog, consumed)
    );
    const satisfied = childStatuses.every((s) => s.satisfied);
    const matchedCourses = childStatuses.flatMap((s) => s.matchedCourses);
    return {
      id: `group:${req.label}`,
      label: req.label,
      kind: "group",
      satisfied,
      matchedCourses,
      creditsEarned: childStatuses.reduce((sum, s) => sum + s.creditsEarned, 0),
      creditsRequired: req.credits,
      detail: childStatuses
        .filter((s) => !s.satisfied)
        .map((s) => s.label)
        .join(", ") || undefined,
    };
  }

  if (req.kind === "countOf") {
    const matched = [...planCodes].filter((code) => {
      if (consumed.has(code)) return false;
      if (departmentPart(code) !== req.pool.department) return false;
      const num = numericPart(code);
      if (isNaN(num) || num < req.pool.numberMin) return false;
      if (CAPSTONE_CODES.has(code)) return false;
      return true;
    });
    const counted = matched.slice(0, req.n);
    counted.forEach((c) => consumed.add(c));
    return {
      id: `countOf:${req.label}`,
      label: req.label,
      kind: "countOf",
      satisfied: matched.length >= req.n,
      matchedCourses: matched,
      creditsEarned: matched.reduce((sum, c) => sum + creditsFor(catalog, c), 0),
      detail: `${matched.length} / ${req.n} ${req.unit} found`,
    };
  }

  // capstone
  for (const option of req.options) {
    if (planCodes.has(option.course.code)) {
      consumed.add(option.course.code);
      return {
        id: `capstone:${req.label}`,
        label: req.label,
        kind: "capstone",
        satisfied: true,
        matchedCourses: [option.course.code],
        creditsEarned: creditsFor(catalog, option.course.code),
        detail: `Satisfied via ${option.label} (${option.course.code})${
          option.minRotations
            ? " — rotation-count tracking not yet implemented"
            : ""
        }`,
      };
    }
  }
  return {
    id: `capstone:${req.label}`,
    label: req.label,
    kind: "capstone",
    satisfied: false,
    matchedCourses: [],
    creditsEarned: 0,
    detail: `Options: ${req.options.map((o) => `${o.label} (${o.course.code})`).join(", ")}`,
  };
}

export function evaluatePlan(
  plan: StudentPlan,
  major: MajorRequirements,
  genEd: GenEdRequirements,
  catalog: CourseCatalog,
  schoolCosts: SchoolCostMap = {}
): PlanEvaluation {
  const allPlannedCourses = plan.semesters.flatMap((s) => s.courses.map((c) => c.code));
  const planCodes = new Set(allPlannedCourses);
  const consumed = new Set<CourseCode>();

  const majorRequirementStatuses = major.requirements.map((req) =>
    evaluateTopLevel(req, planCodes, catalog, consumed)
  );

  const genEdCategoryStatuses = genEd.categories.map((cat) => {
    if (cat.type === "single") {
      const matched = cat.courses.filter((c) => planCodes.has(c));
      return {
        id: cat.id,
        label: cat.label,
        kind: "genEd:single",
        satisfied: matched.length >= 1,
        matchedCourses: matched,
        creditsEarned: matched.reduce((sum, c) => sum + creditsFor(catalog, c, 3), 0),
      };
    }
    // sequence
    for (const seq of cat.sequences) {
      const bothTaken = seq.courses.every((c) => planCodes.has(c));
      if (bothTaken) {
        return {
          id: cat.id,
          label: cat.label,
          kind: "genEd:sequence",
          satisfied: true,
          matchedCourses: [...seq.courses],
          creditsEarned: seq.courses.reduce((sum, c) => sum + creditsFor(catalog, c, 3), 0),
          detail: `Satisfied via ${seq.label} sequence`,
        };
      }
    }
    return {
      id: cat.id,
      label: cat.label,
      kind: "genEd:sequence",
      satisfied: false,
      matchedCourses: [],
      creditsEarned: 0,
      detail: `Complete both courses of one sequence: ${cat.sequences
        .map((s) => s.label)
        .join(" / ")}`,
    };
  });

  const unknownCourses = [...planCodes].filter((code) => !catalog[code]);

  const totalCreditsPlanned = allPlannedCourses.reduce(
    (sum, code) => sum + creditsFor(catalog, code, 0),
    0
  );

  const majorCreditsPlanned = majorRequirementStatuses.reduce(
    (sum, s) => sum + s.creditsEarned,
    0
  );

  const cost = computeCost(plan, catalog, schoolCosts);

  return {
    totalCreditsPlanned,
    totalCreditsRequiredMajor: major.totalCredits,
    majorCreditsPlanned,
    totalCreditsRequiredDegree: major.totalDegreeCredits,
    majorRequirementStatuses,
    genEdCategoryStatuses,
    unknownCourses,
    cost,
  };
}

/** Cost model:
 *  Per term, sum NON-transfer (Pitt) credits. >= 12 → flat full-time
 *  semester charge; 1-11 → per-credit; 0 → nothing. Transfer courses are
 *  billed separately at their home school's per-credit rate (when known)
 *  and added on top. */
function computeCost(
  plan: StudentPlan,
  catalog: CourseCatalog,
  schoolCosts: SchoolCostMap
): CostBreakdown {
  const perTermPitt: CostBreakdown["perTermPitt"] = [];
  let pittCost = 0;
  let transferCost = 0;
  let hasUnknownTransferCost = false;

  for (const sem of plan.semesters) {
    let nativeCredits = 0;
    for (const c of sem.courses) {
      const credits = catalog[c.code]?.credits ?? 0;
      if (c.source === "transfer") {
        // Residency-aware: a PA resident pays in-state only at PA schools,
        // out-of-state elsewhere.
        const rate = c.transferFrom
          ? effectiveRate(schoolCosts[c.transferFrom.school]).effectivePerCredit
          : null;
        if (rate == null) {
          hasUnknownTransferCost = true;
        } else {
          transferCost += rate * (c.transferFrom?.credits ?? credits);
        }
      } else {
        nativeCredits += credits;
      }
    }

    let charged = 0;
    let basis: "full-time-flat" | "per-credit" | "none" = "none";
    if (nativeCredits >= PITT_FULLTIME_THRESHOLD) {
      charged = PITT_FULLTIME_SEMESTER_COST;
      basis = "full-time-flat";
    } else if (nativeCredits > 0) {
      charged = nativeCredits * PITT_PER_CREDIT_COST;
      basis = "per-credit";
    }
    pittCost += charged;
    perTermPitt.push({ semesterId: sem.id, nativeCredits, charged, basis });
  }

  return {
    pittCost,
    transferCost,
    totalCost: pittCost + transferCost,
    hasUnknownTransferCost,
    perTermPitt,
  };
}
