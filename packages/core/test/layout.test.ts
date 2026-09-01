import { describe, expect, it } from 'vitest';
import { COLUMN_BOUNDS, COLUMN_IDEAL_WIDTH, clampColumnWidth } from '../src/index.js';

describe('clampColumnWidth', () => {
  const bounds = COLUMN_BOUNDS.navigator;

  it('keeps a value inside its bounds', () => {
    expect(clampColumnWidth(180, bounds)).toBe(180);
  });

  it('clamps below the minimum and above the maximum', () => {
    expect(clampColumnWidth(10, bounds)).toBe(bounds.min);
    expect(clampColumnWidth(9999, bounds)).toBe(bounds.max);
  });

  it('clamps a stored value that predates changed constants', () => {
    const stored = 300;
    expect(clampColumnWidth(stored, bounds)).toBe(bounds.max);
  });

  it('falls back to the minimum for a non-finite value instead of propagating NaN', () => {
    expect(clampColumnWidth(Number.NaN, bounds)).toBe(bounds.min);
    expect(clampColumnWidth(Number.POSITIVE_INFINITY, bounds)).toBe(bounds.max);
    expect(clampColumnWidth(Number.NEGATIVE_INFINITY, bounds)).toBe(bounds.min);
  });

  it('returns the minimum when the bounds themselves are inverted', () => {
    expect(clampColumnWidth(300, { min: 200, max: 100 })).toBe(200);
  });
});

describe('column constants', () => {
  it('places every ideal width inside its own bounds', () => {
    for (const column of Object.keys(COLUMN_BOUNDS) as Array<keyof typeof COLUMN_BOUNDS>) {
      const bounds = COLUMN_BOUNDS[column];
      const ideal = COLUMN_IDEAL_WIDTH[column];
      expect(ideal).toBeGreaterThanOrEqual(bounds.min);
      expect(ideal).toBeLessThanOrEqual(bounds.max);
    }
  });
});
