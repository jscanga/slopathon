import type { CourseCatalog, CourseCode, Semester } from "../types";
import type { CourseTag } from "../lib/genEdIndex";
import CourseChip from "./CourseChip";
import SeasonScene, { type SeasonName } from "./SeasonScene";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  semesters: Semester[];
  catalog: CourseCatalog;
  courseTags: Record<CourseCode, CourseTag[]>;
  onAddCourse: (semesterId: string) => void;
  onRemoveCourse: (semesterId: string, code: string) => void;
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

function TermBlock({
  sem,
  catalog,
  courseTags,
  onAddCourse,
  onRemoveCourse,
  delay = 0,
}: {
  sem: Semester;
  catalog: CourseCatalog;
  courseTags: Record<CourseCode, CourseTag[]>;
  onAddCourse: () => void;
  onRemoveCourse: (code: string) => void;
  delay?: number;
}) {
  const season = sem.term as SeasonName;
  const totalCredits = sem.courses.reduce(
    (sum, c) => sum + (catalog[c.code]?.credits ?? 0),
    0
  );

  return (
    <Card
      className="group flex min-h-[210px] animate-rise flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
      style={{ animationDelay: `${delay}ms` }}
    >
      <SeasonScene season={season} className="px-3.5 pb-9 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3
              className={cn(
                "text-[1.2rem] font-semibold leading-none [text-shadow:0_1px_3px_rgba(255,255,255,0.75)]",
                inkClass[season]
              )}
            >
              {sem.term}
            </h3>
            <span className={cn("font-code text-[0.68rem] font-medium opacity-80", inkClass[season])}>
              {sem.year}
            </span>
          </div>
          <span
            className={cn(
              "rounded-full bg-white/65 px-2 py-0.5 font-code text-[0.68rem] font-medium shadow-sm backdrop-blur-sm",
              inkClass[season]
            )}
          >
            {totalCredits} cr
          </span>
        </div>
      </SeasonScene>

      <div className={cn("flex flex-1 flex-col gap-1.5 p-2.5", bodyClass[season])}>
        {sem.courses.length === 0 && (
          <p className="my-1 select-none text-center text-[0.78rem] italic text-muted-foreground/70">
            No courses yet
          </p>
        )}
        {sem.courses.map((c) => (
          <CourseChip
            key={c.code}
            planned={c}
            info={catalog[c.code]}
            tags={courseTags[c.code] ?? []}
            onRemove={() => onRemoveCourse(c.code)}
          />
        ))}
        <button
          className="mt-auto inline-flex items-center gap-1 self-start rounded-md border border-dashed border-foreground/20 bg-white/50 px-2.5 py-1 text-[0.78rem] font-medium text-foreground/70 transition-colors hover:border-primary/60 hover:bg-white hover:text-primary"
          onClick={onAddCourse}
        >
          <Plus className="h-3.5 w-3.5" /> Add course
        </button>
      </div>
    </Card>
  );
}

export default function SemesterBoard({
  semesters,
  catalog,
  courseTags,
  onAddCourse,
  onRemoveCourse,
}: Props) {
  const years: Semester[][] = [];
  for (let i = 0; i < semesters.length; i += 3) {
    years.push(semesters.slice(i, i + 3));
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="grid grid-cols-1 gap-x-8 gap-y-7 xl:grid-cols-2">
        {years.map((yearBlocks, idx) => (
          <section key={yearBlocks[0]?.id ?? idx}>
            <div className="mb-3 flex items-center gap-3">
              <span className="font-code text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Year {idx + 1}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {yearBlocks.map((sem, j) => (
                <TermBlock
                  key={sem.id}
                  sem={sem}
                  catalog={catalog}
                  courseTags={courseTags}
                  onAddCourse={() => onAddCourse(sem.id)}
                  onRemoveCourse={(code) => onRemoveCourse(sem.id, code)}
                  delay={(idx * 3 + j) * 55}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
