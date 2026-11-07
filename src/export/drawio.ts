import type { LayoutItem, LayoutLabel, LayoutResult } from '../layout/types';
import { estimateTextWidth } from '../layout/text';
import { parseDay } from '../model/dates';
import { readableTextColor } from '../render/color';
import { THEME } from '../render/TimelineSvg';
import { escapeXml } from './xml';

/** draw.io layers: the grid is locked so clicks reach the entries; entries stay freely editable. */
const BG_LAYER = 'layer-background';
const ENTRY_LAYER = 'layer-entries';

/**
 * Converts the layout into an editable draw.io / diagrams.net file (.drawio).
 *
 * - "Background" layer (locked): white page, row stripes, grid lines, axis dates, today line.
 *   It can be unlocked in draw.io's Layers panel (Ctrl+Shift+L).
 * - "Timeline" layer (editable): row names and colour squares, every bar (rounded rectangle)
 *   and milestone (rhombus). Each shape carries its own name as label, so label and shape
 *   move together, and keeps its dates as a tooltip.
 *
 * Coordinates are the same as on screen.
 */
export function layoutToDrawio(layout: LayoutResult, title = 'Timeline', modified = new Date().toISOString()): string {
  const cells: string[] = [];
  let n = 0;
  const id = (prefix: string) => `${prefix}-${++n}`;
  const T = THEME;
  const font = `fontFamily=Helvetica;fontSize=${layout.fontSize};`;

  const geometry = (x: number, y: number, w: number, h: number) =>
    `<mxGeometry x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" as="geometry"/>`;

  const vertex = (layer: string, prefix: string, value: string, style: string, x: number, y: number, w: number, h: number) =>
    `<mxCell id="${id(prefix)}" value="${escapeXml(value)}" style="${style}" vertex="1" parent="${layer}">${geometry(x, y, w, h)}</mxCell>`;

  /** An entry shape; a tooltip needs a UserObject wrapper that carries the label. */
  const entryShape = (prefix: string, value: string, tip: string, style: string, x: number, y: number, w: number, h: number) =>
    `<UserObject label="${escapeXml(value)}" tooltip="${escapeXml(tip)}" id="${id(prefix)}">` +
    `<mxCell style="${style}" vertex="1" parent="${ENTRY_LAYER}">${geometry(x, y, w, h)}</mxCell></UserObject>`;

  const line = (x1: number, y1: number, x2: number, y2: number, style: string) =>
    `<mxCell id="${id('line')}" value="" style="endArrow=none;html=1;${style}" edge="1" parent="${BG_LAYER}">` +
    `<mxGeometry relative="1" as="geometry"><mxPoint x="${r(x1)}" y="${r(y1)}" as="sourcePoint"/>` +
    `<mxPoint x="${r(x2)}" y="${r(y2)}" as="targetPoint"/></mxGeometry></mxCell>`;

  const textStyle = (color: string, align: 'left' | 'center' | 'right', extra = '') =>
    `text;html=0;${font}fontColor=${color};align=${align};verticalAlign=middle;strokeColor=none;fillColor=none;whiteSpace=nowrap;spacing=0;${extra}`;

  /** A free-standing background text, anchored like the SVG text. */
  const bgText = (l: Omit<LayoutLabel, 'placement'>, color: string, extra = '') => {
    const w = estimateTextWidth(l.text, layout.fontSize) + 6;
    const x = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
    const align = l.anchor === 'start' ? 'left' : l.anchor === 'end' ? 'right' : 'center';
    return vertex(BG_LAYER, 'text', l.text, textStyle(color, align, extra), x, l.y - 9, w, 18);
  };

  // ---- Background layer (locked)
  cells.push(vertex(BG_LAYER, 'page', '', `rounded=0;fillColor=${T.background};strokeColor=none;`, 0, 0, layout.width, layout.height));
  layout.rows.forEach((row, i) => {
    if (i % 2 === 1) {
      cells.push(vertex(BG_LAYER, 'stripe', '', `rounded=0;fillColor=${T.rowStripe};strokeColor=none;`, 0, row.y, layout.width, row.height));
    }
    cells.push(line(0, row.y + row.height, layout.width, row.y + row.height, `strokeColor=${T.rowLine};`));
  });
  const { plot } = layout;
  cells.push(line(0, plot.y0, layout.width, plot.y0, `strokeColor=${T.gridMajor};`));
  for (const t of layout.ticks) {
    cells.push(line(t.x, t.major ? 4 : plot.y0 - 8, t.x, plot.y1, `strokeColor=${t.major ? T.gridMajor : T.grid};`));
    if (t.showLabel) {
      cells.push(bgText({ text: t.label, x: t.x + 4, y: plot.y0 - 12, anchor: 'start' }, T.axisText, t.major ? 'fontStyle=1;' : ''));
    }
  }
  cells.push(line(plot.x0, plot.y0, plot.x0, plot.y1, `strokeColor=${T.gridMajor};`));
  if (layout.today) {
    const x = layout.today.x;
    cells.push(line(x, plot.y0, x, plot.y1 + 4, `strokeColor=${T.today};strokeWidth=1.5;dashed=1;dashPattern=4 3;`));
    cells.push(bgText({ text: 'Today', x, y: plot.y1 + 12, anchor: 'middle' }, T.today, 'fontStyle=1;fontSize=10;'));
  }

  // ---- Timeline layer (editable): row headers
  for (const row of layout.rows) {
    const cy = row.y + row.height / 2;
    cells.push(vertex(ENTRY_LAYER, 'swatch', '', `rounded=1;arcSize=25;fillColor=${row.color};strokeColor=none;`, 12, cy - 6, 12, 12));
    cells.push(
      vertex(ENTRY_LAYER, 'row', row.name, textStyle(T.headerText, 'left', 'fontStyle=1;'), 32, cy - 9, layout.rowHeader.width - 40, 18),
    );
  }

  // ---- Entries: bars first so milestones sit on top
  for (const b of layout.items.filter((i) => i.kind === 'bar')) {
    const inside = b.label.placement === 'inside';
    const opacity = b.opacity < 1 ? `opacity=${Math.round(b.opacity * 100)};` : '';
    const labelStyle = inside
      ? `fontColor=${readableTextColor(b.color)};align=left;verticalAlign=middle;spacingLeft=6;`
      : `fontColor=${T.labelText};${outsideLabelStyle(b.label)}`;
    const style = `rounded=1;arcSize=22;fillColor=${b.color};strokeColor=none;${opacity}${font}whiteSpace=nowrap;${labelStyle}${hiddenLabel(b)}`;
    cells.push(entryShape('bar', b.name, tooltip(b), style, b.x, b.y, b.width, b.height));
  }
  for (const m of layout.items.filter((i) => i.kind === 'milestone')) {
    const h = m.width / 2;
    const style =
      `rhombus;fillColor=${m.color};strokeColor=${T.background};strokeWidth=1.5;${font}` +
      `fontColor=${T.labelText};whiteSpace=nowrap;${outsideLabelStyle(m.label)}${hiddenLabel(m)}`;
    cells.push(entryShape('milestone', m.name, tooltip(m), style, m.x - h, m.y - h, m.width, m.height));
  }

  const model =
    `<mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="0" arrows="0" fold="1" page="0" ` +
    `pageScale="1" pageWidth="${r(layout.width)}" pageHeight="${r(layout.height)}" math="0" shadow="0"><root>` +
    `<mxCell id="0"/>` +
    `<mxCell id="${BG_LAYER}" value="Background (locked)" style="locked=1;" parent="0"/>` +
    `<mxCell id="${ENTRY_LAYER}" value="Timeline" parent="0"/>` +
    `${cells.join('')}</root></mxGraphModel>`;

  return (
    `<mxfile host="Overlay Timeline" modified="${escapeXml(modified)}" type="device">` +
    `<diagram id="timeline" name="${escapeXml(title)}">${model}</diagram></mxfile>\n`
  );
}

