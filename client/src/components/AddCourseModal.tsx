import { useMemo, useState } from "react";
import type { CourseCatalog, CourseCode, GenEdRequirements } from "../types";
import type { CourseTag } from "../lib/genEdIndex";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  catalog: CourseCatalog;
  genEd: GenEdRequirements;
  courseTags: Record<CourseCode, CourseTag[]>;
  onPick: (code: CourseCode) => void;
  onClose: () => void;
}

const TAG_LABELS: Record<CourseTag["type"], string> = {
  core: "Core",
  elective: "Elective",
  math: "Math",
  capstone: "Capstone",
  genEd: "Gen ed",
};

const TAG_BG: Record<CourseTag["type"], string> = {
  core: "bg-ink-core",
  math: "bg-ink-math",
  elective: "bg-ink-elective",
  capstone: "bg-ink-capstone",
  genEd: "bg-ink-genEd",
};

function TagBadges({ tags }: { tags: CourseTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex gap-1">
      {tags.slice(0, 3).map((t, i) => (
        <span
          key={i}
          className={cn("rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium text-white", TAG_BG[t.type])}
          title={t.label}
        >
          {TAG_LABELS[t.type]}
        </span>
      ))}
    </div>
  );
}

export default function AddCourseModal({
  catalog,
  genEd,
  courseTags,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const activeCategory = genEd.categories.find((c) => c.id === activeCategoryId) ?? null;

  const categoryCodes = useMemo(() => {
    if (!activeCategory) return null;
    if (activeCategory.type === "single") return new Set(activeCategory.courses);
    return new Set(activeCategory.sequences.flatMap((s) => s.courses));
  }, [activeCategory]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    let entries = Object.entries(catalog);
    if (categoryCodes) {
      entries = entries.filter(([code]) => categoryCodes.has(code));
    }
    if (q) {
      entries = entries.filter(
        ([code, info]) =>
          code.toUpperCase().includes(q) || info.name.toUpperCase().includes(q)
      );
    } else if (!categoryCodes) {
      return [];
    }
    return entries.slice(0, 40);
  }, [query, catalog, categoryCodes]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] w-[min(600px,92vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 p-5">
          <DialogTitle>Add a course</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          <button
            className={cn(
              "rounded-full border px-2.5 py-1 text-[0.76rem] transition-colors",
              activeCategoryId === null
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
            onClick={() => setActiveCategoryId(null)}
          >
            All courses
          </button>
          {genEd.categories.map((cat) => (
            <button
              key={cat.id}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.76rem] transition-colors",
                activeCategoryId === cat.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setActiveCategoryId(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative mx-5 mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            autoFocus
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={
              activeCategory
                ? `Search within ${activeCategory.label}…`
                : "Search by course code or title…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {activeCategory && activeCategory.type === "sequence" && (
          <p className="mx-5 mt-2 text-[0.78rem] text-muted-foreground">{activeCategory.note}</p>
        )}

        <div className="mt-3 flex-1 overflow-y-auto py-1">
          {!activeCategory && query.trim() === "" && (
            <div className="px-5 py-4 text-sm text-muted-foreground">
              Start typing, or pick a gen-ed category above to browse eligible courses.
            </div>
          )}
          {results.length === 0 && (activeCategory || query.trim() !== "") && (
            <div className="px-5 py-4 text-sm text-muted-foreground">No matches.</div>
          )}
          {results.map(([code, info]) => (
            <button
              key={code}
              className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-5 py-2.5 text-left transition-colors hover:bg-accent/60"
              onClick={() => onPick(code)}
            >
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="font-code text-sm text-foreground">{code}</span>
                <span className="truncate text-sm text-muted-foreground">{info.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TagBadges tags={courseTags[code] ?? []} />
                <span className="font-code text-xs text-muted-foreground">{info.credits}cr</span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
