/**
 * What the library search is doing. specification.md §9.3.
 *
 * Transient by decision: the query and its matches live with the window, like
 * the wrap switch of §10.5. Nothing here reaches the preference record or the
 * project — saving a search as a view is a storage question and a later round
 * (§18).
 *
 * The search runs when it is asked to. Every keystroke would read every sheet
 * in the project from disk, and a manuscript is not a small directory.
 */
import { signal } from '@angular/core';
import {
  isLibrarySearchResult,
  type LibrarySearchHit,
  type OperaIncertaBridge,
} from '@opera-incerta/desktop-contract';
import { toBridgeFailure, unwrapAs } from './bridge.js';

export class LibrarySearchStore {
  readonly #bridge: OperaIncertaBridge | null;

  readonly #query = signal('');
  readonly #hits = signal<readonly LibrarySearchHit[]>([]);
  readonly #capped = signal(false);
  readonly #running = signal(false);
  readonly #searched = signal(false);
  readonly #failure = signal<string | null>(null);

  constructor(bridge: OperaIncertaBridge | null) {
    this.#bridge = bridge;
  }

  readonly query = this.#query.asReadonly();
  readonly hits = this.#hits.asReadonly();
  /** True when the result was cut short by the cap. */
  readonly capped = this.#capped.asReadonly();
  readonly running = this.#running.asReadonly();
  /** Whether a search has run at all — an empty list is not the same as none. */
  readonly searched = this.#searched.asReadonly();
  readonly failure = this.#failure.asReadonly();

  noteQuery(query: string): void {
    this.#query.set(query);
  }

  /** Runs the search. A blank query clears the list rather than asking. */
  async run(): Promise<void> {
    const bridge = this.#bridge;
    const query = this.#query().trim();
    if (query === '') {
      this.#hits.set([]);
      this.#capped.set(false);
      this.#searched.set(false);
      return;
    }
    if (bridge === null) {
      this.#failure.set('bridge/absent');
      return;
    }

    this.#running.set(true);
    this.#failure.set(null);
    try {
      const result = unwrapAs(
        await bridge.searchLibrary({ query }),
        isLibrarySearchResult,
        'search-result',
      );
      this.#hits.set(result.hits);
      this.#capped.set(result.capped);
      this.#searched.set(true);
    } catch (error: unknown) {
      this.#failure.set(toBridgeFailure(error).code);
      this.#hits.set([]);
      this.#capped.set(false);
    } finally {
      this.#running.set(false);
    }
  }

  /** A project that closes takes its search with it. */
  clear(): void {
    this.#query.set('');
    this.#hits.set([]);
    this.#capped.set(false);
    this.#searched.set(false);
    this.#failure.set(null);
  }
}
