/**
 * Parser for `git status --porcelain=v1 -z`. SPEC.md §12.
 *
 * A pure function in the core, so the source-control view can be tested
 * against recorded Git output without a repository, and so the process
 * adapter stays a thin wrapper (TESTING.md §2.5).
 *
 * Paths are relative to the **repository root**, not the project root, and can
 * point outside the project directory. Callers resolve them against the root
 * that `git rev-parse --show-toplevel` reported.
 */

export type GitFileGroup = 'staged' | 'unstaged' | 'untracked';

export interface GitFileStatus {
  /** Path relative to the repository root. */
  readonly path: string;
  /** Index status character; a space when the index is clean. */
  readonly indexStatus: string;
  /** Working-tree status character; a space when it is clean. */
  readonly worktreeStatus: string;
  /** Previous path for a rename or a copy. */
  readonly previousPath?: string;
  readonly groups: readonly GitFileGroup[];
}

/** Status pairs Git reports for an unresolved merge. */
const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/**
 * Parses NUL-separated porcelain v1 output.
 *
 * Rename and copy entries occupy two NUL-separated fields: the new path
 * followed by the old one. Reading them as separate entries would invent a
 * file that does not exist, so the second field is consumed here.
 */
export function parseGitStatus(output: string): readonly GitFileStatus[] {
  const fields = output.split('\0').filter((field) => field !== '');
  const entries: GitFileStatus[] = [];
  let index = 0;

  while (index < fields.length) {
    const field = fields[index] ?? '';
    index += 1;

    if (field.length < 4) {
      continue;
    }

    const indexStatus = field.charAt(0);
    const worktreeStatus = field.charAt(1);
    const path = field.slice(3);
    const pair = `${indexStatus}${worktreeStatus}`;

    let previousPath: string | undefined;
    if (indexStatus === 'R' || indexStatus === 'C') {
      previousPath = fields[index];
      index += 1;
    }

    const entry: GitFileStatus = {
      path,
      indexStatus,
      worktreeStatus,
      groups: groupsOf(indexStatus, worktreeStatus, pair),
      ...(previousPath === undefined ? {} : { previousPath }),
    };
    entries.push(entry);
  }

  return entries;
}

/**
 * Which sections a file appears in.
 *
 * A conflict counts as unstaged: it needs work in the working tree, and
 * listing it as staged would invite committing an unresolved merge.
 */
function groupsOf(
  indexStatus: string,
  worktreeStatus: string,
  pair: string,
): readonly GitFileGroup[] {
  if (pair === '??') {
    return ['untracked'];
  }
  if (CONFLICT_PAIRS.has(pair)) {
    return ['unstaged'];
  }

  const groups: GitFileGroup[] = [];
  if (indexStatus !== ' ' && indexStatus !== '?') {
    groups.push('staged');
  }
  if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
    groups.push('unstaged');
  }
  return groups;
}

/** True when the entry is fully staged and nothing is left in the worktree. */
export function isFullyStaged(entry: GitFileStatus): boolean {
  return entry.groups.includes('staged') && !entry.groups.includes('unstaged');
}

/** The state of the select-all checkbox above the change list. SPEC.md §12. */
export type SelectAllState = 'none' | 'some' | 'all';

export function selectAllState(entries: readonly GitFileStatus[]): SelectAllState {
  if (entries.length === 0) {
    return 'none';
  }
  const staged = entries.filter((entry) => entry.groups.includes('staged')).length;
  if (staged === 0) {
    return 'none';
  }
  return staged === entries.length ? 'all' : 'some';
}

/**
 * Whether a commit may be attempted: staged changes and a non-empty message.
 * SPEC.md §12.
 */
export function canCommit(entries: readonly GitFileStatus[], message: string): boolean {
  return message.trim() !== '' && entries.some((entry) => entry.groups.includes('staged'));
}

/**
 * Whether a filesystem event should trigger a status refresh.
 *
 * `git status` opportunistically writes inside `.git`; without this filter
 * every refresh would re-trigger itself (SPEC.md §12, CONVENTIONS.md C-F4).
 */
export function touchesWorkingTree(changedPaths: readonly string[]): boolean {
  return changedPaths.some((path) => !path.split(/[/\\]/).includes('.git'));
}
