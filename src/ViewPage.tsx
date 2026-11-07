import { useMemo, useState } from 'react';
import { decodeShare } from './io/share';
import { computeLayout } from './layout/computeLayout';
import type { View } from './layout/zoom';
import { ChartView } from './ui/ChartView';
import { useElementWidth } from './ui/useElementWidth';
import { useResolvedTheme } from './ui/useTheme';

/**
 * Read-only page for view links (…/#view=…), e.g. embedded in Notion.
 * Shows only the chart; nothing is saved and the viewer's own data is never touched.
 */
export default function ViewPage() {
  const shared = useMemo(() => decodeShare(window.location.hash), []);
  const theme = useResolvedTheme();
  const [view, setView] = useState<View | null>(shared.ok ? shared.view : null);
  const [chartRef, width] = useElementWidth<HTMLDivElement>();

  const layout = useMemo(
    () => (shared.ok && width > 0 ? computeLayout(shared.project, { width, view }) : null),
    [shared, width, view],
  );

  if (!shared.ok) {
    return (
      <div className="view-page">
        <div className="view-error" role="alert">
          <strong>This timeline link cannot be shown.</strong>
          <span>{shared.error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="view-page">
      <main className="chart" ref={chartRef}>
        {layout && <ChartView layout={layout} theme={theme} onViewChange={setView} readOnly />}
      </main>
      <p className="view-footer">
        Read-only view · hover for dates · Ctrl + scroll to zoom
        {layout && layout.outOfRange.length > 0 && ` · ${layout.outOfRange.length} entries outside the shown range`}
      </p>
    </div>
  );
}
