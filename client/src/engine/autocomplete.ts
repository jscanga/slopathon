import type {
  CatalogCourse,
  CourseCatalog,
  CourseCode,
  GenEdRequirements,
  MajorRequirements,
  Semester,
  StudentPlan,
  Term,
} from "../types";
import {
  CAPSTONE_CODES,
  PITT_FULLTIME_SEMESTER_COST,
  PITT_FULLTIME_THRESHOLD,
  PITT_PER_CREDIT_COST,
  computeCost,
} from "./evaluatePlan";
import type { SchoolCostMap } from "./serverTypes";

/**
 * Autocomplete: fill the rest of the degree, as cheaply as the cost model
 * allows.
 *
 * Two halves, kept separate on purpose:
 *
 *   1. WHAT to take — walk the major + gen-ed requirements and pick a
 *      concrete course for everything still unsatisfied, then top up with
 *      free electives until the 120-credit degree total is met.
 *   2. WHERE to take it — decide which of those courses to transfer in from
 *      another school, and lay the result out across the 12 terms.
 *
 * Step 2 is the interesting one. Pitt's rate is FLAT at 12+ credits in a
 * term ($12,322), so moving a single course out of an otherwise full term
 * saves nothing — you still pay the same flat charge, plus the other
 * school's tuition on top. Savings only materialize when enough credits
 * leave to drop a term below full-time, or empty it entirely. So rather
 * than greedily transferring every course with a cheap equivalent, we sort
 * candidates cheapest-first and sweep the cutoff: "transfer the cheapest
 * k", for every k, and keep whichever k actually costs least. That lets the
 * cost of an unhelpful transfer be paid back by the term it eventually
 * collapses, which a per-course greedy pass can never see.
 */

/** Credits we aim to put in a term before moving to the next one. */
const TARGET_CREDITS_PER_TERM = 15;
/**
 * Hard ceiling on native credits in one term. Pitt's flat full-time rate
 * covers 12-18 credits, so filling to 18 costs exactly what 12 does.
 */
const MAX_CREDITS_PER_TERM = 18;
/**
 * Every Fall/Spring term must end up either empty or full-time. A term
 * carrying 1-11 native credits is part-time enrollment, which the degree
 * doesn't allow — and it's also the expensive shape, since those credits
 * bill per-credit on top of the flat terms around them.
 *
 * Greedily filling terms to a fixed 15 stranded the remainder: 61 credits
 * became 15/15/15/13/3, and that trailing 3-credit term was both invalid
 * and billed $3,078. So the packer decides how many terms it needs first
 * and spreads the credits evenly across exactly that many.
 */
const MIN_FULLTIME_CREDITS = PITT_FULLTIME_THRESHOLD;
/** Soft cap on how many courses we'll stack into one term. */
const MAX_COURSES_PER_TERM = 6;
/**
 * Transfer courses are only ever scheduled into Summer terms — you take them
 * elsewhere while Pitt is out of session, rather than swapping them for a
 * course you'd otherwise be enrolled in. This bounds how much can be
 * transferred at all (summer slots are finite), which `chooseTransfers`
 * accounts for so the optimizer never picks more than can actually be placed.
 */
const TRANSFER_TERM: Term = "Summer";
/**
 * Credits for a course code, matching `creditsFor(catalog, code, 0)` in
 * evaluatePlan — a code the catalog doesn't know counts for NOTHING.
 *
 * This has to agree with the engine or the 120-credit floor is measured
 * against a different number than the sidebar shows. PDF import builds codes
 * straight from the transcript without checking them against the catalog, so
 * an imported plan routinely contains codes that are unknown here; assuming
 * 3 credits for those made autocomplete stop filling early and land a
 * "121-credit" plan that the sidebar then scored at 115.
 */
const UNKNOWN_COURSE_CREDITS = 0;

