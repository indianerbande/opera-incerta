import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_TYPOGRAPHY,
  EDITOR_FONT_FAMILIES,
  EDITOR_FONT_SIZE_BOUNDS,
  EDITOR_FONT_STACKS,
  HEADING_SCALE,
  clampEditorFontSize,
  headingFontSize,
  isEditorFontFamily,
} from '../src/index.js';

describe('the editor typography rule (SPEC.md §13, §10.1)', () => {
  it('clamps a base size into its bounds and to whole pixels', () => {
    expect(clampEditorFontSize(9)).toBe(EDITOR_FONT_SIZE_BOUNDS.min);
    expect(clampEditorFontSize(99)).toBe(EDITOR_FONT_SIZE_BOUNDS.max);
    expect(clampEditorFontSize(17.4)).toBe(17);
    expect(clampEditorFontSize(Number.NaN)).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(clampEditorFontSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });

  it('keeps the default within its own bounds', () => {
    expect(clampEditorFontSize(DEFAULT_EDITOR_TYPOGRAPHY.fontSize)).toBe(
      DEFAULT_EDITOR_TYPOGRAPHY.fontSize,
    );
  });

  it('scales every heading level with the base, keeping the ratios', () => {
    for (const base of [12, 16, 24]) {
      expect(headingFontSize(1, base)).toBe(base * 2);
      expect(headingFontSize(1, base)).toBeGreaterThan(headingFontSize(2, base));
      expect(headingFontSize(2, base)).toBeGreaterThan(headingFontSize(3, base));
      expect(headingFontSize(3, base)).toBeGreaterThan(headingFontSize(4, base));
      expect(headingFontSize(4, base)).toBeGreaterThan(headingFontSize(5, base));
      expect(headingFontSize(5, base)).toBe(base);
      expect(headingFontSize(6, base)).toBe(base);
    }
    expect(HEADING_SCALE[1] / HEADING_SCALE[2]).toBeCloseTo(
      headingFontSize(1, 20) / headingFontSize(2, 20),
    );
  });

  it('offers a curated list with a stack behind every id, each ending in a generic family', () => {
    expect(EDITOR_FONT_FAMILIES.length).toBeGreaterThanOrEqual(3);
    for (const family of EDITOR_FONT_FAMILIES) {
      expect(isEditorFontFamily(family)).toBe(true);
      expect(EDITOR_FONT_STACKS[family]).toMatch(/(serif|sans-serif|monospace)$/u);
    }
    expect(isEditorFontFamily('Comic Sans')).toBe(false);
  });
});
