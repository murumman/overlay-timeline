import { describe, expect, it } from 'vitest';
import { loadSyncedNotion, notionSlug, notionSlugFromInput, syncPageUrl } from './notionSource';

const BASE = 'https://me.github.io/overlay-timeline/#notion=roadmap';

const file = JSON.stringify({
  format: 'overlay-timeline',
  version: 1,
  savedAt: '2026-11-07T10:00:00.000Z',
  source: { type: 'notion', title: 'Roadmap' },
  project: {
    timelines: [{ id: 't0', name: 'Dev', color: '#337ea9', order: 0 }],
    entries: [{ id: 'a', name: 'Build', start: '2026-03-01', end: '2026-03-05', timelineId: 't0' }],
    settings: { overlapMode: 'singleLine', scale: 'auto', showToday: true },
  },
});

function fakeFetch(files: Record<string, string>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const body = files[url];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, text: async () => body ?? '' };
  };
  return { fn, calls };
}

describe('notion links', () => {
  it('reads and builds #notion= links', () => {
    expect(notionSlug('#notion=roadmap')).toBe('roadmap');
    expect(notionSlug('#notion=../secret')).toBeNull();
    expect(notionSlug('#view=abc')).toBeNull();
    expect(notionSlugFromInput(' https://me.github.io/overlay-timeline/#notion=3f9a0c7e1b2d4c6a8e0f1a2b ')).toBe('3f9a0c7e1b2d4c6a8e0f1a2b');
    expect(notionSlugFromInput('3f9a0c7e1b2d4c6a8e0f1a2b')).toBe('3f9a0c7e1b2d4c6a8e0f1a2b');
    expect(notionSlugFromInput('not a link')).toBeNull();
  });
});

describe('loadSyncedNotion', () => {
  it('loads the file next to the app, with title and sync time', async () => {
    const { fn, calls } = fakeFetch({ 'https://me.github.io/overlay-timeline/notion/roadmap.json': file });
    const r = await loadSyncedNotion('roadmap', BASE, fn);
    expect(calls).toEqual(['https://me.github.io/overlay-timeline/notion/roadmap.json']);
    if (!r.ok) throw new Error(r.error);
    expect(r.title).toBe('Roadmap');
    expect(r.savedAt).toBe('2026-11-07T10:00:00.000Z');
    expect(r.project.entries).toHaveLength(1);
    expect(r.project.settings.overlapMode).toBe('singleLine');
  });

  it('explains a missing database and a network failure', async () => {
    const missing = await loadSyncedNotion('nope', BASE, fakeFetch({}).fn);
    expect(missing.ok === false && missing.error).toContain('“nope”');
    const html = await loadSyncedNotion('nope', BASE, async () => ({ ok: true, status: 200, text: async () => '<!doctype html>' }));
    expect(html.ok === false && html.error).toContain('“nope”');
    const offline = await loadSyncedNotion('x', BASE, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(offline.ok).toBe(false);
  });
});

describe('syncPageUrl', () => {
  it('points to the workflow of the repo behind a GitHub Pages address', () => {
    expect(syncPageUrl({ hostname: 'murumman.github.io', pathname: '/overlay-timeline/' })).toBe(
      'https://github.com/murumman/overlay-timeline/actions/workflows/deploy.yml',
    );
    expect(syncPageUrl({ hostname: 'localhost', pathname: '/' })).toBeNull();
  });
});
