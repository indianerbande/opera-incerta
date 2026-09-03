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
  isConflicted,
  selectAllState,
  withIgnoredPath,
  type GitFileStatus,
  type SelectAllState,
} from '@opera-incerta/core';
import {
  isGitReport,
  type GitBranch,
  type GitRemote,
  type GitTracking,
  type GitVersions,
  type OperaIncertaBridge,
} from '@opera-incerta/desktop-contract';
import { toBridgeFailure, unwrap, unwrapAs } from './bridge.js';

export class SourceControlStore {
  readonly #bridge: OperaIncertaBridge | null;
  readonly #refresh: RefreshCoordinator;
  readonly #write = new ExclusiveTask();

  readonly #entries = signal<readonly GitFileStatus[]>([]);
  readonly #root = signal<string | null>(null);
  readonly #tracking = signal<GitTracking | null>(null);
  readonly #merging = signal(false);
  readonly #hasCommit = signal(false);
  readonly #branch = signal<string | null>(null);
  readonly #remote = signal<GitRemote | null>(null);
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
  /** What the branch tracks, or null when it tracks nothing. SPEC.md §12. */
  readonly tracking = this.#tracking.asReadonly();
  /** Pulling is offered only when there is something to pull. */
  readonly canPull = computed(() => (this.#tracking()?.behind ?? 0) > 0);
  /** A merge is under way and unfinished. SPEC.md §12. */
  readonly merging = this.#merging.asReadonly();
  /** The checked-out branch, and where a first publish would go. */
  readonly branch = this.#branch.asReadonly();
  readonly remote = this.#remote.asReadonly();
  /**
   * A branch that has never been published. The offer appears only inside a
   * repository, and only while there is no upstream. SPEC.md §12.
   */
  readonly canPublish = computed(
    () => this.#root() !== null && this.#tracking() === null && this.#branch() !== null,
  );
  /**
   * Merging is offered only when the two have actually drifted apart — the
   * case a fast-forward pull refuses.
   */
  readonly canMerge = computed(() => {
    const tracking = this.#tracking();
    return tracking !== null && tracking.behind > 0 && tracking.ahead > 0;
  });
  /**
   * Whether the last commit may be replaced. SPEC.md §12.
   *
   * Only what has not left the machine: amending rewrites history, and a
   * pushed commit could only be published again by force. A merge in progress
   * is excluded as well — the commit to amend would be the merge.
   */
  readonly canAmend = computed(() => {
    const tracking = this.#tracking();
    return (
      this.#hasCommit() && !this.#merging() && (tracking === null || tracking.ahead > 0)
    );
  });

  /** The files a merge left for the author to decide. */
  readonly conflicted = computed(() => this.#entries().filter((entry) => isConflicted(entry)));

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
    return this.#runRead(null, async (bridge) => unwrap(await bridge.gitDiff({ path })));
  }

  /**
   * The two versions of one file, for comparing prose word by word.
   * SPEC.md §12. A read, like `diff`, and guarded like one.
   */
  async versions(path: string): Promise<GitVersions | null> {
    return this.#runRead(null, async (bridge) => unwrap(await bridge.gitVersions({ path })));
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

  /** Brings the remote's refs up to date. Touches no file. SPEC.md §12. */
  async fetch(): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitFetch());
    });
  }

  /**
   * Fast-forward only. Where the histories have diverged git refuses, and its
   * refusal is what the author is shown: resolving a merge is not part of this
   * stage, and conflict markers in a manuscript would be the worst outcome.
   */
  async pull(): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitPull());
    });
  }

  /** Replaces the last commit, with the field's message or the old one. */
  async amend(): Promise<void> {
    const message = this.#message();
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitAmend({ text: message }));
      this.#message.set('');
    });
  }

  /** The last commit's message, for filling the field before amending. */
  async lastMessage(): Promise<string | null> {
    return this.#runRead(null, async (bridge) => unwrap(await bridge.gitLastMessage()));
  }

  /** The repository's `.gitignore`. SPEC.md §12. */
  async readIgnore(): Promise<string | null> {
    return this.#runRead(null, async (bridge) => unwrap(await bridge.gitReadIgnore()));
  }

  async writeIgnore(text: string): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitWriteIgnore({ text }));
    });
  }

  /** Adds one path to `.gitignore`, leaving it alone if it is already there. */
  async ignorePath(path: string): Promise<void> {
    const contents = await this.readIgnore();
    if (contents === null) {
      return;
    }
    const next = withIgnoredPath(contents, path);
    if (next !== contents) {
      await this.writeIgnore(next);
    }
  }

  /** Every local branch, read when they are about to be shown. SPEC.md §12. */
  async branches(): Promise<readonly GitBranch[]> {
    return this.#runRead([], async (bridge) => unwrap(await bridge.gitBranches()));
  }

  async createBranch(name: string): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitCreateBranch({ name }));
    });
  }

  async switchBranch(name: string): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitSwitchBranch({ name }));
    });
  }

  async deleteBranch(name: string): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitDeleteBranch({ name }));
    });
  }

  /**
   * Pushes the branch for the first time and sets it to track where it went.
   * SPEC.md §12.
   *
   * `url` is given only when no remote is recorded yet; the address is checked
   * in the main process before git sees it.
   */
  async publish(url?: string): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitPublish(url === undefined ? {} : { url }));
    });
  }

  /**
   * Merges the upstream in. SPEC.md §12.
   *
   * It may leave conflicts, which is the whole reason it is a separate action
   * that the author asks for. Git reporting a conflict is not a failure of the
   * operation — the merge began, and the panel now shows what has to be
   * decided — so the refusal is recorded and the status re-read either way.
   */
  async merge(): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitMerge());
    });
  }

  /** Puts everything back as it was before the merge began. */
  async abortMerge(): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitAbortMerge());
    });
  }

  /** Writes a file the author has decided, and stages it. */
  async resolve(path: string, text: string): Promise<void> {
    await this.#runWrite(async (bridge) => {
      unwrap(await bridge.gitResolve({ path, text }));
    });
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
      const report = unwrapAs(await bridge.gitStatus(), isGitReport, 'report');
      this.#root.set(report.root);
      this.#entries.set(report.entries);
      this.#tracking.set(report.tracking);
      this.#merging.set(report.merging);
      this.#hasCommit.set(report.hasCommit);
      this.#branch.set(report.branch);
      this.#remote.set(report.remote);
      this.#loaded.set(true);
      this.#failure.set(null);
    } catch (error: unknown) {
      this.#failure.set(reasonOf(error));
      this.#loaded.set(true);
    }
  }

  /**
   * A read that changes nothing: it goes through neither guard, because
   * making it wait behind a write would present as "the click did nothing"
   * (C-F3). A failure is reported; the caller gets the fallback.
   */
  async #runRead<T>(
    fallback: T,
    operation: (bridge: OperaIncertaBridge) => Promise<T>,
  ): Promise<T> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.#failure.set('bridge/absent');
      return fallback;
    }
    try {
      return await operation(bridge);
    } catch (error: unknown) {
      this.#failure.set(reasonOf(error));
      return fallback;
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

    if (!outcome.ran) {
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
    if (outcome.value.code !== null) {
      this.#failure.set(outcome.value.code);
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
  const failure = toBridgeFailure(error);
  const message = failure.message.trim();
  return message !== '' ? message : failure.code;
}
