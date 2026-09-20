import type { CourseCatalog, Semester } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SeasonScene, { type SeasonName } from "./SeasonScene";
import { cn } from "@/lib/utils";

interface Props {
  semesters: Semester[];
  catalog: CourseCatalog;
  courseLabel: string; // e.g. "CS 0445 — ALGORITHMS…"
  onPick: (semesterId: string) => void;
  onClose: () => void;
}

const inkClass: Record<SeasonName, string> = {
  Fall: "season-ink-fall",
  Spring: "season-ink-spring",
  Summer: "season-ink-summer",
};
const bodyClass: Record<SeasonName, string> = {
  Fall: "season-body-fall",
  Spring: "season-body-spring",
  Summer: "season-body-summer",
};

export default function TermPickerModal({
  semesters,
  catalog,
  courseLabel,
  onPick,
  onClose,
}: Props) {
  const years: Semester[][] = [];
  for (let i = 0; i < semesters.length; i += 3) {
    years.push(semesters.slice(i, i + 3));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(820px,94vw)] max-w-none">
        <DialogHeader>
          <DialogTitle>
            Add <span className="font-code text-primary">{courseLabel}</span> to which term?
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-sm text-muted-foreground">
          Click a term. Existing courses are shown so you can balance your load.
        </p>
        <div className="mt-2 flex gap-4 overflow-x-auto pb-2">
          {years.map((yearBlocks, idx) => (
            <div key={yearBlocks[0]?.id ?? idx} className="shrink-0">
              <div className="mb-1.5 font-code text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Year {idx + 1}
              </div>
              <div className="flex gap-2">
                {yearBlocks.map((sem) => {
                  const season = sem.term as SeasonName;
                  const credits = sem.courses.reduce(
                    (sum, c) => sum + (catalog[c.code]?.credits ?? 0),
                    0
                  );
                  return (
                    <button
                      key={sem.id}
                      className="w-[150px] overflow-hidden rounded-lg border text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-soft hover:ring-2 hover:ring-primary/40"
                      onClick={() => onPick(sem.id)}
                    >
                      <SeasonScene season={season} className="px-2.5 pb-6 pt-2">
                        <div className="flex items-center justify-between">
                          <span className={cn("text-sm font-semibold [text-shadow:0_1px_2px_rgba(255,255,255,0.7)]", inkClass[season])}>
                            {sem.term}
                          </span>
                          <span className={cn("font-code text-[0.62rem] opacity-80", inkClass[season])}>
                            {sem.year}
                          </span>
                        </div>
                      </SeasonScene>
                      <div className={cn("min-h-[52px] space-y-0.5 p-2", bodyClass[season])}>
                        {sem.courses.length === 0 && (
                          <p className="text-[0.7rem] italic text-muted-foreground/70">Empty</p>
                        )}
                        {sem.courses.map((c) => (
                          <div key={c.code} className="flex items-baseline gap-1 text-[0.68rem]">
                            <span className="font-code text-muted-foreground">{c.code}</span>
                            <span className="truncate text-muted-foreground/80">
                              {catalog[c.code]?.name ?? ""}
                            </span>
                          </div>
                        ))}
                        <span className="mt-1 block font-code text-[0.6rem] text-muted-foreground/70">
                          {credits} cr
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
