/**
 * Finding a passage in one sheet. SPEC.md §10.10.
 *
 * The rule, not the interface: where the matches are, and which of them the
 * author is on. It runs over the sheet's Markdown — the text the editor holds
 * — because searching what is currently *displayed* would make a find depend
 * on where the cursor is, the focus line showing markers that every other line
 * hides (§10.2, §10.7).
 *
 * Case is ignored, always. No regular expressions: a manuscript is prose, and
 * an author typing `(` means a bracket.
 */

/** A match, as offsets into the text. */
export interface SearchMatch {
  readonly from: number;
  readonly to: number;
}

/**
 * Every match of `query` in `text`, in order, without overlaps.
 *
 * An empty or whitespace-only query matches nothing rather than everything:
 * the field is empty while the author is still typing, and marking the whole
 * document at that moment is noise.
 */
export function findMatches(text: string, query: string): readonly SearchMatch[] {
  if (query.trim() === '') {
    return [];
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const matches: SearchMatch[] = [];

  let at = haystack.indexOf(needle);
  while (at !== -1) {
    matches.push({ from: at, to: at + needle.length });
    // Past the whole match: overlapping hits of `aa` in `aaa` are one find to
    // step through, not two that share a character.
    at = haystack.indexOf(needle, at + needle.length);
  }
  return matches;
}

/**
 * The match to go to from a cursor position, as a zero-based index into
 * `matches`, or `null` when there are none.
 *
 * Forwards: the first match that begins at or after the cursor, wrapping to
 * the first. Backwards: the last match that ends at or before it, wrapping to
 * the last. Both wrap, because a document has no edge for a reader — this is
 * how every editor behaves and how nobody has to think about it.
 */
export function matchAt(
  matches: readonly SearchMatch[],
  cursor: number,
  direction: 'forwards' | 'backwards' = 'forwards',
): number | null {
  if (matches.length === 0) {
    return null;
  }

  if (direction === 'forwards') {
    const index = matches.findIndex((match) => match.from >= cursor);
    return index === -1 ? 0 : index;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if ((matches[index] as SearchMatch).to <= cursor) {
      return index;
    }
  }
  return matches.length - 1;
}

/**
 * The next index in a direction, wrapping. Separate from {@link matchAt}
 * because stepping is about the match one is on, not about the cursor.
 */
export function stepMatch(
  count: number,
  current: number,
  direction: 'forwards' | 'backwards',
): number {
  if (count <= 0) {
    return 0;
  }
  const step = direction === 'forwards' ? 1 : -1;
  return (current + step + count) % count;
}

/** A match with the line it stands in. SPEC.md §9.3. */
export interface LineMatch {
  /** One-based, as the editor and the status bar count. */
  readonly line: number;
  /** The whole line, so the list can show the passage around the match. */
  readonly text: string;
  /** Where the match sits inside `text`. */
  readonly from: number;
  readonly to: number;
}

/**
 * Every match in a text, line by line. SPEC.md §9.3.
 *
 * The same rule as {@link findMatches} — one search, one notion of a match —
 * with the line number a result list needs to point at.
 */
export function lineMatches(text: string, query: string, limit = Number.POSITIVE_INFINITY): readonly LineMatch[] {
  if (query.trim() === '') {
    return [];
  }

  const found: LineMatch[] = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const match of findMatches(line, query)) {
      if (found.length >= limit) {
        return found;
      }
      found.push({ line: index + 1, text: line, from: match.from, to: match.to });
    }
  }
  return found;
}
