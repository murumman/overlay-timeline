import { describe, expect, it } from 'vitest';
import { parseProjectJson, projectToJson } from '../io/json';
import { computeLayout } from '../layout/computeLayout';
import { sampleProject } from '../model/sample-data';
import { layoutToDrawio } from './drawio';
import { svgToHtmlDocument } from './html';
import { layoutToSvg, layoutToSvgElement } from './svg';
import { escapeXml } from './xml';

const layout = computeLayout(sampleProject, { width: 1100, today: '2026-04-22' });

/** Minimal XML well-formedness check: every opened tag is closed in the right order. */
function assertWellFormed(xml: string) {
  const body = xml.replace(/<\?xml[^>]*\?>/, '');
  expect(body).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/); // no raw ampersands
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) expect(stack.pop()).toBe(name);
    else stack.push(name!);
  }
  expect(stack).toEqual([]);
}

describe('escapeXml', () => {
  it('escapes markup characters', () => {
    expect(escapeXml('a & b < "c" >')).toBe('a &amp; b &lt; &quot;c&quot; &gt;');
  });
});

describe('SVG export', () => {
  it('produces a standalone, well-formed SVG with every entry', () => {
    const svg = layoutToSvg(layout);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    assertWellFormed(svg);
    for (const e of sampleProject.entries) expect(svg).toContain(e.name);
  });

  it('escapes special characters in names', () => {
    const p = { ...sampleProject, entries: [{ ...sampleProject.entries[0]!, name: 'R&D <phase> "1"' }] };
    const svg = layoutToSvg(computeLayout(p, { width: 900 }));
    expect(svg).toContain('R&amp;D &lt;phase&gt;');
    assertWellFormed(svg);
  });
});

describe('HTML export', () => {
  it('embeds a responsive chart and an escaped title', () => {
    const html = svgToHtmlDocument(layoutToSvgElement(layout), 'Plan <2026>', '2026-11-07');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Plan &lt;2026&gt;</title>');
    expect(html).toContain('viewBox=');
    expect(html).not.toMatch(/<svg[^>]* width="\d/); // fixed size removed so it scales
    expect(html).not.toContain('<script');
  });
});

describe('draw.io export', () => {
  const xml = layoutToDrawio(layout, 'Timeline', '2026-11-07T00:00:00.000Z');

  it('is well-formed mxfile XML', () => {
    expect(xml.startsWith('<mxfile')).toBe(true);
    expect(xml).toContain('<mxCell id="0"/>');
    assertWellFormed(xml);
  });

  it('has one shape per bar and one rhombus per milestone, with dates as tooltips', () => {
    const bars = layout.items.filter((i) => i.kind === 'bar').length;
    const milestones = layout.items.filter((i) => i.kind === 'milestone').length;
    expect(xml.match(/id="bar-\d+"/g)).toHaveLength(bars);
    expect(xml.match(/style="rhombus;/g)).toHaveLength(milestones);
    expect(xml).toContain('tooltip="Launch&#10;2026-06-15"');
  });

  it('puts the grid on a locked layer and the entries on an editable one', () => {
    expect(xml).toContain('<mxCell id="layer-background" value="Background (locked)" style="locked=1;" parent="0"/>');
    expect(xml).toContain('<mxCell id="layer-entries" value="Timeline" parent="0"/>');
    expect(xml.match(/<UserObject [^>]*><mxCell [^>]*parent="layer-entries"/g)).toHaveLength(layout.items.length);
    expect(xml).not.toMatch(/<UserObject [^>]*><mxCell [^>]*parent="layer-background"/);
  });

  it('attaches each name to its own shape, so they move together', () => {
    for (const i of layout.items) expect(xml).toContain(`label="${escapeXml(i.name)}"`);
    const launch = xml.match(/<UserObject label="Launch" [^>]*><mxCell style="([^"]+)"/)![1]!;
    expect(launch).toContain('rhombus;');
    expect(launch).toContain('labelPosition=right;');
  });

  it('places single-line labels above or below their shape', () => {
    const single = computeLayout({ ...sampleProject, settings: { ...sampleProject.settings, overlapMode: 'singleLine' } }, { width: 1100 });
    const x = layoutToDrawio(single);
    expect(x).toMatch(/verticalLabelPosition=top;/);
    expect(x).toMatch(/verticalLabelPosition=bottom;/);
    assertWellFormed(x);
  });

  it('uses unique cell ids', () => {
    const ids = [...xml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes row names and visible axis labels', () => {
    for (const r of layout.rows) expect(xml).toContain(`value="${r.name}"`);
    for (const t of layout.ticks.filter((t) => t.showLabel)) expect(xml).toContain(`value="${t.label}"`);
  });
});

describe('JSON backup', () => {
  it('round-trips the full project', () => {
    const r = parseProjectJson(projectToJson(sampleProject), sampleProject.settings);
    expect(r.ok && r.project).toEqual(sampleProject);
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('keeps span settings', () => {
    const p = { ...sampleProject, settings: { ...sampleProject.settings, spanYears: 20, spanStartYear: 2010 } };
    const r = parseProjectJson(projectToJson(p), sampleProject.settings);
    expect(r.ok && r.project.settings).toMatchObject({ spanYears: 20, spanStartYear: 2010 });
  });

  it('rejects files that are not backups', () => {
    expect(parseProjectJson('not json', sampleProject.settings)).toMatchObject({ ok: false });
    expect(parseProjectJson('{"hello": 1}', sampleProject.settings)).toMatchObject({ ok: false });
  });

  it('drops broken items with a warning and fixes duplicate ids', () => {
    const text = JSON.stringify({
      timelines: [{ id: 't', name: 'T', color: 'red', order: 0 }, { id: 'x' }],
      entries: [
        { id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-02', timelineId: 't' },
        { id: 'a', name: 'A2', start: '2026-01-03', end: '2026-01-04', timelineId: 't' },
        { id: 'b', name: 'B' },
      ],
    });
    const r = parseProjectJson(text, sampleProject.settings);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.timelines).toHaveLength(1);
    expect(r.project.timelines[0]!.color).toBe('#4b5563'); // invalid colour replaced
    expect(r.project.entries).toHaveLength(2);
    expect(new Set(r.project.entries.map((e) => e.id)).size).toBe(2);
    expect(r.warnings).toHaveLength(2);
  });
});
