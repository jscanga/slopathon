import { useEffect, useState } from "react";
import { Bug, X, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SAMPLE_SCENARIOS,
  getSamplePlan,
  type SampleScenarioId,
} from "@/lib/sampleData";
import type { StudentPlan } from "../types";

interface Props {
  onLoadPlan: (plan: StudentPlan) => void;
  onClearPlan: () => void;
  onAutocomplete: () => void;
}

/**
 * Discreet debug/demo control pinned to the bottom-left. Hidden behind a
 * small toggle so it doesn't clutter the normal UI. Also opens/closes with
 * Ctrl+D (Cmd+D on Mac). For demonstrations only — loads canned sample
 * plans over the current plan.
 */
export default function DebugPanel({ onLoadPlan, onClearPlan, onAutocomplete }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SampleScenarioId | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function load(id: SampleScenarioId) {
    onLoadPlan(getSamplePlan(id));
    setActive(id);
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 flex flex-col items-start gap-2">
      {open && (
        <div className="w-64 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Bug className="h-3.5 w-3.5" /> Demo data
            </span>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
              aria-label="Close debug panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {SAMPLE_SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                onClick={() => load(sc.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-[0.8rem] transition-colors",
                  active === sc.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="font-medium">{sc.label}</div>
                <div className="mt-0.5 text-[0.7rem] leading-snug text-muted-foreground">
                  {sc.description}
                </div>
              </button>
            ))}

            <button
              onClick={onAutocomplete}
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-left text-[0.8rem] font-medium text-primary hover:bg-primary/15"
            >
              <Wand2 className="h-3.5 w-3.5" /> Autocomplete degree
            </button>

            <button
              onClick={() => {
                onClearPlan();
                setActive(null);
              }}
              className="mt-0.5 rounded-lg border border-border px-3 py-1.5 text-left text-[0.78rem] text-muted-foreground hover:text-foreground"
            >
              Clear plan
            </button>
          </div>

          <div className="mt-2 text-[0.66rem] leading-snug text-muted-foreground/70">
            Toggle with Ctrl/Cmd + D. Overwrites your current plan.
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border shadow-md transition-colors",
          open
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border bg-card/90 text-muted-foreground hover:text-foreground"
        )}
        title="Demo data (Ctrl/Cmd + D)"
        aria-label="Toggle demo data panel"
      >
        <Bug className="h-4 w-4" />
      </button>
    </div>
  );
}
