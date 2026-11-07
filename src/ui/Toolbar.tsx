import { useState } from 'react';
import { layoutToDrawio } from '../export/drawio';
import { svgToHtmlDocument } from '../export/html';
import { svgToPngBlob } from '../export/png';
import { csvToEntries, projectToCsv } from '../io/csv';
import { downloadBlob, downloadText, pickTextFile } from '../io/download';
import { parseProjectJson, projectToJson } from '../io/json';
import { loadSyncedIndex, loadSyncedNotion, notionLink, type SyncedIndex } from '../io/notionSource';
import { buildViewUrl } from '../io/share';
import { applyFilter } from '../model/filter';
import { parseDay } from '../model/dates';
import type { LayoutResult } from '../layout/types';
import { todayIso } from '../model/dates';
import type { OverlapMode, TimeScale } from '../model/types';
import { useStore, type ThemePreference } from '../state/store';
import { Menu, type MenuItem } from './Menu';

const MODES: [OverlapMode, string][] = [
  ['sublanes', 'Auto sub-lanes'],
  ['singleLine', 'One line'],
];

const SCALE_NAMES: Record<TimeScale, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  decade: 'Decade',
};

const SPANS = [1, 2, 5, 10, 20, 50, 70] as const;

type ToolbarProps = {
  onMessage: (msg: string) => void;
  /** The chart as currently shown (filters and span applied); exports use it. */
  layout: LayoutResult | null;
};

