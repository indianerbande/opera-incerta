import { describe, expect, it } from 'vitest';
import { categoryTextColor, parseHexColor, relativeLuminance, textColorFor } from '../src/index.js';

describe('parseHexColor', () => {
  it('accepts #RRGGBB with and without the leading hash', () => {
    expect(parseHexColor('#FF8000')).toEqual({ red: 255, green: 128, blue: 0 });
    expect(parseHexColor('ff8000')).toEqual({ red: 255, green: 128, blue: 0 });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseHexColor('  #000000 ')).toEqual({ red: 0, green: 0, blue: 0 });
  });

  it('returns null for anything else', () => {
    expect(parseHexColor('#FFF')).toBeNull();
    expect(parseHexColor('#GGGGGG')).toBeNull();
    expect(parseHexColor('rgb(1,2,3)')).toBeNull();
    expect(parseHexColor('')).toBeNull();
  });
});

describe('textColorFor', () => {
  it('uses black on a light background and white on a dark one', () => {
    expect(textColorFor({ red: 255, green: 255, blue: 255 })).toBe('black');
    expect(textColorFor({ red: 0, green: 0, blue: 0 })).toBe('white');
  });

  it('uses white exactly at the threshold, because the rule is strictly greater than 0.5', () => {
    const halfway = { red: 128, green: 128, blue: 128 };
    expect(relativeLuminance(halfway)).toBeCloseTo(128 / 255, 10);
    expect(textColorFor(halfway)).toBe('black');

    const atThreshold = { red: 127.5, green: 127.5, blue: 127.5 };
    expect(relativeLuminance(atThreshold)).toBeCloseTo(0.5, 10);
    expect(textColorFor(atThreshold)).toBe('white');
  });

  it('weights green more heavily than blue', () => {
    const green = relativeLuminance({ red: 0, green: 255, blue: 0 });
    const blue = relativeLuminance({ red: 0, green: 0, blue: 255 });
    expect(green).toBeGreaterThan(blue);
  });
});

describe('categoryTextColor', () => {
  it('combines parsing and the threshold rule', () => {
    expect(categoryTextColor('#FFFFFF')).toBe('black');
    expect(categoryTextColor('#101010')).toBe('white');
  });

  it('returns null for an unreadable stored color instead of guessing', () => {
    expect(categoryTextColor('not-a-color')).toBeNull();
  });
});
