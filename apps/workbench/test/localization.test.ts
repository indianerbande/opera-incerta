import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { CATALOGUES, LANGUAGES, type LanguageChoice } from '@opera-incerta/localization';
import { Localization } from '../src/app/localization/localization.js';
import { LayoutState } from '../src/app/shell/layout-state.js';

const appDirectory = join(import.meta.dirname, '..', 'src', 'app');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Every key the interface uses, read from the source: `i18n.t('…')`,
 * `i18n.n('…')`, `this.#i18n.t('…')`, and the registry-style `labelKey:
 * '…'` of the activity bars. TESTING.md §2.10.
 */
function usedKeys(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  for (const file of sourceFiles(appDirectory)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bi18n\.[tn]\(\s*'([^']+)'/gu)) {
      uses.set(match[1] ?? '', [...(uses.get(match[1] ?? '') ?? []), file]);
    }
    for (const match of source.matchAll(/\blabelKey:\s*'([^']+)'/gu)) {
      uses.set(match[1] ?? '', [...(uses.get(match[1] ?? '') ?? []), file]);
    }
  }
  return uses;
}

describe('every key the interface uses exists in every catalogue (TESTING.md §2.10)', () => {
  const uses = usedKeys();

  it('finds keys in the source at all', () => {
    expect(uses.size).toBeGreaterThan(150);
  });

  for (const language of LANGUAGES) {
    it(`has every used key in the ${language} catalogue`, () => {
      const catalogue = CATALOGUES[language] as Record<string, string>;
      const missing = [...uses.keys()].filter(
        (key) => catalogue[key] === undefined && catalogue[`${key}.other`] === undefined,
      );
      expect(missing).toEqual([]);
    });
  }

  it('never hands the service a value that is not a literal key', () => {
    // User data — a category name, a title, a path — goes through a verbatim
    // path (SPEC.md §14.2). A dynamic first argument is the one way to get it
    // into the service, and the settings dialog's `key()` bridge to the
    // registry is the one place allowed to.
    const offenders: string[] = [];
    for (const file of sourceFiles(appDirectory)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bi18n\.[tn]\(\s*([^'\s)][^,)]*)/gu)) {
        const argument = match[1] ?? '';
        if (argument.startsWith('key(') || argument.startsWith('item.labelKey') || argument.startsWith('layout.secondaryTitleKey')) {
          continue;
        }
        offenders.push(`${file}: ${argument}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the localization service', () => {
  it('follows the preference, and the system where the preference says so', () => {
    const choice = signal<LanguageChoice>('system');
    const german = new Localization(choice, 'de-AT');
    expect(german.language()).toBe('de');
    expect(german.t('view.settings')).toBe('Einstellungen');

    choice.set('en');
    expect(german.language()).toBe('en');
    expect(german.t('view.settings')).toBe('Settings');
  });

  it('changes language when the layout state stores a new choice, without a restart', () => {
    const layout = new LayoutState();
    const i18n = new Localization(layout.interfaceLanguage, 'en-US');
    expect(i18n.t('menu.settings')).toBe('Settings…');
    layout.setLanguage('de');
    expect(i18n.t('menu.settings')).toBe('Einstellungen…');
    expect(i18n.n('library.sheets', 2)).toBe('2 Blätter');
  });
});
