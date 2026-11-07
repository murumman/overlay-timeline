import type { IsoDate, TimeScale } from '../model/types';
import type { EntryIssue } from '../model/validation';

export type LabelPlacement = 'inside' | 'right' | 'left' | 'above' | 'below';

export type LayoutLabel = {
  text: string;
  /** Anchor point; `y` is the vertical centre of the text. */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  placement: LabelPlacement;
  /** Not drawn because there is no room (collapsed row, or crowded single line). The name stays in the tooltip. */
  hidden?: boolean;
};

export type LayoutItem = {
  entryId: string;
  timelineId: string;
  kind: 'bar' | 'milestone';
  name: string;
  start: IsoDate;
  end: IsoDate;
  /** Bars: top-left corner + size. Milestones: centre point; width/height = diamond size. */
  x: number;
  y: number;
  width: number;
  height: number;
  lane: number;
  color: string;
  opacity: number;
  label: LayoutLabel;
};

export type LayoutRow = {
  timelineId: string;
  name: string;
  /** The name as drawn: shortened with "…" if it does not fit the row header. */
  label: string;
  /** Folded into a thin summary strip without labels. */
  collapsed: boolean;
  color: string;
  y: number;
  height: number;
  laneCount: number;
};

export type AxisTick = { x: number; date: IsoDate; label: string; showLabel: boolean; major: boolean };

/** Pure geometry. Every renderer / exporter (SVG, PNG, HTML, draw.io) only translates this. */
export type LayoutResult = {
  width: number;
  height: number;
  fontSize: number;
  plot: { x0: number; x1: number; y0: number; y1: number };
  axis: { y: number; height: number };
  rowHeader: { width: number };
  domain: { start: IsoDate; end: IsoDate };
  /** The domain without zoom (fit to entries or fixed span). Equal to `domain` when not zoomed. */
  baseDomain: { start: IsoDate; end: IsoDate };
  zoomed: boolean;
  /** The tick unit actually used (resolves 'auto'). */
  scale: TimeScale;
  rows: LayoutRow[];
  items: LayoutItem[];
  ticks: AxisTick[];
  today: { x: number; date: IsoDate } | null;
  /** Entries that could not be drawn, with the reasons. */
  skipped: EntryIssue[];
  /** Ids of valid entries that lie entirely outside a fixed visible span. */
  outOfRange: string[];
};
