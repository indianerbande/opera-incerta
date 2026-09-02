import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  LibraryDrag,
  type DragRow,
  type OverRow,
} from '../src/app/shell/library-drag.js';

/** Three sheets in the root, and two groups in the root beside them. */
const sheets: readonly DragRow[] = [
  { kind: 'sheet', path: 'a.md', parent: '.', index: 0 },
  { kind: 'sheet', path: 'b.md', parent: '.', index: 1 },
  { kind: 'sheet', path: 'c.md', parent: '.', index: 2 },
];
const sheetNames = ['a.md', 'b.md', 'c.md'];

const partOne: DragRow = { kind: 'group', path: 'part-1', parent: '.', index: 0 };
const partTwo: DragRow = { kind: 'group', path: 'part-2', parent: '.', index: 1 };
const groupNames = ['part-1', 'part-2'];

/** A 20 px row starting at 100, and a point at a share of its height. */
function over(row: DragRow, siblings: readonly string[]): OverRow {
  return { row, box: { top: 100, bottom: 120 }, siblings };
}
function at(share: number): number {
  return 100 + 20 * share;
}

function press(source: DragRow): LibraryDrag {
  const drag = new LibraryDrag();
  drag.press(source, 0);
  return drag;
}

describe('becoming a drag', () => {
  it('stays a click until the pointer really travels', () => {
    const drag = new LibraryDrag();
    drag.press(sheets[0] as DragRow, 100);

    expect(drag.moveTo(100 + DRAG_THRESHOLD - 1, over(sheets[1] as DragRow, sheetNames))).toBe(
      false,
    );
    expect(drag.source()).toBeNull();
    expect(drag.release()).toBeNull();
    // A press that never became a drag is not a swallowed click either.
    expect(drag.consumeClick()).toBe(false);
  });

  it('swallows the click that follows a real drag', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.9), over(sheets[2] as DragRow, sheetNames));
    drag.release();

    expect(drag.consumeClick()).toBe(true);
    // Only once.
    expect(drag.consumeClick()).toBe(false);
  });
});

describe('reordering among siblings', () => {
  it('lands in front of the row whose upper half the pointer is in', () => {
    const drag = press(sheets[2] as DragRow);
    drag.moveTo(at(0.2), over(sheets[1] as DragRow, sheetNames));

    expect(drag.drop()).toEqual({ kind: 'reorder', path: 'c.md', before: 'b.md' });
    expect(drag.line()).toEqual({ kind: 'sheet', parent: '.', index: 1 });
    expect(drag.into()).toBeNull();
  });

  it('lands after the row whose lower half the pointer is in', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.8), over(sheets[2] as DragRow, sheetNames));

    expect(drag.drop()).toEqual({ kind: 'reorder', path: 'a.md', before: null });
  });

  it('shows the line but asks for nothing where the row already is', () => {
    const above = press(sheets[1] as DragRow);
    above.moveTo(at(0.2), over(sheets[1] as DragRow, sheetNames));
    expect(above.drop()).toBeNull();
    expect(above.line()).toEqual({ kind: 'sheet', parent: '.', index: 1 });

    const below = press(sheets[1] as DragRow);
    below.moveTo(at(0.8), over(sheets[1] as DragRow, sheetNames));
    expect(below.drop()).toBeNull();
  });
});

