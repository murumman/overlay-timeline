/** Picks black or white text for the best contrast on a #rrggbb background. */
export function readableTextColor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Contrast against white vs. against near-black (#111827, luminance ≈ 0.012)
  return (1.05) / (lum + 0.05) >= (lum + 0.05) / 0.062 ? '#ffffff' : '#111827';
}
