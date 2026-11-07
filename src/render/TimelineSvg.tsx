import { parseDay } from '../model/dates';
import type { LayoutItem, LayoutResult } from '../layout/types';
import { readableTextColor } from './color';

/** Colours used in the drawing. Inline attributes only (no CSS classes) so the SVG exports cleanly. */
export const THEME = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  background: '#ffffff',
  rowStripe: '#f8fafc',
  rowLine: '#e2e8f0',
  grid: '#eef2f7',
  gridMajor: '#cbd5e1',
  axisText: '#475569',
  headerText: '#0f172a',
  labelText: '#1e293b',
  today: '#dc2626',
} as const;

type Props = { layout: LayoutResult; title?: string };

export function TimelineSvg({ layout, title = 'Timeline' }: Props) {
  const { width, height, plot, rows, items, ticks, today, fontSize } = layout;
  const T = THEME;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={T.font}
      fontSize={fontSize}
      role="img"
      aria-label={title}
    >
      <rect x={0} y={0} width={width} height={height} fill={T.background} />

      {/* Row backgrounds and headers */}
      {rows.map((r, i) => (
        <g key={r.timelineId}>
          {i % 2 === 1 && <rect x={0} y={r.y} width={width} height={r.height} fill={T.rowStripe} />}
          <line x1={0} x2={width} y1={r.y + r.height} y2={r.y + r.height} stroke={T.rowLine} />
          <rect x={12} y={r.y + r.height / 2 - 6} width={12} height={12} rx={3} fill={r.color} />
          <text x={32} y={r.y + r.height / 2} dominantBaseline="central" fill={T.headerText} fontWeight={600}>
            {r.name}
          </text>
        </g>
      ))}

      {/* Grid + axis labels */}
      <line x1={0} x2={width} y1={plot.y0} y2={plot.y0} stroke={T.gridMajor} />
      {ticks.map((t) => (
        <g key={t.date}>
          <line
            x1={t.x}
            x2={t.x}
            y1={t.major ? 4 : plot.y0 - 8}
            y2={plot.y1}
            stroke={t.major ? T.gridMajor : T.grid}
          />
          {t.showLabel && (
            <text x={t.x + 4} y={plot.y0 - 12} fill={T.axisText} fontWeight={t.major ? 600 : 400}>
              {t.label}
            </text>
          )}
        </g>
      ))}
      <line x1={plot.x0} x2={plot.x0} y1={plot.y0} y2={plot.y1} stroke={T.gridMajor} />

      {/* Entries: bars first, so milestones sit on top */}
      {items.filter((i) => i.kind === 'bar').map((i) => <Bar key={i.entryId} item={i} />)}
      {items.filter((i) => i.kind === 'milestone').map((i) => <Milestone key={i.entryId} item={i} />)}

      {today && (
        <g>
          <line
            x1={today.x}
            x2={today.x}
            y1={plot.y0}
            y2={plot.y1 + 4}
            stroke={T.today}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text x={today.x} y={plot.y1 + 12} dominantBaseline="central" textAnchor="middle" fill={T.today} fontSize={10} fontWeight={600}>
            Today
          </text>
        </g>
      )}
    </svg>
  );
}

function tooltip(i: LayoutItem): string {
  if (i.kind === 'milestone') return `${i.name}\n${i.start}`;
  const days = parseDay(i.end)! - parseDay(i.start)! + 1;
  return `${i.name}\n${i.start} → ${i.end} (${days} days)`;
}

function Label({ item, color }: { item: LayoutItem; color: string }) {
  const l = item.label;
  return (
    <text x={l.x} y={l.y} textAnchor={l.anchor} dominantBaseline="central" fill={color}>
      {l.text}
    </text>
  );
}

function Bar({ item: i }: { item: LayoutItem }) {
  const inside = i.label.placement === 'inside';
  return (
    <g>
      <title>{tooltip(i)}</title>
      <rect x={i.x} y={i.y} width={i.width} height={i.height} rx={4} fill={i.color} fillOpacity={i.opacity} />
      <Label item={i} color={inside ? readableTextColor(i.color) : THEME.labelText} />
    </g>
  );
}

function Milestone({ item: i }: { item: LayoutItem }) {
  const h = i.width / 2;
  const points = `${i.x},${i.y - h} ${i.x + h},${i.y} ${i.x},${i.y + h} ${i.x - h},${i.y}`;
  return (
    <g>
      <title>{tooltip(i)}</title>
      <polygon points={points} fill={i.color} stroke={THEME.background} strokeWidth={1.5} />
      <Label item={i} color={THEME.labelText} />
    </g>
  );
}
