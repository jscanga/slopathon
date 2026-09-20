import { useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  CourseCatalog,
  StudentPlan,
  TransferEquivalencyWithCost,
  TransferSortKey,
} from "../types";
import TermPickerModal from "./TermPickerModal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Plus, Search, Info } from "lucide-react";

interface Props {
  plan: StudentPlan;
  catalog: CourseCatalog;
  onAddTransferCourse: (
    semesterId: string,
    pittCode: string,
    transferFrom: { school: string; code: string; title?: string; credits?: number }
  ) => void;
}

function CostCell({ eq }: { eq: TransferEquivalencyWithCost }) {
  const cost = eq.cost?.costPerCreditInState ?? null;
  if (cost == null) {
    return (
      <div className="text-right font-code">
        <span className="text-lg text-muted-foreground/50">—</span>
      </div>
    );
  }
  return (
    <div className="min-w-[92px] text-right font-code">
      <div className="text-base font-semibold text-primary">${cost}</div>
      <div className="text-[0.65rem] text-muted-foreground">/ credit (est.)</div>
      {eq.cost?.onlineSharePct != null && (
        <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
          {eq.cost.onlineSharePct}% online
        </div>
      )}
    </div>
  );
}

export default function TransferSearch({ plan, catalog, onAddTransferCourse }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TransferSortKey>("cost-asc");
  const [results, setResults] = useState<TransferEquivalencyWithCost[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasCostData, setHasCostData] = useState<boolean>(false);
  const [pickerFor, setPickerFor] = useState<TransferEquivalencyWithCost | null>(null);

  useEffect(() => {
    api.getTransferEquivalencies().then((all) => {
      setTotalCount(all.length);
      setHasCostData(all.some((e) => e.cost && e.cost.costPerCreditInState != null));
    });
  }, []);

  useEffect(() => {
    const q = query.trim();
    setLoading(true);
    const handle = setTimeout(() => {
      api
        .searchTransferEquivalencies(q, sort)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, sort]);

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-5 max-w-[680px]">
        <h2 className="mb-1 font-display text-[1.4rem] font-semibold">Transfer course search</h2>
        <p className="text-sm text-muted-foreground">
          Find a course from another school, see its Pitt equivalent and estimated
          cost per credit, then drop it into your timeline. Sorted cheapest-first by
          default.
        </p>
      </div>

      {totalCount === 0 && (
        <div className="mb-5 flex max-w-[680px] items-start gap-2 rounded-lg border border-ink-elective/40 bg-ink-elective/10 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-elective" />
          <span>
            The equivalency database hasn't loaded yet. Add it to{" "}
            <code className="rounded bg-muted px-1">server/src/data/transfer-equivalencies.json</code>{" "}
            and this tab will populate.
          </span>
        </div>
      )}
      {totalCount !== 0 && !hasCostData && (
        <div className="mb-5 flex max-w-[680px] items-start gap-2 rounded-lg border border-ink-elective/40 bg-ink-elective/10 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-elective" />
          <span>
            Cost data isn't loaded yet, so every school shows "—" for cost and sorting
            by price won't reorder anything. Run{" "}
            <code className="rounded bg-muted px-1">node scripts/fetch-cost-data.mjs</code>{" "}
            in the server folder to populate it.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Search by school, external course, or Pitt course…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as TransferSortKey)}>
          <SelectTrigger className="h-10 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cost-asc">Cheapest first</SelectItem>
            <SelectItem value="cost-desc">Most expensive first</SelectItem>
            <SelectItem value="online-desc">Most online first</SelectItem>
            <SelectItem value="school">School name (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="mb-4 text-sm text-muted-foreground">Searching…</p>}
      {!loading && results.length === 0 && totalCount !== 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {query.trim() ? `No equivalencies found for "${query}".` : "Type to search."}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        {results.map((eq, i) => (
          <div
            key={`${eq.externalSchool}-${eq.externalCourse.code}-${i}`}
            className="grid grid-cols-1 items-center gap-3 rounded-lg border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-soft sm:grid-cols-[1fr_auto_1fr_auto_auto] sm:gap-4"
          >
            <div className="min-w-0">
              <span className="block text-[0.72rem] text-muted-foreground">{eq.externalSchool}</span>
              <div className="truncate">
                <span className="font-code text-sm font-medium text-foreground">{eq.externalCourse.code}</span>{" "}
                <span className="text-sm text-muted-foreground">{eq.externalCourse.title}</span>
              </div>
            </div>
            <ArrowRight className="hidden h-4 w-4 text-primary sm:block" />
            <div className="min-w-0">
              <span className="font-code text-sm font-medium text-foreground">{eq.pittCourse.code}</span>{" "}
              <span className="text-sm text-muted-foreground">
                {eq.pittCourse.title || catalog[eq.pittCourse.code]?.name || ""}
              </span>
              {eq.isGenericPlaceholder && (
                <div className="text-[0.7rem] italic text-ink-elective">
                  General credit — not tied to a specific requirement
                </div>
              )}
            </div>
            <CostCell eq={eq} />
            <Button size="sm" variant="outline" onClick={() => setPickerFor(eq)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        ))}
      </div>

      {pickerFor && (
        <TermPickerModal
          semesters={plan.semesters}
          catalog={catalog}
          courseLabel={`${pickerFor.pittCourse.code} — ${
            pickerFor.pittCourse.title || catalog[pickerFor.pittCourse.code]?.name || ""
          }`}
          onClose={() => setPickerFor(null)}
          onPick={(semesterId) => {
            onAddTransferCourse(semesterId, pickerFor.pittCourse.code, {
              school: pickerFor.externalSchool,
              code: pickerFor.externalCourse.code,
              title: pickerFor.externalCourse.title,
              credits: pickerFor.externalCourse.credits,
            });
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}