/**
 * Credits that must be earned AT Pitt, capping how much the optimizer is
 * allowed to transfer away.
 *
 * Without this the answer is degenerate: transferring is nearly always
 * cheaper per credit, so the optimizer empties every term and hands back a
 * "Pitt degree" with two Pitt courses in it. Real schools carry a residency
 * requirement that forbids exactly that.
 *
 * 60 is the common figure for a 120-credit bachelor's (half the degree in
 * residence) and is a placeholder, NOT a number verified against current
 * Pitt policy — check the Dietrich School's residency and transfer-credit
 * rules before relying on a plan this produces. Raise it to be more
 * conservative; set it to 0 to see the unconstrained cheapest path.
 */
export const MIN_PITT_CREDITS = 60;

/** The cheapest way to take one Pitt course somewhere else. */
export interface TransferOption {
  school: string;
  code: string;
  title?: string;
  /** Credits per the SENDING school, when their catalog stated it. */
  credits?: number;
  perCredit: number;
  onlineSharePct: number | null;
  /** perCredit × billed credits — what this course costs to transfer. */
  totalCost: number;
}

export type TransferIndex = Record<CourseCode, TransferOption>;

/** Why a course ended up in the plan — surfaced in the preview. */
export type PickReason =
  | "Core course"
  | "Upper-level elective"
  | "Required mathematics"
  | "Capstone experience"
  | "General education"
  | "Free elective";

interface Pick {
  code: CourseCode;
  credits: number;
  reason: PickReason;
  detail: string;
  /** Must land in a strictly later term than this course (sequence order). */
  after?: CourseCode;
  /** Must land strictly BEFORE this course, which the plan already places.
   *  Without it, autocompleting around a hand-placed CS 0445 would happily
   *  drop its prerequisite into the very same term. */
  before?: CourseCode;
  /** Capstones/internships aren't realistically taken at another school. */
  transferable: boolean;
  transfer?: TransferOption;
}

export interface PlacedPick {
  code: CourseCode;
  name: string;
  credits: number;
  reason: PickReason;
  detail: string;
  semesterId: string;
  termLabel: string;
  transfer?: TransferOption;
}

