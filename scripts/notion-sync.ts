/**
 * Fetches the Notion databases listed in notion.config.json and writes one chart file per database:
 *   <outDir>/notion/<slug>.json   (an Overlay Timeline backup, loaded by …/#notion=<slug>)
 *   <outDir>/notion/index.json    (list of synced databases, for the editor's Import menu)
 *
 * Usage:  node scripts/notion-sync.ts [outDir]      (outDir defaults to "dist")
 * Needs the secret Notion key in the NOTION_TOKEN environment variable.
 * Runs in GitHub Actions after the build; see .github/workflows/deploy.yml and README.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notionToProject, parseDatabaseId, type NotionMapping } from '../src/io/notion.ts';
import type { Settings } from '../src/model/types.ts';

type DatabaseConfig = { slug: string; database: string; properties?: NotionMapping; settings?: Partial<Settings> };

/** Overridable only for local testing against a fake server. */
const API = process.env.NOTION_API_URL ?? 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
/** 100 rows per request; stop at 5000 rows (the app's limit anyway). */
const MAX_REQUESTS = 50;

async function notion(token: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return (await res.json()) as Record<string, unknown>;
  const detail = await res.text().catch(() => '');
  if (res.status === 401) throw new Error('Notion rejected the key (401). Check the NOTION_TOKEN secret.');
  if (res.status === 404) {
    throw new Error(
      'Database not found (404). In Notion, open the database, click ••• → Connections, and add your integration. ' +
        'Also check the link in notion.config.json points to the database itself, not a page that contains it.',
    );
  }
  throw new Error(`Notion API error ${res.status}: ${detail.slice(0, 300)}`);
}

async function fetchRows(token: string, id: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_REQUESTS; i++) {
    const page = await notion(token, `/databases/${id}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    if (Array.isArray(page.results)) rows.push(...page.results);
    if (page.has_more !== true || typeof page.next_cursor !== 'string') return rows;
    cursor = page.next_cursor;
  }
  console.warn(`  Stopped after ${rows.length} rows.`);
  return rows;
}

const titleOf = (schema: Record<string, unknown>): string =>
  Array.isArray(schema.title) ? schema.title.map((t: { plain_text?: string }) => t.plain_text ?? '').join('') : '';

async function main() {
  const outDir = process.argv[2] ?? 'dist';
  const config = JSON.parse(await readFile(new URL('../notion.config.json', import.meta.url), 'utf8')) as { databases?: DatabaseConfig[] };
  const databases = config.databases ?? [];
  if (databases.length === 0) {
    console.log('notion.config.json lists no databases; nothing to sync.');
    return;
  }
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not set. Add it as a repository secret (see README → Notion).');

  const dir = join(outDir, 'notion');
  await mkdir(dir, { recursive: true });
  const index: { slug: string; title: string; savedAt: string; entries: number }[] = [];

  for (const db of databases) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(db.slug ?? '')) {
      throw new Error(`Invalid slug "${db.slug}": use lower-case letters, digits and dashes.`);
    }
    const id = parseDatabaseId(db.database ?? '');
    if (!id) throw new Error(`"${db.slug}": no database id found in "${db.database}".`);

    console.log(`Syncing "${db.slug}"…`);
    const schema = await notion(token, `/databases/${id}`);
    const rows = await fetchRows(token, id);
    const result = notionToProject(rows, { schema, mapping: db.properties, settings: db.settings });
    if (!result.ok) throw new Error(`"${db.slug}": ${result.error}`);

    const savedAt = new Date().toISOString();
    const title = titleOf(schema) || db.slug;
    const file = { format: 'overlay-timeline', version: 1, savedAt, source: { type: 'notion', title }, project: result.project };
    await writeFile(join(dir, `${db.slug}.json`), JSON.stringify(file) + '\n');
    index.push({ slug: db.slug, title, savedAt, entries: result.project.entries.length });

    const u = result.used;
    console.log(
      `  ${result.project.entries.length} entries on ${result.project.timelines.length} rows ` +
        `(name: ${u.name}, date: ${u.date}${u.end ? `, end: ${u.end}` : ''}, row: ${u.timeline ?? 'none'})`,
    );
    for (const w of result.warnings) console.log(`  Note: ${w}`);
  }
  await writeFile(join(dir, 'index.json'), JSON.stringify({ databases: index }) + '\n');
}

main().catch((err: unknown) => {
  console.error(`Notion sync failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
