/**
 * Progress figures for the inspector: characters, words, reading time.
 * SPEC.md §11, TESTING.md §2.1.
 *
 * These count the body only. Front matter is metadata, not text the author
 * wrote, and counting it would make the figures jump when a keyword is added.
 */

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
  const characters = [...body].length;
  const charactersWithoutSpaces = [...body.replace(/\s/gu, '')].length;
  const words = body.split(/\s+/u).filter((word) => word !== '').length;
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));

  return { characters, charactersWithoutSpaces, words, readingMinutes };
}
