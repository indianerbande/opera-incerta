import { signal } from '@angular/core';
import { findGroup, sheetsInGroup, subgroupsOf, type GroupEntry } from '@opera-incerta/core';

/**
 * Dragging an entry in the library: to a new place among its siblings
 * (SPEC.md §6.4) or into another group (§6.8).
 *
 * **One owner for the whole gesture.** A drag that starts in the sheet list
 * and ends in the tree belongs to neither of them, so the shell owns it: the
 * two columns report where a press began and draw what this says, and the
 * shell — the one element that contains both — measures and decides. An
 * earlier version let each column own its own drag, and that arrangement
 * cannot express a drop in the other one at all.
 *
 * **Pointer events, not the drag-and-drop API**: the native one cannot be
 * driven by a synthetic pointer, and a gesture no check can drive is a gesture
 * nothing proves (`TESTING.md` §1.4).
 *
 * The geometry here is free of the DOM. The caller measures; this decides.
 */

/** A row that can be dragged, and dropped on. */
export interface DragRow {
  readonly kind: 'sheet' | 'group';
  /** The entry's path, relative to the project root. */
  readonly path: string;
  /** The group holding it. */
  readonly parent: string;
  /** Its position among the rows of its own list. */
  readonly index: number;
}

/** A row's vertical extent, in the same coordinates as the pointer. */
export interface RowBox {
  readonly top: number;
  readonly bottom: number;
}

/** What the pointer is over: a row, its box, and the names of its list. */
export interface OverRow {
  readonly row: DragRow;
  readonly box: RowBox;
  /** The file or directory names of that row's list, in the order shown. */
  readonly siblings: readonly string[];
  /**
   * True when the pointer is in the empty space *past* the last row rather
   * than on a row. Dropping there means the end of that list, which is what
   * the space below a list looks like it means.
   */
  readonly past?: boolean;
}

/**
 * Where an entry is to be put: a group, and a position within it.
 *
 * One shape for both, because reordering is placing an entry in the group it
 * is already in. `before` is the sibling it lands in front of, or null for
 * last.
 */
export interface Drop {
  readonly path: string;
  readonly into: string;
  readonly before: string | null;
}

/**
 * Where the insertion line belongs, when there is one.
 *
 * `kind` says which of the two lists: the sheet list and the tree show
 * different children of the *same* group, so a parent and an index alone name
 * two different places.
 */
export interface InsertionLine {
  readonly kind: 'sheet' | 'group';
  readonly parent: string;
  readonly index: number;
}

/**
 * What a row is, read from the library rather than from the DOM.
 *
 * A row in either column names only its kind and its path; where it sits,
 * what its neighbours are called, and which group holds it all follow from
 * the model. Reading them from `data-` attributes made a five-attribute
 * contract between three files, and finding the neighbours meant querying the
 * whole document on every pointer move. Only the row's box needs the DOM.
 */
export function describeRow(
  library: GroupEntry,
  kind: 'sheet' | 'group',
  path: string,
): { readonly row: DragRow; readonly siblings: readonly string[] } | null {
  if (kind === 'group' && path === '.') {
    // The root has no siblings and no group above it: a destination, never a
    // passenger.
    return { row: { kind, path, parent: '', index: 0 }, siblings: [] };
  }
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
  const peers = peersIn(library, kind, parent);
  if (peers === null) {
    return null;
  }
  const index = peers.findIndex((peer) => peer.relativePath === path);
  if (index === -1) {
    return null;
  }
  return { row: { kind, path, parent, index }, siblings: peers.map((peer) => peer.name) };
}

/** The empty space past the last row of a list: the end of that list. */
export function describeListEnd(
  library: GroupEntry,
  kind: 'sheet' | 'group',
  parent: string,
): { readonly row: DragRow; readonly siblings: readonly string[] } | null {
  const peers = peersIn(library, kind, parent);
  if (peers === null) {
    return null;
  }
  return {
    row: { kind, path: '', parent, index: peers.length },
    siblings: peers.map((peer) => peer.name),
  };
}

function peersIn(
  library: GroupEntry,
  kind: 'sheet' | 'group',
  parent: string,
): readonly { readonly relativePath: string; readonly name: string }[] | null {
  const group = findGroup(library, parent);
  if (group === null) {
    return null;
  }
  return kind === 'group' ? subgroupsOf(group) : sheetsInGroup(group);
}

/** How far a pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

/**
 * The share of a group's row height, top and bottom, that means "between the
 * rows" rather than "into this group". The middle half is the group itself, so
 * hitting it does not demand precision.
 */
