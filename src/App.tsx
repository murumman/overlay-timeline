import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computeLayout } from './layout/computeLayout';
import type { View } from './layout/zoom';
import { applyFilter, isFilterActive } from './model/filter';
import { useStore } from './state/store';
import { ChartView } from './ui/ChartView';
import { useResolvedTheme } from './ui/useTheme';
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
  const filter = useStore((s) => s.filter);
  const resetFilter = useStore((s) => s.resetFilter);
  const [message, setMessage] = useState<string | null>(null);
  const [chartRef, width] = useElementWidth<HTMLDivElement>();
  const filtered = useMemo(() => applyFilter(project, filter), [project, filter]);
  const theme = useResolvedTheme();
  // Zoom window: not saved, and reset when the span setting changes.
  const [view, setView] = useState<View | null>(null);
  const { spanYears, spanStartYear } = project.settings;
  useEffect(() => setView(null), [spanYears, spanStartYear]);
  const layout = useMemo(
    () => (width > 0 ? computeLayout(filtered, { width, view }) : null),
    [filtered, width, view],
  );
  const filtering = isFilterActive(filter);

  return (
    <div className="app">
      <Toolbar onMessage={setMessage} layout={layout} />

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
        {layout && <ChartView layout={layout} theme={theme} onViewChange={setView} />}
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
            {layout.zoomed ? ' zoomed-in range' : ' chosen span'} and {layout.outOfRange.length === 1 ? 'is' : 'are'} not
            shown.
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
