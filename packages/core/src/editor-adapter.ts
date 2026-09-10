/**
 * The boundary between the display model and whichever component renders it.
 * SPEC.md §5.4, §10.
 *
 * Deliberately free of DOM types. The component is chosen when the adapter is
 * constructed; from then on the application speaks about text, lines, and
 * heading levels, never about elements or key events. That is what makes the
 * component replaceable — and what lets one contract suite run against both a
 * real implementation and a double.
 */
import type { HeadingLevel } from './heading.js';

/** A document the editor can show, identified for its own undo history. */
export interface EditorDocument {
  /** Stable identity of the document, from the desktop bridge's handle. */
  readonly id: string;
  readonly text: string;
}

/** Notified after a change; returns the current text. */
export type EditorChangeListener = (text: string) => void;

/**
 * Where the cursor is, as the status bar says it. SPEC.md §10.5.
 *
 * One-based, and the column counts the visible text of the line: a hidden
 * heading prefix is not part of what the author sees, so it is not part of
 * where they are.
 */
export interface EditorCursor {
  readonly line: number;
  readonly column: number;
}

export type EditorCursorListener = (cursor: EditorCursor) => void;

/**
 * The author activated a heading marker in the gutter. SPEC.md §10.2.
 *
 * Carries plain numbers rather than an event: the adapter reports *what* was
 * activated and *where* on screen, and the view decides what to show there.
 * Only a line that has a level can be activated — a plain line has no marker.
 */
export interface HeadingMarkerActivation {
  /** One-based line number. */
  readonly line: number;
  readonly level: HeadingLevel;
  /** Viewport coordinates of the marker, for placing a menu beside it. */
  readonly x: number;
  readonly y: number;
}

export type HeadingMarkerListener = (activation: HeadingMarkerActivation) => void;

/**
 * What the find bar of SPEC.md §10.11 shows: how many matches there are, and
 * which one the author is on.
 */
export interface EditorSearchState {
  readonly matches: number;
  /** One-based position of the current match; 0 when there is none. */
  readonly current: number;
}

export interface EditorAdapter {
  /**
   * Shows a document.
   *
   * Switching away and back MUST preserve that document's undo history, cursor,
   * and scroll position for as long as the project stays open
   * (`SPEC.md` §6, "per-document editing state").
   */
  open(document: EditorDocument): void;

  /** Identity of the open document, or null when none is open. */
  openDocumentId(): string | null;

  /**
   * Replaces the open document's text, keeping it the same document.
   *
   * Distinct from `open`, which seeds a document once and then leaves the
   * buffer to the editor. This is for the case where the content was replaced
   * from outside — the author took the version on disk after a conflict
   * (SPEC.md §10.6) — and re-opening would be a lie about identity.
   */
  replace(text: string): void;

  /** The current text, in the form it would be written to disk. */
  text(): string;

  /** One-based line holding the cursor. */
  focusedLine(): number;

  /** Line and visible column of the cursor. SPEC.md §10.5. */
  cursor(): EditorCursor;

  /**
   * Registers a listener for cursor movement, including the move an `open`
   * or `revealLine` makes; the returned function unregisters it.
   */
  onCursorChange(listener: EditorCursorListener): () => void;

  /** Moves the cursor to a line — outline navigation, diagnostics. */
  revealLine(line: number): void;

  /**
   * Applies or removes a heading level on one line — the gutter menu of
   * `SPEC.md` §10.2. A heading applies to exactly one line.
   */
  setHeadingLevel(line: number, level: HeadingLevel | null): void;

  /**
   * Marks every match of `query` and goes to the one at or after the cursor.
   * SPEC.md §10.11. An empty query clears the search rather than matching
   * everything.
   */
  search(query: string): EditorSearchState;

  /** Steps to the next or previous match, wrapping at either end. */
  stepSearch(direction: 'forwards' | 'backwards'): EditorSearchState;

  /** Takes the marks away. The cursor stays where the last match left it. */
  clearSearch(): void;

  /** What is selected, for seeding the find field with it. */
  selectedText(): string;

  undo(): void;
  redo(): void;

  /** Registers a change listener; the returned function unregisters it. */
  onChange(listener: EditorChangeListener): () => void;

  /**
   * Registers a listener for gutter marker activation; the returned function
   * unregisters it. The adapter never opens a menu itself — that is the view's
   * decision, and keeping it there is what allows one menu implementation for
   * every adapter.
   */
  onHeadingMarkerActivate(listener: HeadingMarkerListener): () => void;

  /**
   * Drops what is remembered for a document that is gone — deleted, or moved
   * to a new identity. Its undo history and cursor are released; opening the
   * same id afterwards starts fresh. Forgetting an unknown id, or the open
   * document, is not an error: nothing visible changes until the next open.
   */
  forget(documentId: string): void;

  /** Releases the component. Calling it twice is not an error. */
  destroy(): void;
}
