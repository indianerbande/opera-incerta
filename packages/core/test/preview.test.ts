import { describe, expect, it } from 'vitest';
import {
  PREVIEW_BASE_FONT_SIZE,
  PREVIEW_DENSITIES,
  PREVIEW_STEP_RATIO,
  previewFontSize,
  previewLineCount,
  previewLines,
} from '../src/index.js';

describe('preview density', () => {
  it('has the specified totals: 3, 5, and 10 lines', () => {
    expect(PREVIEW_DENSITIES.compact.totalLines).toBe(3);
    expect(PREVIEW_DENSITIES.standard.totalLines).toBe(5);
    expect(PREVIEW_DENSITIES.large.totalLines).toBe(10);
  });

  it('reserves one line of each total for the title', () => {
    expect(previewLineCount('compact')).toBe(2);
    expect(previewLineCount('standard')).toBe(4);
    expect(previewLineCount('large')).toBe(9);
  });
});

describe('previewFontSize', () => {
  it('puts body text and H6 at the base size', () => {
    expect(previewFontSize(null)).toBe(PREVIEW_BASE_FONT_SIZE);
    expect(previewFontSize(6)).toBe(PREVIEW_BASE_FONT_SIZE);
  });

  it('grows by one step per level upward, so H1 is base times ratio to the fifth', () => {
    expect(previewFontSize(5)).toBeCloseTo(PREVIEW_BASE_FONT_SIZE * PREVIEW_STEP_RATIO, 10);
    expect(previewFontSize(1)).toBeCloseTo(PREVIEW_BASE_FONT_SIZE * PREVIEW_STEP_RATIO ** 5, 10);
    expect(previewFontSize(1)).toBeCloseTo(15.3, 1);
  });

  it('increases monotonically from H6 to H1', () => {
    const sizes = [6, 5, 4, 3, 2, 1].map((level) => previewFontSize(level as 1));
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThan(sizes[index - 1] as number);
    }
  });

  it('uses one uniform size under the compact density', () => {
    for (const level of [null, 1, 3, 6] as const) {
      expect(previewFontSize(level, 'compact')).toBe(PREVIEW_BASE_FONT_SIZE);
    }
  });

  it('accepts a different base and ratio, because both become settings later', () => {
    expect(previewFontSize(1, 'standard', 10, 1.1)).toBeCloseTo(10 * 1.1 ** 5, 10);
  });
});

describe('previewLines', () => {
  const texts = ['First line', '', 'Second line', '', '', 'Third line', 'Fourth', 'Fifth'];
  const body = texts.map((text, index) => ({ text, level: index === 0 ? (1 as const) : null }));
  const kept = (lines: readonly { text: string }[]): string[] => lines.map((line) => line.text);

  it('drops blank lines by default, and keeps what a line carries', () => {
    const lines = previewLines(body, 'standard', false);
    expect(kept(lines)).toEqual(['First line', 'Second line', 'Third line', 'Fourth']);
    // The level travels with the line, so nothing has to be matched back.
    expect(lines[0]?.level).toBe(1);
    expect(lines[1]?.level).toBeNull();
  });

  it('keeps blank lines when asked', () => {
    expect(kept(previewLines(body, 'standard', true))).toEqual(['First line', '', 'Second line', '']);
  });

  it('never returns more lines than the density allows', () => {
    expect(previewLines(body, 'compact', false)).toHaveLength(2);
    expect(previewLines(body, 'large', false).length).toBeLessThanOrEqual(
      previewLineCount('large'),
    );
  });

  it('returns fewer lines than allowed when the body is short', () => {
    // Five non-blank lines, nine slots.
    expect(previewLines(body, 'large', false)).toHaveLength(5);
  });
});
