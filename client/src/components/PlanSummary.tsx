import type { PlanEvaluation } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, PiggyBank, Sparkles, Trash2, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/lib/useCountUp";
import { cn } from "@/lib/utils";

interface Props {
  evaluation: PlanEvaluation | null;
  majorOptions: Array<{ id: string; name: string }>;
  selectedMajorId: string;
  onSelectMajor: (id: string) => void;
  onAutocomplete: () => void;
  autocompleting: boolean;
  onClearPlan: () => void;
  /** False when the plan is already empty, so there's nothing to clear. */
  canClear: boolean;
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const { value } = useCountUp(pct, 850);
  const offset = c * (1 - value / 100);
  return (
    <svg viewBox="0 0 180 180" className="mx-auto w-full max-w-[170px] -rotate-90" aria-hidden="true">
      <circle cx="90" cy="90" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
      <text
        x="90"
        y="82"
        className="fill-foreground font-display"
        style={{ transform: "rotate(90deg)", transformOrigin: "90px 90px", textAnchor: "middle", fontSize: "2rem", fontWeight: 600 }}
      >
        {Math.round(value)}%
      </text>
      <text
        x="90"
        y="108"
        className="fill-muted-foreground"
        style={{ transform: "rotate(90deg)", transformOrigin: "90px 90px", textAnchor: "middle", fontSize: "0.8rem" }}
      >
        of degree
      </text>
    </svg>
  );
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function CostHero({ evaluation }: { evaluation: PlanEvaluation | null }) {
  const total = evaluation?.cost.totalCost ?? 0;
  const { value, bump } = useCountUp(total, 800);

  return (
    <div className="relative animate-cost-breathe overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/14 via-card to-accent/50 p-4">
      {/* periodic light sweep */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/45 to-transparent cost-sweep" />
      </div>

      <div className="relative">
        <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-primary/90">
          <PiggyBank className="h-4 w-4" /> Estimated cost
        </div>

        {evaluation ? (
          <>
            <div
              className={cn(
                "font-display text-[2.6rem] font-bold leading-none text-primary tabular-nums",
                bump && "animate-value-bump"
              )}
            >
              {money(Math.round(value))}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[0.72rem] font-medium text-primary/80">
              <TrendingDown className="h-3.5 w-3.5" /> across your full plan
            </div>

            <div className="mt-3 space-y-1.5 border-t border-primary/15 pt-3">
              <div className="flex justify-between font-code text-[0.8rem] text-muted-foreground">
                <span>Pitt tuition</span>
                <span className="text-foreground">{money(evaluation.cost.pittCost)}</span>
              </div>
              <div className="flex justify-between font-code text-[0.8rem] text-muted-foreground">
                <span>Transfer credits</span>
                <span className="text-foreground">{money(evaluation.cost.transferCost)}</span>
              </div>
            </div>
            {evaluation.cost.hasUnknownTransferCost && (
              <div className="mt-2.5 text-[0.72rem] italic text-muted-foreground">
                Some transfer courses have no cost data, so the total is a floor,
                not a full estimate.
              </div>
            )}
          </>
        ) : (
          <div className="font-display text-[2.6rem] font-bold leading-none text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}

export default function PlanSummary({
  evaluation,
  majorOptions,
  selectedMajorId,
  onSelectMajor,
  onAutocomplete,
  autocompleting,
  onClearPlan,
  canClear,
}: Props) {
  const pct = evaluation
    ? Math.min(
        100,
        Math.round(
          (evaluation.totalCreditsPlanned / evaluation.totalCreditsRequiredDegree) * 100
        )
      )
    : 0;

  const credits = useCountUp(evaluation?.totalCreditsPlanned ?? 0, 700);

  return (
    <div className="flex flex-col gap-4">
      {/* Estimated cost — the focal point, first thing you see. */}
      <CostHero evaluation={evaluation} />

      <div className="flex flex-col gap-2">
        <Button
          className="w-full"
          onClick={onAutocomplete}
          disabled={autocompleting || !evaluation}
        >
          {autocompleting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Finding the cheapest path…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Autocomplete my degree
            </>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full text-muted-foreground hover:border-destructive/40 hover:text-destructive"
          onClick={onClearPlan}
          disabled={!canClear}
          title={canClear ? "Remove every course from the plan" : "Your plan is already empty"}
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear plan
        </Button>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-soft">
        <ProgressRing pct={pct} />
        {evaluation && (
          <div className="mt-1 text-center">
            <span className="font-display text-[1.5rem] font-semibold tabular-nums text-foreground">
              {Math.round(credits.value)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">
              / {evaluation.totalCreditsRequiredDegree} credits
            </span>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Major
        </label>
        <Select value={selectedMajorId} onValueChange={onSelectMajor}>
          <SelectTrigger>
            <SelectValue placeholder="Select a major" />
          </SelectTrigger>
          <SelectContent>
            {majorOptions.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
