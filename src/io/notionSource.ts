import type { Project } from '../model/types';
import { parseProjectJson } from './json';

/**
 * Loads Notion data that the GitHub sync published next to the app (notion/<link name>.json).
 * Live embed links look like …/overlay-timeline/#notion=<link name>. The name is long and random and there is
 * no list of names, so a chart can only be opened by someone who was given its link.
 */

const PREFIX = '#notion=';
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isNotionHash = (hash: string): boolean => hash.startsWith(PREFIX);

export function notionSlug(hash: string): string | null {
  if (!isNotionHash(hash)) return null;
  let slug = hash.slice(PREFIX.length);
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  slug = slug.trim().toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

/** A pasted live link (…#notion=abc) or just its name → the name, or null. */
export const notionSlugFromInput = (input: string): string | null => {
  const t = input.trim();
  const i = t.indexOf(PREFIX);
  return notionSlug(i >= 0 ? t.slice(i) : PREFIX + t);
};

/**
 * Where to start a sync: the "Run workflow" page of the deploy workflow on GitHub.
 * Derived from the Pages address (<user>.github.io/<repo>/); null when running elsewhere.
 */
export function syncPageUrl(location: Pick<Location, 'hostname' | 'pathname'>): string | null {
  const user = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i)?.[1];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return user && repo ? `https://github.com/${user}/${repo}/actions/workflows/deploy.yml` : null;
}

export type SyncedNotion = { ok: true; project: Project; title: string; savedAt: string | null; warnings: string[] } | { ok: false; error: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

const fileUrl = (baseUrl: string, name: string) => new URL(`notion/${name}`, baseUrl.split('#')[0]).href;

export async function loadSyncedNotion(slug: string, baseUrl: string, fetchFn: FetchFn = fetch): Promise<SyncedNotion> {
  let res;
  try {
    // no-cache: always ask the server whether a newer sync is there.
    res = await fetchFn(fileUrl(baseUrl, `${slug}.json`), { cache: 'no-cache' });
  } catch {
    return { ok: false, error: 'Could not reach the server. Are you offline?' };
  }
  const notFound = { ok: false, error: `No synced Notion database is called “${slug}”. Check the link, or wait for the next sync.` } as const;
  if (res.status === 404) return notFound;
  if (!res.ok) return { ok: false, error: `The server answered with error ${res.status}.` };

  const text = await res.text();
  // Some servers answer unknown paths with the app's own HTML page instead of a 404.
  if (text.trimStart().startsWith('<')) return notFound;
  const parsed = parseProjectJson(text, { overlapMode: 'sublanes', scale: 'auto', showToday: true });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  let title = slug;
  let savedAt: string | null = null;
  try {
    const data = JSON.parse(text) as { savedAt?: unknown; source?: { title?: unknown } };
    if (typeof data.source?.title === 'string' && data.source.title) title = data.source.title.slice(0, 200);
    if (typeof data.savedAt === 'string' && !Number.isNaN(Date.parse(data.savedAt))) savedAt = data.savedAt;
  } catch {
    // parseProjectJson already accepted the file; the extras are optional.
  }
  return { ok: true, project: parsed.project, title, savedAt, warnings: parsed.warnings };
}
