import { signal } from '@angular/core';

/**
 * Dragging a row to a new place in its list. SPEC.md §6.4.
 *
 * Built on **pointer** events rather than the HTML drag-and-drop API. Two
 * reasons, and the second is the one that decided it: the pointer gives the
 * insertion line the same feel as the column dividers already have, and a
 * synthetic mouse event drives it — the drag API is native, and a check that
 * cannot drive the gesture cannot prove the gesture works (`TESTING.md` §1.4).
 *
 * The geometry here is deliberately free of the DOM: the caller measures, this
 * decides.
 */

/** A row's vertical extent, in the same coordinates as the pointer. */
export interface RowBox {
  readonly top: number;
  readonly bottom: number;
}

/** How far a pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

/**
 * The gap a pointer at `y` would drop into: `0` above the first row, up to
 * `rows.length` below the last. A row's own midpoint is the boundary, so the
 * insertion line switches when the pointer passes the middle of a neighbour
 * rather than its edge — otherwise the line flickers along every border.
 */
export function dropSlot(rows: readonly RowBox[], y: number): number {
  for (const [index, row] of rows.entries()) {
    if (y < (row.top + row.bottom) / 2) {
      return index;
    }
  }
  return rows.length;
}

/** What a finished drag asks for: an entry, and the sibling it lands before. */
export interface Drop {
  readonly index: number;
  readonly before: string | null;
}

/**
 * The state of one drag: pressed, then dragging once the pointer has really
 * travelled. A press that never travels stays a click — dragging on the first
 * pixel would make every selection feel unstable.
 */
export class ReorderDrag {
  /** The row being dragged, once the press became one. */
  readonly index = signal<number | null>(null);
  /** Where it would land. */
  readonly slot = signal<number | null>(null);

  #pressed: number | null = null;
  #startY = 0;

  press(index: number, y: number): void {
    this.#pressed = index;
    this.#startY = y;
  }

  /** Reports whether a drag is now under way. */
  move(y: number, rows: readonly RowBox[]): boolean {
    if (this.#pressed === null) {
      return false;
    }
    if (this.index() === null) {
      if (Math.abs(y - this.#startY) < DRAG_THRESHOLD) {
        return false;
      }
      this.index.set(this.#pressed);
    }
    this.slot.set(dropSlot(rows, y));
    return true;
  }

  /**
   * Ends the drag, returning what to move — or `null` when nothing should be:
   * no drag happened, or the row was dropped back where it already was.
   */
  release(names: readonly string[]): Drop | null {
    const index = this.index();
    const slot = this.slot();
    this.cancel();

    if (index === null || slot === null || slot === index || slot === index + 1) {
      return null;
    }
    return { index, before: names[slot] ?? null };
  }

  cancel(): void {
    this.#pressed = null;
    this.index.set(null);
    this.slot.set(null);
  }
}
