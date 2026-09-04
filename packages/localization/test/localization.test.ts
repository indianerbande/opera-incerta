import { describe, expect, it } from 'vitest';
import {
  CATALOGUES,
  DE,
  EN,
  LANGUAGES,
  isLanguageChoice,
  plural,
  resolveLanguage,
  translate,
  type MessageKey,
  type PluralKey,
} from '../src/index.js';

describe('the catalogues (SPEC.md §14.1)', () => {
  it('carry the same keys, none of them empty', () => {
    expect(Object.keys(DE).sort()).toEqual(Object.keys(EN).sort());
    for (const language of LANGUAGES) {
      for (const [key, message] of Object.entries(CATALOGUES[language])) {
        expect(message.trim(), `${language} ${key}`).not.toBe('');
      }
    }
  });

  it('use the same placeholders in both languages', () => {
    const placeholders = (message: string): string[] =>
      [...message.matchAll(/\{(\w+)\}/gu)].map((match) => match[1] ?? '').sort();
    for (const key of Object.keys(EN) as MessageKey[]) {
      expect(placeholders(DE[key]), key).toEqual(placeholders(EN[key]));
    }
  });

  it('spell every plural family in both forms English and German have', () => {
    const bases = new Set(
      Object.keys(EN)
        .filter((key) => key.endsWith('.other'))
        .map((key) => key.slice(0, -'.other'.length)),
    );
    expect(bases.size).toBeGreaterThan(0);
    for (const base of bases) {
      for (const language of LANGUAGES) {
        const catalogue = CATALOGUES[language] as Record<string, string>;
        expect(catalogue[`${base}.one`], `${language} ${base}.one`).toBeDefined();
        expect(catalogue[`${base}.other`], `${language} ${base}.other`).toBeDefined();
      }
    }
  });
});

describe('translate', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'sourceControl.onBranch', { name: 'main' })).toBe('On branch main');
    expect(translate('de', 'sourceControl.onBranch', { name: 'main' })).toBe('Auf Branch main');
    expect(translate('en', 'sourceControl.onBranch', {})).toBe('On branch {name}');
  });

  it('falls back to the key itself for a key the catalogue has lost', () => {
    // The type forbids this from source; a catalogue that lost a line does
    // not, and the fallback is what the author would then see.
    expect(translate('de', 'not.a.key' as MessageKey)).toBe('not.a.key');
  });
});

describe('plural resolution (SPEC.md §14.1)', () => {
  const cases: ReadonlyArray<readonly [PluralKey, number, string, string]> = [
    ['library.sheets', 0, '0 sheets', '0 Blätter'],
    ['library.sheets', 1, '1 sheet', '1 Blatt'],
    ['library.sheets', 2, '2 sheets', '2 Blätter'],
    ['library.sheets', 21, '21 sheets', '21 Blätter'],
    ['library.subgroups', 1, '1 subgroup', '1 Untergruppe'],
    ['library.subgroups', 5, '5 subgroups', '5 Untergruppen'],
    ['inspector.words', 1, 'word', 'Wort'],
    ['inspector.words', 100, 'words', 'Wörter'],
  ];
  for (const [key, count, english, german] of cases) {
    it(`resolves ${key} for ${count} in both languages`, () => {
      expect(plural('en', key, count)).toBe(english);
      expect(plural('de', key, count)).toBe(german);
    });
  }

  it('uses the platform rules, not a count-equals-one test', () => {
    // 1 is "one" in both languages; 0 is "other" in both — as Intl says.
    expect(new Intl.PluralRules('en').select(0)).toBe('other');
    expect(plural('en', 'library.sheets', 0)).toBe('0 sheets');
  });
});

describe('the language choice', () => {
  it('follows the system where a catalogue exists, and English elsewhere', () => {
    expect(resolveLanguage('system', 'de-AT')).toBe('de');
    expect(resolveLanguage('system', 'de_DE')).toBe('de');
    expect(resolveLanguage('system', 'en-GB')).toBe('en');
    expect(resolveLanguage('system', 'fr-FR')).toBe('en');
    expect(resolveLanguage('system', '')).toBe('en');
  });

  it('takes an explicit choice as it is', () => {
    expect(resolveLanguage('de', 'en-US')).toBe('de');
    expect(resolveLanguage('en', 'de-DE')).toBe('en');
  });

  it('recognises the three stored values and nothing else', () => {
    expect(isLanguageChoice('system')).toBe(true);
    expect(isLanguageChoice('de')).toBe(true);
    expect(isLanguageChoice('fr')).toBe(false);
    expect(isLanguageChoice(null)).toBe(false);
  });
});
