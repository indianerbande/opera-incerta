import { describe, expect, it } from 'vitest';
import {
  compareNames,
  groupDisplayName,
  moveChild,
  readStructureRecord,
  reorderChild,
  resolveChildOrder,
  withChildOrder,
  withDisplayName,
  withoutChild,
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

  it('carries a moved group’s own keys with it', () => {
    const nested: StructureRecord = {
      '.': { order: ['chapter-1', 'chapter-2'] },
      'chapter-1': { order: ['pre'] },
      'chapter-1/pre': { displayName: 'Preparation', order: ['note.md'] },
      'chapter-2': { order: [] },
    };
    const moved = moveChild(
      nested,
      { path: 'chapter-1', name: 'pre' },
      { path: 'chapter-2', name: 'pre' },
    );

    // Those keys are paths: without this the group loses its name and order.
    expect(moved['chapter-1/pre']).toBeUndefined();
    expect(moved['chapter-2/pre']).toEqual({ displayName: 'Preparation', order: ['note.md'] });
    expect(moved['chapter-1']?.order).toEqual([]);
    expect(moved['chapter-2']?.order).toEqual(['pre']);
  });

  it('re-keys everything beneath a moved group, not only the group itself', () => {
    const deep: StructureRecord = {
      'a/b': { displayName: 'B' },
      'a/b/c': { displayName: 'C' },
      'a/b/c/d': { displayName: 'D' },
    };
    const moved = moveChild(deep, { path: 'a', name: 'b' }, { path: '.', name: 'b' });

    expect(Object.keys(moved).sort()).toEqual(['b', 'b/c', 'b/c/d']);
    expect(moved['b/c/d']?.displayName).toBe('D');
  });

  it('invents no order for a target that had none', () => {
    const bare: StructureRecord = { '.': { order: ['a.md', 'part'] } };
    const moved = moveChild(bare, { path: '.', name: 'a.md' }, { path: 'part', name: 'a.md' });

    // An order of exactly the arrival would put it first in its new group.
    expect(moved['part']).toBeUndefined();
    expect(moved['.']?.order).toEqual(['part']);
  });

  it('touches no order at all when neither group has one', () => {
    expect(moveChild({}, { path: '.', name: 'a.md' }, { path: 'part', name: 'a.md' })).toEqual({});
  });

  it('takes the arrival name, which a collision may have changed', () => {
    const record: StructureRecord = { '.': { order: ['a.md'] }, part: { order: ['a.md'] } };
    const moved = moveChild(record, { path: '.', name: 'a.md' }, { path: 'part', name: 'a-2.md' });

    expect(moved['.']?.order).toEqual([]);
    expect(moved['part']?.order).toEqual(['a.md', 'a-2.md']);
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

describe('reorderChild', () => {
  const order = ['a.md', 'part-1', 'b.md', 'c.md'];

  it('puts the item in front of the named sibling', () => {
    expect(reorderChild(order, 'c.md', 'part-1')).toEqual(['a.md', 'c.md', 'part-1', 'b.md']);
  });

  it('puts it last when no sibling follows', () => {
    expect(reorderChild(order, 'a.md', null)).toEqual(['part-1', 'b.md', 'c.md', 'a.md']);
  });

  it('moves an item down past its neighbour', () => {
    // Dropping a.md in front of c.md means a.md ends up after b.md.
    expect(reorderChild(order, 'a.md', 'c.md')).toEqual(['part-1', 'b.md', 'a.md', 'c.md']);
  });

  it('changes nothing when the item lands on itself', () => {
    expect(reorderChild(order, 'b.md', 'b.md')).toBe(order);
  });

  it('changes nothing for an item that is not there', () => {
    expect(reorderChild(order, 'gone.md', 'a.md')).toBe(order);
  });

  it('returns the whole order, so nothing is left to be appended alphabetically', () => {
    // A partial order would scramble the arrangement being made (§6.4).
    expect(reorderChild(order, 'c.md', 'a.md')).toHaveLength(order.length);
  });

  it('treats an unknown sibling as the end rather than losing the item', () => {
    expect(reorderChild(order, 'a.md', 'nowhere.md')).toEqual(['part-1', 'b.md', 'c.md', 'a.md']);
  });
});

describe('withoutChild', () => {
  const structure: StructureRecord = {
    '.': { order: ['a.md', 'part-1', 'b.md'] },
    'part-1': { displayName: 'Part One', order: ['scene.md', 'pre'] },
    'part-1/pre': { displayName: 'Preparation', order: ['note.md'] },
  };

  it('strikes the name from its parent’s order', () => {
    expect(withoutChild(structure, '.', 'a.md')['.']?.order).toEqual(['part-1', 'b.md']);
  });

  it('takes a group’s whole subtree of entries with it', () => {
    const next = withoutChild(structure, '.', 'part-1');

    // Those keys are paths, and the paths are gone.
    expect(Object.keys(next)).toEqual(['.']);
    expect(next['.']?.order).toEqual(['a.md', 'b.md']);
  });

  it('removes a nested group without touching its siblings', () => {
    const next = withoutChild(structure, 'part-1', 'pre');

    expect(next['part-1/pre']).toBeUndefined();
    expect(next['part-1']?.order).toEqual(['scene.md']);
    expect(next['part-1']?.displayName).toBe('Part One');
  });

  it('invents no order for a group that had none', () => {
    const bare: StructureRecord = { 'part-1': { displayName: 'Part One' } };
    expect(withoutChild(bare, 'part-1', 'scene.md')['part-1']?.order).toBeUndefined();
  });

  it('is harmless for a name that was never recorded', () => {
    expect(withoutChild(structure, '.', 'ghost.md')['.']?.order).toEqual([
      'a.md',
      'part-1',
      'b.md',
    ]);
  });
});
