import { useEffect, useMemo, useState } from 'react';
import { isNotionHash, loadSyncedNotion, notionSlug } from './io/notionSource';
import { decodeShare } from './io/share';
import { computeLayout } from './layout/computeLayout';
import type { View } from './layout/zoom';
import type { Project } from './model/types';
import { ChartView } from './ui/ChartView';
import { useElementWidth } from './ui/useElementWidth';
import { useResolvedTheme } from './ui/useTheme';

type Source =
  | { state: 'loading' }
  | { state: 'error'; error: string }
  | { state: 'ready'; project: Project; view: View | null; notion?: { title: string; savedAt: string | null } };

/** The chart behind the link: a view link (#view=…, data inside the URL) or a synced Notion database (#notion=…). */
function useSource(): Source {
  const hash = window.location.hash;
  const [source, setSource] = useState<Source>(() => {
    if (isNotionHash(hash)) return { state: 'loading' };
    const shared = decodeShare(hash);
    return shared.ok ? { state: 'ready', project: shared.project, view: shared.view } : { state: 'error', error: shared.error };
  });

  useEffect(() => {
    if (!isNotionHash(hash)) return;
    const slug = notionSlug(hash);
    if (!slug) return setSource({ state: 'error', error: 'The name after “#notion=” is not valid.' });
    let cancelled = false;
    loadSyncedNotion(slug, window.location.href).then((r) => {
      if (cancelled) return;
      if (!r.ok) return setSource({ state: 'error', error: r.error });
      document.title = `${r.title} – Overlay Timeline`;
      setSource({ state: 'ready', project: r.project, view: null, notion: { title: r.title, savedAt: r.savedAt } });
    });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  return source;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Read-only page for view links and Notion links, e.g. embedded in Notion.
 * Shows only the chart; nothing is saved and the viewer's own data is never touched.
 */
export default function ViewPage() {
  const source = useSource();
  const theme = useResolvedTheme();
  const [view, setView] = useState<View | null>(null);
  const [chartRef, width] = useElementWidth<HTMLDivElement>();
  const ready = source.state === 'ready' ? source : null;
  useEffect(() => setView(ready?.view ?? null), [ready]);

  const layout = useMemo(
    () => (ready && width > 0 ? computeLayout(ready.project, { width, view }) : null),
    [ready, width, view],
  );

  if (source.state === 'error') {
    return (
      <div className="view-page">
        <div className="view-error" role="alert">
          <strong>This timeline link cannot be shown.</strong>
          <span>{source.error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="view-page">
      <main className="chart" ref={chartRef}>
        {source.state === 'loading' && <p className="view-loading">Loading timeline…</p>}
        {layout && <ChartView layout={layout} theme={theme} onViewChange={setView} readOnly />}
      </main>
      {ready && (
        <p className="view-footer">
          {ready.notion && (
            <>
              From Notion: {ready.notion.title}
              {ready.notion.savedAt && ` · synced ${formatTime(ready.notion.savedAt)}`}
              {' · '}
            </>
          )}
          Read-only view · hover for dates · Ctrl + scroll to zoom
          {layout && layout.outOfRange.length > 0 && ` · ${layout.outOfRange.length} entries outside the shown range`}
        </p>
      )}
    </div>
  );
}
