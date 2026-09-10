import { computed, signal, type Signal } from '@angular/core';
import type { EditorCursor, EditorSearchState } from '@opera-incerta/core';

/**
 * What the status bar shows and switches, for the window's lifetime.
 * SPEC.md §10.5.
 *
 * The cursor, as the adapter last reported it; and the wrap toggle, which
 * overrides the settings' default for one sheet and is forgotten with the
 * window — it is a switch for reading this sheet now, not a preference, and
 * a preference it is not must not be smuggled into the record (§13).
 */
export class EditorSession {
  readonly #cursor = signal<EditorCursor>({ line: 1, column: 1 });
  readonly #wrapOverrides = signal<ReadonlyMap<string, boolean>>(new Map());
  /** The find of SPEC.md §10.10: whether the bar is up, and what it found. */
  readonly #finding = signal(false);
  readonly #query = signal('');
  readonly #searchState = signal<EditorSearchState>({ matches: 0, current: 0 });

  readonly cursor = this.#cursor.asReadonly();
  readonly finding = this.#finding.asReadonly();
  readonly query = this.#query.asReadonly();
  readonly searchState = this.#searchState.asReadonly();

  /** Opens the bar, seeded with whatever was selected. */
  startFinding(seed: string): void {
    if (seed.trim() !== '') {
      this.#query.set(seed);
    }
    this.#finding.set(true);
  }

  noteQuery(query: string): void {
    this.#query.set(query);
  }

  noteSearch(state: EditorSearchState): void {
    this.#searchState.set(state);
  }

  /** Closes the bar. The query is kept: reopening finds the same thing. */
  stopFinding(): void {
    this.#finding.set(false);
    this.#searchState.set({ matches: 0, current: 0 });
  }

  noteCursor(cursor: EditorCursor): void {
    this.#cursor.set(cursor);
  }

  /** Whether a sheet wraps: its own switch if it was flipped, the default otherwise. */
  isWrapping(documentId: string | null, defaultWrap: boolean): boolean {
    return documentId === null ? defaultWrap : (this.#wrapOverrides().get(documentId) ?? defaultWrap);
  }

  /** The same, as a signal over a signal — for a caller that keeps one. */
  wrapping(documentId: string | null, defaultWrap: Signal<boolean>): Signal<boolean> {
    return computed(() => this.isWrapping(documentId, defaultWrap()));
  }

  toggleWrap(documentId: string, defaultWrap: boolean): void {
    const current = this.#wrapOverrides().get(documentId) ?? defaultWrap;
    const next = new Map(this.#wrapOverrides());
    next.set(documentId, !current);
    this.#wrapOverrides.set(next);
  }

  /** A sheet that is gone takes its switch with it. */
  forget(documentId: string): void {
    if (!this.#wrapOverrides().has(documentId)) {
      return;
    }
    const next = new Map(this.#wrapOverrides());
    next.delete(documentId);
    this.#wrapOverrides.set(next);
  }
}
