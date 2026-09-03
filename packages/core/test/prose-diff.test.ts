import { describe, expect, it } from 'vitest';
import { MAX_PROSE_EDITS, diffProse, tokenizeProse, type ProseSegment } from '../src/index.js';

/** What the first text must be, read out of the result. */
function beforeOf(segments: readonly ProseSegment[]): string {
  return segments.filter((s) => s.kind !== 'added').map((s) => s.text).join('');
}

/** And the second. */
function afterOf(segments: readonly ProseSegment[]): string {
  return segments.filter((s) => s.kind !== 'removed').map((s) => s.text).join('');
}

describe('tokenizeProse', () => {
  it('keeps whitespace, so the text can be put back together', () => {
    const text = 'The bell rang.\n\nTwice, and then\tonce.\n';
    expect(tokenizeProse(text).join('')).toBe(text);
  });

  it('separates words from the space between them', () => {
    expect(tokenizeProse('two words')).toEqual(['two', ' ', 'words']);
  });

  it('is empty for an empty text', () => {
    expect(tokenizeProse('')).toEqual([]);
  });
});

describe('diffProse', () => {
  it('says nothing changed when nothing changed', () => {
    expect(diffProse('The bell rang.', 'The bell rang.')).toEqual([
      { kind: 'same', text: 'The bell rang.' },
    ]);
    expect(diffProse('', '')).toEqual([]);
  });

  it('marks the changed word, and only it', () => {
    const segments = diffProse('The bell rang twice.', 'The bell rang once.');

    // This is the whole point: Git would report the entire line twice.
    expect(segments).toEqual([
      { kind: 'same', text: 'The bell rang ' },
      { kind: 'removed', text: 'twice.' },
      { kind: 'added', text: 'once.' },
    ]);
  });

  it('marks an insertion in the middle', () => {
    const segments = diffProse('The bell rang.', 'The heavy bell rang.');
    expect(segments.filter((s) => s.kind === 'added').map((s) => s.text)).toEqual(['heavy ']);
    expect(segments.some((s) => s.kind === 'removed')).toBe(false);
  });

  it('marks a deletion in the middle', () => {
    const segments = diffProse('The heavy bell rang.', 'The bell rang.');
    expect(segments.filter((s) => s.kind === 'removed').map((s) => s.text)).toEqual(['heavy ']);
    expect(segments.some((s) => s.kind === 'added')).toBe(false);
  });

  it('handles text appearing and disappearing entirely', () => {
    expect(diffProse('', 'All new.')).toEqual([{ kind: 'added', text: 'All new.' }]);
    expect(diffProse('All gone.', '')).toEqual([{ kind: 'removed', text: 'All gone.' }]);
  });

  it('keeps paragraph breaks, which a manuscript cares about', () => {
    const before = 'First line.\n\nSecond line.\n';
    const after = 'First line.\n\nSecond and better line.\n';
    const segments = diffProse(before, after);

    expect(beforeOf(segments)).toBe(before);
    expect(afterOf(segments)).toBe(after);
  });

  describe('the invariant', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['The bell rang twice.', 'The bell rang once, then twice.'],
      ['a b c d e', 'e d c b a'],
      ['one\ntwo\nthree\n', 'one\nthree\n'],
      ['', 'something'],
      ['something', ''],
      ['same', 'same'],
      ['   ', '\t\n'],
      ['Wort für Wort, mit Umlauten: Größe.', 'Wort um Wort, mit Umlauten: Größe!'],
      ['x '.repeat(200), `${'x '.repeat(100)}y ${'x '.repeat(99)}`],
    ];

    it.each(cases)('reproduces both texts exactly (%#)', (before, after) => {
      const segments = diffProse(before, after);
      // Nothing invented, nothing lost — the property everything else rests on.
      expect(beforeOf(segments)).toBe(before);
      expect(afterOf(segments)).toBe(after);
    });
  });

  it('reports a wholesale replacement rather than searching forever', () => {
    // Two texts with nothing in common, past the bound: the answer is coarse
    // but still correct, and the work stays bounded.
    const before = Array.from({ length: 60 }, (_unused, index) => `a${String(index)}`).join(' ');
    const after = Array.from({ length: 60 }, (_unused, index) => `b${String(index)}`).join(' ');
    const segments = diffProse(before, after, 4);

    expect(segments).toEqual([
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]);
    expect(beforeOf(segments)).toBe(before);
    expect(afterOf(segments)).toBe(after);
  });

  it('has a bound in the first place', () => {
    expect(MAX_PROSE_EDITS).toBeGreaterThan(0);
  });
});

describe('the invariant, against many pairs', () => {
  /** A small deterministic generator: the same run every time, no dependency. */
  function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }

  const words = ['bell', 'rang', 'twice', 'harbour', 'the', 'a', 'night', 'ship', 'Größe', 'and'];
  const gaps = [' ', '\n', '\n\n', '  ', '\t'];

  function text(next: () => number, length: number): string {
    let out = '';
    for (let index = 0; index < length; index += 1) {
      out += words[Math.floor(next() * words.length)] as string;
      out += gaps[Math.floor(next() * gaps.length)] as string;
    }
    return out;
  }

  /** An edited copy: some words dropped, some inserted, some replaced. */
  function edit(next: () => number, source: string): string {
    return tokenizeProse(source)
      .flatMap((token) => {
        const roll = next();
        if (/^\s+$/u.test(token)) {
          return [token];
        }
        if (roll < 0.1) {
          return [];
        }
        if (roll < 0.2) {
          return [words[Math.floor(next() * words.length)] as string, ' ', token];
        }
        if (roll < 0.3) {
          return [words[Math.floor(next() * words.length)] as string];
        }
        return [token];
      })
      .join('');
  }

  it('reproduces both texts for two hundred generated pairs', () => {
    const next = random(20260903);
    for (let round = 0; round < 200; round += 1) {
      const before = text(next, 1 + Math.floor(next() * 40));
      const after = edit(next, before);
      const segments = diffProse(before, after);

      expect(segments.filter((s) => s.kind !== 'added').map((s) => s.text).join('')).toBe(before);
      expect(segments.filter((s) => s.kind !== 'removed').map((s) => s.text).join('')).toBe(after);
    }
  });

  it('never marks anything as changed when nothing is', () => {
    const next = random(4711);
    for (let round = 0; round < 50; round += 1) {
      const same = text(next, 1 + Math.floor(next() * 30));
      expect(diffProse(same, same).every((segment) => segment.kind === 'same')).toBe(true);
    }
  });
});

describe('where an inserted run begins and ends', () => {
  it('takes the whitespace after it, because the one before it was already there', () => {
    const before = 'title: A Scene\ncategory: draft\n';
    const after = 'title: A Scene\nstatus: review\ncategory: draft\n';

    // The newline in front of `status` is the one that used to precede
    // `category`; the newline after it is the new one. Minimal at the token
    // level, and stated here so it is a property rather than a surprise.
    expect(diffProse(before, after).filter((s) => s.kind === 'added')).toEqual([
      { kind: 'added', text: 'status: review\n' },
    ]);
  });

  it('marks a word inserted mid-sentence with its following space', () => {
    expect(diffProse('The bell rang.', 'The heavy bell rang.')).toEqual([
      { kind: 'same', text: 'The ' },
      { kind: 'added', text: 'heavy ' },
      { kind: 'same', text: 'bell rang.' },
    ]);
  });
});
