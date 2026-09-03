/**
 * Coordination for refreshes and writes. SPEC.md §10.6 and §12.
 *
 * Two rules, each paid for with a defect:
 *
 * - **Separate guards for reading and writing.** One shared "busy" flag lets a
 *   background refresh swallow a user action, which presents to the user as
 *   "the click did nothing" (CONVENTIONS.md C-F3).
 * - **Coalesce, do not queue.** A refresh requested while one is running
 *   schedules exactly one more, so a change made after the running read began
 *   is still seen, without a pile-up of redundant reads.
 *
 * Both are timer-free and therefore testable without fake clocks. Debouncing
 * is the caller's concern; this only governs overlap.
 */

/**
 * Runs an operation so that at most one run is in flight, coalescing further
 * requests into a single follow-up run.
 */
export class RefreshCoordinator {
  readonly #run: () => Promise<void>;
  #running: Promise<void> | null = null;
  #pending = false;

  constructor(run: () => Promise<void>) {
    this.#run = run;
  }

  /** True while a run is in flight. */
  get isRunning(): boolean {
    return this.#running !== null;
  }

  /** True when exactly one follow-up run is already scheduled. */
  get hasPending(): boolean {
    return this.#pending;
  }

  /**
   * Requests a run and resolves when the work covering this request is done.
   *
   * Requesting during a run does not start a second one; it marks a single
   * follow-up. Further requests during the same run collapse into that one.
   */
  async request(): Promise<void> {
    if (this.#running !== null) {
      this.#pending = true;
      await this.#running;
      // The follow-up runs after the in-flight run completes; awaiting the
      // chain keeps the caller's promise meaningful.
      if (this.#running !== null) {
        await this.#running;
      }
      return;
    }

    this.#running = this.#cycle();
    await this.#running;
  }

  async #cycle(): Promise<void> {
    try {
      await this.#run();
      while (this.#pending) {
        this.#pending = false;
        await this.#run();
      }
    } finally {
      this.#running = null;
      this.#pending = false;
    }
  }
}

/**
 * Runs an operation with its own guard, rejecting overlap instead of dropping
 * it silently. Used for user-triggered writes, which must never be swallowed
 * by a background read.
 */
export class ExclusiveTask {
  #running = false;

  get isRunning(): boolean {
    return this.#running;
  }

  /**
   * Runs `operation` unless one is already in flight, in which case `null` is
   * returned. A caller can then report that the previous action is still
   * running rather than pretending nothing happened.
   */
  async run<T>(operation: () => Promise<T>): Promise<T | null> {
    if (this.#running) {
      return null;
    }
    this.#running = true;
    try {
      return await operation();
    } finally {
      this.#running = false;
    }
  }
}

/**
 * How long a burst of filesystem events is allowed to settle before it counts
 * as one change. SPEC.md §12.
 *
 * Measured rather than guessed at: one atomic save of a single sheet produced
 * seven events on macOS, including two for directories that had not changed.
 * Debouncing is what turns that back into the one thing that happened.
 */
export const WATCH_DEBOUNCE_MS = 400;

