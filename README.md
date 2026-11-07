# Overlay Timeline

A Gantt-style timeline where related entries share **one row** instead of each getting its own line
("overlaying time"). Bars and milestones of the same timeline are drawn together; overlaps either stack
into sub-lanes or stay on a single line.

## Features
- Edit entries and timelines in a table; filters, sorting, CSV import/export (also German Excel)
- Spans from weeks up to 70 years, automatic scale, zoom and pan
- Light and dark theme, collapsible rows
- Export as PNG, SVG, standalone HTML, editable draw.io diagram, JSON backup
- Read-only **view links** (e.g. for Notion `/embed`)

## Privacy
Your data stays in your browser (localStorage). Nothing is sent to a server.
View links carry the timeline inside the part of the URL after `#`, which browsers do not send to the
web server — but anyone who has the link can see that timeline.

## Development
```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```
Pushing to `main` tests, builds and publishes the app to GitHub Pages (`.github/workflows/deploy.yml`).
