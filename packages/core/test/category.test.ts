import { describe, expect, it } from 'vitest';
import {
  MAX_CATEGORIES,
  categoryTextColor,
  findCategory,
  parseHexColor,
  readCategories,
  relativeLuminance,
  textColorFor,
} from '../src/index.js';

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

describe('readCategories', () => {
  const good = [
    { id: 'a', name: 'Draft', color: '#ff0000' },
    { id: 'b', name: 'Done', color: '#00ff00' },
  ];

  it('reads well-formed entries', () => {
    expect(readCategories(good)).toEqual(good);
  });

  it('costs one entry, not the set, when something is unusable', () => {
    expect(
      readCategories([
        ...good,
        { id: '', name: 'Nameless id', color: '#000000' },
        { id: 'c', name: 'Bad colour', color: 'red' },
        { id: 'd', name: 42, color: '#000000' },
        { id: 'a', name: 'Duplicate', color: '#123456' },
        'not an object',
      ]),
    ).toEqual(good);
  });

  it('is nothing for a missing or malformed file', () => {
    expect(readCategories(undefined)).toEqual([]);
    expect(readCategories({ categories: good })).toEqual([]);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: MAX_CATEGORIES + 10 }, (_unused, index) => ({
      id: `id-${String(index)}`,
      name: `Category ${String(index)}`,
      color: '#112233',
    }));
    expect(readCategories(many)).toHaveLength(MAX_CATEGORIES);
  });
});

describe('findCategory', () => {
  const categories = [{ id: 'a', name: 'Draft', color: '#ff0000' }];

  it('finds one by id, and treats an unknown id as uncategorized', () => {
    expect(findCategory(categories, 'a')?.name).toBe('Draft');
    // A deleted category leaves its id behind in sheets, on purpose (§6.6).
    expect(findCategory(categories, 'gone')).toBeNull();
    expect(findCategory(categories, undefined)).toBeNull();
  });
});

describe('the colour is stored as #RRGGBB', () => {
  it('adds the hash a file left out, so the badge can bind the value', () => {
    const [category] = readCategories([{ id: 'a', name: 'Draft', color: 'ff8000' }]);
    expect(category?.color).toBe('#ff8000');
    const [kept] = readCategories([{ id: 'b', name: 'Done', color: ' #00FF00 ' }]);
    expect(kept?.color).toBe('#00FF00');
  });
});
