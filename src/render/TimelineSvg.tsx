import { parseDay } from '../model/dates';
import type { LayoutItem, LayoutResult, LayoutRow } from '../layout/types';
import { readableTextColor } from './color';

/** Colours used in the drawing. Inline attributes only (no CSS classes) so the SVG exports cleanly. */
export type ChartTheme = {
  font: string;
  background: string;
  rowStripe: string;
  rowLine: string;
  grid: string;
  gridMajor: string;
  axisText: string;
  headerText: string;
  labelText: string;
  mutedText: string;
  today: string;
  selected: string;
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const LIGHT_THEME: ChartTheme = {
  font: FONT,
  background: '#ffffff',
  rowStripe: '#f8fafc',
  rowLine: '#e2e8f0',
  grid: '#eef2f7',
  gridMajor: '#cbd5e1',
  axisText: '#475569',
  headerText: '#0f172a',
  labelText: '#1e293b',
  mutedText: '#94a3b8',
  today: '#dc2626',
  selected: '#0f172a',
};

export const DARK_THEME: ChartTheme = {
  font: FONT,
  background: '#111827',
  rowStripe: '#162033',
  rowLine: '#1f2937',
  grid: '#1c2636',
  gridMajor: '#334155',
  axisText: '#94a3b8',
  headerText: '#e5e7eb',
  labelText: '#e2e8f0',
  mutedText: '#64748b',
  today: '#f87171',
  selected: '#f8fafc',
};

/** Exports always use the light theme (documents and slides are usually white). */
export const THEME = LIGHT_THEME;

type Props = {
  layout: LayoutResult;
  title?: string;
  theme?: ChartTheme;
  /** Interactive use only (omitted for exports): highlight one entry and report clicks. */
  selectedId?: string | null;
  onSelect?: (entryId: string | null) => void;
  /** Interactive use only: clicking a row name folds / unfolds the row. */
  onToggleRow?: (timelineId: string) => void;
};

export function TimelineSvg({ layout, title = 'Timeline', theme = LIGHT_THEME, selectedId = null, onSelect, onToggleRow }: Props) {
  const { width, height, plot, rows, items, ticks, today, fontSize } = layout;
  const T = theme;

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
      <rect x={0} y={0} width={width} height={height} fill={T.background} onClick={onSelect && (() => onSelect(null))} />

      {/* Row backgrounds and headers */}
      {rows.map((r, i) => (
        <g key={r.timelineId}>
          {i % 2 === 1 && <rect x={0} y={r.y} width={width} height={r.height} fill={T.rowStripe} />}
          <line x1={0} x2={width} y1={r.y + r.height} y2={r.y + r.height} stroke={T.rowLine} />
          <RowHeader row={r} theme={T} onToggle={onToggleRow} />
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
      {items
        .filter((i) => i.kind === 'bar')
        .map((i) => (
          <Bar key={i.entryId} item={i} theme={T} selected={i.entryId === selectedId} onSelect={onSelect} />
        ))}
      {items
        .filter((i) => i.kind === 'milestone')
        .map((i) => (
          <Milestone key={i.entryId} item={i} theme={T} selected={i.entryId === selectedId} onSelect={onSelect} />
        ))}

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

function RowHeader({ row: r, theme: T, onToggle }: { row: LayoutRow; theme: ChartTheme; onToggle?: (id: string) => void }) {
  const cy = r.y + r.height / 2;
  const interactive = onToggle
    ? { onClick: () => onToggle(r.timelineId), style: { cursor: 'pointer' }, role: 'button', 'aria-expanded': !r.collapsed }
    : {};
  return (
    <g {...interactive}>
      {(onToggle || r.label !== r.name) && (
        <title>{`${r.name}${onToggle ? (r.collapsed ? ' – click to expand' : ' – click to collapse') : ''}`}</title>
      )}
      {/* Invisible hit area so the whole header is clickable */}
      {onToggle && <rect x={0} y={r.y} width={150} height={r.height} fill="transparent" />}
      {onToggle && (
        <text x={7} y={cy} dominantBaseline="central" textAnchor="middle" fill={T.mutedText} fontSize={9}>
          {r.collapsed ? '▶' : '▼'}
        </text>
      )}
      <rect x={14} y={cy - 6} width={12} height={12} rx={3} fill={r.color} opacity={r.collapsed ? 0.6 : 1} />
      <text
        x={32}
        y={cy}
        dominantBaseline="central"
        fill={r.collapsed ? T.mutedText : T.headerText}
        fontWeight={600}
      >
        {r.label}
      </text>
    </g>
  );
}

function tooltip(i: LayoutItem): string {
  if (i.kind === 'milestone') return `${i.name}\n${i.start}`;
  const days = parseDay(i.end)! - parseDay(i.start)! + 1;
  return `${i.name}\n${i.start} → ${i.end} (${days} days)`;
}

function Label({ item, color }: { item: LayoutItem; color: string }) {
  const l = item.label;
  if (l.hidden) return null;
  return (
    <text x={l.x} y={l.y} textAnchor={l.anchor} dominantBaseline="central" fill={color}>
      {l.text}
    </text>
  );
}

type ItemProps = { item: LayoutItem; theme: ChartTheme; selected: boolean; onSelect?: (entryId: string) => void };

/** Click handling + pointer cursor, only when the chart is interactive. */
const interaction = (i: LayoutItem, onSelect?: (id: string) => void) =>
  onSelect ? { onClick: () => onSelect(i.entryId), style: { cursor: 'pointer' } } : {};

function Bar({ item: i, theme: T, selected, onSelect }: ItemProps) {
  const inside = i.label.placement === 'inside';
  return (
    <g {...interaction(i, onSelect)}>
      <title>{tooltip(i)}</title>
      <rect
        x={i.x}
        y={i.y}
        width={i.width}
        height={i.height}
        rx={Math.min(4, i.height / 2)}
        fill={i.color}
        fillOpacity={i.opacity}
        {...(selected ? { stroke: T.selected, strokeWidth: 2 } : {})}
      />
      <Label item={i} color={inside ? readableTextColor(i.color) : T.labelText} />
    </g>
  );
}

function Milestone({ item: i, theme: T, selected, onSelect }: ItemProps) {
  const h = i.width / 2;
  const points = `${i.x},${i.y - h} ${i.x + h},${i.y} ${i.x},${i.y + h} ${i.x - h},${i.y}`;
  return (
    <g {...interaction(i, onSelect)}>
      <title>{tooltip(i)}</title>
      <polygon
        points={points}
        fill={i.color}
        stroke={selected ? T.selected : T.background}
        strokeWidth={selected ? 2 : 1.5}
      />
      <Label item={i} color={T.labelText} />
    </g>
  );
}
