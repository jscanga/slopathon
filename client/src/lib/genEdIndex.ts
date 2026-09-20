import type {
  GenEdRequirements,
  MajorRequirements,
  GroupChild,
  CourseCode,
} from "../types";

export type TagType = "core" | "elective" | "math" | "capstone" | "genEd";

export interface CourseTag {
  type: TagType;
  label: string;
}

function addTag(
  index: Record<CourseCode, CourseTag[]>,
  code: CourseCode,
  tag: CourseTag
) {
  if (!index[code]) index[code] = [];
  // avoid duplicate identical tags
  if (!index[code].some((t) => t.type === tag.type && t.label === tag.label)) {
    index[code].push(tag);
  }
}

function tagGroupChild(
  index: Record<CourseCode, CourseTag[]>,
  child: GroupChild,
  type: TagType
) {
  if (child.kind === "sequence") {
    child.courses.forEach((c) => addTag(index, c.code, { type, label: child.label }));
  } else if (child.kind === "course") {
    addTag(index, child.course.code, { type, label: child.course.title });
  } else {
    child.options.forEach((opt) =>
      addTag(index, opt.course.code, { type, label: child.label })
    );
  }
}

/** Maps every course code named anywhere in the major requirements to
 *  human-readable tags describing what it counts toward. The upper-level
 *  elective pool is a filter rule rather than a fixed list, so it isn't
 *  represented here — the caller can compute pool membership separately. */
export function buildMajorTagIndex(
  major: MajorRequirements
): Record<CourseCode, CourseTag[]> {
  const index: Record<CourseCode, CourseTag[]> = {};
  for (const req of major.requirements) {
    if (req.kind === "group") {
      const type: TagType = req.label.toLowerCase().includes("math") ? "math" : "core";
      req.children.forEach((child) => tagGroupChild(index, child, type));
    } else if (req.kind === "capstone") {
      req.options.forEach((opt) =>
        addTag(index, opt.course.code, { type: "capstone", label: opt.label })
      );
    }
    // countOf (upper-level electives) is a rule over a course-number range,
    // not an enumerable list — see isElectivePoolMember below.
  }
  return index;
}

export function isElectivePoolMember(
  major: MajorRequirements,
  code: CourseCode
): boolean {
  const countOf = major.requirements.find((r) => r.kind === "countOf");
  if (!countOf || countOf.kind !== "countOf") return false;
  const [dept, num] = [code.split(" ")[0], parseInt(code.match(/(\d+)/)?.[1] ?? "", 10)];
  if (dept !== countOf.pool.department) return false;
  if (isNaN(num) || num < countOf.pool.numberMin) return false;
  return true;
}

/** Maps every course code in the gen-ed data to the category labels it
 *  fulfills. A course can appear under multiple categories. */
export function buildGenEdTagIndex(
  genEd: GenEdRequirements
): Record<CourseCode, CourseTag[]> {
  const index: Record<CourseCode, CourseTag[]> = {};
  for (const cat of genEd.categories) {
    if (cat.type === "single") {
      cat.courses.forEach((code) => addTag(index, code, { type: "genEd", label: cat.label }));
    } else {
      cat.sequences.forEach((seq) => {
        seq.courses.forEach((code) =>
          addTag(index, code, { type: "genEd", label: `${cat.label} (${seq.label})` })
        );
      });
    }
  }
  return index;
}

export function mergeTagIndexes(
  ...indexes: Record<CourseCode, CourseTag[]>[]
): Record<CourseCode, CourseTag[]> {
  const merged: Record<CourseCode, CourseTag[]> = {};
  for (const idx of indexes) {
    for (const [code, tags] of Object.entries(idx)) {
      tags.forEach((t) => addTag(merged, code, t));
    }
  }
  return merged;
}
