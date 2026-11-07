import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computeLayout } from './layout/computeLayout';
import { sampleProject } from './model/sample-data';
import type { OverlapMode, Project, TimeScale } from './model/types';
import { TimelineSvg } from './render/TimelineSvg';

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
  const [project, setProject] = useState<Project>(sampleProject);
  const [chartRef, width] = useElementWidth<HTMLDivElement>();
  const layout = useMemo(() => (width > 0 ? computeLayout(project, { width }) : null), [project, width]);

  const setSettings = (patch: Partial<Project['settings']>) =>
    setProject((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  const { overlapMode, scale, showToday } = project.settings;

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Overlay Timeline</h1>
        <div className="segmented" role="group" aria-label="Overlap mode">
          {(
            [
              ['sublanes', 'Auto sub-lanes'],
              ['singleLine', 'One line'],
            ] as [OverlapMode, string][]
          ).map(([mode, text]) => (
            <button key={mode} aria-pressed={overlapMode === mode} onClick={() => setSettings({ overlapMode: mode })}>
              {text}
            </button>
          ))}
        </div>
        <label>
          Scale{' '}
          <select value={scale} onChange={(e) => setSettings({ scale: e.target.value as TimeScale })}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={showToday} onChange={(e) => setSettings({ showToday: e.target.checked })} />{' '}
          Today line
        </label>
      </header>

      <main className="chart" ref={chartRef}>
        {layout && <TimelineSvg layout={layout} />}
        {layout && layout.skipped.length > 0 && (
          <ul className="warnings">
            {layout.skipped.map((s, i) => (
              <li key={i}>
                Entry {s.entryId}: {s.message}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