const EDGE_BAND = 0.25;

export class LibraryDrag {
  /** The row being dragged, once the press became one. */
  readonly source = signal<DragRow | null>(null);
  /** What releasing here would do, or null when it would do nothing. */
  readonly drop = signal<Drop | null>(null);
  /** Where to draw the insertion line. */
  readonly line = signal<InsertionLine | null>(null);
  /** The group to highlight as the destination. */
  readonly into = signal<string | null>(null);

  #pressed: DragRow | null = null;
  #startY = 0;
  #dropped = false;

  press(row: DragRow, y: number): void {
    this.#pressed = row;
    this.#startY = y;
  }

  /** Reports whether a drag is now under way. */
  moveTo(y: number, over: OverRow | null): boolean {
    if (this.#pressed === null) {
      return false;
    }
    if (this.source() === null) {
      if (Math.abs(y - this.#startY) < DRAG_THRESHOLD) {
        return false;
      }
      this.source.set(this.#pressed);
    }

    const source = this.source();
    if (source === null) {
      return false;
    }
    this.#aim(source, y, over);
    return true;
  }

  /**
   * Ends the drag, returning what to do — or `null` when nothing should be
   * done: no drag happened, or it was released where it already was.
   */
  release(): Drop | null {
    const drop = this.drop();
    const dragged = this.source() !== null;
    this.cancel();
    // A press that turned into a drag must not also count as a click on the
    // row: the author was moving it, not choosing it.
    this.#dropped = dragged;
    return drop;
  }

  cancel(): void {
    this.#pressed = null;
    this.source.set(null);
    this.drop.set(null);
    this.line.set(null);
    this.into.set(null);
  }

  /** Whether the click now arriving belongs to a drag, and should be ignored. */
  consumeClick(): boolean {
    const dropped = this.#dropped;
    this.#dropped = false;
    return dropped;
  }

  /** Works out what a release at this point would mean, and how to show it. */
  #aim(source: DragRow, y: number, over: OverRow | null): void {
    if (over === null || over.box.bottom <= over.box.top) {
      this.#aimAt(null, null, null);
      return;
    }

    // A row with no parent — the project root — has no siblings to be placed
    // among, so the whole of it means "into this one", at its end.
    if (over.past !== true && over.row.parent === '') {
      this.#aimAt(this.#placeInto(source, over.row.path), null, over.row.path);
      return;
    }

    const share = (y - over.box.top) / (over.box.bottom - over.box.top);
    const insideGroup =
      over.past !== true && over.row.kind === 'group' && share > EDGE_BAND && share < 1 - EDGE_BAND;
    if (insideGroup) {
      this.#aimAt(this.#placeInto(source, over.row.path), null, over.row.path);
      return;
    }

    const slot =
      over.past === true ? over.row.index : share < 0.5 ? over.row.index : over.row.index + 1;
    const before = over.siblings[slot] ?? null;
    const line = { kind: over.row.kind, parent: over.row.parent, index: slot } as const;

    // Only a row from the *same* list can be the place the entry already
    // occupies. The sheet list and the tree show different children of one
    // group, so an index from one says nothing about the other.
    const unchanged =
      over.row.parent === source.parent &&
      over.row.kind === source.kind &&
      (slot === source.index || slot === source.index + 1);
    if (unchanged) {
      this.#aimAt(null, line, null);
      return;
    }
    this.#aimAt(this.#placeAt(source, over.row.parent, before), line, over.row.parent);
  }

  /**
   * Dropped on a group's row: into it, at its end. No position was asked for,
   * so dropping an entry on the group it already lives in does nothing.
   */
  #placeInto(source: DragRow, group: string): Drop | null {
    return group === source.parent ? null : this.#placeAt(source, group, null);
  }

  /**
   * Dropped between rows: into that group, in front of that sibling — or at
   * its end, which the empty space below a list means.
   */
  #placeAt(source: DragRow, group: string, before: string | null): Drop | null {
    if (group === source.path || group.startsWith(`${source.path}/`)) {
      // Into itself, or into its own descendant: the group and everything in
      // it would end up unreachable.
      return null;
    }
    return { path: source.path, into: group, before };
  }

  #aimAt(drop: Drop | null, line: InsertionLine | null, into: string | null): void {
    this.drop.set(drop);
    this.line.set(line);
    // A group is highlighted only when the entry would end up somewhere else
    // than it is: a highlight that leads nowhere is a promise not kept.
    this.into.set(drop !== null && into !== null && into !== this.source()?.parent ? into : null);
  }
}
