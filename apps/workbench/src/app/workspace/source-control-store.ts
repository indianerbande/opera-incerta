/**
 * Source control state. SPEC.md §12.
 *
 * The parsing and the grouping live in the portable core; this holds what the
 * panel shows and drives the bridge. Reading and writing have **separate
 * guards**: one shared busy flag would let a background refresh swallow a
 * user's click, which presents as "nothing happened" (`CONVENTIONS.md` C-F3).
 */
import { computed, signal } from '@angular/core';
import {
  ExclusiveTask,
  RefreshCoordinator,
  canCommit,
  selectAllState,
  type GitFileStatus,
  type SelectAllState,
} from '@opera-incerta/core';
import type { OperaIncertaBridge } from '@opera-incerta/desktop-contract';
import { unwrap } from './bridge.js';

export class SourceControlStore {
  readonly #bridge: OperaIncertaBridge | null;
  readonly #refresh: RefreshCoordinator;
  readonly #write = new ExclusiveTask();

  readonly #entries = signal<readonly GitFileStatus[]>([]);
  readonly #root = signal<string | null>(null);
  readonly #message = signal('');
  readonly #failure = signal<string | null>(null);
  readonly #loaded = signal(false);

  constructor(bridge: OperaIncertaBridge | null) {
    this.#bridge = bridge;
    this.#refresh = new RefreshCoordinator(async () => this.#readStatus());
  }

  readonly entries = this.#entries.asReadonly();
  readonly message = this.#message.asReadonly();
  readonly failure = this.#failure.asReadonly();
  readonly loaded = this.#loaded.asReadonly();

  /** Null when the project is not inside a repository — a normal state. */
  readonly repositoryRoot = this.#root.asReadonly();

  /** All, none, or some staged — the tri-state of the select-all box. */
  readonly selectAll = computed<SelectAllState>(() => selectAllState(this.#entries()));

  readonly canCommit = computed(() => canCommit(this.#entries(), this.#message()));

  setMessage(message: string): void {
    this.#message.set(message);
  }

  /** Reads the status, coalescing overlapping requests. */
  /**
   * Reacts to a change in the working tree by reading the status again.
   * SPEC.md §12.
   *
   * The coordinator behind `refresh` coalesces, so a burst that the debounce
   * did not already merge still costs one read.
   */
  listenForRepositoryChanges(): () => void {
    return this.#bridge?.onRepositoryChange(() => void this.refresh()) ?? ((): void => undefined);
  }

  async refresh(): Promise<void> {
    await this.#refresh.request();
  }

  isStaged(entry: GitFileStatus): boolean {
    return entry.groups.includes('staged');
  }

  /** Stages or unstages one file, then re-reads. */
  async toggle(entry: GitFileStatus): Promise<void> {
    const staged = this.isStaged(entry);
    await this.#runWrite(async (bridge) => {
      const request = { paths: [entry.path] };
      unwrap(staged ? await bridge.gitUnstage(request) : await bridge.gitStage(request));
    });
  }

  /**
   * Stages or unstages everything in **one** invocation, so the guard applies
   * once to the whole action rather than per file (SPEC.md §12).
   */
  async toggleAll(): Promise<void> {
    const state = this.selectAll();
    const paths =
      state === 'all'
        ? this.#entries().map((entry) => entry.path)
        : this.#entries()
            .filter((entry) => !this.isStaged(entry))
            .map((entry) => entry.path);
    if (paths.length === 0) {
      return;
    }

    await this.#runWrite(async (bridge) => {
      unwrap(
        state === 'all' ? await bridge.gitUnstage({ paths }) : await bridge.gitStage({ paths }),
      );
    });
  }

  /**
   * Git's own diff for one file, as text. SPEC.md §12.
   *
   * A read, so it goes through neither guard: it changes nothing, and making
   * it wait behind a write would present as "the click did nothing" (C-F3).
   */
  async diff(path: string): Promise<string | null> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.#failure.set('bridge/absent');
      return null;
    }
    try {
      return unwrap(await bridge.gitDiff({ path }));
    } catch (error: unknown) {
      this.#failure.set(reasonOf(error));
      return null;
    }
  }

  /**
   * Throws away the changes to one file. SPEC.md §12.
   *
   * Destructive, so the caller confirms first — this only carries it out. What
   * comes back are the affected paths **relative to the project**, so that
   * whatever the editor still holds for them can be forgotten: saving the old
   * buffer afterwards would put the discarded change straight back.
   */
  async discard(paths: readonly string[]): Promise<readonly string[]> {
    if (paths.length === 0) {
      return [];
    }
    let affected: readonly string[] = [];
    await this.#runWrite(async (bridge) => {
      affected = unwrap(await bridge.gitDiscard({ paths: [...paths] }));
    });
    return affected;
  }

  async commit(): Promise<void> {
    if (!this.canCommit()) {
      return;
    }
    const message = this.#message();
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitCommit({ message }));
      this.#message.set('');
    });
  }

  /**
   * Commits, then pushes.
   *
   * If the commit succeeds and the push fails, the commit stands and the
   * message field is cleared — it was committed — and only the push failure is
   * reported (SPEC.md §12).
   */
  async commitAndPush(): Promise<void> {
    if (!this.canCommit()) {
      return;
    }
    const message = this.#message();
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitCommit({ message }));
      this.#message.set('');
      unwrap(await bridge.gitPush());
    });
  }

  dismissFailure(): void {
    this.#failure.set(null);
  }

  async #readStatus(): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      return;
    }
    try {
      const report = unwrap(await bridge.gitStatus());
      this.#root.set(report.root);
      this.#entries.set(report.entries as readonly GitFileStatus[]);
      this.#loaded.set(true);
      this.#failure.set(null);
    } catch (error: unknown) {
      this.#failure.set(reasonOf(error));
      this.#loaded.set(true);
    }
  }

  /** A user action, guarded separately from the refresh, then re-reading. */
  async #runWrite(operation: (bridge: OperaIncertaBridge) => Promise<void>): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.#failure.set('bridge/absent');
      return;
    }

    const outcome = await this.#write.run(async () => {
      try {
        await operation(bridge);
        return { code: null };
      } catch (error: unknown) {
        return { code: reasonOf(error) };
      }
    });

    // `null` from the guard means "already running"; the operation itself
    // reports its own outcome as a code or an explicit absence of one.
    if (outcome === null) {
      // Another write is in flight; say so rather than doing nothing visible.
      this.#failure.set('git/busy');
      return;
    }

    // Re-read regardless: a failed push still leaves a made commit behind, and
    // the panel must show the state as it now is.
    await this.refresh();

    // The refresh reports its own success by clearing the failure, so a write
    // failure is restored afterwards — otherwise the message the author needs
    // disappears in the same tick it appeared.
    if (outcome.code !== null) {
      this.#failure.set(outcome.code);
    }
  }
}

/**
 * What to show the author when a Git action failed.
 *
 * **Git's own message, where there is one** (SPEC.md §12): "does not appear to
 * be a git repository" tells the author what to do, and `git/command-failed`
 * tells them nothing. The code is the fallback, and it is what the codes
 * outside Git — a missing bridge, a busy guard — already are.
 */
function reasonOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'git/failed';
  }
  const candidate = error as { message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
  if (message !== '') {
    return message;
  }
  return 'code' in candidate ? String(candidate.code) : 'git/failed';
}
