import { describe, expect, it } from 'vitest';
import {
  FRONT_MATTER_MAX_VISIBLE_LINES,
  PREVIEW_BASE_FONT_SIZE,
  PREVIEW_DENSITIES,
  PREVIEW_STEP_RATIO,
  cappedBlockHeight,
  effectiveBlockHeight,
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
  const body = ['First line', '', 'Second line', '', '', 'Third line', 'Fourth', 'Fifth'];

  it('drops blank lines by default', () => {
    expect(previewLines(body, 'standard', false)).toEqual([
      'First line',
      'Second line',
      'Third line',
      'Fourth',
    ]);
  });

  it('keeps blank lines when asked', () => {
    expect(previewLines(body, 'standard', true)).toEqual(['First line', '', 'Second line', '']);
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

describe('cappedBlockHeight', () => {
  it('shows short content at its measured height', () => {
    expect(cappedBlockHeight(80, 4)).toBe(80);
    expect(cappedBlockHeight(200, FRONT_MATTER_MAX_VISIBLE_LINES)).toBe(200);
  });

  it('caps proportionally: twice the allowed lines shows half the height', () => {
    expect(cappedBlockHeight(400, FRONT_MATTER_MAX_VISIBLE_LINES * 2)).toBe(200);
  });

  it('collapses to nothing for empty or unmeasurable content', () => {
    expect(cappedBlockHeight(0, 0)).toBe(0);
    expect(cappedBlockHeight(100, 0)).toBe(0);
    expect(cappedBlockHeight(Number.NaN, 5)).toBe(0);
  });
});

describe('effectiveBlockHeight', () => {
  it('uses the content height when nothing was dragged', () => {
    expect(effectiveBlockHeight(120, null)).toBe(120);
  });

  it('lets dragging enlarge', () => {
    expect(effectiveBlockHeight(120, 300)).toBe(300);
  });

  it('never lets dragging hide content', () => {
    expect(effectiveBlockHeight(120, 40)).toBe(120);
  });
});
