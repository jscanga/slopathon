import type { PlanEvaluation, RequirementStatus } from "../types";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  evaluation: PlanEvaluation | null;
}

function ReqPill({ status }: { status: RequirementStatus }) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.76rem] transition-colors",
        status.satisfied
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
      title={status.detail ?? status.label}
    >
      {status.satisfied ? (
        <Check className="h-3 w-3 shrink-0 text-primary" />
      ) : (
        <Minus className="h-3 w-3 shrink-0 text-muted-foreground/60" />
      )}
      <span className="truncate">{status.label}</span>
    </div>
  );
}

const LEGEND: Array<{ label: string; cls: string }> = [
  { label: "Core", cls: "bg-ink-core" },
  { label: "Math", cls: "bg-ink-math" },
  { label: "Elective", cls: "bg-ink-elective" },
  { label: "Capstone", cls: "bg-ink-capstone" },
  { label: "Gen ed", cls: "bg-ink-genEd" },
];

export default function RequirementsBar({ evaluation }: Props) {
  if (!evaluation) {
    return (
      <footer className="col-span-full border-t border-border/70 bg-card/70 px-6 py-3 text-sm text-muted-foreground backdrop-blur-sm">
        Loading requirements…
      </footer>
    );
  }

  return (
    <footer className="col-span-full flex max-h-[176px] items-start gap-8 overflow-x-auto border-t border-border/70 bg-card/70 px-6 py-3.5 backdrop-blur-sm">
      <div className="min-w-0">
        <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Major
        </h2>
        <div className="flex max-w-[640px] flex-wrap gap-1.5">
          {evaluation.majorRequirementStatuses.map((s) => (
            <ReqPill key={s.id} status={s} />
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          General education
        </h2>
        <div className="flex max-w-[660px] flex-wrap gap-1.5">
          {evaluation.genEdCategoryStatuses.map((s) => (
            <ReqPill key={s.id} status={s} />
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Key
        </h2>
        <div className="flex flex-col gap-1">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full", l.cls)} />
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