export function Toolbar({ onMessage, layout }: ToolbarProps) {
  const settings = useStore((s) => s.project.settings);
  const themePref = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const { setSettings, replaceData, replaceProject, loadSample, clearAll } = useStore.getState();
  /** Scale the chart actually uses (shown next to "Auto", or when a too-fine scale was coarsened). */
  const usedScale = layout?.scale;
  /** First year of the visible range, the default for "from year". */
  const firstYear = layout ? Number(layout.domain.start.slice(0, 4)) : undefined;

  const [pending, setPending] = useState<{ name: string; text: string; count: number } | null>(null);

  const importCsv = async () => {
    const file = await pickTextFile('.csv,.tsv,.txt,text/csv');
    if (!file) return;
    const result = csvToEntries(file.text);
    if (result.entries.length === 0) {
      onMessage(`Nothing imported from ${file.name}. ${result.warnings.join(' ')}`);
      return;
    }
    if (useStore.getState().project.entries.length === 0) finishImport(file, 'replace');
    else setPending({ ...file, count: result.entries.length });
  };

  const finishImport = (file: { name: string; text: string }, how: 'replace' | 'add') => {
    setPending(null);
    const { project } = useStore.getState();
    // When adding, timelines are matched by name against the existing ones.
    const result = csvToEntries(file.text, how === 'add' ? project.timelines : []);
    replaceData(how === 'add' ? [...project.entries, ...result.entries] : result.entries, result.timelines);
    onMessage(
      `Imported ${result.entries.length} entries from ${file.name}.` +
        (result.warnings.length ? ` Notes: ${result.warnings.join(' ')}` : ''),
    );
  };

  const importJson = async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    const { project } = useStore.getState();
    const result = parseProjectJson(file.text, project.settings);
    if (!result.ok) return onMessage(`Could not load ${file.name}: ${result.error}`);
    const n = result.project.entries.length;
    if (
      project.entries.length > 0 &&
      !window.confirm(`Load the backup “${file.name}” (${n} entries)?\nThis replaces all your current data and settings.`)
    ) {
      return;
    }
    replaceProject(result.project);
    onMessage(`Loaded ${n} entries from ${file.name}.` + (result.warnings.length ? ` Notes: ${result.warnings.join(' ')}` : ''));
  };

  /** Asks which synced Notion database to use (no question when there is only one). */
  const pickSynced = async (purpose: string): Promise<SyncedIndex[number] | null> => {
    const list = await loadSyncedIndex(window.location.href);
    if (list.length === 0) {
      onMessage('No Notion database is synced yet. See “Notion” in the README for the one-time setup.');
      return null;
    }
    if (list.length === 1) return list[0]!;
    const answer = window.prompt(
      `${purpose}: which database? Type its number:\n` + list.map((d, i) => `${i + 1}. ${d.title} (${d.entries} entries)`).join('\n'),
      '1',
    );
    return answer ? (list[Number(answer) - 1] ?? null) : null;
  };

  const importNotion = async () => {
    const db = await pickSynced('Load from Notion');
    if (!db) return;
    const result = await loadSyncedNotion(db.slug, window.location.href);
    if (!result.ok) return onMessage(`Could not load “${db.title}”: ${result.error}`);
    const n = result.project.entries.length;
    if (
      useStore.getState().project.entries.length > 0 &&
      !window.confirm(`Load “${result.title}” from Notion (${n} entries)?\nThis replaces all your current data and settings.`)
    ) {
      return;
    }
    replaceProject(result.project);
    onMessage(
      `Loaded ${n} entries from Notion “${result.title}”` +
        (result.savedAt ? ` (synced ${new Date(result.savedAt).toLocaleString()})` : '') +
        '. Changes you make here are not sent back to Notion.',
    );
  };

  const copyNotionLink = async () => {
    const db = await pickSynced('Copy live link');
    if (!db) return;
    const url = notionLink(window.location.href, db.slug);
    const note = `Live link for “${db.title}”: it always shows the latest sync. In Notion, type /embed and paste it.`;
    try {
      await navigator.clipboard.writeText(url);
      onMessage(`Copied. ${note}`);
    } catch {
      window.prompt('Copy this link:', url);
      onMessage(note);
    }
  };

  const fileName = (ext: string) => `timeline-${todayIso()}.${ext}`;

  /** Runs an export, reporting errors instead of failing silently. */
  const run = (what: string, fn: () => Promise<void> | void) => async () => {
    try {
      await fn();
    } catch (err) {
      onMessage(`${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // The SVG renderer pulls in react-dom/server, so it is only loaded when an export is used.
  const svgModule = () => import('../export/svg');

  /** A read-only link to the chart as shown (filters, span and zoom applied). */
  const copyViewLink = async () => {
    if (!layout) return;
    const { project, filter } = useStore.getState();
    const shown = applyFilter(project, filter);
    const view = layout.zoomed ? { start: parseDay(layout.domain.start)!, end: parseDay(layout.domain.end)! } : null;
    const url = buildViewUrl(window.location.href, shown, view);
    const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const notes = [
      `Anyone with this link can see these ${shown.entries.length} entries.`,
      local ? 'Note: this link points to your own computer (localhost) and only works here. Use the published app to make links for Notion.' : 'In Notion, type /embed and paste the link.',
      url.length > 8000 ? `The link is long (${url.length} characters); some apps may cut it off.` : '',
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(url);
      onMessage(`View link copied. ${notes.join(' ')}`);
    } catch {
      window.prompt('Copy this view link:', url);
      onMessage(notes.join(' '));
    }
  };

  const exportItems: MenuItem[] = [
    { separator: 'Share' },
    {
      label: 'Copy view link',
      hint: 'Read-only chart, e.g. for Notion /embed',
      onSelect: run('Copying the link', copyViewLink),
    },
    {
      label: 'Copy live Notion link',
      hint: 'Chart of a synced Notion database',
      onSelect: run('Copying the link', copyNotionLink),
    },
    { separator: 'Chart (as shown, with filters)' },
    {
      label: 'PNG image',
      hint: 'For slides, documents, Notion',
      onSelect: run('PNG export', async () => {
        if (!layout) return;
        const { layoutToSvg } = await svgModule();
        const blob = await svgToPngBlob(layoutToSvg(layout), layout.width, layout.height, 2);
        downloadBlob(fileName('png'), blob);
      }),
    },
    {
      label: 'SVG image',
      hint: 'Sharp at any size',
      onSelect: run('SVG export', async () => {
        if (!layout) return;
        const { layoutToSvg } = await svgModule();
        downloadText(fileName('svg'), layoutToSvg(layout), 'image/svg+xml');
      }),
    },
    {
      label: 'HTML page',
      hint: 'One file, opens in any browser',
      onSelect: run('HTML export', async () => {
        if (!layout) return;
        const { layoutToSvgElement } = await svgModule();
        downloadText(fileName('html'), svgToHtmlDocument(layoutToSvgElement(layout), 'Timeline', todayIso()), 'text/html');
      }),
    },
    {
      label: 'draw.io diagram',
      hint: 'Edit further in diagrams.net',
      onSelect: run('draw.io export', () => {
        if (layout) downloadText(fileName('drawio'), layoutToDrawio(layout), 'application/xml');
      }),
    },
    { separator: 'Data (all entries)' },
    {
      label: 'JSON backup',
      hint: 'Everything, can be loaded again',
      onSelect: () => downloadText(fileName('json'), projectToJson(useStore.getState().project), 'application/json'),
    },
    {
      label: 'CSV',
      hint: 'Comma-separated',
      onSelect: () => downloadText(fileName('csv'), projectToCsv(useStore.getState().project, ','), 'text/csv'),
    },
    {
      label: 'CSV for Excel (;)',
      hint: 'Opens directly in German Excel',
      onSelect: () => downloadText(fileName('csv'), projectToCsv(useStore.getState().project, ';'), 'text/csv'),
    },
  ];

  return (
    <header className="toolbar">
      <h1>Overlay Timeline</h1>

      <div className="segmented" role="group" aria-label="Overlap mode">
        {MODES.map(([mode, text]) => (
          <button key={mode} aria-pressed={settings.overlapMode === mode} onClick={() => setSettings({ overlapMode: mode })}>
            {text}
          </button>
        ))}
      </div>

      <label>
        Span{' '}
        <select
          value={settings.spanYears ?? ''}
          onChange={(e) => {
            const years = e.target.value ? Number(e.target.value) : undefined;
            setSettings({ spanYears: years, ...(years ? {} : { spanStartYear: undefined }) });
          }}
        >
          <option value="">Fit to entries</option>
          {SPANS.map((y) => (
            <option key={y} value={y}>
              {y} {y === 1 ? 'year' : 'years'}
            </option>
          ))}
        </select>
      </label>

      {settings.spanYears !== undefined && (
        <label>
          from{' '}
          <input
            className="year-input"
            type="number"
            min={1000}
            max={9000}
            step={1}
            value={settings.spanStartYear ?? firstYear ?? ''}
            onChange={(e) => {
              const y = Number(e.target.value);
              if (Number.isInteger(y) && y >= 1000 && y <= 9000) setSettings({ spanStartYear: y });
            }}
            aria-label="First year shown"
          />
        </label>
      )}

      <label>
        Scale{' '}
        <select value={settings.scale} onChange={(e) => setSettings({ scale: e.target.value as TimeScale | 'auto' })}>
          <option value="auto">Auto{settings.scale === 'auto' && usedScale ? ` (${SCALE_NAMES[usedScale]})` : ''}</option>
          {(Object.keys(SCALE_NAMES) as TimeScale[]).map((k) => (
            <option key={k} value={k}>
              {SCALE_NAMES[k]}
            </option>
          ))}
        </select>
        {settings.scale !== 'auto' && usedScale && usedScale !== settings.scale && (
          <span className="hint" title="The chosen scale would draw too many lines for this span">
            {' '}
            → {SCALE_NAMES[usedScale]}
          </span>
        )}
      </label>

      <label>
        <input type="checkbox" checked={settings.showToday} onChange={(e) => setSettings({ showToday: e.target.checked })} />{' '}
        Today line
      </label>

      <label title="Colour theme of the app (exports are always light)">
        Theme{' '}
        <select value={themePref} onChange={(e) => setTheme(e.target.value as ThemePreference)}>
          <option value="system">Like Windows</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <div className="toolbar-right">
        <Menu
          label="Import"
          align="right"
          items={[
            { label: 'CSV / Excel file', hint: 'Replace or add entries', onSelect: importCsv },
            { label: 'JSON backup', hint: 'Restore everything', onSelect: importJson },
            { label: 'From Notion', hint: 'Latest synced copy of a Notion database', onSelect: run('Loading from Notion', importNotion) },
          ]}
        />
        <Menu label="Export" align="right" items={exportItems} />
        <Menu
          label="Project"
          align="right"
          items={[
            {
              label: 'Load example data',
              onSelect: () => window.confirm('Replace your current data with the example data?') && loadSample(),
            },
            {
              label: 'Clear all',
              danger: true,
              onSelect: () =>
                window.confirm('Delete all entries and timelines? This cannot be undone.\nTip: export a JSON backup first.') &&
                clearAll(),
            },
          ]}
        />
      </div>

      {pending && (
        <div className="import-choice" role="alertdialog" aria-label="Import options">
          <span>
            Import {pending.count} entries from <b>{pending.name}</b>:
          </span>
          <button className="primary" onClick={() => finishImport(pending, 'replace')}>
            Replace current entries
          </button>
          <button onClick={() => finishImport(pending, 'add')}>Add to current entries</button>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
    </header>
  );
}
