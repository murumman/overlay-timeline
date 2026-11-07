import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computeLayout } from './layout/computeLayout';
import { applyFilter, isFilterActive } from './model/filter';
import { TimelineSvg } from './render/TimelineSvg';
import { useStore } from './state/store';
import { EntryTable } from './ui/EntryTable';
import { TimelinePanel } from './ui/TimelinePanel';
import { Toolbar } from './ui/Toolbar';

/** Width of an element, kept up to date as the window resizes. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function App() {
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedEntryId);
  const select = useStore((s) => s.select);
  const filter = useStore((s) => s.filter);
  const resetFilter = useStore((s) => s.resetFilter);
  const [message, setMessage] = useState<string | null>(null);
  const [chartRef, width] = useElementWidth<HTMLDivElement>();
  const filtered = useMemo(() => applyFilter(project, filter), [project, filter]);
  const layout = useMemo(() => (width > 0 ? computeLayout(filtered, { width }) : null), [filtered, width]);
  const filtering = isFilterActive(filter);

  return (
    <div className="app">
      <Toolbar
        onMessage={setMessage}
        usedScale={layout?.scale}
        firstYear={layout ? Number(layout.domain.start.slice(0, 4)) : undefined}
      />

      {message && (
        <div className="message" role="status">
          <span>{message}</span>
          <button className="link" onClick={() => setMessage(null)}>
            dismiss
          </button>
        </div>
      )}

      {filtering && (
        <div className="filter-banner" role="status">
          <span>
            Filtered: showing {filtered.entries.length} of {project.entries.length} entries
            {filtered.timelines.length < project.timelines.length &&
              ` on ${filtered.timelines.length} of ${project.timelines.length} timelines`}
            .
          </span>
          <button onClick={resetFilter}>✕ Reset filters</button>
        </div>
      )}

      <main className="chart" ref={chartRef}>
        {layout && <TimelineSvg layout={layout} selectedId={selectedId} onSelect={select} />}
        {layout && layout.skipped.length > 0 && (
          <p className="warnings">
            {new Set(layout.skipped.map((s) => s.entryId)).size} entr
            {new Set(layout.skipped.map((s) => s.entryId)).size === 1 ? 'y is' : 'ies are'} not shown because of
            invalid dates or a missing timeline (marked red in the table).
          </p>
        )}
        {layout && layout.outOfRange.length > 0 && (
          <p className="hint chart-note">
            {layout.outOfRange.length} entr{layout.outOfRange.length === 1 ? 'y lies' : 'ies lie'} outside the
            chosen span and {layout.outOfRange.length === 1 ? 'is' : 'are'} not shown.
          </p>
        )}
      </main>

      <div className="editor">
        <TimelinePanel />
        <EntryTable />
      </div>
    </div>
  );
}
