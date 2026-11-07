import { escapeXml } from './xml';

/**
 * A single self-contained HTML file showing the chart. Opens in any browser,
 * can be uploaded to Notion, and keeps the hover tooltips. No scripts, no external files.
 */
export function svgToHtmlDocument(svgElement: string, title: string, generatedOn: string): string {
  // Let the chart shrink to the window width while keeping its proportions.
  const responsive = svgElement.replace(/^<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, '<svg$1');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Overlay Timeline">
<title>${escapeXml(title)}</title>
<style>
  body { margin: 0; padding: 24px; background: #f1f5f9; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: #64748b; font-size: 13px; }
  .chart { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
  .chart svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<h1>${escapeXml(title)}</h1>
<p>Created ${escapeXml(generatedOn)} with Overlay Timeline. Hover over an item to see its dates.</p>
<div class="chart">
${responsive}
</div>
</body>
</html>
`;
}
