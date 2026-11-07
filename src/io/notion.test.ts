import { describe, expect, it } from 'vitest';
import { NOTION_COLORS, notionToProject, parseDatabaseId } from './notion';

const title = (t: string) => ({ type: 'title', title: [{ plain_text: t }] });
const date = (start: string | null, end: string | null = null) => ({ type: 'date', date: start ? { start, end } : null });
const select = (name: string | null, color = 'default') => ({ type: 'select', select: name ? { name, color } : null });
const text = (t: string) => ({ type: 'rich_text', rich_text: t ? [{ plain_text: t }] : [] });
const page = (id: string, properties: Record<string, unknown>) => ({ object: 'page', id, properties });

const rows = [
  page('a', { Name: title('Kick-off'), Date: date('2026-03-01'), Team: select('Design', 'pink'), Secret: text('salary') }),
  page('b', { Name: title('Build'), Date: date('2026-03-02', '2026-04-10'), Team: select('Dev', 'blue'), Secret: text('x') }),
  page('c', { Name: title('Review'), Date: date('2026-04-12T09:00:00.000+02:00'), Team: select('Dev', 'blue'), Secret: text('') }),
];

describe('parseDatabaseId', () => {
  const id = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
  const dashed = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
  it('reads bare ids, dashed ids and links with a view id', () => {
    expect(parseDatabaseId(id)).toBe(dashed);
    expect(parseDatabaseId(dashed)).toBe(dashed);
    expect(parseDatabaseId(`https://www.notion.so/myspace/Roadmap-${id}?v=ffffffffffffffffffffffffffffffff&pvs=4`)).toBe(dashed);
  });
  it('rejects text without an id', () => {
    expect(parseDatabaseId('https://www.notion.so/myspace')).toBeNull();
  });
});

describe('notionToProject', () => {
  it('detects title, date and select, and copies nothing else', () => {
    const r = notionToProject(rows);
    if (!r.ok) throw new Error(r.error);
    expect(r.used).toEqual({ name: 'Name', date: 'Date', timeline: 'Team' });
    expect(r.project.timelines.map((t) => t.name)).toEqual(['Design', 'Dev']);
    expect(r.project.entries.map((e) => [e.name, e.start, e.end])).toEqual([
      ['Kick-off', '2026-03-01', '2026-03-01'],
      ['Build', '2026-03-02', '2026-04-10'],
      ['Review', '2026-04-12', '2026-04-12'],
    ]);
    expect(JSON.stringify(r.project)).not.toContain('salary');
    expect(r.warnings).toEqual([]);
  });

  it('uses Notion option colours, and the option order from the schema', () => {
    const schema = {
      properties: {
        Name: { type: 'title' },
        Date: { type: 'date' },
        Team: { type: 'select', select: { options: [{ name: 'Dev', color: 'blue' }, { name: 'Design', color: 'pink' }] } },
      },
    };
    const r = notionToProject(rows, { schema });
    if (!r.ok) throw new Error(r.error);
    expect(r.project.timelines.map((t) => [t.name, t.color])).toEqual([
      ['Dev', NOTION_COLORS.blue],
      ['Design', NOTION_COLORS.pink],
    ]);
    const dev = r.project.timelines[0]!.id;
    expect(r.project.entries.filter((e) => e.timelineId === dev).map((e) => e.name)).toEqual(['Build', 'Review']);
  });

  it('skips rows without a date and puts rows without a value on a last "No …" row', () => {
    const r = notionToProject([
      ...rows,
      page('d', { Name: title('Someday'), Date: date(null), Team: select('Dev') }),
      page('e', { Name: title(''), Date: date('2026-05-01'), Team: select(null) }),
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.timelines.map((t) => t.name)).toEqual(['Design', 'Dev', 'No Team']);
    expect(r.project.entries.find((e) => e.id === 'e')?.name).toBe('Untitled');
    expect(r.warnings).toEqual(['1 row has no date in "Date" and was skipped.']);
  });

  it('pairs separate Start and End date properties', () => {
    const r = notionToProject([
      page('a', { Task: title('A'), 'Start date': date('2026-01-05'), 'End date': date('2026-01-09'), Created: date('2025-12-01') }),
      page('b', { Task: title('B'), 'Start date': date('2026-02-01'), 'End date': date(null), Created: date('2025-12-01') }),
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(r.used).toMatchObject({ date: 'Start date', end: 'End date' });
    expect(r.project.entries.map((e) => [e.start, e.end])).toEqual([
      ['2026-01-05', '2026-01-09'],
      ['2026-02-01', '2026-02-01'],
    ]);
    expect(r.project.timelines.map((t) => t.name)).toEqual(['All entries']);
  });

  it('follows an explicit mapping, including notes, and status / multi-select rows', () => {
    const r = notionToProject(
      [
        page('a', {
          Name: title('A'),
          Due: date('2026-01-01'),
          Phase: { type: 'status', status: { name: 'Done', color: 'green' } },
          Tags: { type: 'multi_select', multi_select: [{ name: 'x', color: 'red' }, { name: 'y', color: 'red' }] },
          Info: text('see doc'),
        }),
      ],
      { mapping: { timeline: 'Tags', notes: 'Info' } },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.project.timelines.map((t) => [t.name, t.color])).toEqual([['x', NOTION_COLORS.red]]);
    expect(r.project.entries[0]?.notes).toBe('see doc');
    expect(r.warnings).toEqual(['1 row has several "Tags" values; only the first is used.']);
  });

  it('skips rows that end before they start, and archived rows', () => {
    const r = notionToProject([
      page('a', { Name: title('A'), From: date('2026-01-01'), To: date('2026-01-03') }),
      page('b', { Name: title('B'), From: date('2026-02-01'), To: date('2026-01-01') }),
      { ...page('c', { Name: title('C'), From: date('2026-01-01'), To: date('2026-01-03') }), archived: true },
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(r.used).toMatchObject({ date: 'From', end: 'To' });
    expect(r.project.entries.map((e) => e.name)).toEqual(['A']);
    expect(r.warnings).toEqual(['1 row ends before it starts and was skipped.']);
  });

  it('explains mapping mistakes and missing date properties', () => {
    const bad = notionToProject(rows, { mapping: { timeline: 'Teams' } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('no property "Teams"');
    const noDate = notionToProject([page('a', { Name: title('A') })]);
    expect(noDate.ok).toBe(false);
  });

  it('applies settings from the config', () => {
    const r = notionToProject(rows, { settings: { overlapMode: 'singleLine' } });
    expect(r.ok && r.project.settings).toEqual({ overlapMode: 'singleLine', scale: 'auto', showToday: true });
  });
});
