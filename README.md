## Steel Hacks 2026: ## James Scanga, Aayush Shah, James Widmer

# transfr ![Slopathon](client/public/favicon.svg) 

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

## Wanna See?

[Try it Out!](https://transfr-one.vercel.app/)
