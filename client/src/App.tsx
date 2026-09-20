import { useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import type {
  CourseCatalog,
  GenEdRequirements,
  MajorRequirements,
  PlanEvaluation,
  StudentPlan,
} from "./types";
import PlanSummary from "./components/PlanSummary";
import RequirementsBar from "./components/RequirementsBar";
import SemesterBoard from "./components/SemesterBoard";
import AddCourseModal from "./components/AddCourseModal";
import TransferSearch from "./components/TransferSearch";
import DuplicateCourseModal from "./components/DuplicateCourseModal";
import AutocompleteModal from "./components/AutocompleteModal";
import type { AutocompleteResult } from "./engine/autocomplete";
import DebugPanel from "./components/DebugPanel";
import ImportModal from "./components/ImportModal";
import {
  buildGenEdTagIndex,
  buildMajorTagIndex,
  mergeTagIndexes,
} from "./lib/genEdIndex";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { GraduationCap, Sparkles, Undo2, Upload, X } from "lucide-react";

type Tab = "planner" | "transfer";

interface PendingAdd {
  semesterId: string;
  code: string;
  source: "native" | "transfer";
  transferFrom?: { school: string; code: string; title?: string; credits?: number };
  existingLocation: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("planner");
  const [catalog, setCatalog] = useState<CourseCatalog | null>(null);
  const [major, setMajor] = useState<MajorRequirements | null>(null);
  const [genEd, setGenEd] = useState<GenEdRequirements | null>(null);
  const [plan, setPlan] = useState<StudentPlan | null>(null);
  const [evaluation, setEvaluation] = useState<PlanEvaluation | null>(null);
  const [modalSemesterId, setModalSemesterId] = useState<string | null>(null);
  const [selectedMajorId, setSelectedMajorId] = useState<string>("cs-bs-2023");
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autocompleting, setAutocompleting] = useState(false);
  const [autoPreview, setAutoPreview] = useState<AutocompleteResult | null>(null);
  /** The plan as it was before the last autocomplete, so it can be undone. */
  const [undoPlan, setUndoPlan] = useState<StudentPlan | null>(null);

  useEffect(() => {
    Promise.all([
      api.getCourseCatalog(),
      api.getPlan(),
      api.getMajorRequirements(),
      api.getGenEdRequirements(),
    ])
      .then(([catalogRes, planRes, majorRes, genEdRes]) => {
        setCatalog(catalogRes);
        setPlan(planRes);
        setMajor(majorRes);
        setGenEd(genEdRes);
        setSelectedMajorId(majorRes.id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!plan) return;
    api.evaluatePlan(plan).then(setEvaluation).catch((e) => setError(String(e)));
    api.savePlan(plan).catch((e) => setError(String(e)));
  }, [plan]);

  const courseTags = useMemo(() => {
    if (!major || !genEd) return {};
    return mergeTagIndexes(buildMajorTagIndex(major), buildGenEdTagIndex(genEd));
  }, [major, genEd]);

  function labelFor(semesterId: string): string {
    const s = plan?.semesters.find((x) => x.id === semesterId);
    return s ? `${s.term} ${s.year}` : "another term";
  }

  /** Finds the semester a course is already in, if any. */
  function findExisting(code: string): string | null {
    if (!plan) return null;
    const sem = plan.semesters.find((s) => s.courses.some((c) => c.code === code));
    return sem ? sem.id : null;
  }

  /** Performs the actual insert (no duplicate checking). */
  function insertCourse(
    semesterId: string,
    code: string,
    source: "native" | "transfer",
    transferFrom?: { school: string; code: string; title?: string; credits?: number }
  ) {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        semesters: prev.semesters.map((s) =>
          s.id === semesterId
            ? {
                ...s,
                courses: [
                  ...s.courses,
                  source === "transfer"
                    ? { code, source, transferFrom }
                    : { code, source },
                ],
              }
            : s
        ),
      };
    });
  }

  /** Duplicate rules:
   *  - Same course already in the SAME target semester → silently ignore
   *    (can't add a class twice to one term).
   *  - Same course in a DIFFERENT semester → ask for confirmation.
   *  - Otherwise → insert. */
  function requestAdd(
    semesterId: string,
    code: string,
    source: "native" | "transfer",
    transferFrom?: { school: string; code: string; title?: string; credits?: number }
  ) {
    const existingSemId = findExisting(code);
    if (existingSemId === semesterId) {
      // already in this exact term — do nothing
      return;
    }
    if (existingSemId) {
      setPendingAdd({
        semesterId,
        code,
        source,
        transferFrom,
        existingLocation: labelFor(existingSemId),
      });
      return;
    }
    insertCourse(semesterId, code, source, transferFrom);
  }

  function addCourse(semesterId: string, code: string) {
    requestAdd(semesterId, code, "native");
    setModalSemesterId(null);
  }

  function addTransferCourse(
    semesterId: string,
    code: string,
    transferFrom: { school: string; code: string; title?: string; credits?: number }
  ) {
    requestAdd(semesterId, code, "transfer", transferFrom);
  }

  /** Builds an autocomplete proposal. Nothing is committed until the user
   *  confirms in the preview — the first run also has to pull the 12MB
   *  equivalency table, hence the pending state. */
  async function requestAutocomplete() {
    if (!plan) return;
    setAutocompleting(true);
    try {
      setAutoPreview(await api.autocompletePlan(plan));
    } catch (e) {
      setError(String(e));
    } finally {
      setAutocompleting(false);
    }
  }

  function applyAutocomplete() {
    if (!autoPreview || !plan) return;
    setUndoPlan(plan);
    setPlan(autoPreview.plan);
    setAutoPreview(null);
    setTab("planner");
  }

  function undoAutocomplete() {
    if (!undoPlan) return;
    setPlan(undoPlan);
    setUndoPlan(null);
  }

  function removeCourse(semesterId: string, code: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        semesters: prev.semesters.map((s) =>
          s.id === semesterId
            ? { ...s, courses: s.courses.filter((c) => c.code !== code) }
            : s
        ),
      };
    });
  }

  /** Debug/demo: replace the whole plan with a sample, or clear it. The
   *  existing plan effect persists + re-evaluates automatically. */
  function loadSamplePlan(sample: StudentPlan) {
    setPlan(sample);
    setTab("planner");
  }

  function clearPlan() {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        semesters: prev.semesters.map((s) => ({ ...s, courses: [] })),
      };
    });
  }


  if (error) {
    return (
      <div className="mx-auto max-w-lg p-10">
        <h1 className="mb-2 text-2xl">Something went wrong</h1>
        <p className="mb-2 text-muted-foreground">{error}</p>
        <p className="text-sm text-muted-foreground">
          Make sure the backend server is running (
          <code className="rounded bg-muted px-1 py-0.5">npm run dev</code> in{" "}
          <code className="rounded bg-muted px-1 py-0.5">/server</code>) on port 4000.
        </p>
      </div>
    );
  }

  const majorOptions = major ? [{ id: major.id, name: major.name }] : [];

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] md:grid-cols-[300px_1fr]">
      <header className="col-span-full flex items-center justify-between border-b border-border/70 bg-card/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <GraduationCap className="h-[1.15rem] w-[1.15rem]" />
          </span>
          <h1 className="text-[1.4rem] font-semibold tracking-tight">
            <span className="text-primary">transfr</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            title="Import a PeopleSoft What-If report PDF"
          >
            <Upload className="h-3.5 w-3.5" /> Import PDF
          </button>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="planner">Timeline</TabsTrigger>
              <TabsTrigger value="transfer">Transfer Search</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <aside className="hidden overflow-y-auto border-r border-border/70 bg-card/60 p-5 md:block">
        <PlanSummary
          evaluation={evaluation}
          majorOptions={majorOptions}
          selectedMajorId={selectedMajorId}
          onSelectMajor={setSelectedMajorId}
          onAutocomplete={requestAutocomplete}
          autocompleting={autocompleting}
        />
      </aside>

      <main className="min-w-0 overflow-auto p-6 lg:p-8">
        {!plan || !catalog ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : tab === "planner" ? (
          <SemesterBoard
            semesters={plan.semesters}
            catalog={catalog}
            courseTags={courseTags}
            onAddCourse={(semesterId) => setModalSemesterId(semesterId)}
            onRemoveCourse={removeCourse}
          />
        ) : (
          <TransferSearch
            plan={plan}
            catalog={catalog}
            onAddTransferCourse={addTransferCourse}
          />
        )}
      </main>

      <RequirementsBar evaluation={evaluation} />

      {modalSemesterId && catalog && genEd && (
        <AddCourseModal
          catalog={catalog}
          genEd={genEd}
          courseTags={courseTags}
          onClose={() => setModalSemesterId(null)}
          onPick={(code) => addCourse(modalSemesterId, code)}
        />
      )}

      {autoPreview && (
        <AutocompleteModal
          result={autoPreview}
          onApply={applyAutocomplete}
          onCancel={() => setAutoPreview(null)}
        />
      )}

      {undoPlan && (
        <div className="fixed left-1/2 top-[4.5rem] z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/25 bg-card/95 py-2 pl-4 pr-2 shadow-soft backdrop-blur-sm">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Plan filled in.
          </span>
          <Button size="sm" variant="outline" onClick={undoAutocomplete}>
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </Button>
          <button
            className="rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
            onClick={() => setUndoPlan(null)}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {pendingAdd && (
        <DuplicateCourseModal
          courseCode={pendingAdd.code}
          existingLocation={pendingAdd.existingLocation}
          onCancel={() => setPendingAdd(null)}
          onConfirm={() => {
            insertCourse(
              pendingAdd.semesterId,
              pendingAdd.code,
              pendingAdd.source,
              pendingAdd.transferFrom
            );
            setPendingAdd(null);
          }}
        />
      )}

      <DebugPanel
        onLoadPlan={loadSamplePlan}
        onClearPlan={clearPlan}
        onAutocomplete={requestAutocomplete}
      />

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImport={(imported) => {
            setPlan(imported);
            setTab("planner");
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}
