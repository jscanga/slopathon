/**
 * Residency-aware pricing. transfr is based at the University of Pittsburgh,
 * so the student is treated as a Pennsylvania resident: they pay the in-state
 * per-credit rate only at PA schools, and the out-of-state rate everywhere
 * else. This is the price the student would actually pay to transfer a credit.
 */

export const HOME_STATE = "PA";

export interface RateInfo {
  effectivePerCredit: number | null;
  residency: "in-state" | "out-of-state" | null;
}

interface CostLike {
  state?: string | null;
  costPerCreditInState?: number | null;
  costPerCreditOutState?: number | null;
}

export function effectiveRate(
  cost: CostLike | null | undefined,
  homeState: string = HOME_STATE
): RateInfo {
  if (!cost) return { effectivePerCredit: null, residency: null };
  const isHome = (cost.state ?? null) === homeState;
  const residency = isHome ? "in-state" : "out-of-state";
  const rate = isHome ? cost.costPerCreditInState : cost.costPerCreditOutState;
  if (rate != null) return { effectivePerCredit: rate, residency };
  return { effectivePerCredit: null, residency };
}
