# transfr

Optimize your degree, reroute your future

Most students plan their degree in a spreadsheet and find out what it costs when the bill arrives. transfr puts both in one screen: a four-year timeline that checks your major and gen-ed requirements as you build it, and a searchable database of every course Pitt accepts in transfer — 43,239 equivalencies from 1,801 schools — with each school's cost per credit attached. Plan the degree, see the price, reroute the expensive parts.

A full-stack TypeScript/React app for planning a University of Pittsburgh
degree timeline: a semester-by-semester grid where you add courses, and a
live requirements checklist that tracks what's satisfied.


## Tech stack

**Frontend**
- React 18 + TypeScript 5.5
- Vite 5 (build + dev server)
- Tailwind CSS 3.4, with `tailwind-merge`, `clsx`, `class-variance-authority`, `tailwindcss-animate`
- Radix UI primitives (dialog, select, tabs, progress) via shadcn-style components
- lucide-react for icons
- Inline SVG for the seasonal term art — no image assets
- Source Serif 4 / IBM Plex Sans / IBM Plex Mono

**Backend**
- Express 4 + TypeScript (local dev; production runs fully static)
- tsx for dev-mode execution

**Data & persistence**
- Static JSON served from the CDN; requirement and cost engine runs in-browser
- `localStorage` for plan persistence
- U.S. Dept. of Education College Scorecard API for school cost and online-share data
- Pitt's official transfer equivalency database (43,239 rows, 1,801 schools)

**Deployment**
- Vercel

## Running it

Two terminals:

