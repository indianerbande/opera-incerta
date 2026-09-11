/**
 * Progress figures for the inspector: characters, words, reading time.
 * specification.md §11, testing.md §2.1.
 *
 * These count the body only, and the body as the author reads it: front
 * matter is metadata, not text, and `#` and `**` are markup, not words. A
 * heading's hashes and a bold phrase's asterisks counted as words until this
 * read the display text instead of the file.
 */
import { markdownToDisplay } from './heading.js';
import { delimiterRanges } from './inline.js';

/**
 * Words per minute for silent reading of prose. A conventional value rather
 * than a measured one; it is a constant here so that it can become a setting
 * without touching the rule.
 */
export const READING_WORDS_PER_MINUTE = 200;

export interface TextStatistics {
  /** Unicode code points, so an emoji counts once rather than twice. */
  readonly characters: number;
  /** Characters excluding all whitespace. */
  readonly charactersWithoutSpaces: number;
  readonly words: number;
  /** Reading time in whole minutes, at least 1 for any non-empty text. */
  readonly readingMinutes: number;
}

export function textStatistics(body: string): TextStatistics {
  const text = proseOf(body);
  const characters = [...text].length;
  const charactersWithoutSpaces = [...text.replace(/\s/gu, '')].length;
  const words = text.split(/\s+/u).filter((word) => word !== '').length;
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));

  return { characters, charactersWithoutSpaces, words, readingMinutes };
}

/** The body without its markup: heading prefixes gone, inline delimiters gone. */
function proseOf(body: string): string {
  return markdownToDisplay(body)
    .map((line) => {
      if (line.verbatim) {
        return line.text;
      }
      let text = line.text;
      for (const range of [...delimiterRanges(line.text)].reverse()) {
        text = text.slice(0, range.from) + text.slice(range.to);
      }
      return text;
    })
    .join('\n');
}
