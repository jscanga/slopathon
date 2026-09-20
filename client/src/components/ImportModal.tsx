import { useRef, useState } from "react";
import { Upload, FileText, AlertTriangle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { importPeopleSoftPdf, type ImportResult } from "@/lib/pdfLoader";
import type { StudentPlan } from "../types";

interface Props {
  onImport: (plan: StudentPlan) => void;
  onClose: () => void;
}

/**
 * Upload + parse a PeopleSoft What-If PDF, preview what was found, and (on
 * confirm) replace the current plan. Parsing happens entirely in the browser.
 */
export default function ImportModal({ onImport, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const res = await importPeopleSoftPdf(file);
      setResult(res);
      if (res.parse.rows.length === 0) {
        setError("No courses were found in that PDF.");
      }
    } catch (e) {
      setError(
        `Couldn't read that PDF: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
    }
  }

  const courseCount = result?.parse.rows.length ?? 0;
  const termCount = result
    ? new Set(result.plan.semesters.filter((s) => s.courses.length).map((s) => s.id)).size
    : 0;
  const transferCount = result?.parse.rows.filter((r) => r.isTransfer).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex w-[min(560px,92vw)] max-h-[82vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-[1.05rem] font-semibold">
            <Upload className="h-4 w-4 text-primary" /> Import PeopleSoft What-If report
          </h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          {/* Drop / pick zone */}
          <button
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              busy
                ? "border-border bg-muted/40"
                : "border-border hover:border-primary/60 hover:bg-primary/5"
            )}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <FileText className="h-7 w-7 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {busy ? "Reading PDF…" : fileName ?? "Click to choose your What-If PDF"}
            </span>
            <span className="text-[0.75rem] text-muted-foreground">
              The file is parsed locally in your browser — nothing is uploaded.
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && courseCount > 0 && (
            <div className="mt-4">
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Courses" value={courseCount} />
                <Stat label="Transfer" value={transferCount} />
                <Stat label="Terms" value={termCount} />
              </div>

              {result.warnings.length > 0 && (
                <div className="mb-3 space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-[0.78rem] text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-elective" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
                {result.plan.semesters
                  .filter((s) => s.courses.length > 0)
                  .map((s) => (
                    <div key={s.id} className="border-b border-border/60 px-3 py-2 last:border-b-0">
                      <div className="mb-1 font-code text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {s.term} {s.year}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {s.courses.map((c) => (
                          <span
                            key={c.code}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[0.72rem]",
                              c.source === "transfer"
                                ? "border-dashed border-ink-elective/50 text-ink-elective"
                                : "border-border text-foreground"
                            )}
                          >
                            {c.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  onClick={() => onImport(result.plan)}
                >
                  Replace plan with this
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 py-2">
      <div className="font-display text-xl font-semibold text-foreground">{value}</div>
      <div className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
