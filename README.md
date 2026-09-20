# transfr (MVP)

A full-stack TypeScript/React app for planning a University of Pittsburgh
degree timeline: a semester-by-semester grid where you add courses, and a
live requirements checklist that tracks what's satisfied.

The app itself isn't CS-specific — the UI reads the major's name and
requirement structure from `major-requirements.json` rather than hardcoding
it. Today that file describes the Computer Science, BS; swapping in a
differently-shaped major requirements file (following the same schema in
`server/src/types.ts`) is enough to reuse this for another major. Currently
the server loads exactly one major file at startup — multi-major switching
in a single running app (a dropdown to pick your major) isn't built yet.

## Structure

```
server/   Express + TypeScript API. Owns the data and the requirement-
          evaluation logic (source of truth for "is this plan valid?").
client/   Vite + React + TypeScript frontend. Semester grid + sidebar.
```

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

## Known gaps (by design, for this MVP pass)

- **No prerequisite checking yet.** The major requirements data has no
  prerequisite chains, so there's no red-highlighting for unmet
  prerequisites. The `PlannedCourse` type and evaluation engine are
  structured so this can be added later without a rework — see
  `server/src/engine/evaluatePlan.ts`.
- **Credit hours for most catalog courses are defaulted to 3**,
  tagged `"creditsSource": "default-assumed"` in
  `server/src/data/courses-catalog.json`. The 15 courses with real known
  credits (the CS/Math core + capstone options) are tagged `"known"`. If
  you get real per-course credit data, re-run a merge keeping the `"known"`
  ones untouched.
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