export interface AutocompleteResult {
  plan: StudentPlan;
  placed: PlacedPick[];
  nativeCount: number;
  transferCount: number;
  creditsBefore: number;
  creditsAfter: number;
  /** Cost of this plan, per the same model the sidebar uses. */
  estimatedTotal: number;
  /** Cost of the identical course list taken entirely at Pitt. */
  allNativeTotal: number;
  saved: number;
  /** Requirements it could not fill, e.g. an empty gen-ed category. */
  unfilled: string[];
  /** True when nothing was left to add. */
  alreadyComplete: boolean;
  /** Credits this plan has the student earning at Pitt. */
  pittCredits: number;
  /** True when the residency floor stopped it transferring more. */
  residencyCapped: boolean;
  /** True when summer capacity, not cost, limited how much was transferred. */
  summerCapped: boolean;
  /** Fall/Spring terms left below full-time, which the degree doesn't allow.
   *  Empty in a healthy plan. */
  partTimeTerms: string[];
  /** Credits the degree requires (120) — for reporting against creditsAfter. */
  creditsRequired: number;
  /** True when the plan reaches the degree credit total. */
  meetsCreditRequirement: boolean;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const creditsOf = (catalog: CourseCatalog, code: CourseCode): number =>
  catalog[code]?.credits ?? UNKNOWN_COURSE_CREDITS;

const departmentPart = (code: CourseCode): string => code.split(" ")[0];

function numericPart(code: CourseCode): number {
  const m = code.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

/**
 * Cheapest-first ordering over candidate courses: the one that costs least
 * to transfer wins. Ties break on course code so a given plan always
 * autocompletes to the same thing.
 */
function byTransferCost(catalog: CourseCatalog, index: TransferIndex) {
  return (a: CourseCode, b: CourseCode): number => {
    const ca = index[a]?.totalCost ?? Infinity;
    const cb = index[b]?.totalCost ?? Infinity;
    if (ca !== cb) return ca - cb;
    // No transfer option either way — prefer the cheaper course to sit at
    // Pitt, i.e. the one with fewer credits, then alphabetical.
    const ka = creditsOf(catalog, a);
    const kb = creditsOf(catalog, b);
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  };
}

/* ------------------------------------------------------------------ */
/* 1. what to take                                                     */
/* ------------------------------------------------------------------ */

/**
 * Picks a concrete course for every unsatisfied requirement.
 *
 * `chosen` accumulates everything already in the plan plus everything
 * picked so far, so a course is never picked twice. A course that already
 * satisfies one gen-ed category and is eligible for another satisfies both
 * without being added again — Pitt permits that overlap, and it's strictly
 * cheaper than picking a second course.
 */
function pickCourses(
  major: MajorRequirements,
  genEd: GenEdRequirements,
  catalog: CourseCatalog,
  index: TransferIndex,
  existing: Set<CourseCode>,
  /** Extra credits needed purely to lift already-occupied Fall/Spring terms
   *  up to full-time. The 120 is a floor, not a ceiling, so overshooting it
   *  to make a term valid is the right trade. */
  fullTimeShortfall: number
): { picks: Pick[]; unfilled: string[] } {
  const picks: Pick[] = [];
  const unfilled: string[] = [];
  const chosen = new Set(existing);
  const cheapest = byTransferCost(catalog, index);

  const add = (
    code: CourseCode,
    reason: PickReason,
    detail: string,
    opts: { after?: CourseCode; before?: CourseCode; transferable?: boolean } = {}
  ) => {
    picks.push({
      code,
      credits: creditsOf(catalog, code),
      reason,
      detail,
      after: opts.after,
      before: opts.before,
      transferable: opts.transferable ?? !CAPSTONE_CODES.has(code),
      transfer: index[code],
    });
    chosen.add(code);
  };

  /** Cheapest option from a list that isn't already covered. */
  const pickFrom = (codes: CourseCode[]): CourseCode | null => {
    const open = codes.filter((c) => !chosen.has(c) && catalog[c]);
    if (!open.length) return null;
    return [...open].sort(cheapest)[0];
  };

  /* ---- major requirements ---- */

  for (const req of major.requirements) {
    if (req.kind === "group") {
      for (const child of req.children) {
        const reason: PickReason =
          req.label === "Required Mathematics" ? "Required mathematics" : "Core course";

        if (child.kind === "sequence") {
          // Sequence courses are ordered: each one lands after the last, and
          // before any later course in the chain the student already placed.
          let prev: CourseCode | undefined;
          child.courses.forEach((c, i) => {
            if (!chosen.has(c.code)) {
              const laterPlaced = child.courses
                .slice(i + 1)
                .find((x) => existing.has(x.code));
              add(c.code, reason, child.label, { after: prev, before: laterPlaced?.code });
            }
            prev = c.code;
          });
        } else if (child.kind === "course") {
          if (!chosen.has(child.course.code)) {
            add(child.course.code, reason, child.course.title);
          }
        } else {
          // chooseOne — satisfied already, or take the cheapest option.
          if (child.options.some((o) => chosen.has(o.course.code))) continue;
          const code = pickFrom(child.options.map((o) => o.course.code));
          if (code) add(code, reason, child.label);
          else unfilled.push(child.label);
        }
      }
      continue;
    }

    if (req.kind === "countOf") {
      const inPool = (code: CourseCode) =>
        departmentPart(code) === req.pool.department &&
        !isNaN(numericPart(code)) &&
        numericPart(code) >= req.pool.numberMin &&
        !CAPSTONE_CODES.has(code);

      const already = [...chosen].filter(inPool).length;
      const want = req.n - already;
      if (want <= 0) continue;

      const pool = Object.keys(catalog).filter((c) => inPool(c) && !chosen.has(c));
      const take = [...pool].sort(cheapest).slice(0, want);
      take.forEach((code) => add(code, "Upper-level elective", req.label));
      if (take.length < want) unfilled.push(`${req.label} (${want - take.length} short)`);
      continue;
    }

    // capstone — one option, and not something you transfer in.
    if (req.options.some((o) => chosen.has(o.course.code))) continue;
    const preferred =
      req.options.find((o) => o.course.code === "CS 1980") ?? req.options[0];
    if (preferred) {
      add(preferred.course.code, "Capstone experience", preferred.label, {
        transferable: false,
      });
    } else {
      unfilled.push(req.label);
    }
  }

  /* ---- gen eds ---- */

  for (const cat of genEd.categories) {
    if (cat.type === "single") {
      if (cat.courses.some((c) => chosen.has(c))) continue;
      const code = pickFrom(cat.courses);
      if (code) add(code, "General education", cat.label);
      else unfilled.push(cat.label);
      continue;
    }

    // A science sequence must be both halves of ONE row, in order.
    if (cat.sequences.some((s) => s.courses.every((c) => chosen.has(c)))) continue;
    const ranked = [...cat.sequences].sort((a, b) => {
      const cost = (s: typeof a) =>
        s.courses.reduce((sum, c) => sum + (index[c]?.totalCost ?? Infinity), 0);
      const ca = cost(a);
      const cb = cost(b);
      if (ca !== cb) return ca - cb;
      return a.label.localeCompare(b.label);
    });
    const seq = ranked.find((s) => s.courses.every((c) => catalog[c]));
    if (!seq) {
      unfilled.push(cat.label);
      continue;
    }
    let prev: CourseCode | undefined;
    seq.courses.forEach((c, i) => {
      if (!chosen.has(c)) {
        const laterPlaced = seq.courses.slice(i + 1).find((x) => existing.has(x));
        add(c, "General education", `${cat.label} — ${seq.label}`, {
          after: prev,
          before: laterPlaced,
        });
      }
      prev = c;
    });
  }

  /* ---- free electives, to reach the degree total ---- */

  const existingCredits = [...existing].reduce(
    (sum, c) => sum + creditsOf(catalog, c),
    0
  );
  /** Credits the plan would carry with everything picked so far. */
  const plannedCredits = () =>
    existingCredits + picks.reduce((sum, p) => sum + p.credits, 0);

  // Top up to the degree total. The 120 is a FLOOR, not a target: graduation
  // needs at least that many credits, so we add whole courses until it's
  // cleared and stop at the first total that does. An exact landing isn't
  // generally reachable — nearly every catalog course is 3 credits while
  // MATH 0220 is 4, so totals run 4 + 3n and the smallest one clearing 120
  // is 121. Prefer a filler that lands exactly when the arithmetic allows.
  // Repair fillers first: courses that exist purely to lift an occupied
  // Fall/Spring term to full-time. They are pinned NATIVE — a transferred
  // course is taken over the summer, so it can never fix a Fall/Spring
  // term, and leaving these transferable meant the optimizer shipped them
  // off to summer and left the short term short.
  const fillers = Object.keys(index)
    .filter((c) => !chosen.has(c) && catalog[c])
    .sort(cheapest);
  let cursor = 0;
  const nextFiller = (): CourseCode | null => {
    while (cursor < fillers.length && chosen.has(fillers[cursor])) cursor++;
    return cursor < fillers.length ? fillers[cursor] : null;
  };

  let repair = fullTimeShortfall;
  while (repair > 0) {
    const code = nextFiller();
    if (!code) break;
    add(code, "Free elective", "Brings a term up to full-time", {
      transferable: false,
    });
    repair -= creditsOf(catalog, code);
  }
  if (repair > 0) unfilled.push(`${repair} credits to reach full-time enrolment`);

  // Then top up to the degree total.
  let remaining = major.totalDegreeCredits - plannedCredits();
  while (remaining > 0) {
    const exact = fillers.find(
      (c) => !chosen.has(c) && creditsOf(catalog, c) === remaining
    );
    const code = exact ?? nextFiller();
    if (!code) break;
    add(code, "Free elective", "Counts toward the 120-credit total");
    remaining -= creditsOf(catalog, code);
  }
  if (remaining > 0) {
    unfilled.push(`${remaining} credits short of ${major.totalDegreeCredits}`);
  }

  return { picks, unfilled };
}

/* ------------------------------------------------------------------ */
/* 2. where to take it                                                 */
/* ------------------------------------------------------------------ */

/**
 * Chooses which picks to transfer by sweeping the cheapest-k cutoff and
 * keeping the k that costs least.
 *
 * `costOf` builds the real schedule for a candidate set and prices it with
 * the same `computeCost` the sidebar uses. An earlier version scored these
 * with a quick approximation of term packing instead, and once the real
 * packer grew smarter than the approximation the two disagreed — the sweep
 * started choosing sets that actually cost MORE than transferring nothing,
 * which is impossible to reach when k = 0 is always on the table. Scoring
 * the real thing keeps the choice honest and costs nothing that matters:
 * it's a few dozen schedules over a few dozen courses.
 */
function chooseTransfers(
  picks: Pick[],
  existingNativeCredits: number,
  summerCapacity: number,
  costOf: (transferred: Set<CourseCode>) => number
): {
  transferred: Set<CourseCode>;
  total: number;
  allNative: number;
  residencyCapped: boolean;
  summerCapped: boolean;
} {
  const candidates = picks
    .filter((p) => p.transferable && p.transfer)
    .sort((a, b) => a.transfer!.totalCost - b.transfer!.totalCost);

  const firstK = (k: number) => new Set(candidates.slice(0, k).map((c) => c.code));
  const nativeCreditsAt = (k: number) => {
    const set = firstK(k);
    return (
      existingNativeCredits +
      picks.filter((p) => !set.has(p.code)).reduce((sum, p) => sum + p.credits, 0)
    );
  };

  // Candidates are cheapest-first, so native credits fall monotonically as k
  // grows: the residency floor is just a ceiling on k.
  let maxK = candidates.length;
  while (maxK > 0 && nativeCreditsAt(maxK) < MIN_PITT_CREDITS) maxK--;
  const residencyCapped = maxK < candidates.length;

  // Transfers can only be scheduled into summers, so never choose more than
  // there are summer slots to put them in.
  const summerCapped = summerCapacity < maxK;
  if (summerCapped) maxK = summerCapacity;

  const allNative = costOf(new Set<CourseCode>());
  let best = { total: allNative, set: new Set<CourseCode>() };
  for (let k = 1; k <= maxK; k++) {
    const set = firstK(k);
    const total = costOf(set);
    if (total < best.total) best = { total, set };
  }

  return { transferred: best.set, total: best.total, allNative, residencyCapped, summerCapped };
}

/* ------------------------------------------------------------------ */
/* scheduling                                                          */
/* ------------------------------------------------------------------ */

/**
 * Decides which Fall/Spring terms carry native courses, and how many credits
 * each should hold, so every used term lands at or above full-time.
 *
 * Terms that already contain courses are forced in — autocomplete never moves
 * what the student placed — so they set a floor on the term count.
 */
function budgetNativeTerms(
  termIdxs: number[],
  loads: number[],
  counts: number[],
  creditsToPlace: number
): { chosen: Set<number>; target: number; shortfall: boolean } {
  const forced = termIdxs.filter((t) => loads[t] > 0);
  const existing = termIdxs.reduce((sum, t) => sum + loads[t], 0);
  const total = existing + creditsToPlace;
  if (total <= 0) return { chosen: new Set(), target: TARGET_CREDITS_PER_TERM, shortfall: false };

  /** Credits a term can still absorb — limited by BOTH the credit ceiling
   *  and the free course slots, which is the part a credits-only estimate
   *  misses: a term holding four courses has room for two more, however few
   *  credits those courses carry. */
  const spare = (t: number) =>
    Math.max(
      0,
      Math.min(
        MAX_CREDITS_PER_TERM - loads[t],
        (MAX_COURSES_PER_TERM - counts[t]) * 3
      )
    );

  // Walk terms in order taking real capacity until everything fits. Terms
  // already holding courses are always included — autocomplete can't empty
  // them, so they're part of the plan whether or not they're needed.
  const chosen = new Set<number>(forced);
  let left = creditsToPlace;
  for (const t of termIdxs) {
    if (left <= 0 && !chosen.has(t)) break;
    chosen.add(t);
    left -= spare(t);
  }

  return {
    chosen,
    target: Math.max(
      MIN_FULLTIME_CREDITS,
      Math.min(MAX_CREDITS_PER_TERM, Math.ceil(total / Math.max(1, chosen.size)))
    ),
    // True when even the densest packing can't make every used term
    // full-time — e.g. one existing course sitting alone in a late term.
    shortfall: total < chosen.size * MIN_FULLTIME_CREDITS,
  };
}

/**
 * Lays a set of picks across the plan's terms. Called twice — once with the
 * chosen transfer set, once with none — so the "all at Pitt" baseline is a
 * real plan costed by the real engine rather than a parallel estimate.
 */
function schedule(
  plan: StudentPlan,
  picks: Pick[],
  transferred: Set<CourseCode>,
  catalog: CourseCatalog,
  baseLoads: number[]
): { semesters: Semester[]; placed: PlacedPick[]; partTimeTerms: string[] } {
  const semesters: Semester[] = plan.semesters.map((s) => ({ ...s, courses: [...s.courses] }));
  // Standalone labeled rows ("Other") are buckets for AP/transfer credit
  // already earned, not terms you can enroll in — never schedule into one.
  // They stay in `baseLoads` so the cost estimate still matches computeCost.
  const placeable = semesters
    .map((s, i) => (s.rowLabel ? -1 : i))
    .filter((i) => i >= 0);
  const summers = placeable.filter((i) => semesters[i].term === TRANSFER_TERM);
  // Native courses prefer Fall/Spring, so the summers stay free for the
  // transfers that can only go there. They fall back to summers only if the
  // academic-year terms genuinely run out of room.
  const academicTerms = placeable.filter((i) => semesters[i].term !== TRANSFER_TERM);
  const nativeOrder = [...academicTerms, ...summers];

  // How many Fall/Spring terms to use, and how full each should be, so none
  // ends up part-time.
  const nativeCreditsToPlace = picks
    .filter((p) => !transferred.has(p.code))
    .reduce((sum, p) => sum + p.credits, 0);
  const loads = [...baseLoads];
  const counts = semesters.map((s) => s.courses.length);
  const budget = budgetNativeTerms(
    academicTerms,
    baseLoads,
    counts,
    nativeCreditsToPlace
  );
  const placedTerm = new Map<CourseCode, number>();
  semesters.forEach((s, t) => s.courses.forEach((c) => placedTerm.set(c.code, t)));

  const placed: PlacedPick[] = [];

  // Sequence courses go down first. They're the constrained ones — each must
  // sit in a later term than the one before it — so if free electives claim
  // the early terms first, a chain gets pushed past the end of the packed
  // terms and strands a lone course in a term of its own. Unchained picks
  // then fill whatever room is left. Relative order within a chain is
  // preserved, so a course is still placed after its predecessor.
  const chained = new Set<CourseCode>();
  for (const p of picks) {
    if (p.after) {
      chained.add(p.code);
      chained.add(p.after);
    }
    if (p.before) chained.add(p.code);
  }
  const ordered = [
    ...picks.filter((p) => chained.has(p.code)),
    ...picks.filter((p) => !chained.has(p.code)),
  ];

  for (const pick of ordered) {
    const isTransfer = transferred.has(pick.code);
    const earliest = Math.max(0, pick.after ? (placedTerm.get(pick.after) ?? -1) + 1 : 0);
    const latest = Math.min(
      semesters.length - 1,
      pick.before ? (placedTerm.get(pick.before) ?? semesters.length) - 1 : semesters.length - 1
    );

    const pool = isTransfer ? summers : nativeOrder;
    const window = pool.filter((t) => t >= earliest && t <= latest);

    let target = -1;
    if (isTransfer) {
      // Summer only, and spread across the summers rather than stacking the
      // first one full. Cost doesn't depend on which term a transfer sits in,
      // so this is purely about the plan reading sensibly.
      for (const t of window) {
        if (counts[t] >= MAX_COURSES_PER_TERM) continue;
        if (target === -1 || counts[t] < counts[target]) target = t;
      }
    } else {
      // Fill the budgeted terms toward their shared target first, then use
      // the headroom up to the hard cap, and only then open a new term —
      // opening one early is what leaves a part-time straggler behind.
      const fits = (t: number, cap: number) =>
        counts[t] < MAX_COURSES_PER_TERM && loads[t] + pick.credits <= cap;
      // An empty term trivially "fits" any target, so every clause that can
      // open a new term has to come after the ones that top up a started
      // one — otherwise each course starts a fresh term and they all settle
      // at the target instead of filling, stranding the remainder.
      const started = (t: number) => loads[t] > 0;
      target =
        // A started term below full-time is the most urgent: it's invalid
        // until it's filled.
        window.find(
          (t) => started(t) && loads[t] < MIN_FULLTIME_CREDITS && fits(t, MAX_CREDITS_PER_TERM)
        ) ??
        // Then top up started terms, to the target and then to the cap.
        window.find((t) => started(t) && fits(t, budget.target)) ??
        window.find((t) => started(t) && fits(t, MAX_CREDITS_PER_TERM)) ??
        // Only now open one of the budgeted terms.
        window.find((t) => budget.chosen.has(t) && fits(t, budget.target)) ??
        window.find((t) => fits(t, MAX_CREDITS_PER_TERM)) ??
        -1;
    }
    // Every allowed term is full. Overfill one rather than drop the course,
    // preferring to keep the sequence order intact.
    if (target === -1) {
      const fallback = window.length ? window : pool;
      if (!fallback.length) {
        target = placeable[placeable.length - 1] ?? 0;
      } else if (isTransfer) {
        // Keep the summer-only guarantee even when every summer is full —
        // overfill the emptiest one rather than leaking into a Pitt term.
        target = fallback.reduce((a, t) => (counts[t] < counts[a] ? t : a), fallback[0]);
      } else {
        target = fallback[fallback.length - 1];
      }
    }

    const sem = semesters[target];
    sem.courses.push(
      isTransfer && pick.transfer
        ? {
            code: pick.code,
            source: "transfer",
            transferFrom: {
              school: pick.transfer.school,
              code: pick.transfer.code,
              title: pick.transfer.title,
              credits: pick.transfer.credits,
            },
          }
        : { code: pick.code, source: "native" }
    );

    if (!isTransfer) loads[target] += pick.credits;
    counts[target] += 1;
    placedTerm.set(pick.code, target);

    placed.push({
      code: pick.code,
      name: (catalog[pick.code] as CatalogCourse | undefined)?.name ?? pick.code,
      credits: pick.credits,
      reason: pick.reason,
      detail: pick.detail,
      semesterId: sem.id,
      termLabel: `${sem.term} ${sem.year}`,
      transfer: isTransfer ? pick.transfer : undefined,
    });
  }

  // Verify the rule actually held rather than assuming the packer got it
  // right: a Fall/Spring term must end empty or full-time.
  const partTimeTerms = academicTerms
    .filter((t) => loads[t] > 0 && loads[t] < MIN_FULLTIME_CREDITS)
    .map((t) => `${semesters[t].term} ${semesters[t].year}`);

  return { semesters, placed, partTimeTerms };
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function autocompletePlan(
  plan: StudentPlan,
  major: MajorRequirements,
  genEd: GenEdRequirements,
  catalog: CourseCatalog,
  index: TransferIndex,
  schoolCosts: SchoolCostMap = {}
): AutocompleteResult {
  const existing = new Set<CourseCode>(
    plan.semesters.flatMap((s) => s.courses.map((c) => c.code))
  );
  const creditsBefore = [...existing].reduce((sum, c) => sum + creditsOf(catalog, c), 0);

  // Fall/Spring terms that already hold courses but sit below full-time.
  // They can't be emptied (autocomplete never moves what the student placed),
  // so they have to be filled up instead.
  const fullTimeShortfall = plan.semesters
    .filter((s) => !s.rowLabel && s.term !== TRANSFER_TERM)
    .map((s) =>
      s.courses
        .filter((c) => c.source !== "transfer")
        .reduce((sum, c) => sum + creditsOf(catalog, c.code), 0)
    )
    .filter((load) => load > 0 && load < PITT_FULLTIME_THRESHOLD)
    .reduce((sum, load) => sum + (PITT_FULLTIME_THRESHOLD - load), 0);

  const { picks, unfilled } = pickCourses(
    major,
    genEd,
    catalog,
    index,
    existing,
    fullTimeShortfall
  );

  if (!picks.length) {
    return {
      plan,
      placed: [],
      nativeCount: 0,
      transferCount: 0,
      creditsBefore,
      creditsAfter: creditsBefore,
      estimatedTotal: 0,
      allNativeTotal: 0,
      saved: 0,
      unfilled,
      alreadyComplete: true,
      pittCredits: creditsBefore,
      residencyCapped: false,
      summerCapped: false,
      partTimeTerms: [],
      creditsRequired: major.totalDegreeCredits,
      meetsCreditRequirement: creditsBefore >= major.totalDegreeCredits,
    };
  }

  // Native credits already committed, per term.
  const baseLoads = plan.semesters.map((s) =>
    s.courses
      .filter((c) => c.source !== "transfer")
      .reduce((sum, c) => sum + creditsOf(catalog, c.code), 0)
  );

  const existingNativeCredits = plan.semesters
    .flatMap((s) => s.courses)
    .filter((c) => c.source !== "transfer")
    .reduce((sum, c) => sum + creditsOf(catalog, c.code), 0);

  // How many transfer courses the summers can actually hold.
  const summerCapacity = plan.semesters
    .filter((s) => !s.rowLabel && s.term === TRANSFER_TERM)
    .reduce((sum, s) => sum + Math.max(0, MAX_COURSES_PER_TERM - s.courses.length), 0);

  const costOf = (transferred: Set<CourseCode>): number => {
    const { semesters } = schedule(plan, picks, transferred, catalog, baseLoads);
    return computeCost({ ...plan, semesters }, catalog, schoolCosts).totalCost;
  };

  const { transferred, total: estimatedTotal, allNative: allNativeTotal, residencyCapped, summerCapped } = chooseTransfers(
    picks,
    existingNativeCredits,
    summerCapacity,
    costOf
  );

  const { semesters, placed, partTimeTerms } = schedule(
    plan,
    picks,
    transferred,
    catalog,
    baseLoads
  );

  // Both headline figures come from the SAME cost function the sidebar uses,
  // run over two real plans. The sweep's internal estimate is only ever used
  // to choose what to transfer — anything shown to the user is computed here,
  // so the preview and the sidebar can't disagree. (The estimate omits the
  // cost of transfer courses already in the plan, which is constant across
  // the sweep and so harmless there, but would be wrong on screen.)
  const proposed: StudentPlan = { ...plan, semesters };

  const transferCount = placed.filter((p) => p.transfer).length;
  const creditsAfterTotal =
    creditsBefore + picks.reduce((sum, p) => sum + p.credits, 0);

  return {
    plan: { ...proposed, updatedAt: new Date().toISOString() },
    placed,
    nativeCount: placed.length - transferCount,
    transferCount,
    creditsBefore,
    creditsAfter: creditsAfterTotal,
    estimatedTotal,
    allNativeTotal,
    saved: Math.max(0, allNativeTotal - estimatedTotal),
    unfilled,
    alreadyComplete: false,
    pittCredits:
      existingNativeCredits +
      picks.filter((p) => !transferred.has(p.code)).reduce((sum, p) => sum + p.credits, 0),
    residencyCapped,
    summerCapped,
    partTimeTerms,
    creditsRequired: major.totalDegreeCredits,
    meetsCreditRequirement: creditsAfterTotal >= major.totalDegreeCredits,
  };
}
