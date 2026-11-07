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
- Live charts of a **Notion database** (synced hourly by GitHub)

## Privacy
Your data stays in your browser (localStorage). Nothing is sent to a server (the Notion sync is separate, see below).
View links carry the timeline inside the part of the URL after `#`, which browsers do not send to the
web server — but anyone who has the link can see that timeline.

## Notion
A Notion database can feed a live chart. Every hour (and on every push) GitHub reads the database and
publishes a copy next to the app, so the chart is at most about an hour behind Notion.

**Privacy:** the published copy contains only the name, dates and row of each entry (plus a notes column if
you choose one). Anyone who has the link can see it, like a view link. Other columns are never copied.

### One-time setup
1. **Notion key:** open <https://www.notion.so/profile/integrations> → *New integration* → type *Internal*,
   pick your workspace. Under *Capabilities*, keep only *Read content*. Copy the *Internal Integration Secret*.
2. **Give it access:** open the database in Notion → `•••` (top right) → *Connections* → add your integration.
3. **Store the key on GitHub:** repository → *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret*, name `NOTION_TOKEN`, value = the secret from step 1.
4. **List the database** in `notion.config.json` (a short name of your choice, and the database link):
   ```json
   { "databases": [ { "slug": "roadmap", "database": "https://www.notion.so/…" } ] }
   ```
5. Push, or run it now: *Actions* → *Deploy to GitHub Pages* → *Run workflow*.

Then `https://<you>.github.io/overlay-timeline/#notion=roadmap` shows the chart. In Notion, type `/embed`
and paste the link. In the app, *Export → Copy live Notion link* gives the same link, and
*Import → From Notion* loads the data into the editor (changes there are not sent back to Notion).

### Columns
Detected automatically: the title column → name; the first date column → start/end (a date with no end is a
milestone; columns named like *Start* / *End* are paired); the first *Select*, else *Status*, else
*Multi-select* column → row. Rows keep Notion's option order and colours. To choose columns yourself, or set
chart options:
```json
{ "slug": "roadmap", "database": "…",
  "properties": { "date": "Planned", "end": "Deadline", "timeline": "Team", "notes": "Summary" },
  "settings": { "overlapMode": "singleLine" } }
```
The sync log (*Actions* → latest run → *Sync Notion databases*) shows which columns were used and which rows
were skipped. GitHub pauses hourly runs after 60 days without commits; re-enable them in the *Actions* tab.

## Development
```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```
Pushing to `main` tests, builds and publishes the app to GitHub Pages (`.github/workflows/deploy.yml`).
