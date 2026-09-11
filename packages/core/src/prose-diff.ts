/**
 * A word-level difference between two versions of prose. specification.md §12.
 *
 * Git compares lines, which is right for source code and wrong for a
 * manuscript: rewording four words in a paragraph shows up as the whole
 * paragraph removed and the whole paragraph added, and the author has to find
 * the change by reading both. Comparing **words** shows the change itself.
 *
 * The algorithm is Myers' greedy shortest-edit-script over tokens, with the
 * common prefix and suffix trimmed first — which is nearly all of the work for
 * a typical edit — and a bound on how far it will search. Beyond that bound
 * the middle is reported as replaced wholesale: coarse, but correct, and
 * bounded work matters more than an ideal script on a file that was rewritten
 * from scratch.
 *
 * **The invariant that makes it trustworthy**: putting the kept and removed
 * parts together reproduces the first text exactly, and the kept and added
 * parts reproduce the second. Nothing is invented and nothing is lost.
 */

export type ProseSegmentKind = 'same' | 'added' | 'removed';

export interface ProseSegment {
  readonly kind: ProseSegmentKind;
  readonly text: string;
}

/** How far the search goes before it gives up and reports a replacement. */
export const MAX_PROSE_EDITS = 4000;

/**
 * Splits prose into words and the whitespace between them.
 *
 * Whitespace is kept as its own token rather than attached to a word, so that
 * joining the tokens reproduces the text exactly — including the line breaks,
 * which a manuscript cares about.
 */
export function tokenizeProse(text: string): readonly string[] {
  return text.split(/(\s+)/u).filter((token) => token !== '');
}

/**
 * The difference between two texts, word by word.
 *
 * Adjacent segments of the same kind are merged, so the result reads as runs
 * of text rather than as a list of tokens.
 */
export function diffProse(
  before: string,
  after: string,
  maxEdits: number = MAX_PROSE_EDITS,
): readonly ProseSegment[] {
  if (before === after) {
    return before === '' ? [] : [{ kind: 'same', text: before }];
  }

  const a = tokenizeProse(before);
  const b = tokenizeProse(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end += 1;
  }

  const head = a.slice(0, start);
  const tail = a.slice(a.length - end);
  const middleA = a.slice(start, a.length - end);
  const middleB = b.slice(start, b.length - end);

  const middle = shortestEditScript(middleA, middleB, maxEdits) ?? [
    { kind: 'removed' as const, text: middleA.join('') },
    { kind: 'added' as const, text: middleB.join('') },
  ];

  return merge([
    { kind: 'same', text: head.join('') },
    ...middle,
    { kind: 'same', text: tail.join('') },
  ]);
}

/**
 * Myers' greedy algorithm, or `null` when the two texts are further apart than
 * the bound allows.
 */
function shortestEditScript(
  a: readonly string[],
  b: readonly string[],
  maxEdits: number,
): readonly ProseSegment[] | null {
  if (a.length === 0 && b.length === 0) {
    return [];
  }
  if (a.length === 0) {
    return [{ kind: 'added', text: b.join('') }];
  }
  if (b.length === 0) {
    return [{ kind: 'removed', text: a.join('') }];
  }

  const max = Math.min(a.length + b.length, maxEdits);
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      // Down (an insertion) when the neighbour above reaches further, right (a
      // deletion) otherwise.
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;

      while (x < a.length && y < b.length && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;

      if (x >= a.length && y >= b.length) {
        return backtrack(a, b, trace, offset, d);
      }
    }
  }
  return null;
}

/** Walks the recorded traces backwards into a list of segments. */
function backtrack(
  a: readonly string[],
  b: readonly string[],
  trace: readonly Int32Array[],
  offset: number,
  edits: number,
): readonly ProseSegment[] {
  const segments: ProseSegment[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = edits; d > 0; d -= 1) {
    const v = trace[d] as Int32Array;
    const k = x - y;
    const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = v[offset + previousK] ?? 0;
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      segments.push({ kind: 'same', text: a[x] as string });
    }

    if (down) {
      y -= 1;
      segments.push({ kind: 'added', text: b[y] as string });
    } else {
      x -= 1;
      segments.push({ kind: 'removed', text: a[x] as string });
    }
  }

  while (x > 0) {
    x -= 1;
    y -= 1;
    segments.push({ kind: 'same', text: a[x] as string });
  }

  return segments.reverse();
}

/** Joins neighbouring segments of the same kind, and drops empty ones. */
function merge(segments: readonly ProseSegment[]): readonly ProseSegment[] {
  const merged: ProseSegment[] = [];
  for (const segment of segments) {
    if (segment.text === '') {
      continue;
    }
    const last = merged[merged.length - 1];
    if (last !== undefined && last.kind === segment.kind) {
      merged[merged.length - 1] = { kind: last.kind, text: last.text + segment.text };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}
