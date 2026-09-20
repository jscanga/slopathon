export type CourseCode = string;

export interface CatalogCourse {
  name: string;
  credits: number;
  creditsSource: "known" | "default-assumed";
  attributes: string[];
}

export type CourseCatalog = Record<CourseCode, CatalogCourse>;

export interface RequirementCourseRef {
  code: CourseCode;
  title: string;
  credits: number;
  minGrade?: string;
}

export interface SequenceRequirement {
  kind: "sequence";
  label: string;
  courses: RequirementCourseRef[];
}

export interface SingleCourseRequirement {
  kind: "course";
  course: RequirementCourseRef;
}

export interface ChooseOneRequirement {
  kind: "chooseOne";
  label: string;
  options: SingleCourseRequirement[];
}

export type GroupChild =
  | SequenceRequirement
  | SingleCourseRequirement
  | ChooseOneRequirement;

export interface GroupRequirement {
  kind: "group";
  label: string;
  credits?: number;
  children: GroupChild[];
}

export interface CountOfRequirement {
  kind: "countOf";
  label: string;
  n: number;
  unit: string;
  pool: {
    department: string;
    numberMin: number;
    excludeTags: string[];
  };
}

export interface CapstoneOption {
  label: string;
  course: RequirementCourseRef;
  minCredits?: number;
  minRotations?: number;
}

export interface CapstoneRequirement {
  kind: "capstone";
  label: string;
  options: CapstoneOption[];
}

export type TopLevelRequirement =
  | GroupRequirement
  | CountOfRequirement
  | CapstoneRequirement;

export interface MajorRequirements {
  id: string;
  name: string;
  effectiveTerm: string;
  totalCredits: number;
  totalDegreeCredits: number;
  requirements: TopLevelRequirement[];
  notes: string[];
}

export interface GenEdSingleCategory {
  id: string;
  label: string;
  attribute: string;
  type: "single";
  coursesRequired: 1;
  courses: CourseCode[];
  note?: string;
}

export interface GenEdSequence {
  label: string;
  department: string;
  courses: [CourseCode, CourseCode];
}

export interface GenEdSequenceCategory {
  id: string;
  label: string;
  attribute: string;
  type: "sequence";
  coursesRequired: 2;
  note: string;
  sequences: GenEdSequence[];
}

export type GenEdCategory = GenEdSingleCategory | GenEdSequenceCategory;

export interface GenEdRequirements {
  school: string;
  categories: GenEdCategory[];
}

export type Term = "Fall" | "Spring" | "Summer";

export interface PlannedCourse {
  code: CourseCode;
  fulfills?: string;
  source?: "native" | "transfer";
  transferFrom?: {
    school: string;
    code: string;
    title?: string;
    credits?: number;
  };
}

export interface Semester {
  id: string;
  term: Term;
  year: number;
  courses: PlannedCourse[];
  /** When set, this semester is rendered as a standalone labeled row (e.g.
   *  "Other") instead of being grouped into a Year N / Fall-Spring-Summer
   *  block. Used for buckets like AP/transfer credit that aren't tied to a
   *  real term. */
  rowLabel?: string;
}

export interface StudentPlan {
  id: string;
  majorId: string;
  semesters: Semester[];
  updatedAt: string;
}

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

export interface CostBreakdown {
  pittCost: number;
  transferCost: number;
  totalCost: number;
  hasUnknownTransferCost: boolean;
  perTermPitt: Array<{
    semesterId: string;
    nativeCredits: number;
    charged: number;
    basis: "full-time-flat" | "per-credit" | "none";
  }>;
}

export interface PlanEvaluation {
  totalCreditsPlanned: number;
  totalCreditsRequiredMajor: number;
  majorCreditsPlanned: number;
  totalCreditsRequiredDegree: number;
  majorRequirementStatuses: RequirementStatus[];
  genEdCategoryStatuses: RequirementStatus[];
  unknownCourses: CourseCode[];
  cost: CostBreakdown;
}

// Schema finalized against the real transfer equivalency data — see the
// matching comment in server/src/types.ts for details on the quirks.
export interface SchoolCostData {
  matchedName: string | null;
  state: string | null;
  annualTuitionInState: number | null;
  annualTuitionOutState: number | null;
  costPerCreditInState: number | null;
  costPerCreditOutState: number | null;
  onlineSharePct: number | null;
  creditsPerYearAssumed: number;
  source: string;
}

export interface TransferEquivalency {
  externalSchool: string;
  externalCourse: {
    code: CourseCode;
    title: string;
    credits?: number;
  };
  pittCourse: {
    code: CourseCode;
    title: string;
  };
  isGenericPlaceholder?: boolean;
}

export interface TransferEquivalencyWithCost extends TransferEquivalency {
  cost: SchoolCostData | null;
}

export type TransferSortKey = "cost-asc" | "cost-desc" | "school" | "online-desc";
