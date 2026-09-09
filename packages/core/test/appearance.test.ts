import { describe, expect, it } from 'vitest';
import {
  ACCENT_PALETTES,
  COLOR_SCHEMES,
  DEFAULT_ACCENT_PALETTE,
  DEFAULT_COLOR_SCHEME,
  isAccentPalette,
  isColorScheme,
  resolveColorScheme,
} from '../src/index.js';

describe('the visual system (SPEC.md §8.8)', () => {
  it('resolves a chosen scheme to itself and the system one to the machine', () => {
    expect(resolveColorScheme('light', true)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
  });

  it('starts by following the system, in the palette the surfaces are written for', () => {
    expect(DEFAULT_COLOR_SCHEME).toBe('system');
    expect(DEFAULT_ACCENT_PALETTE).toBe('blue');
  });

  it('offers three schemes and eight palettes, and refuses anything else', () => {
    expect([...COLOR_SCHEMES]).toEqual(['system', 'light', 'dark']);
    expect(ACCENT_PALETTES).toHaveLength(8);
    for (const scheme of COLOR_SCHEMES) {
      expect(isColorScheme(scheme)).toBe(true);
    }
    for (const palette of ACCENT_PALETTES) {
      expect(isAccentPalette(palette)).toBe(true);
    }
    expect(isColorScheme('sepia')).toBe(false);
    expect(isAccentPalette('chartreuse')).toBe(false);
    expect(isColorScheme(null)).toBe(false);
  });
});
