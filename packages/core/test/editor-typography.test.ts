import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_TYPOGRAPHY,
  DEFAULT_EDITOR_ZOOM,
  EDITOR_FONT_FAMILIES,
  EDITOR_FONT_SIZE_BOUNDS,
  EDITOR_FONT_STACKS,
  EDITOR_ZOOM_BOUNDS,
  EDITOR_ZOOM_DETENT,
  HEADING_SCALE,
  clampEditorFontSize,
  clampEditorZoom,
  editorZoomFactor,
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

  it('starts with the line-number gutter off', () => {
    // A manuscript is not source code (SPEC.md §10.8).
    expect(DEFAULT_EDITOR_TYPOGRAPHY.lineNumbers).toBe(false);
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

describe('the editor zoom rule (SPEC.md §10.9)', () => {
  it('holds a value to whole percent within its bounds', () => {
    expect(clampEditorZoom(20)).toBe(EDITOR_ZOOM_BOUNDS.min);
    expect(clampEditorZoom(500)).toBe(EDITOR_ZOOM_BOUNDS.max);
    expect(clampEditorZoom(137.4)).toBe(137);
    expect(clampEditorZoom(Number.NaN)).toBe(DEFAULT_EDITOR_ZOOM);
    expect(clampEditorZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_EDITOR_ZOOM);
  });

  it('has a detent at 100 %: the points either side of it land on it', () => {
    for (let offset = -EDITOR_ZOOM_DETENT; offset <= EDITOR_ZOOM_DETENT; offset += 1) {
      expect(clampEditorZoom(DEFAULT_EDITOR_ZOOM + offset)).toBe(DEFAULT_EDITOR_ZOOM);
    }
    // And no further: the detent must not swallow a value the author meant.
    expect(clampEditorZoom(DEFAULT_EDITOR_ZOOM + EDITOR_ZOOM_DETENT + 1)).toBe(
      DEFAULT_EDITOR_ZOOM + EDITOR_ZOOM_DETENT + 1,
    );
    expect(clampEditorZoom(DEFAULT_EDITOR_ZOOM - EDITOR_ZOOM_DETENT - 1)).toBe(
      DEFAULT_EDITOR_ZOOM - EDITOR_ZOOM_DETENT - 1,
    );
  });

  it('is exactly one at 100 %, and multiplies the configured size elsewhere', () => {
    expect(editorZoomFactor(DEFAULT_EDITOR_ZOOM)).toBe(1);
    expect(editorZoomFactor(150)).toBe(1.5);
    expect(editorZoomFactor(50) * DEFAULT_EDITOR_FONT_SIZE).toBe(DEFAULT_EDITOR_FONT_SIZE / 2);
    // A stored value out of bounds is brought in on the way to the factor.
    expect(editorZoomFactor(1000)).toBe(EDITOR_ZOOM_BOUNDS.max / 100);
  });
});
