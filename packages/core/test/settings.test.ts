import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  LAYOUT_PREFERENCE_KEYS,
  PREVIEW_DENSITIES,
  SETTINGS,
  SETTINGS_CATEGORIES,
  settingsOf,
} from '../src/index.js';

describe('the settings registry (SPEC.md §13)', () => {
  it('registers every preference that is not layout exactly once', () => {
    const recordKeys = Object.keys(DEFAULT_PREFERENCES).filter(
      (key) => !(LAYOUT_PREFERENCE_KEYS as readonly string[]).includes(key),
    );
    const registered = SETTINGS.map((setting) => setting.key);
    expect([...registered].sort()).toEqual([...recordKeys].sort());
  });

  it('gives every setting a stable, unique id and a category that exists', () => {
    const ids = SETTINGS.map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(SETTINGS_CATEGORIES.map((category) => category.id));
    for (const setting of SETTINGS) {
      expect(categories.has(setting.category), setting.id).toBe(true);
      expect(setting.id.startsWith(`${setting.category}.`), setting.id).toBe(true);
    }
  });

  it('takes every default from the preference record, never from a second source', () => {
    for (const setting of SETTINGS) {
      expect(setting.defaultValue, setting.id).toBe(DEFAULT_PREFERENCES[setting.key]);
    }
  });

  it('offers exactly the density steps the preview knows', () => {
    const density = SETTINGS.find((setting) => setting.kind === 'density');
    expect(density?.kind).toBe('density');
    if (density?.kind === 'density') {
      expect(density.options.map((option) => option.value).sort()).toEqual(
        Object.keys(PREVIEW_DENSITIES).sort(),
      );
    }
  });

  it('lists categories once each, and marks the two that hold no preference', () => {
    const ids = SETTINGS_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    const withoutPreferences = SETTINGS_CATEGORIES.filter(
      (category) => settingsOf(category.id).length === 0,
    ).map((category) => [category.id, category.scope]);
    expect(withoutPreferences).toEqual([
      ['pageCategories', 'project'],
      ['sourceControl', 'repository'],
    ]);
    for (const category of SETTINGS_CATEGORIES.filter((c) => settingsOf(c.id).length > 0)) {
      expect(category.scope, category.id).toBe('installation');
    }
  });
});
