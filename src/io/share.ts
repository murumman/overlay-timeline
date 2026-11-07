import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { View } from '../layout/zoom';
import type { Project } from '../model/types';
import { parseProjectJson } from './json';

/**
 * Read-only view links: the timeline is compressed into the part of the URL after "#".
 * Browsers never send that part to the web server, so the data is not stored or logged
 * by GitHub Pages. Anyone who has the link can read it, though.
 */

const PREFIX = '#view=';
const FORMAT_VERSION = 1;

/** The smallest project that draws the same chart: notes dropped, ids shortened. */
function minimalProject(p: Project): Project {
  const timelineIds = new Map(p.timelines.map((t, i) => [t.id, `t${i}`]));
  return {
    timelines: p.timelines.map((t) => ({ ...t, id: timelineIds.get(t.id)! })),
    entries: p.entries
      .filter((e) => timelineIds.has(e.timelineId))
      .map((e, i) => ({
        id: `e${i}`,
        name: e.name,
        start: e.start,
        end: e.end,
        timelineId: timelineIds.get(e.timelineId)!,
        ...(e.color ? { color: e.color } : {}),
      })),
    settings: p.settings,
  };
}

export function encodeShare(p: Project, view: View | null): string {
  const payload = {
    v: FORMAT_VERSION,
    p: minimalProject(p),
    ...(view ? { z: [Math.round(view.start), Math.round(view.end)] } : {}),
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function buildViewUrl(baseUrl: string, p: Project, view: View | null): string {
  return `${baseUrl.split('#')[0]}${PREFIX}${encodeShare(p, view)}`;
}

export function isViewHash(hash: string): boolean {
  return hash.startsWith(PREFIX);
}

export type DecodedShare = { ok: true; project: Project; view: View | null } | { ok: false; error: string };

/** Reads a view link. The data may come from anyone, so it is validated like an imported file. */
export function decodeShare(hash: string): DecodedShare {
  if (!isViewHash(hash)) return { ok: false, error: 'This is not a view link.' };
  let json: string | null = null;
  try {
    json = decompressFromEncodedURIComponent(hash.slice(PREFIX.length));
  } catch {
    json = null;
  }
  if (!json) return { ok: false, error: 'The link is broken or incomplete. Was it cut off when copying?' };

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The link is broken or incomplete.' };
  }
  if (typeof data !== 'object' || data === null || !('p' in data)) return { ok: false, error: 'The link contains no timeline.' };

  const parsed = parseProjectJson(JSON.stringify((data as { p: unknown }).p), {
    overlapMode: 'sublanes',
    scale: 'auto',
    showToday: true,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const z = (data as { z?: unknown }).z;
  const view =
    Array.isArray(z) && z.length === 2 && z.every((n) => typeof n === 'number' && Number.isFinite(n)) && z[1] > z[0]
      ? { start: z[0] as number, end: z[1] as number }
      : null;
  return { ok: true, project: parsed.project, view };
}