```bash
# terminal 1
cd server
npm install
npm run dev        # http://localhost:4000

# terminal 2
cd client
npm install
npm run dev         # http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the
backend on port 4000 (see `client/vite.config.ts`).

## What's implemented

- **Two tabs**: "Timeline" (the semester grid) and "Transfer Tool Search"
  (search external-school courses, see cost/online data, add straight into
  a term).
- **12-block timeline**: 4 years × Fall/Spring/Summer, laid out
  horizontally with a bracket label above each year. Click "+ Add course"
  on any block to search the catalog and drop a course in.
- **Transfer → timeline flow**: adding a course from the Transfer tab pops
  up all 12 blocks in a modal (showing what's already in each), and you
  click the block to place it.
- **Credit tracking against 120**: the sidebar's progress ring tracks
  total planned credits against the full 120-credit graduation
  requirement (`totalDegreeCredits` in `major-requirements.json`), with a
  secondary line showing major-specific credit progress (against the
  major's own 54-credit total) underneath.
- **Live requirements sidebar**: recomputes on every add/remove —
  - Major core sequences (Programming/Data Structures, Systems, Discrete
    Math/Theory), the ML foundations course, 6 upper-level CS electives
    (CS 1504+, capstone codes excluded), required math (Calc 1 + Linear
    Algebra choice), and the capstone experience (Internship / Directed
    Research / Capstone Course / Co-op).
  - Gen-ed categories: the 9 "one each" categories, the science sequence
    (pick one matched pair), and the science non-sequence elective.
- **Persistence**: the plan is saved to `server/src/data/student-plan.json`
  on every change (simple file store — good enough for one user, not meant
  to survive a real multi-user deployment).
- **Browsable gen-eds**: the "Add course" modal has a chip row for every
  gen-ed category (and "All courses"). Picking one filters the search to
  just that category's eligible courses — including science sequences,
  which show a note reminding you both courses must come from the same
  row. Search results also show colored tag badges for what a course
  counts toward (Core / Math / Elective / Capstone / Gen ed), and planted
  course chips get a matching colored left border, with a legend in the
  sidebar.

- **PDF import**: "Import PDF" in the header parses a PeopleSoft What-If
  report entirely in the browser (`client/src/lib/peoplesoftImport.ts`,
  `pdfLoader.ts`) and builds a plan from it. Courses that aren't tied to a
  real term (AP / already-transferred credit) land in a standalone **"Other"**
  row, which `Semester.rowLabel` drives.
- **Demo panel**: Ctrl/Cmd + D opens a panel with two canned scenarios (a
  vanilla 4-year Pitt plan and a cheaper 3-year plan using real CCAC
  equivalencies), plus clear-plan and autocomplete shortcuts. Demo only — it
  overwrites the current plan.

## Known gaps (by design, for this MVP pass)

- **No prerequisite checking yet.** The major requirements data has no
  prerequisite chains, so there's no red-highlighting for unmet
  prerequisites. The `PlannedCourse` type and evaluation engine are
  structured so this can be added later without a rework — see
  `server/src/engine/evaluatePlan.ts`.
- **Credit hours for most catalog courses are defaulted to 3**,
  tagged `"creditsSource": "default-assumed"` in
  `server/src/data/courses-catalog.json`. The 17 courses with real known
  credits (the CS/Math core + capstone options, plus `CMPINF 0010` at 4 and
  `CMPINF 0001` at 1) are tagged `"known"`. If you get real per-course
  credit data, re-run a merge keeping the `"known"` ones untouched.
  `CMPINF 0001` was added by hand — it appears in no source file, so its
  credits are verified but its **name is a placeholder** waiting on a real
  title, and nothing references the code, so it's reachable only by
  searching the "Add course" modal.
- **Co-op rotation counting** isn't modeled — the capstone requirement is
  satisfied by presence of `CS 1906` in the plan, not by counting 2
  rotations.
- **No auth / multi-user support** — this is a single-plan MVP.

## Data files (also useful standalone)

- `server/src/data/major-requirements.json` — CS BS requirement structure.
- `server/src/data/gen-ed-requirements.json` — gen-ed categories → eligible
  course codes, with a `dataQualityFlags` field noting `CMPINF 0070`, which
  carries the Science Sequence attribute but isn't part of any known
  bio/chem/physics/neuro pair (worth checking against the catalog).
- `server/src/data/courses-catalog.json` — course code → name, credits,
  gen-ed attributes, for ~2,247 courses (grew from 1,313 after merging in
  every Pitt course referenced by a transfer equivalency — see below).

## Estimated cost model

The left sidebar shows a running cost estimate computed server-side in
`server/src/engine/evaluatePlan.ts` (`computeCost`). Per the figures
provided:

- **Pitt (native) courses, per term**: sum the term's non-transfer
  credits. If ≥ 12 → flat full-time charge of **$12,322**. If 1–11 →
  **$1,026 / credit**. If 0 → nothing. (Constants at the top of
  `evaluatePlan.ts`.)
- **Transfer courses**: billed separately at their home school's estimated
  per-credit rate (from the College Scorecard cost data) × the course's
  credits, added on top. If a transfer course's school has no cost data,
  it's skipped and the UI flags the total as a floor rather than a full
  estimate.
- **Total** = Pitt term costs + transfer costs, shown with both lines
  broken out.

Because Summer is a real term in the 12-block layout, a Summer term with
≥ 12 non-transfer credits is charged the same flat rate as any other term.

## Autocomplete

Reachable two ways — **"Autocomplete my degree"** in the left sidebar, and
**"Autocomplete degree"** in the demo panel (Ctrl/Cmd + D). Both run the same
solver; there is deliberately only one implementation.

Autocomplete fills every unsatisfied requirement
and lays the result across the 12 terms, choosing where to take each course
so the total comes out as low as the cost model allows. It proposes first —
nothing is committed until you confirm in the preview — and the change can
be undone afterwards. It builds *around* whatever is already in your plan
rather than replacing it, so a hand-placed course is never duplicated or
moved.

The interesting part is deciding what to transfer. Pitt's rate is flat at
12+ credits in a term, so pulling one course out of a full term saves
nothing and adds the other school's tuition on top — savings only appear
when enough credits leave to drop a term below full-time or empty it. A
per-course greedy pass can't see that, so the optimizer sorts candidates
cheapest-first and sweeps the cutoff ("transfer the cheapest k") for every
k, keeping whichever k actually costs least. See
`client/src/engine/autocomplete.ts`.

Assumptions worth knowing about, all of them in constants at the top of
that file:

- **`MIN_PITT_CREDITS = 60`** — a residency floor. Without it the answer is
  degenerate: transferring is cheaper per credit almost everywhere, so the
  optimizer empties every term and returns a "Pitt degree" containing two
  Pitt courses. **60 is a placeholder, not a figure verified against current
  Pitt policy** — check the Dietrich School's residency and transfer-credit
  rules before trusting a plan this produces. Set it to 0 to see the
  unconstrained cheapest path.
- **Transfers are taken over the summer, and only there.** Native Pitt
  courses prefer Fall/Spring so the summers stay free for them. That bounds
  how much can be transferred at all — four summers at
  `MAX_COURSES_PER_TERM` each — and `chooseTransfers` caps its selection to
  that capacity, so the optimizer never picks more than can be placed. When
  the cap is what stopped it going cheaper, the preview says so.
- **Capstones aren't transferred.** `CS 1900/1950/1980/1906` are excluded
  from transfer candidates — an internship or team-project capstone isn't
  something you take at another school.
- **Sequence order is enforced, real prerequisites are not.** Courses inside
  a declared sequence land in separate, increasing terms (and before any
  later course in that chain you've already placed). The requirements data
  still has no prerequisite graph, so nothing outside a sequence is ordered.
- **Gen-ed overlap is allowed.** One course satisfying two categories
  satisfies both without being taken twice, which is cheaper and matches how
  Pitt treats the overlap.
- **Target load is 15 credits/term**, up to 6 courses.
- **The 120-credit total is a floor and is guaranteed.** Free electives are
  added until `totalDegreeCredits` is cleared; the result carries
  `meetsCreditRequirement`, and the preview shows a red warning if a plan
  ever comes up short. Note that landing *exactly* on 120 is not reachable
  with the current catalog: 2,245 of its 2,247 courses are 3 credits and
  `MATH 0220` (required Calc 1) is 4, so every total is `4 + 3n` and the
  smallest one clearing 120 is **121**. That is the minimum overshoot, not
  a rounding bug — it would change only if real per-course credit data
  replaced the `default-assumed` 3s.
- **Labeled rows are never scheduled into.** A semester carrying a `rowLabel`
  (the "Other" bucket that PDF import creates for AP/transfer credit) is a
  record of credit already earned, not a term you can enroll in.

Both headline figures in the preview — "every course at Pitt" and "this plan"
— are produced by running `computeCost` over two real plans, the proposal and
an all-native scheduling of the same course list. The optimizer's internal
estimate is only used to *choose* what to transfer, so the preview and the
sidebar can never quote different totals.

## Layout

- **Left sidebar**: large 120-credit progress ring, a Major dropdown
  (currently just Computer Science, BS — the scaffolding is there to add
  more), and the estimated-cost box.
- **Main area**: the active tab (Timeline or Transfer search).
- **Bottom bar (full width)**: the major + gen-ed requirement checklist as
  pills (green check when satisfied), plus the course-color key.



The Transfer tab shows an estimated **cost per credit** and **online %**
per school, and sorts cheapest-first by default. This data comes from the
U.S. Dept. of Education College Scorecard, fetched by a **one-time script**
you run locally (it can't run inside a no-network sandbox):

```bash
cd server
# get a free key at https://api.data.gov/signup/ (instant)
SCORECARD_API_KEY=your_key node scripts/fetch-cost-data.mjs
```

That writes `server/src/data/school-cost-data.json`, keyed by your
equivalency file's school names. Restart the server and the Transfer tab
picks it up. Until you run it, the file is `{}` and every school shows "—"
(the app shows a banner explaining this).

Honest caveats about this data:

- **Cost per credit is DERIVED, not official.** College Scorecard reports
  *annual* tuition, not a per-credit rate — there is no per-credit field.
  The script estimates it as annual in-state tuition ÷ 30 credits/yr, and
  the UI labels it "(est.)". The raw annual figures are kept in the JSON
  so you can change the divisor or show annual instead.
- **Not every school will match.** Your equivalency file has ALL-CAPS
  names and no institution IDs, so schools are matched to Scorecard by
  fuzzy name search. Unmatched schools get `null` and show "—", and always
  sort to the bottom regardless of sort direction — so "cheapest first"
  never surfaces an unknown as if it were free.
- **Online %** uses the Scorecard field `latest.student.share_distance_education`.
  If that field name has drifted or is absent for a school, the value is
  simply omitted (shows nothing) rather than guessed. Verify against the
  current [data dictionary](https://collegescorecard.ed.gov/data/data-documentation/)
  if coverage looks low.

## Sorting

The Transfer tab sorts server-side (`/api/transfer-equivalencies/search?q=…&sort=…`).
Options: cheapest first (default), most expensive first, most online first,
school A–Z. Rows with no cost data always sink to the bottom.



Loaded from your `university-of-pittsburgh.json`: **1,801 schools,
43,239 equivalency rows**. A few notes on how the raw data was handled:

- The source mixed two formats for the external course: sometimes code
  and title were separate fields, sometimes jammed into one string like
  `"BIOL1107 PRINCIPLES OF BIOLOGY I"`. Both are parsed into
  `{ code, title }`. About 5,400 rows had a trailing `"(3)"`-style credit
  count embedded in that string — those became `externalCourse.credits`;
  most rows have no external credit figure at all, so it's optional.
- 98 rows had two courses jammed into one string with a literal newline
  (a lecture + lab pair sharing one Pitt equivalency). Rather than
  mis-splitting these, the full combined description is kept as the
  title.
- ~12,459 rows point to a **department-level placeholder** Pitt code
  (e.g. `MATH 0000`, `FP 0000`) rather than a specific course — meaning
  the external course transfers as generic credit in that department, not
  as a named course. These are flagged with `isGenericPlaceholder: true`
  and shown with a note in the Transfer Search UI. They still count
  toward your total planned credits but won't satisfy any specific major
  or gen-ed requirement, which is factually correct (they're unallocated
  credit, not a specific course match).
- The course catalog (`courses-catalog.json`) grew from 1,313 → **2,247
  courses** — every Pitt course code referenced by an equivalency that
  wasn't already in the catalog got added, using the equivalency file's
  own `pittTitle` for the name (credits still default to 3 unless
  otherwise known, same `creditsSource` tagging as before).


