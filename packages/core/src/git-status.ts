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

/** What a branch tracks and how far the two have drifted. SPEC.md §12. */
export interface GitTracking {
  /** The upstream's name, as git prints it — `origin/main`. */
  readonly upstream: string;
  /** Commits the upstream has and this branch does not. */
  readonly behind: number;
  /** Commits this branch has and the upstream does not. */
  readonly ahead: number;
}

/**
 * Reads the upstream and the drift from the header of
 * `git status --porcelain=v2 --branch`, or null when the branch tracks
 * nothing — a normal state, not a failure.
 *
 *     # branch.oid 3f2a…
 *     # branch.head main
 *     # branch.upstream origin/main
 *     # branch.ab +1 -2
 *
 * One command where two were used before (`rev-parse @{u}` and `rev-list
 * --count`), and a pure parser here so the adapter stays a thin wrapper.
 */
export function parseTrackingHeader(output: string): GitTracking | null {
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim();
    } else if (line.startsWith('# branch.ab ')) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/u.exec(line.trim());
      if (match !== null) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }
    }
  }
  return upstream === null || upstream === '' ? null : { upstream, ahead, behind };
}

/** A local branch. SPEC.md §12. */
export interface GitBranch {
  readonly name: string;
  readonly current: boolean;
}

/** A remote, by name and address. SPEC.md §12. */
export interface GitRemote {
  readonly name: string;
  readonly url: string;
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
 * `.gitignore` with one more path in it. SPEC.md §12.
 *
 * Idempotent: a path already listed is not listed twice, whether or not the
 * file ends with a newline. The file's own line ending is kept, because a
 * manuscript repository may well have been made on another platform.
 */
export function withIgnoredPath(contents: string, path: string): string {
  const entry = path.trim();
  if (entry === '') {
    return contents;
  }

  const ending = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/u);
  if (lines.some((line) => line.trim() === entry)) {
    return contents;
  }

  const body = contents === '' ? [] : lines.filter((line, index) => line !== '' || index !== lines.length - 1);
  return [...body, entry, ''].join(ending);
}

/**
 * Whether a branch name is one worth handing to git. SPEC.md §12.
 *
 * Git's own `check-ref-format` is the authority and has the last word; this
 * catches the shapes that would be misread rather than refused — a name
 * beginning with `-` reads as an option — and the everyday mistakes, so the
 * author gets an answer before a command runs.
 */
export function isValidBranchName(value: string): boolean {
  const name = value.trim();
  if (name === '' || name.startsWith('-') || name.endsWith('/') || name.endsWith('.lock')) {
    return false;
  }
  if (name.includes('..') || name.includes('//') || name.startsWith('/')) {
    return false;
  }
  // Space, and the characters git names in its own refusal.
  return !/[\s~^:?*[\\]/u.test(name);
}

/**
 * Whether a remote's address is one this application will accept.
 * SPEC.md §12.
 *
 * Git's transports include `ext::`, which **runs a command**: a pasted address
 * of that shape would execute it on the author's machine at the next fetch. An
 * address beginning with `-` is a second way in, because git would read it as
 * an option rather than an address.
 *
 * So the accepted shapes are named rather than filtered: the ordinary URL
 * schemes, the `user@host:path` form that ssh uses, and an absolute local
 * path. Everything else is refused with a reason instead of being tried.
 */
export function isSafeRemoteUrl(value: string): boolean {
  const address = value.trim();
  if (address === '' || address.startsWith('-')) {
    return false;
  }
  if (/^(?:https?|ssh|git|file):\/\//u.test(address)) {
    return true;
  }
  // `user@host:path`, the form ssh takes without a scheme.
  if (/^[\w.-]+@[\w.-]+:[^\s]+$/u.test(address)) {
    return true;
  }
  return address.startsWith('/');
}

/**
 * Whether an entry is an unresolved merge conflict. SPEC.md §12.
 *
 * It counts as unstaged for the purpose of the change list — it is certainly
 * not ready to commit — but it needs a decision rather than a checkbox, and
 * the panel has to tell the two apart.
 */
export function isConflicted(entry: GitFileStatus): boolean {
  return CONFLICT_PAIRS.has(`${entry.indexStatus}${entry.worktreeStatus}`);
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
