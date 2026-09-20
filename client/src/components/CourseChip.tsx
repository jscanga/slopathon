import type { CatalogCourse, PlannedCourse } from "../types";
import type { CourseTag } from "../lib/genEdIndex";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  planned: PlannedCourse;
  info?: CatalogCourse;
  tags: CourseTag[];
  onRemove: () => void;
}

const PRIORITY: CourseTag["type"][] = ["capstone", "core", "math", "elective", "genEd"];

const BORDER: Record<CourseTag["type"], string> = {
  core: "border-l-ink-core",
  math: "border-l-ink-math",
  elective: "border-l-ink-elective",
  capstone: "border-l-ink-capstone",
  genEd: "border-l-ink-genEd",
};

function primaryTagType(tags: CourseTag[]): CourseTag["type"] | null {
  for (const type of PRIORITY) {
    if (tags.some((t) => t.type === type)) return type;
  }
  return null;
}

export default function CourseChip({ planned, info, tags, onRemove }: Props) {
  const primary = primaryTagType(tags);
  const isTransfer = planned.source === "transfer";

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md border border-l-4 bg-card/90 px-2.5 py-1.5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-px hover:shadow-soft",
        primary ? BORDER[primary] : "border-l-muted-foreground/40",
        isTransfer && "border-dashed"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-code text-xs text-muted-foreground">{planned.code}</span>
          <span className="min-w-0 flex-1 truncate text-[0.8rem] text-foreground">
            {info?.name ?? "Unknown course"}
          </span>
        </div>
        {isTransfer && planned.transferFrom && (
          <div className="truncate text-[0.68rem] italic text-muted-foreground">
            from {planned.transferFrom.school} ({planned.transferFrom.code})
          </div>
        )}
      </div>
      <span className="font-code text-[0.7rem] text-muted-foreground">
        {info?.credits ?? "?"}cr
      </span>
      <button
        className="text-muted-foreground/60 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
        onClick={onRemove}
        aria-label={`Remove ${planned.code}`}
        title={`Remove ${planned.code}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