/**
 * draw.io style that puts a shape's own label outside it, where the app drew it:
 * right/left of the shape, or above/below it (single-line mode).
 */
function outsideLabelStyle(l: LayoutLabel): string {
  const gap = 5;
  switch (l.placement) {
    case 'right':
      return `labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;spacingLeft=${gap};`;
    case 'left':
      return `labelPosition=left;verticalLabelPosition=middle;align=right;verticalAlign=middle;spacingRight=${gap};`;
    case 'above':
    case 'below': {
      const align = l.anchor === 'start' ? 'left' : l.anchor === 'end' ? 'right' : 'center';
      return l.placement === 'above'
        ? `labelPosition=center;verticalLabelPosition=top;align=${align};verticalAlign=bottom;spacingBottom=2;`
        : `labelPosition=center;verticalLabelPosition=bottom;align=${align};verticalAlign=top;spacingTop=2;`;
    }
    case 'inside':
      return 'align=left;verticalAlign=middle;spacingLeft=6;';
  }
}

/** A label with no room keeps its text but is switched off (draw.io: Edit Style → remove noLabel). */
const hiddenLabel = (i: LayoutItem) => (i.label.hidden ? 'noLabel=1;' : '');

function tooltip(i: LayoutItem): string {
  if (i.kind === 'milestone') return `${i.name}\n${i.start}`;
  const days = parseDay(i.end)! - parseDay(i.start)! + 1;
  return `${i.name}\n${i.start} → ${i.end} (${days} days)`;
}

/** Round to 0.1 px to keep the file small. */
const r = (v: number) => Math.round(v * 10) / 10;
