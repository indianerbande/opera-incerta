import { describe, expect, it } from 'vitest';
import { findMatches, lineMatches, matchAt, stepMatch } from '../src/index.js';

const text = 'The bell rang once.\nThe bell rang twice.\nSilence.';

describe('finding in a sheet (SPEC.md §10.11)', () => {
  it('finds every occurrence, in order, ignoring case', () => {
    expect(findMatches(text, 'bell')).toEqual([
      { from: 4, to: 8 },
      { from: 24, to: 28 },
    ]);
    expect(findMatches(text, 'BELL')).toEqual(findMatches(text, 'bell'));
    expect(findMatches(text, 'the')).toHaveLength(2);
  });

  it('finds a marker the display hides, because it is in the file', () => {
    expect(findMatches('## Chapter', '## ')).toEqual([{ from: 0, to: 3 }]);
    expect(findMatches('A **bold** word', '**')).toHaveLength(2);
  });

  it('matches nothing for an empty or blank query', () => {
    expect(findMatches(text, '')).toEqual([]);
    expect(findMatches(text, '   ')).toEqual([]);
  });

  it('does not overlap matches with themselves', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
  });

  it('goes to the first match at or after the cursor, and wraps', () => {
    const matches = findMatches(text, 'bell');
    expect(matchAt(matches, 0)).toBe(0);
    expect(matchAt(matches, 10)).toBe(1);
    // Past the last one: back to the first.
    expect(matchAt(matches, 40)).toBe(0);
    expect(matchAt([], 0)).toBeNull();
  });

  it('goes backwards to the last match that ends at or before the cursor, and wraps', () => {
    const matches = findMatches(text, 'bell');
    expect(matchAt(matches, 30, 'backwards')).toBe(1);
    expect(matchAt(matches, 9, 'backwards')).toBe(0);
    // Before the first one: round to the last.
    expect(matchAt(matches, 0, 'backwards')).toBe(1);
  });

  it('steps through the matches in a ring', () => {
    expect(stepMatch(3, 0, 'forwards')).toBe(1);
    expect(stepMatch(3, 2, 'forwards')).toBe(0);
    expect(stepMatch(3, 0, 'backwards')).toBe(2);
    expect(stepMatch(0, 0, 'forwards')).toBe(0);
  });
});

describe('searching the library (SPEC.md §9.3)', () => {
  const sheet = ['# The Harbour', '', 'The bell rang once.', 'It rang again.'].join('\n');

  it('reports each match with the line it stands in, one-based', () => {
    expect(lineMatches(sheet, 'rang')).toEqual([
      { line: 3, text: 'The bell rang once.', from: 9, to: 13 },
      { line: 4, text: 'It rang again.', from: 3, to: 7 },
    ]);
  });

  it('ignores case, like the find in the editor', () => {
    expect(lineMatches(sheet, 'HARBOUR')).toHaveLength(1);
    expect(lineMatches(sheet, '')).toEqual([]);
  });

  it('stops at the limit, so a short query cannot flood the list', () => {
    expect(lineMatches(sheet, 'a', 2)).toHaveLength(2);
    expect(lineMatches(sheet, 'the').length).toBeGreaterThan(1);
  });
});
