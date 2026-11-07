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
- Live charts of a **Notion database** (synced by GitHub when you click "Sync")

## Privacy
Your data stays in your browser (localStorage). Nothing is sent to a server (the Notion sync is separate, see below).
View links carry the timeline inside the part of the URL after `#`, which browsers do not send to the
web server — but anyone who has the link can see that timeline.

## Notion
A Notion database can feed a live chart. GitHub reads the database **only when you ask it to** and publishes
a copy next to the app: in the app use *Import → Sync Notion now ↗* (or on GitHub: *Actions* →
*Deploy to GitHub Pages* → *Run workflow*). Every code push syncs too. About a minute later the chart is updated.

**Privacy:** the published copy contains only the name, dates and row of each entry (plus a notes column if
you choose one); other columns are never copied. Each chart has a long random link name
(`…/#notion=3f9a0c7e1b2d4c6a8e0f1a2b`) that is stored only in a GitHub secret and in a file on your PC that
is not uploaded. There is no list of charts, and the public GitHub logs show no names, titles or columns. So
nobody can find a chart unless they are given its link — but anyone who has the link can see it, and anyone
who can open a Notion page with the embed can find the link there.

### One-time setup
1. **Notion key:** open <https://www.notion.so/profile/integrations> → *New integration* → type *Internal*,
   pick your workspace. Under *Capabilities*, keep only *Read content*. Copy the *Internal Integration Secret*.
2. **Give it access:** open the database in Notion → `•••` (top right) → *Connections* → add your integration.
3. **Store the key on GitHub:** repository → *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret*, name `NOTION_TOKEN`, value = the secret from step 1.
4. **List the database:** copy `notion.config.example.json` to `notion.config.json` (this file is never
   committed), paste the database link, and replace `link` with a new random name from
   `npm run notion-new-link`. Then upload the config as the `NOTION_CONFIG` secret: `npm run notion-upload`.
5. Sync (see above). The chart is at `https://<you>.github.io/overlay-timeline/#notion=<link>`. In Notion,
   type `/embed` and paste it. *Import → From Notion* (paste the link) loads the data into the editor;
   changes there are not sent back to Notion.

Keep `notion.config.json` safe: it is the only place (besides the GitHub secret, which cannot be read back)
where your link names are written down. To retire a link, change its name and upload the config again.

### Columns
Detected automatically: the title column → name; the first date column → start/end (a date with no end is a
milestone; columns named like *Start* / *End* are paired); the first *Select*, else *Status*, else
*Multi-select* column → row. Rows keep Notion's option order and colours. To choose columns yourself, or set
chart options:
```json
{ "label": "Roadmap", "link": "…", "database": "…",
  "properties": { "date": "Planned", "end": "Deadline", "timeline": "Team", "notes": "Summary" },
  "settings": { "overlapMode": "singleLine" } }
```
To see which columns are used and which rows are skipped, run the sync on your PC (the GitHub log hides these):
set `NOTION_TOKEN` and run `npm run notion-sync -- public`, then open `http://localhost:5173/#notion=<link>`
with `npm run dev`.

## Development
```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```
Pushing to `main` tests, builds and publishes the app to GitHub Pages (`.github/workflows/deploy.yml`).
