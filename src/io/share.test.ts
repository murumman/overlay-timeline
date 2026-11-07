import { compressToEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';
import { computeLayout } from '../layout/computeLayout';
import { sampleProject } from '../model/sample-data';
import { buildViewUrl, decodeShare, encodeShare, isViewHash } from './share';

const hashOf = (url: string) => url.slice(url.indexOf('#'));

describe('view links', () => {
  it('round-trips a project and draws the same chart', () => {
    const url = buildViewUrl('https://example.github.io/overlay-timeline/', sampleProject, null);
    expect(url.startsWith('https://example.github.io/overlay-timeline/#view=')).toBe(true);
    const r = decodeShare(hashOf(url));
    if (!r.ok) throw new Error(r.error);
    const a = computeLayout(sampleProject, { width: 1000, today: '2026-04-01' });
    const b = computeLayout(r.project, { width: 1000, today: '2026-04-01' });
    expect(b.items.map((i) => [i.name, i.x, i.y, i.width])).toEqual(a.items.map((i) => [i.name, i.x, i.y, i.width]));
    expect(b.rows.map((x) => x.name)).toEqual(a.rows.map((x) => x.name));
  });

  it('replaces an existing hash in the base URL', () => {
    expect(buildViewUrl('https://x.io/app/#old', sampleProject, null)).toMatch(/^https:\/\/x\.io\/app\/#view=/);
  });

  it('leaves out notes and internal ids', () => {
    const p = {
      ...sampleProject,
      entries: [{ ...sampleProject.entries[0]!, id: 'secret-internal-id', notes: 'private note' }],
    };
    const r = decodeShare(hashOf(buildViewUrl('https://x.io/', p, null)));
    if (!r.ok) throw new Error(r.error);
    expect(r.project.entries[0]).not.toHaveProperty('notes');
    expect(r.project.entries[0]!.id).toBe('e0');
  });

  it('keeps the zoom window', () => {
    const r = decodeShare(hashOf(buildViewUrl('https://x.io/', sampleProject, { start: 20500.4, end: 20530.6 })));
    expect(r.ok && r.view).toEqual({ start: 20500, end: 20531 });
  });

  it('is reasonably short for the sample project', () => {
    expect(encodeShare(sampleProject, null).length).toBeLessThan(1500);
  });

  it('recognises view hashes', () => {
    expect(isViewHash('#view=abc')).toBe(true);
    expect(isViewHash('#other')).toBe(false);
    expect(isViewHash('')).toBe(false);
  });

  it('explains broken or cut-off links', () => {
    expect(decodeShare('#view=').ok).toBe(false);
    expect(decodeShare('#view=not-valid-data!!!').ok).toBe(false);
    const full = encodeShare(sampleProject, null);
    expect(decodeShare(`#view=${full.slice(0, full.length / 2)}`).ok).toBe(false);
  });

  it('cleans up hostile data from crafted links', () => {
    const evil = {
      v: 1,
      p: {
        timelines: [{ id: 't0', name: 'T', color: 'red" onload="alert(1)', order: 0 }],
        entries: [
          {
            id: 'e0',
            name: 'x'.repeat(10_000),
            start: '2026-01-01',
            end: '2026-01-02',
            timelineId: 't0',
            color: 'url(javascript:alert(1))',
          },
        ],
        settings: { overlapMode: 'sublanes', scale: 'auto', showToday: true },
      },
      z: ['a', 'b'],
    };
    const r = decodeShare(`#view=${compressToEncodedURIComponent(JSON.stringify(evil))}`);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.timelines[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(r.project.entries[0]).not.toHaveProperty('color');
    expect(r.project.entries[0]!.name.length).toBeLessThanOrEqual(300);
    expect(r.view).toBeNull();
  });
});
