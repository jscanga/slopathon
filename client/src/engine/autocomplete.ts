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
/** Credits assumed for a catalog course that doesn't specify. */
const ASSUMED_CREDITS = 3;

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
  /** Credits the degree requires (120) — for reporting against creditsAfter. */
  creditsRequired: number;
  /** True when the plan reaches the degree credit total. */
  meetsCreditRequirement: boolean;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const creditsOf = (catalog: CourseCatalog, code: CourseCode): number =>
  catalog[code]?.credits ?? ASSUMED_CREDITS;

const departmentPart = (code: CourseCode): string => code.split(" ")[0];

function numericPart(code: CourseCode): number {
  const m = code.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

/** Cost of one term given its native (Pitt) credit load. */
function termCharge(nativeCredits: number): number {
  if (nativeCredits >= PITT_FULLTIME_THRESHOLD) return PITT_FULLTIME_SEMESTER_COST;
  if (nativeCredits > 0) return nativeCredits * PITT_PER_CREDIT_COST;
  return 0;
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
  existing: Set<CourseCode>
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

  const plannedCredits =
    [...existing].reduce((sum, c) => sum + creditsOf(catalog, c), 0) +
    picks.reduce((sum, p) => sum + p.credits, 0);

  // Top up to the degree total. The 120 is a FLOOR, not a target: graduation
  // needs at least that many credits, so we add whole courses until it's
  // cleared and stop at the first total that does. An exact landing isn't
  // generally reachable — nearly every catalog course is 3 credits while
  // MATH 0220 is 4, so totals run 4 + 3n and the smallest one clearing 120
  // is 121. Prefer a filler that lands exactly when the arithmetic allows.
  let remaining = major.totalDegreeCredits - plannedCredits;
  if (remaining > 0) {
    // The cheapest courses to transfer anywhere, since a free elective has
    // no constraint beyond carrying credit.
    const fillers = Object.keys(index)
      .filter((c) => !chosen.has(c) && catalog[c])
      .sort(cheapest);
    let cursor = 0;
    while (remaining > 0 && cursor < fillers.length) {
      const exact = fillers.find(
        (c) => !chosen.has(c) && creditsOf(catalog, c) === remaining
      );
      const code = exact ?? fillers.slice(cursor).find((c) => !chosen.has(c));
      if (!code) break;
      cursor = Math.max(cursor, fillers.indexOf(code) + 1);
      add(code, "Free elective", "Counts toward the 120-credit total");
      remaining -= creditsOf(catalog, code);
    }
    if (remaining > 0) {
      unfilled.push(`${remaining} credits short of ${major.totalDegreeCredits}`);
    }
  }

  return { picks, unfilled };
}

/* ------------------------------------------------------------------ */
/* 2. where to take it                                                 */
/* ------------------------------------------------------------------ */

/**
 * Greedily packs native credits into terms, front to back, at
 * TARGET_CREDITS_PER_TERM each — starting from whatever the existing plan
 * already has in each term. Returns the resulting per-term credit loads.
 */
function packNative(baseLoads: number[], creditList: number[]): number[] {
  const loads = [...baseLoads];
  for (const credits of creditList) {
    let placed = false;
    for (let t = 0; t < loads.length; t++) {
      if (loads[t] + credits <= TARGET_CREDITS_PER_TERM) {
        loads[t] += credits;
        placed = true;
        break;
      }
    }
    if (!placed) loads[loads.length - 1] += credits;
  }
  return loads;
}

const pittCostOf = (loads: number[]): number =>
  loads.reduce((sum, c) => sum + termCharge(c), 0);

/**
 * Chooses which picks to transfer, by sweeping the cheapest-k cutoff and
 * keeping the k with the lowest total cost. See the module comment for why
 * a per-course greedy pass gets this wrong.
 */
function chooseTransfers(
  picks: Pick[],
  baseLoads: number[],
  existingNativeCredits: number,
  summerCapacity: number
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

  const costAt = (k: number): { total: number; set: Set<CourseCode>; native: number } => {
    const set = new Set(candidates.slice(0, k).map((c) => c.code));
    const nativeCredits = picks.filter((p) => !set.has(p.code)).map((p) => p.credits);
    const transferCost = candidates
      .slice(0, k)
      .reduce((sum, c) => sum + c.transfer!.totalCost, 0);
    return {
      total: pittCostOf(packNative(baseLoads, nativeCredits)) + transferCost,
      set,
      native: existingNativeCredits + nativeCredits.reduce((a, b) => a + b, 0),
    };
  };

  // Candidates are cheapest-first, so native credits fall monotonically as k
  // grows: the residency floor is just a ceiling on k.
  let maxK = candidates.length;
  while (maxK > 0 && costAt(maxK).native < MIN_PITT_CREDITS) maxK--;
  const residencyCapped = maxK < candidates.length;

  // Transfers can only be scheduled into summers, so never choose more than
  // there are summer slots to put them in.
  const summerCapped = summerCapacity < maxK;
  if (summerCapped) maxK = summerCapacity;

  const allNative = costAt(0).total;
  let best = { total: allNative, set: new Set<CourseCode>() };
  for (let k = 1; k <= maxK; k++) {
    const attempt = costAt(k);
    if (attempt.total < best.total) best = { total: attempt.total, set: attempt.set };
  }

  return { transferred: best.set, total: best.total, allNative, residencyCapped, summerCapped };
}

/* ------------------------------------------------------------------ */
/* scheduling                                                          */
/* ------------------------------------------------------------------ */

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
): { semesters: Semester[]; placed: PlacedPick[] } {
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
  const nativeOrder = [
    ...placeable.filter((i) => semesters[i].term !== TRANSFER_TERM),
    ...summers,
  ];
  const loads = [...baseLoads];
  const counts = semesters.map((s) => s.courses.length);
  const placedTerm = new Map<CourseCode, number>();
  semesters.forEach((s, t) => s.courses.forEach((c) => placedTerm.set(c.code, t)));

  const placed: PlacedPick[] = [];

  for (const pick of picks) {
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
      for (const t of window) {
        if (counts[t] >= MAX_COURSES_PER_TERM) continue;
        if (loads[t] + pick.credits <= TARGET_CREDITS_PER_TERM) {
          target = t;
          break;
        }
      }
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

  return { semesters, placed };
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

  const { picks, unfilled } = pickCourses(major, genEd, catalog, index, existing);

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

  const { transferred, residencyCapped, summerCapped } = chooseTransfers(
    picks,
    baseLoads,
    existingNativeCredits,
    summerCapacity
  );

  const { semesters, placed } = schedule(plan, picks, transferred, catalog, baseLoads);

  // Both headline figures come from the SAME cost function the sidebar uses,
  // run over two real plans. The sweep's internal estimate is only ever used
  // to choose what to transfer — anything shown to the user is computed here,
  // so the preview and the sidebar can't disagree. (The estimate omits the
  // cost of transfer courses already in the plan, which is constant across
  // the sweep and so harmless there, but would be wrong on screen.)
  const proposed: StudentPlan = { ...plan, semesters };
  const baseline: StudentPlan = {
    ...plan,
    semesters: schedule(plan, picks, new Set<CourseCode>(), catalog, baseLoads).semesters,
  };
  const estimatedTotal = computeCost(proposed, catalog, schoolCosts).totalCost;
  const allNativeTotal = computeCost(baseline, catalog, schoolCosts).totalCost;

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
    creditsRequired: major.totalDegreeCredits,
    meetsCreditRequirement: creditsAfterTotal >= major.totalDegreeCredits,
  };
}
