/**
 * Approximate rendered width of a label in a sans-serif font, without needing a DOM.
 * Keeps the layout engine pure (usable in tests and exporters). Slightly generous on purpose.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    if ('iljtf.,:;\'|!()[] '.includes(ch)) units += 0.32;
    else if ('mwMW@'.includes(ch)) units += 0.88;
    else if (ch >= 'A' && ch <= 'Z') units += 0.68;
    else units += 0.56;
  }
  return units * fontSize;
}

/**
 * Shortens `text` with "…" so it fits in `maxWidth` pixels. Returns '' if not even
 * one character plus the ellipsis fits.
 */
export function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
  const chars = [...text];
  for (let n = chars.length - 1; n >= 1; n--) {
    const candidate = chars.slice(0, n).join('').trimEnd() + '…';
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) return candidate;
  }
  return '';
}
