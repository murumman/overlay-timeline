import { describe, expect, it } from 'vitest';
import { readableTextColor } from './color';

describe('readableTextColor', () => {
  it('uses white on dark colours and dark text on light colours', () => {
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff');
    expect(readableTextColor('#fde68a')).toBe('#111827');
  });
});
