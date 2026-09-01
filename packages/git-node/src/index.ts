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
export interface GitService {
  /** Resolves the repository root, or null when the path is not in a repository. */
  repositoryRoot(absolutePath: string): Promise<string | null>;
  status(repositoryRoot: string): Promise<readonly GitFileStatus[]>;
  /** Stages every path in one invocation, so the guard applies once. */
  stage(repositoryRoot: string, paths: readonly string[]): Promise<void>;
  /** Unstages every path in one invocation. */
  unstage(repositoryRoot: string, paths: readonly string[]): Promise<void>;
  commit(repositoryRoot: string, message: string): Promise<void>;
  /** Deliberately without upstream creation, pull, or fetch. SPEC.md §12. */
  push(repositoryRoot: string): Promise<void>;
}

export { GitError, createGitService, systemGitRunner } from './process-git.js';
export type { GitCommandResult, GitCommandRunner } from './process-git.js';
