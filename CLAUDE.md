# Overlay Timeline

Browser app that draws Gantt-style timelines where related entries share one row ("overlaying time").
Entries with `start === end` are milestones (diamonds); others are bars. The end date is inclusive.

## Commands
- `npm run dev` – dev server at http://localhost:5173
- `npm test` – unit tests (Vitest)
- `npm run typecheck` – TypeScript check
- `npm run build` – type check + production build to `dist/`

## Architecture
Input → `model/` (Project, Entry, Timeline, Settings) → `layout/computeLayout` (pure geometry) → renderers/exporters.

- **Layout is separate from rendering.** `computeLayout(project, { width, today })` returns a `LayoutResult`
  (rows, items with x/y/size/label, axis ticks, today line). Renderers and exporters only translate it;
  they never compute positions themselves. New output formats (SVG, PNG, HTML, draw.io) go in `src/export/`.
- `layout/` and `model/` must stay pure (no DOM, no React) so they work in tests, exporters and a future server.
- Dates are whole days: use `parseDay` / `formatDay` (UTC day numbers) from `model/dates.ts`; never `new Date("YYYY-MM-DD")` math.
- Text width is estimated (`layout/text.ts`), not measured, to keep layout DOM-free.
- `render/TimelineSvg.tsx` uses inline SVG attributes only (no CSS classes), so the SVG exports standalone.
- Zoom is a transient `view` window passed to computeLayout (pure maths in `layout/zoom.ts`); `baseDomain` is the unzoomed range.
- Themes: CSS variables switch on `<html data-theme>`; the chart gets LIGHT_THEME/DARK_THEME as a prop. Exports always use the light theme.
- Labels that do not fit are shortened with "…" (`truncateText`) or marked `hidden` (still in the tooltip / draw.io `noLabel`).
- Overlap modes: `sublanes` (greedy lane packing on shape+label extents, `layout/lanes.ts`) and
  `singleLine` (everything on lane 0, semi-transparent bars, labels alternate above/below).

## Conventions
- TypeScript strict, `noUncheckedIndexedAccess` on.
- Tests sit next to code as `*.test.ts`. `model/sample-data.ts` is the shared visual test case.
- Roadmap / phases: see the project plan (Phases 0–4 done; next is Phase 5: GitHub Pages + Notion embed).
