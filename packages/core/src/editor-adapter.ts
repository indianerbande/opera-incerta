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

  /** The current text, in the form it would be written to disk. */
  text(): string;

  /** One-based line holding the cursor. */
  focusedLine(): number;

  /** Moves the cursor to a line — outline navigation, diagnostics. */
  revealLine(line: number): void;

  /**
   * Applies or removes a heading level on one line — the gutter menu of
   * `SPEC.md` §10.2. A heading applies to exactly one line.
   */
  setHeadingLevel(line: number, level: HeadingLevel | null): void;

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

  /** Releases the component. Calling it twice is not an error. */
  destroy(): void;
}
