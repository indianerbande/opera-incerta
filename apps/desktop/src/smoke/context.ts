/**
 * What every check receives. One object, passed first, so a check reads
 * exactly like its signature says: `check(smoke, window)`.
 *
 * Nothing here is global. The smoke entry builds it once, from the shell
 * handle and the temporary directories it made, and every path a check reads
 * or writes on disk comes from it.
 */
import type { Shell } from '../shell.js';

export interface Smoke {
  /** The running shell: its windows, its counters, and the way out. */
  readonly shell: Shell;
  /**
   * The project the smoke works on — a fresh **copy** of
   * `examples/smoke-project`, `git init`-ed without a commit. The checks
   * write into it; the fixture in the repository never changes.
   */
  readonly projectPath: string;
  /**
   * Where a deleted entry goes under the smoke, instead of the desktop trash.
   * A check proves a deletion by finding the file **here**.
   */
  readonly trashPath: string;
  /** Where "new project" lands, instead of asking with a native chooser. */
  readonly createParent: string;
  /**
   * A directory holding `manuscript/` — two Markdown files and no project —
   * for the folder that has to become one (specification.md §8.6).
   */
  readonly plainParent: string;
  /**
   * Points the directory chooser at a folder for the next open. The chooser
   * is the one substitution the shell takes; a check that wants a different
   * answer says so here rather than reaching into the shell.
   */
  chooseFolder(absolutePath: string): void;
  /** The preference record the shell writes under the smoke's user-data directory. */
  readonly preferencesPath: string;
  /**
   * Where an export lands, instead of asking with a native save dialog
   * (specification.md §15.2). The file the shell writes appears here under the name
   * the export offered.
   */
  readonly exportDirectory: string;
  /** `build/desktop/`, where the screenshots (`smoke-*.png`) are written. */
  readonly evidenceDirectory: string;
  /** This checkout, for what the smoke asks of the repository it was built from. */
  readonly repositoryRoot: string;
  /** Runs git in a directory and returns its stdout. Throws on a non-zero exit. */
  git(cwd: string, argv: readonly string[]): string;
}
