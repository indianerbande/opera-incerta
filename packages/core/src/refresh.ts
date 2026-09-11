/**
 * Coordination for refreshes and writes. specification.md §10.6 and §12.
 *
 * Two rules, each paid for with a defect:
 *
 * - **Separate guards for reading and writing.** One shared "busy" flag lets a
 *   background refresh swallow a user action, which presents to the user as
 *   "the click did nothing" (conventions.md C-F3).
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
  /** The follow-up's outcome, for the requests that were coalesced into it. */
  #followUp: Deferred | null = null;

  constructor(run: () => Promise<void>) {
    this.#run = run;
  }

  /** True while a run is in flight. */
  get isRunning(): boolean {
    return this.#running !== null;
  }

  /** True when exactly one follow-up run is already scheduled. */
  get hasPending(): boolean {
    return this.#followUp !== null;
  }

  /**
   * Requests a run and resolves when the work covering this request is done.
   *
   * Requesting during a run does not start a second one; it marks a single
   * follow-up, and every request made during the same run waits for **that**
   * follow-up — not for the run that was already under way, which began
   * before they asked. A follow-up runs whether or not the run before it
   * failed: the later request wanted a fresh read, and a failure that dropped
   * it would leave the panel showing a state nobody asked for.
   */
  request(): Promise<void> {
    if (this.#running === null) {
      this.#running = this.#cycle();
      return this.#running;
    }
    this.#followUp ??= deferred();
    return this.#followUp.promise;
  }

  async #cycle(): Promise<void> {
    let firstFailure: unknown = null;
    let failed = false;
    try {
      await this.#run();
    } catch (error: unknown) {
      firstFailure = error;
      failed = true;
    }
    while (this.#followUp !== null) {
      const followUp = this.#followUp;
      this.#followUp = null;
      try {
        await this.#run();
        followUp.resolve();
      } catch (error: unknown) {
        followUp.reject(error);
      }
    }
    this.#running = null;
    if (failed) {
      throw firstFailure;
    }
  }
}

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason: unknown): void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

/** What `ExclusiveTask.run` answers: the operation's value, or that it did not run. */
export type ExclusiveOutcome<T> =
  | { readonly ran: true; readonly value: T }
  | { readonly ran: false };

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
   * Runs `operation` unless one is already in flight, and says which it was.
   * A caller can then report that the previous action is still running rather
   * than pretending nothing happened. Said explicitly rather than with `null`,
   * because an operation may itself answer `null`.
   */
  async run<T>(operation: () => Promise<T>): Promise<ExclusiveOutcome<T>> {
    if (this.#running) {
      return { ran: false };
    }
    this.#running = true;
    try {
      return { ran: true, value: await operation() };
    } finally {
      this.#running = false;
    }
  }
}

/**
 * How long a burst of filesystem events is allowed to settle before it counts
 * as one change. specification.md §12.
 *
 * Measured rather than guessed at: one atomic save of a single sheet produced
 * seven events on macOS, including two for directories that had not changed.
 * Debouncing is what turns that back into the one thing that happened.
 */
export const WATCH_DEBOUNCE_MS = 400;

