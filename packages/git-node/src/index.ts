/**
 * Source control adapter boundary. SPEC.md §12.
 *
 * Git is the synchronization mechanism, and the adapter drives the locally
 * installed `git` executable: no Git library dependency, no bundled binary
 * (CONVENTIONS.md C-P10). Only the ports and the pure status vocabulary are
 * declared so far; the status parser itself is a pure function and will live
 * beside these types with its own tests (TESTING.md §2.5).
 */

/** Which group a changed file belongs to. Conflicts count as unstaged. */
/**
 * The status vocabulary and its parser live in the portable core, so the
 * source-control view can be tested against recorded output with no process
 * involved. They are re-exported here because this package is where a consumer
 * looks for them.
 */
export {
  canCommit,
  isFullyStaged,
  parseGitStatus,
  selectAllState,
  touchesWorkingTree,
} from '@opera-incerta/core';
export type { GitFileGroup, GitFileStatus, SelectAllState } from '@opera-incerta/core';

import type { GitFileStatus } from '@opera-incerta/core';

/** A failed Git invocation, surfaced to the user rather than thrown away. */
export interface GitFailure {
  readonly code: string;
  readonly message: string;
  readonly exitCode: number | null;
}

/**
 * The port the desktop application implements.
 *
 * Read and write operations get separate in-flight guards in the consumer: one
 * shared busy flag lets a background refresh swallow a user action
 * (CONVENTIONS.md C-F3).
 */
/** What a branch tracks, and how far it has drifted. SPEC.md §12. */
export interface GitTracking {
  /** The upstream's name, as git prints it — `origin/main`. */
  readonly upstream: string;
  /** Commits the upstream has and this branch does not. */
  readonly behind: number;
  /** Commits this branch has and the upstream does not. */
  readonly ahead: number;
}

export interface GitService {
  /** Resolves the repository root, or null when the path is not in a repository. */
  repositoryRoot(absolutePath: string): Promise<string | null>;
  status(repositoryRoot: string): Promise<readonly GitFileStatus[]>;
  /** Stages every path in one invocation, so the guard applies once. */
  stage(repositoryRoot: string, paths: readonly string[]): Promise<void>;
  /** Unstages every path in one invocation. */
  unstage(repositoryRoot: string, paths: readonly string[]): Promise<void>;
  /**
   * Whether the repository has a commit at all.
   *
   * A freshly created project has none, and `HEAD` is what half of Git's
   * restoring vocabulary resolves against (SPEC.md §12).
   */
  hasCommit(repositoryRoot: string): Promise<boolean>;
  /**
   * Puts tracked paths back to `HEAD`, in the index and in the working tree.
   * Only meaningful where there is a commit to go back to.
   */
  restore(repositoryRoot: string, paths: readonly string[]): Promise<void>;
  /**
   * Git's own diff for one path, against the last commit.
   *
   * A file with no commit behind it — untracked, or in a repository without a
   * `HEAD` — is shown as entirely added, because that is what it is.
   */
  diff(repositoryRoot: string, path: string, tracked: boolean): Promise<string>;
  /**
   * The committed content of one path, or `null` when the last commit does not
   * carry it — a new file, or a repository without a commit at all.
   */
  showAtHead(repositoryRoot: string, path: string): Promise<string | null>;
  commit(repositoryRoot: string, message: string): Promise<void>;
  push(repositoryRoot: string): Promise<void>;
  /**
   * Where the branch tracks, and how far apart the two are. SPEC.md §12.
   *
   * `null` when the branch tracks nothing: this application does not create an
   * upstream, so there is simply nothing to compare against.
   */
  tracking(repositoryRoot: string): Promise<GitTracking | null>;
  /** Brings the remote's refs up to date. Touches no file in the working tree. */
  fetch(repositoryRoot: string): Promise<void>;
  /**
   * Fast-forward only, never a merge.
   *
   * A merge can conflict, and resolving conflicts is not part of this stage
   * (§12) — conflict markers written into a manuscript would be the worst
   * possible outcome. Where a fast-forward is impossible git refuses, and its
   * refusal is what the author is shown.
   */
  pull(repositoryRoot: string): Promise<void>;
  /**
   * Merges the upstream in, which may leave conflicts. SPEC.md §12.
   *
   * Separate from `pull` and never automatic: this is the operation that can
   * write markers into a manuscript, so the author asks for it explicitly.
   */
  merge(repositoryRoot: string): Promise<void>;
  /** Whether a merge is under way and unfinished. */
  isMerging(repositoryRoot: string): Promise<boolean>;
  /** Puts everything back as it was before the merge began. */
  abortMerge(repositoryRoot: string): Promise<void>;
}

export { GitError, createGitService, systemGitRunner } from './process-git.js';
export type { GitCommandResult, GitCommandRunner } from './process-git.js';
