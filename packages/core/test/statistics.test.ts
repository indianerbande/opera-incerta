import { describe, expect, it } from 'vitest';
import { READING_WORDS_PER_MINUTE, parseSheet, textStatistics } from '../src/index.js';

describe('textStatistics', () => {
  it('counts characters, non-space characters, and words', () => {
    expect(textStatistics('The quick brown fox')).toMatchObject({
      characters: 19,
      charactersWithoutSpaces: 16,
      words: 4,
    });
  });

  it('counts an emoji as one character', () => {
    expect(textStatistics('🌊').characters).toBe(1);
  });

  it('ignores repeated and mixed whitespace between words', () => {
    expect(textStatistics('  one\t\ttwo\n\nthree  ').words).toBe(3);
  });

  it('reports zero for an empty text and for whitespace only', () => {
    expect(textStatistics('')).toEqual({
      characters: 0,
      charactersWithoutSpaces: 0,
      words: 0,
      readingMinutes: 0,
    });
    expect(textStatistics('   \n  ').words).toBe(0);
  });

  it('rounds reading time, but never below one minute for real text', () => {
    expect(textStatistics('one two three').readingMinutes).toBe(1);
    expect(textStatistics('word '.repeat(READING_WORDS_PER_MINUTE)).readingMinutes).toBe(1);
    expect(textStatistics('word '.repeat(READING_WORDS_PER_MINUTE * 3)).readingMinutes).toBe(3);
  });

  it('does not count front matter, which is metadata rather than text', () => {
    const text = [
      '---',
      'opera-incerta:',
      '  title: A Long Title With Many Words Indeed',
      '  keywords: [one, two, three]',
      '---',
      'Body has four words.',
    ].join('\n');
    const { sheet } = parseSheet(text);

    expect(textStatistics(sheet.body).words).toBe(4);
  });
});

describe('markup is not text', () => {
  it('does not count heading hashes or emphasis delimiters as words', () => {
    const { words, charactersWithoutSpaces } = textStatistics('# Title\n\n**bold** text\n');
    expect(words).toBe(3);
    // `Title`, `bold`, `text`: 13 letters, no hashes and no asterisks.
    expect(charactersWithoutSpaces).toBe(13);
  });

  it('counts a fenced block as written, since backticks mean literally this', () => {
    // The fences and the hash are text here: six words, not three.
    expect(textStatistics('```\n# not a heading\n```\n').words).toBe(6);
  });
});
