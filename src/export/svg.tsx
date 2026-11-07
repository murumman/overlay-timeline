import { renderToStaticMarkup } from 'react-dom/server';
import type { LayoutResult } from '../layout/types';
import { TimelineSvg } from '../render/TimelineSvg';

/** The chart as a standalone SVG document (same drawing as on screen, without the selection highlight). */
export function layoutToSvg(layout: LayoutResult, title = 'Timeline'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(<TimelineSvg layout={layout} title={title} />)}\n`;
}

/** Just the <svg> element, for embedding in HTML. */
export function layoutToSvgElement(layout: LayoutResult, title = 'Timeline'): string {
  return renderToStaticMarkup(<TimelineSvg layout={layout} title={title} />);
}
