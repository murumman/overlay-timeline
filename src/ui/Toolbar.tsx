import { useState } from 'react';
import { csvToEntries, projectToCsv } from '../io/csv';
import { downloadText, pickTextFile } from '../io/download';
import type { OverlapMode, TimeScale } from '../model/types';
import { useStore } from '../state/store';

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
  /** Scale the chart actually uses (shown next to "Auto", or when a too-fine scale was coarsened). */
  usedScale?: TimeScale;
  /** First year of the visible range, used as the default for "from year". */
  firstYear?: number;
};

export function Toolbar({ onMessage, usedScale, firstYear }: ToolbarProps) {
  const settings = useStore((s) => s.project.settings);
  const { setSettings, replaceData, loadSample, clearAll } = useStore.getState();

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

  const exportCsv = (delimiter: ',' | ';') => {
    downloadText('timeline.csv', projectToCsv(useStore.getState().project, delimiter), 'text/csv');
  };

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

      <div className="toolbar-right">
        <button onClick={importCsv}>Import CSV</button>
        <button onClick={() => exportCsv(',')} title="Comma-separated (international)">
          Export CSV
        </button>
        <button onClick={() => exportCsv(';')} title="Semicolon-separated, opens directly in German Excel">
          Export CSV (Excel ;)
        </button>
        <button
          onClick={() => window.confirm('Replace your current data with the example data?') && loadSample()}
          title="Load the example data"
        >
          Example
        </button>
        <button
          className="danger"
          onClick={() => window.confirm('Delete all entries and timelines? This cannot be undone.') && clearAll()}
        >
          Clear all
        </button>
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
