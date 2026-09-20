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
import DebugPanel from "./components/DebugPanel";
import ImportModal from "./components/ImportModal";
import {
  buildGenEdTagIndex,
  buildMajorTagIndex,
  mergeTagIndexes,
} from "./lib/genEdIndex";
import { autocompleteDegree } from "./lib/autocomplete";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, Upload } from "lucide-react";

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

  /** Demo: fill in the courses needed to satisfy all remaining requirements. */
  function autocomplete() {
    setPlan((prev) => {
      if (!prev || !catalog) return prev;
      const next = autocompleteDegree(prev, catalog);
      return next;
    });
    setTab("planner");
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
        onAutocomplete={autocomplete}
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
