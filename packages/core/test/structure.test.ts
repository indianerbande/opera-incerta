import { describe, expect, it } from 'vitest';
import {
  compareNames,
  groupDisplayName,
  moveChild,
  readStructureRecord,
  resolveChildOrder,
  withChildOrder,
  withDisplayName,
  type StructureRecord,
} from '../src/index.js';

describe('resolveChildOrder', () => {
  const actual = ['intro.md', 'pre', 'scene-2.md', 'scene-10.md'];

  it('follows the recorded order', () => {
    expect(resolveChildOrder(actual, { order: ['pre', 'scene-2.md', 'intro.md'] })).toEqual([
      'pre',
      'scene-2.md',
      'intro.md',
      'scene-10.md',
    ]);
  });

  it('ignores recorded names that no longer exist on disk', () => {
    expect(resolveChildOrder(actual, { order: ['deleted.md', 'intro.md'] })[0]).toBe('intro.md');
  });

  it('appends items missing from the order, sorted among themselves', () => {
    expect(resolveChildOrder(actual, { order: ['scene-2.md'] })).toEqual([
      'scene-2.md',
      'intro.md',
      'pre',
      'scene-10.md',
    ]);
  });

  it('sorts everything alphabetically when there is no entry', () => {
    expect(resolveChildOrder(actual, undefined)).toEqual([
      'intro.md',
      'pre',
      'scene-2.md',
      'scene-10.md',
    ]);
  });

  it('sorts numerically, so chapter-2 precedes chapter-10', () => {
    expect(resolveChildOrder(['chapter-10.md', 'chapter-2.md'], undefined)).toEqual([
      'chapter-2.md',
      'chapter-10.md',
    ]);
  });

  it('ignores a duplicate in the recorded order', () => {
    expect(resolveChildOrder(['a.md', 'b.md'], { order: ['a.md', 'a.md'] })).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('returns nothing for an empty directory, whatever the record says', () => {
    expect(resolveChildOrder([], { order: ['gone.md'] })).toEqual([]);
  });
});

describe('compareNames', () => {
  it('is deterministic and case-insensitive, with a stable tiebreak', () => {
    expect(compareNames('alpha', 'Beta')).toBeLessThan(0);
    expect(compareNames('Alpha', 'alpha')).not.toBe(0);
    expect(compareNames('a', 'a')).toBe(0);
  });
});

describe('groupDisplayName', () => {
  it('prefers the recorded name', () => {
    expect(groupDisplayName('chapter-1', { displayName: 'Part 1: Beginning' })).toBe(
      'Part 1: Beginning',
    );
  });

  it('falls back to the directory name when absent, empty, or blank', () => {
    expect(groupDisplayName('chapter-1', undefined)).toBe('chapter-1');
    expect(groupDisplayName('chapter-1', {})).toBe('chapter-1');
    expect(groupDisplayName('chapter-1', { displayName: '   ' })).toBe('chapter-1');
  });
});

describe('editing the record', () => {
  const structure: StructureRecord = {
    '.': { order: ['chapter-1', 'preface.md'] },
    'chapter-1': { displayName: 'Part 1', order: ['intro.md', 'scene.md'] },
  };

  it('records a new order without touching other entries', () => {
    const updated = withChildOrder(structure, 'chapter-1', ['scene.md', 'intro.md']);

    expect(updated['chapter-1']).toEqual({
      displayName: 'Part 1',
      order: ['scene.md', 'intro.md'],
    });
    expect(updated['.']).toEqual(structure['.']);
  });

  it('records and clears a display name', () => {
    expect(withDisplayName(structure, 'chapter-1', 'Beginning')['chapter-1']?.displayName).toBe(
      'Beginning',
    );
    expect(withDisplayName(structure, 'chapter-1', '  ')['chapter-1']).toEqual({
      order: ['intro.md', 'scene.md'],
    });
  });

  it('moves a child between groups in one step, appending at the target end', () => {
    const moved = moveChild(
      structure,
      { path: 'chapter-1', name: 'intro.md' },
      { path: '.', name: 'intro.md' },
    );

    expect(moved['chapter-1']?.order).toEqual(['scene.md']);
    expect(moved['.']?.order).toEqual(['chapter-1', 'preface.md', 'intro.md']);
  });

  it('does not duplicate an entry when a move lands in the same group', () => {
    const moved = moveChild(
      structure,
      { path: 'chapter-1', name: 'intro.md' },
      { path: 'chapter-1', name: 'intro.md' },
    );

    expect(moved['chapter-1']?.order).toEqual(['scene.md', 'intro.md']);
  });
});

describe('readStructureRecord', () => {
  it('reads a well-formed record', () => {
    expect(
      readStructureRecord({ '.': { order: ['a.md'] }, sub: { displayName: 'Sub' } }),
    ).toEqual({ '.': { order: ['a.md'] }, sub: { displayName: 'Sub' } });
  });

  it('falls back to an empty record for malformed input rather than failing', () => {
    expect(readStructureRecord(null)).toEqual({});
    expect(readStructureRecord('nonsense')).toEqual({});
    expect(readStructureRecord([1, 2, 3])).toEqual({});
  });

  it('discards entries and fields of the wrong shape', () => {
    expect(
      readStructureRecord({
        good: { order: ['a.md', 42, null], displayName: 'Good' },
        bad: 'not an object',
        alsoBad: ['array'],
        partial: { displayName: 7 },
      }),
    ).toEqual({
      good: { order: ['a.md'], displayName: 'Good' },
      partial: {},
    });
  });
});
