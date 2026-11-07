import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutResult } from '../layout/types';
import { panView, zoomView, type View } from '../layout/zoom';
import { parseDay } from '../model/dates';
import { DARK_THEME, LIGHT_THEME, TimelineSvg } from '../render/TimelineSvg';
import { useStore } from '../state/store';

type Props = {
  layout: LayoutResult;
  theme: 'light' | 'dark';
  /** Sets the zoom window; null = show the full range. */
  onViewChange: (view: View | null) => void;
};

const ZOOM_STEP = 1.5;
const DRAG_THRESHOLD_PX = 4;

const toView = (d: { start: string; end: string }): View => ({ start: parseDay(d.start)!, end: parseDay(d.end)! });

/** The interactive chart: selection, folding rows, zoom (buttons / Ctrl+wheel) and drag-to-pan. */
export function ChartView({ layout, theme, onViewChange }: Props) {
  const selectedId = useStore((s) => s.selectedEntryId);
  const { select, toggleCollapsed } = useStore.getState();
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; view: View; moved: boolean } | null>(null);
  // Latest values for the native wheel listener (registered once).
  const latest = useRef({ layout, onViewChange });
  latest.current = { layout, onViewChange };

  const current = toView(layout.domain);
  const base = toView(layout.baseDomain);
  const plotWidth = layout.plot.x1 - layout.plot.x0;

  const zoom = (factor: number, anchor = 0.5) => onViewChange(zoomView(current, base, factor, anchor));

  // Ctrl + mouse wheel zooms around the mouse position. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { layout: l, onViewChange: change } = latest.current;
      const svg = el.querySelector('svg');
      if (!svg) return;
      const x = e.clientX - svg.getBoundingClientRect().left;
      const anchor = (x - l.plot.x0) / (l.plot.x1 - l.plot.x0);
      change(zoomView(toView(l.domain), toView(l.baseDomain), e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to move the zoomed window left/right.
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!layout.zoomed || e.button !== 0) return;
    drag.current = { x: e.clientX, view: current, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) wrapRef.current?.setPointerCapture(e.pointerId);
    d.moved = true;
    const daysPerPx = (d.view.end - d.view.start) / plotWidth;
    onViewChange(panView(d.view, base, -dx * daysPerPx));
  };
  const endDrag = () => {
    // Keep `moved` until the click that follows the drag has been swallowed.
    setTimeout(() => (drag.current = null), 0);
  };

  return (
    <div
      ref={wrapRef}
      className={`chart-canvas${layout.zoomed ? ' zoomed' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        if (drag.current?.moved) e.stopPropagation(); // a drag is not a click
      }}
    >
      <TimelineSvg
        layout={layout}
        theme={theme === 'dark' ? DARK_THEME : LIGHT_THEME}
        selectedId={selectedId}
        onSelect={select}
        onToggleRow={toggleCollapsed}
      />

      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button title="Zoom out (Ctrl + scroll)" aria-label="Zoom out" disabled={!layout.zoomed} onClick={() => zoom(ZOOM_STEP)}>
          −
        </button>
        <button title="Zoom in (Ctrl + scroll)" aria-label="Zoom in" onClick={() => zoom(1 / ZOOM_STEP)}>
          +
        </button>
        {layout.zoomed && (
          <button title="Show the full range" onClick={() => onViewChange(null)}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
