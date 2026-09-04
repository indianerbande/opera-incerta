import { describe, expect, it } from 'vitest';
import {
  COLUMN_BOUNDS,
  COLUMN_IDEAL_WIDTH,
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  readPreferences,
} from '../src/index.js';

describe('readPreferences', () => {
  it('returns the defaults for nothing stored', () => {
    expect(readPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences('nonsense')).toEqual(DEFAULT_PREFERENCES);
  });

  it('reads a well-formed record', () => {
    const stored = {
      version: 1,
      interfaceLanguage: 'de',
      columnWidths: { navigator: 200, sheetList: 250, secondarySidebar: 300 },
      navigatorView: 'sourceControl',
      secondaryView: 'outline',
      secondaryVisible: false,
      sheetListDensity: 'large',
      showBlankLines: true,
      showDeeperOutline: true,
      showFrontMatter: true,
      frontMatterWritable: true,
      showOwnedFrontMatter: false,
    };

    expect(readPreferences(stored)).toEqual({ ...stored, version: PREFERENCES_VERSION });
  });

  it('costs one setting, not the whole record, when a value is bad', () => {
    const preferences = readPreferences({
      navigatorView: 'nonsense',
      secondaryView: 'outline',
      sheetListDensity: 42,
      showBlankLines: 'yes',
    });

    expect(preferences.navigatorView).toBe('explorer');
    expect(preferences.secondaryView).toBe('outline');
    expect(preferences.sheetListDensity).toBe(DEFAULT_PREFERENCES.sheetListDensity);
    expect(preferences.showBlankLines).toBe(false);
  });

  it('discards unknown fields', () => {
    const preferences = readPreferences({ nonsense: true, secondaryVisible: false });

    expect('nonsense' in preferences).toBe(false);
    expect(preferences.secondaryVisible).toBe(false);
  });

  it('clamps a stored width that predates changed constants', () => {
    const preferences = readPreferences({
      columnWidths: { navigator: 9999, sheetList: 1, secondarySidebar: 260 },
    });

    expect(preferences.columnWidths.navigator).toBe(COLUMN_BOUNDS.navigator.max);
    expect(preferences.columnWidths.sheetList).toBe(COLUMN_BOUNDS.sheetList.min);
    expect(preferences.columnWidths.secondarySidebar).toBe(260);
  });

  it('falls back to the ideal width for a missing or non-numeric one', () => {
    const preferences = readPreferences({ columnWidths: { navigator: 'wide' } });

    expect(preferences.columnWidths.navigator).toBe(COLUMN_IDEAL_WIDTH.navigator);
    expect(preferences.columnWidths.sheetList).toBe(COLUMN_IDEAL_WIDTH.sheetList);
  });

  it('always reports the current version, whatever was stored', () => {
    expect(readPreferences({ version: 99 }).version).toBe(PREFERENCES_VERSION);
  });

  it('round-trips its own output', () => {
    const once = readPreferences({ columnWidths: { navigator: 200 }, secondaryVisible: false });
    expect(readPreferences(JSON.parse(JSON.stringify(once)) as unknown)).toEqual(once);
  });
});

describe('the defaults', () => {
  it('place every column at its ideal width', () => {
    expect(DEFAULT_PREFERENCES.columnWidths).toEqual({
      navigator: COLUMN_IDEAL_WIDTH.navigator,
      sheetList: COLUMN_IDEAL_WIDTH.sheetList,
      secondarySidebar: COLUMN_IDEAL_WIDTH.secondarySidebar,
    });
  });

  it('open on the explorer and the inspector', () => {
    expect(DEFAULT_PREFERENCES.navigatorView).toBe('explorer');
    expect(DEFAULT_PREFERENCES.secondaryView).toBe('inspector');
    expect(DEFAULT_PREFERENCES.secondaryVisible).toBe(true);
  });
});
