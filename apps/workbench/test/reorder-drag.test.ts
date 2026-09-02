import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, ReorderDrag, dropSlot, type RowBox } from '../src/app/shell/reorder-drag.js';

/** Three 20 px rows, starting at 100. */
const rows: readonly RowBox[] = [
  { top: 100, bottom: 120 },
  { top: 120, bottom: 140 },
  { top: 140, bottom: 160 },
];

describe('dropSlot', () => {
  it('switches at a row’s middle, not at its edge', () => {
    expect(dropSlot(rows, 109)).toBe(0);
    expect(dropSlot(rows, 111)).toBe(1);
    expect(dropSlot(rows, 129)).toBe(1);
    expect(dropSlot(rows, 131)).toBe(2);
  });

  it('lands above the first row and below the last', () => {
    expect(dropSlot(rows, 0)).toBe(0);
    expect(dropSlot(rows, 1000)).toBe(3);
  });

  it('has one slot for an empty list', () => {
    expect(dropSlot([], 42)).toBe(0);
  });
});

describe('ReorderDrag', () => {
  const names = ['a.md', 'b.md', 'c.md'];

  it('stays a click until the pointer really travels', () => {
    const drag = new ReorderDrag();
    drag.press(0, 110);

    expect(drag.move(110 + DRAG_THRESHOLD - 1, rows)).toBe(false);
    expect(drag.index()).toBeNull();
    // A press that never travels must not move anything.
    expect(drag.release(names)).toBeNull();
  });

  it('becomes a drag past the threshold and reports where it would land', () => {
    const drag = new ReorderDrag();
    drag.press(0, 110);

    expect(drag.move(151, rows)).toBe(true);
    expect(drag.index()).toBe(0);
    expect(drag.slot()).toBe(3);
    expect(drag.release(names)).toEqual({ index: 0, before: null });
  });

  it('moves a row in front of the sibling under the pointer', () => {
    const drag = new ReorderDrag();
    drag.press(2, 150);
    drag.move(115, rows);

    expect(drag.release(names)).toEqual({ index: 2, before: 'b.md' });
  });

  it('asks for nothing when the row is dropped where it already was', () => {
    const above = new ReorderDrag();
    above.press(1, 130);
    above.move(122, rows);
    expect(above.release(names)).toBeNull();

    const below = new ReorderDrag();
    below.press(1, 130);
    below.move(138, rows);
    expect(below.release(names)).toBeNull();
  });

  it('forgets everything on release and on cancel', () => {
    const drag = new ReorderDrag();
    drag.press(0, 110);
    drag.move(151, rows);
    drag.release(names);

    expect(drag.index()).toBeNull();
    expect(drag.slot()).toBeNull();
    // A released drag must not be revived by a stray pointer move.
    expect(drag.move(151, rows)).toBe(false);

    drag.press(0, 110);
    drag.move(151, rows);
    drag.cancel();
    expect(drag.index()).toBeNull();
  });
});
