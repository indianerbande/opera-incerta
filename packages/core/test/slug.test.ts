import { describe, expect, it } from 'vitest';
import {
  SLUG_MAX_LENGTH,
  arrivalName,
  projectDirectoryName,
  sheetFileName,
  slugify,
  withCollisionSuffix,
} from '../src/index.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Chapter One')).toBe('chapter-one');
  });

  it('transliterates German umlauts to ASCII', () => {
    expect(slugify('Größe und Übermut')).toBe('groesse-und-uebermut');
    expect(slugify('ÄÖÜ')).toBe('aeoeue');
  });

  it('reduces accented letters to their base, and removes what has none', () => {
    // `Café` is `cafe`, not `caf`: a title in French or Polish keeps its letters.
    expect(slugify('Café — 日本語 — naïve')).toBe('cafe-naive');
    expect(slugify('Ærø Łódź')).toBe('r-odz');
    // The umlaut table runs first, so an `ö` keeps its German spelling.
    expect(slugify('Señor Ångström')).toBe('senor-angstroem');
  });

  it('collapses separator runs and trims them at both ends', () => {
    expect(slugify('  ...Hello,,,   World!!  ')).toBe('hello-world');
  });

  it('caps the result at the specified maximum length without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(60));
    expect(slug).toHaveLength(SLUG_MAX_LENGTH);

    const capped = slugify(`${'b'.repeat(SLUG_MAX_LENGTH - 1)} tail`);
    expect(capped).toHaveLength(SLUG_MAX_LENGTH - 1);
    expect(capped.endsWith('-')).toBe(false);
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('***')).toBe('');
    expect(slugify('日本語')).toBe('');
  });
});

describe('withCollisionSuffix', () => {
  it('returns the base when it is free', () => {
    expect(withCollisionSuffix('intro', ['other'])).toBe('intro');
  });

  it('counts up until the name is free', () => {
    expect(withCollisionSuffix('intro', ['intro'])).toBe('intro-2');
    expect(withCollisionSuffix('intro', ['intro', 'intro-2'])).toBe('intro-3');
    expect(withCollisionSuffix('intro', ['intro', 'intro-3'])).toBe('intro-2');
  });

  it('compares case-insensitively, because file systems may not distinguish case', () => {
    expect(withCollisionSuffix('intro', ['INTRO'])).toBe('intro-2');
  });
});

describe('sheetFileName', () => {
  it('builds a slugged .md name', () => {
    expect(sheetFileName('The First Scene', [])).toBe('the-first-scene.md');
  });

  it('avoids collisions with existing .md files', () => {
    expect(sheetFileName('Intro', ['intro.md'])).toBe('intro-2.md');
    expect(sheetFileName('Intro', ['intro.md', 'intro-2.md'])).toBe('intro-3.md');
  });

  it('falls back to the specified base when the title yields no slug', () => {
    expect(sheetFileName('***', [])).toBe('sheet.md');
    expect(sheetFileName('***', ['sheet.md'])).toBe('sheet-2.md');
  });
});

describe('projectDirectoryName', () => {
  it('slugs the display name and avoids collisions with existing entries', () => {
    expect(projectDirectoryName('My Novel', [])).toBe('my-novel');
    expect(projectDirectoryName('My Novel', ['my-novel'])).toBe('my-novel-2');
  });

  it('falls back when the display name yields no slug', () => {
    expect(projectDirectoryName('…', [])).toBe('project');
  });
});

describe('arrivalName', () => {
  it('keeps the name when nothing there is called that', () => {
    expect(arrivalName('scene.md', ['other.md', 'notes'])).toBe('scene.md');
    expect(arrivalName('pre', ['post'])).toBe('pre');
  });

  it('suffixes rather than overwriting', () => {
    expect(arrivalName('scene.md', ['scene.md'])).toBe('scene-2.md');
    expect(arrivalName('scene.md', ['scene.md', 'scene-2.md'])).toBe('scene-3.md');
    expect(arrivalName('pre', ['pre', 'pre-2'])).toBe('pre-3');
  });

  it('compares without regard to case, as the file systems do', () => {
    expect(arrivalName('Scene.md', ['scene.md'])).toBe('Scene-2.md');
  });

  it('keeps a directory a directory and a sheet a sheet', () => {
    // A group arriving next to a sheet of the same base still gets out of its
    // way: `scene` beside `scene.md` is a confusion worth avoiding.
    expect(arrivalName('scene', ['scene.md'])).toBe('scene-2');
  });
});
