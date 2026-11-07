/**
 * Fetches the configured Notion databases and writes one chart file per database:
 *   <outDir>/notion/<link>.json   (an Overlay Timeline backup, loaded by …/#notion=<link>)
 * The link name is long and random, and there is deliberately no list of files: a chart can
 * only be found by someone who was given its link.
 *
 * Usage:  node scripts/notion-sync.ts [outDir]      (outDir defaults to "dist")
 *         node scripts/notion-sync.ts --new-link    (prints a new random link name)
 * Needs the secret Notion key in NOTION_TOKEN, and the config in NOTION_CONFIG or notion.config.json.
 * Runs in GitHub Actions after the build; see .github/workflows/deploy.yml and README.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notionToProject, parseDatabaseId, type NotionMapping } from '../src/io/notion.ts';
import type { Settings } from '../src/model/types.ts';

type DatabaseConfig = {
  /** Secret, hard-to-guess file name; the chart is at …/#notion=<link>. */
  link: string;
  /** Your own name for it; only shown when the sync runs on your PC. */
  label?: string;
  /** Database link or id. */
  database: string;
  properties?: NotionMapping;
  settings?: Partial<Settings>;
};

/** Overridable only for local testing against a fake server. */
const API = process.env.NOTION_API_URL ?? 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
/** GitHub Actions logs of a public repo are public: there, print no names, titles, ids or columns. */
const VERBOSE = process.env.CI !== 'true';
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
        'Also check the database link in the config points to the database itself, not a page that contains it.',
    );
  }
  throw new Error(`Notion API error ${res.status}${VERBOSE ? `: ${detail.slice(0, 300)}` : ''}`);
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

/** A new hard-to-guess link name (24 random hex characters). */
const newLinkName = () => randomBytes(12).toString('hex');

/**
 * The config is private: on GitHub it comes from the NOTION_CONFIG secret, locally from
 * notion.config.json (gitignored). It is never committed, so nobody can learn the link names.
 */
async function readConfig(): Promise<{ databases?: DatabaseConfig[] }> {
  const text = process.env.NOTION_CONFIG?.trim() || (await readFile(new URL('../notion.config.json', import.meta.url), 'utf8').catch(() => ''));
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as { databases?: DatabaseConfig[] };
  } catch {
    throw new Error('The Notion config is not valid JSON.');
  }
}

async function main() {
  if (process.argv[2] === '--new-link') return console.log(newLinkName());
  const outDir = process.argv[2] ?? 'dist';



  const databases = (await readConfig()).databases ?? [];
  if (databases.length === 0) {
    console.log('No Notion databases configured; nothing to sync.');
    return;
  }
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not set. Add it as a repository secret (see README → Notion).');

  const dir = join(outDir, 'notion');
  await mkdir(dir, { recursive: true });

  for (const [i, db] of databases.entries()) {
    const label = VERBOSE ? `"${db.label ?? db.link}"` : `Database ${i + 1}`;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(db.link ?? '')) {
      throw new Error(`${label}: the link name may only use lower-case letters, digits and dashes.`);
    }
    if (db.link.length < 20) {
      throw new Error(`${label}: the link name is too short to be secret. Use at least 20 characters, e.g. ${newLinkName()}`);
    }
    const id = parseDatabaseId(db.database ?? '');
    if (!id) throw new Error(`${label}: no database id found in the "database" setting.`);

    console.log(`Syncing ${label}…`);
    const schema = await notion(token, `/databases/${id}`);
    const rows = await fetchRows(token, id);
    const result = notionToProject(rows, { schema, mapping: db.properties, settings: db.settings });
    if (!result.ok) {
      throw new Error(`${label}: ${VERBOSE ? result.error : 'the columns do not fit. Run the sync on your PC to see details (README → Notion).'}`);
    }

    const savedAt = new Date().toISOString();
    const title = titleOf(schema) || db.label || 'Notion';
    const file = { format: 'overlay-timeline', version: 1, savedAt, source: { type: 'notion', title }, project: result.project };
    await writeFile(join(dir, `${db.link}.json`), JSON.stringify(file) + '\n');

    console.log(`  ${result.project.entries.length} entries on ${result.project.timelines.length} rows.`);
    if (VERBOSE) {
      const u = result.used;
      console.log(`  Columns: name = ${u.name}, date = ${u.date}${u.end ? `, end = ${u.end}` : ''}, row = ${u.timeline ?? 'none'}`);
      for (const w of result.warnings) console.log(`  Note: ${w}`);
    } else if (result.warnings.length) {
      console.log(`  ${result.warnings.length} note(s), e.g. skipped rows. Run the sync on your PC to see them.`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(`Notion sync failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
