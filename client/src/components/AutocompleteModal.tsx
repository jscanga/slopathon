import { useMemo } from "react";
import {
  MIN_PITT_CREDITS,
  type AutocompleteResult,
  type PickReason,
  type PlacedPick,
} from "../engine/autocomplete";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Info, Sparkles, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  result: AutocompleteResult;
  onApply: () => void;
  onCancel: () => void;
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

const REASON_COLOR: Record<PickReason, string> = {
  "Core course": "bg-ink-core",
  "Required mathematics": "bg-ink-math",
  "Upper-level elective": "bg-ink-elective",
  "Capstone experience": "bg-ink-capstone",
  "General education": "bg-ink-genEd",
  "Free elective": "bg-muted-foreground/50",
};

function CourseRow({ pick }: { pick: PlacedPick }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-l-[3px] bg-card/80 px-2.5 py-1.5",
        pick.transfer ? "border-dashed" : "border-solid"
      )}
    >
      <span className={cn("h-3.5 w-1 shrink-0 rounded-full", REASON_COLOR[pick.reason])} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-code text-[0.7rem] text-muted-foreground">{pick.code}</span>
          <span className="min-w-0 flex-1 truncate text-[0.78rem] text-foreground">
            {pick.name}
          </span>
        </div>
        {pick.transfer && (
          <span className="truncate text-[0.66rem] italic text-muted-foreground">
            {pick.transfer.school} · {money(pick.transfer.perCredit)}/cr
            {pick.transfer.onlineSharePct != null &&
              ` · ${pick.transfer.onlineSharePct}% online`}
          </span>
        )}
      </div>
      <span className="font-code text-[0.68rem] text-muted-foreground">{pick.credits}cr</span>
    </div>
  );
}

export default function AutocompleteModal({ result, onApply, onCancel }: Props) {
  const byTerm = useMemo(() => {
    const groups: Array<{ label: string; picks: PlacedPick[] }> = [];
    for (const pick of result.placed) {
      const last = groups.find((g) => g.label === pick.termLabel);
      if (last) last.picks.push(pick);
      else groups.push({ label: pick.termLabel, picks: [pick] });
    }
    return groups;
  }, [result.placed]);

  if (result.alreadyComplete) {
    return (
      <Dialog open onOpenChange={(o) => !o && onCancel()}>
        <DialogContent className="w-[min(440px,92vw)] max-w-none">
          <DialogHeader>
            <DialogTitle>Nothing left to add</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Every requirement in this major is already covered by the courses in your
            plan.
          </p>
          <DialogFooter>
            <Button onClick={onCancel}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex max-h-[88vh] w-[min(780px,94vw)] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-[1.1rem] w-[1.1rem] text-primary" />
            Autocomplete your degree
          </DialogTitle>
        </DialogHeader>

        {/* savings hero */}
        <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/12 via-card to-accent/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Every course at Pitt
              </div>
              <div className="font-display text-[1.5rem] font-semibold text-muted-foreground line-through decoration-muted-foreground/40">
                {money(result.allNativeTotal)}
              </div>
            </div>
            <ArrowRight className="mb-2 h-5 w-5 text-primary" />
            <div>
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-primary/90">
                This plan
              </div>
              <div className="font-display text-[2.2rem] font-bold leading-none text-primary tabular-nums">
                {money(result.estimatedTotal)}
              </div>
            </div>
            {result.saved > 0 && (
              <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-primary">
                <TrendingDown className="h-4 w-4" />
                <span className="font-display text-[1.15rem] font-semibold tabular-nums">
                  {money(result.saved)} saved
                </span>
              </div>
            )}
          </div>

          <p className="mt-3 border-t border-primary/15 pt-3 text-[0.78rem] text-muted-foreground">
            Adds <strong className="text-foreground">{result.placed.length} courses</strong>{" "}
            ({result.nativeCount} at Pitt, {result.transferCount} transferred in), taking you
            from {result.creditsBefore} to{" "}
            <strong className="text-foreground">{result.creditsAfter} credits</strong>, with{" "}
            <strong className="text-foreground">{result.pittCredits}</strong> of them earned
            at Pitt.
          </p>
        </div>

        {result.saved === 0 && result.transferCount === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-ink-elective/40 bg-ink-elective/10 px-3 py-2 text-[0.78rem]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-elective" />
            <span>
              No transfer route beat taking everything at Pitt here. At 12+ credits a term
              Pitt charges one flat rate, so a transfer only pays off when it empties a
              term outright.
            </span>
          </div>
        )}

        {result.residencyCapped && (
          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[0.78rem]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>
              More of this could be transferred, but the plan keeps{" "}
              {MIN_PITT_CREDITS} credits at Pitt for the residency requirement.
              Confirm the real limit with an advisor — schools cap transfer credit and
              the exact figure varies.
            </span>
          </div>
        )}

        {result.unfilled.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-ink-elective/40 bg-ink-elective/10 px-3 py-2 text-[0.78rem]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-elective" />
            <span>
              Couldn't fill: {result.unfilled.join(", ")}. You'll need to place{" "}
              {result.unfilled.length === 1 ? "it" : "those"} by hand.
            </span>
          </div>
        )}

        {/* term-by-term preview */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {byTerm.map((group) => (
              <div key={group.label}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="font-display text-[0.9rem] font-semibold text-foreground">
                    {group.label}
                  </span>
                  <span className="font-code text-[0.68rem] text-muted-foreground">
                    {group.picks.reduce((s, p) => s + p.credits, 0)}cr
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {group.picks.map((pick) => (
                    <CourseRow key={`${group.label}-${pick.code}`} pick={pick} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 pt-3">
          <span className="mr-auto self-center text-[0.72rem] italic text-muted-foreground">
            Dashed = transferred in. You can undo this afterwards.
          </span>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onApply}>Fill my plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
