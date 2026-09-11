import { describe, expect, it } from 'vitest';
import {
  STYLESHEET_NAME_LIMIT,
  isUsableStylesheetName,
  stylesheetFileName,
  stylesheetNameOf,
} from '../src/index.js';

describe('naming a stylesheet of one’s own (SPEC.md §15.2)', () => {
  it('takes a plain name and makes it a file', () => {
    expect(isUsableStylesheetName('My Novel')).toBe(true);
    expect(stylesheetFileName('My Novel')).toBe('My Novel.css');
    expect(stylesheetNameOf('My Novel.css')).toBe('My Novel');
  });

  it('refuses what a path would read as structure', () => {
    for (const name of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a|b', 'a<b', 'a>b', 'a"b']) {
      expect(isUsableStylesheetName(name), name).toBe(false);
    }
  });

  it('keeps the digits a careless character range would eat', () => {
    // `[ -<]` is space to `<`: every digit. That mistake has been made in
    // this repository once already, in the export's file name.
    expect(isUsableStylesheetName('Draft 2 of 3')).toBe(true);
  });

  it('refuses a name that would hide the file, or pad it, or run long', () => {
    expect(isUsableStylesheetName('.hidden')).toBe(false);
    expect(isUsableStylesheetName(' padded')).toBe(false);
    expect(isUsableStylesheetName('')).toBe(false);
    expect(isUsableStylesheetName('x'.repeat(STYLESHEET_NAME_LIMIT))).toBe(true);
    expect(isUsableStylesheetName('x'.repeat(STYLESHEET_NAME_LIMIT + 1))).toBe(false);
  });

  it('refuses a control character, which is what the range was there for', () => {
    expect(isUsableStylesheetName('a\tb')).toBe(false);
    expect(isUsableStylesheetName('a\u0000b')).toBe(false);
  });

  it('reads a name back only from a file it could have written', () => {
    expect(stylesheetNameOf('notes.txt')).toBeNull();
    expect(stylesheetNameOf('.css')).toBeNull();
    // Whatever else the author keeps in that folder is simply not offered.
    expect(stylesheetNameOf('..css')).toBeNull();
  });
});
