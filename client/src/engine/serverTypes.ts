// Core domain types shared across the API.
// Kept intentionally close to the shape of the source data files so the
// frontend can consume API responses with minimal transformation.

export type CourseCode = string; // e.g. "CS 0445"

export interface CatalogCourse {
  name: string;
  credits: number;
  creditsSource: "known" | "default-assumed";
  attributes: string[];
}

export type CourseCatalog = Record<CourseCode, CatalogCourse>;

// ---- Major requirements (major-requirements.json) ----

export interface RequirementCourseRef {
  code: CourseCode;
  title: string;
  credits: number;
  minGrade?: string;
}

export interface EligibilityItem {
  kind: "course";
  course: RequirementCourseRef;
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
  /** Total credits required to graduate (university-wide), distinct from
   *  totalCredits which is the major-specific credit count. */
  totalDegreeCredits: number;
  eligibility: EligibilityItem[];
  requirements: TopLevelRequirement[];
  notes: string[];
}

// ---- Gen-ed requirements (gen-ed-requirements.json) ----

export interface GenEdSingleCategory {
  id: string;
  label: string;
  attribute: string;
  type: "single";
  coursesRequired: 1;
  courses: CourseCode[];
  note?: string;
  excludesDepartmentOfCategoryId?: string;
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
  dataQualityFlags?: {
    candidateCoursesMissingAttributeTag: CourseCode[];
    attributeTaggedCoursesNotInAnyKnownSequence: CourseCode[];
  };
}

export type GenEdCategory = GenEdSingleCategory | GenEdSequenceCategory;

export interface GenEdRequirements {
  $schema: string;
  school: string;
  sourceFile: string;
  generatedNote: string;
  categories: GenEdCategory[];
}

// ---- Student plan (persisted, mutable) ----

export type Term = "Fall" | "Spring" | "Summer";

export interface PlannedCourse {
  code: CourseCode;
  /** Free-text tag the UI can use to show why this course is in the plan,
   *  e.g. "core:programming-sequence" or "genEd:diversity". Optional. */
  fulfills?: string;
  /** Where this course entry came from. Defaults to "native" (taken at
   *  Pitt directly) when omitted. */
  source?: "native" | "transfer";
  /** Present when source === "transfer": which external course this Pitt
   *  course code was matched from. */
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
}

export interface StudentPlan {
  id: string;
  majorId: string;
  semesters: Semester[];
  updatedAt: string;
}

// ---- Transfer equivalencies ----
// Schema finalized against the real data file (university-of-pittsburgh.json,
// 1,801 schools / 43,239 rows). Notes on quirks preserved from the source:
// - External course credits are only known for ~5.4k rows where the source
//   embedded a trailing "(3)"-style credit count in the description; most
//   rows have no external credit figure at all, hence optional.
// - pittCourse has no credits/attributes here by design — look those up
//   from the course catalog by pittCourse.code instead of duplicating data.
// - Some pittCourse.code values are department-level placeholders (e.g.
//   "MATH 0000") rather than a specific course; isGenericPlaceholder flags
//   these. They still count toward total credits but don't satisfy any
//   named requirement, since they're not tied to a specific course.
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

// ---- School cost / online data (school-cost-data.json) ----
// Produced by server/scripts/fetch-cost-data.mjs from College Scorecard.
// Any school not resolved by that script maps to null.
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

export type SchoolCostMap = Record<string, SchoolCostData | null>;

/** A transfer equivalency enriched with its school's cost/online data. */
export interface TransferEquivalencyWithCost extends TransferEquivalency {
  cost: SchoolCostData | null;
}