describe('moving into a group', () => {
  it('takes the middle of a group row as the group itself', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.5), over(partOne, groupNames));

    expect(drag.drop()).toEqual({ kind: 'move', path: 'a.md', into: 'part-1' });
    expect(drag.into()).toBe('part-1');
    expect(drag.line()).toBeNull();
  });

  it('takes the edges of a group row as between the rows', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.1), over(partOne, groupNames));

    // Same parent, so this is an ordinary reorder among the root's children —
    // and the line belongs in the tree, where the pointer is.
    expect(drag.drop()).toEqual({ kind: 'reorder', path: 'a.md', before: 'part-1' });
    expect(drag.line()).toEqual({ kind: 'group', parent: '.', index: 0 });
    expect(drag.into()).toBeNull();
  });

  it('treats a drop between the rows of another group as a move into it', () => {
    const nested: DragRow = { kind: 'sheet', path: 'part-1/x.md', parent: 'part-1', index: 0 };
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.1), over(nested, ['x.md']));

    // Travelling and placing at once would be two operations in one gesture.
    expect(drag.drop()).toEqual({ kind: 'move', path: 'a.md', into: 'part-1' });
    expect(drag.into()).toBe('part-1');
  });

  it('asks for nothing when the group is the one it is already in', () => {
    const inPartOne: DragRow = { kind: 'sheet', path: 'part-1/x.md', parent: 'part-1', index: 0 };
    const drag = press(inPartOne);
    drag.moveTo(at(0.5), over(partOne, groupNames));

    expect(drag.drop()).toBeNull();
    // No highlight either: a destination that does nothing is a false promise.
    expect(drag.into()).toBeNull();
  });

  it('refuses a group into itself and into its own descendant', () => {
    const own = press(partOne);
    own.moveTo(at(0.5), over(partOne, groupNames));
    expect(own.drop()).toBeNull();

    const child: DragRow = { kind: 'group', path: 'part-1/pre', parent: 'part-1', index: 0 };
    const intoChild = press(partOne);
    intoChild.moveTo(at(0.5), over(child, ['pre']));
    expect(intoChild.drop()).toBeNull();
    expect(intoChild.into()).toBeNull();
  });

  it('lets a group move into a sibling group', () => {
    const drag = press(partOne);
    drag.moveTo(at(0.5), over(partTwo, groupNames));

    expect(drag.drop()).toEqual({ kind: 'move', path: 'part-1', into: 'part-2' });
  });

  it('never takes a sheet row as a destination', () => {
    const drag = press(partOne);
    drag.moveTo(at(0.5), over(sheets[1] as DragRow, sheetNames));

    // A sheet holds nothing, so the middle of one is still between the rows.
    expect(drag.drop()).toEqual({ kind: 'reorder', path: 'part-1', before: 'c.md' });
  });
});

describe('letting go', () => {
  it('asks for nothing over empty space', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.5), null);

    expect(drag.drop()).toBeNull();
    expect(drag.line()).toBeNull();
    expect(drag.into()).toBeNull();
  });

  it('forgets everything on release and on cancel', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.5), over(partOne, groupNames));
    expect(drag.release()).toEqual({ kind: 'move', path: 'a.md', into: 'part-1' });

    expect(drag.source()).toBeNull();
    expect(drag.drop()).toBeNull();
    expect(drag.into()).toBeNull();
    // A released drag must not be revived by a stray pointer move.
    expect(drag.moveTo(at(0.5), over(partOne, groupNames))).toBe(false);

    const cancelled = press(sheets[0] as DragRow);
    cancelled.moveTo(at(0.5), over(partOne, groupNames));
    cancelled.cancel();
    expect(cancelled.source()).toBeNull();
    expect(cancelled.consumeClick()).toBe(false);
  });
});

describe('the empty space past the last row', () => {
  /** The pointer below every row of the root's sheet list. */
  function pastSheets(): OverRow {
    return {
      row: { kind: 'sheet', path: '', parent: '.', index: sheetNames.length },
      box: { top: 300, bottom: 400 },
      siblings: sheetNames,
      past: true,
    };
  }

  it('means the end of that list', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(350, pastSheets());

    // What the space below a list looks like it means.
    expect(drag.drop()).toEqual({ kind: 'reorder', path: 'a.md', before: null });
    expect(drag.line()).toEqual({ kind: 'sheet', parent: '.', index: 3 });
  });

  it('asks for nothing when the row is already last', () => {
    const drag = press(sheets[2] as DragRow);
    drag.moveTo(350, pastSheets());

    expect(drag.drop()).toBeNull();
  });

  it('is never read as "into" a group, however tall the space', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(350, {
      row: { kind: 'group', path: '', parent: '.', index: 2 },
      box: { top: 300, bottom: 400 },
      siblings: groupNames,
      past: true,
    });

    // There is no group there to go into: it is the space after the last one.
    expect(drag.drop()).toEqual({ kind: 'reorder', path: 'a.md', before: null });
    expect(drag.into()).toBeNull();
  });
});

describe('the project root as a destination', () => {
  const root: DragRow = { kind: 'group', path: '.', parent: '', index: -1 };

  it('takes the whole row as "into the project", edges included', () => {
    const inPartOne: DragRow = { kind: 'sheet', path: 'part-1/x.md', parent: 'part-1', index: 0 };
    for (const share of [0.05, 0.5, 0.95]) {
      const drag = press(inPartOne);
      drag.moveTo(at(share), over(root, []));

      // It has no siblings to be placed among, so there is no "between" there.
      expect(drag.drop()).toEqual({ kind: 'move', path: 'part-1/x.md', into: '.' });
      expect(drag.into()).toBe('.');
    }
  });

  it('asks for nothing from something already in the root', () => {
    const drag = press(sheets[0] as DragRow);
    drag.moveTo(at(0.5), over(root, []));

    expect(drag.drop()).toBeNull();
  });
});
