/**
 * What a failed git command was about, read from its own words. SPEC.md §12.
 *
 * Git's message is what the author is shown, unchanged. The **code** is for
 * the interface, which cannot act on prose: a push refused for want of an
 * upstream offers publishing, a pull refused because the histories diverged
 * offers merging, and both used to be `git/command-failed`. A pure function
 * over stderr, so the vocabulary is tested against recorded output and the
 * adapter stays a wrapper.
 */
export type GitFailureCode =
  | 'git/not-a-repository'
  | 'git/no-upstream'
  | 'git/not-fast-forward'
  | 'git/conflict'
  | 'git/authentication'
  | 'git/branch-not-merged'
  | 'git/nothing-to-commit'
  | 'git/index-locked'
  | 'git/no-identity'
  | 'git/command-failed';

const RULES: ReadonlyArray<readonly [GitFailureCode, RegExp]> = [
  ['git/not-a-repository', /not a git repository/iu],
  ['git/index-locked', /index\.lock/iu],
  [
    'git/no-identity',
    /please tell me who you are|author identity unknown|empty ident name/iu,
  ],
  [
    'git/no-upstream',
    /no configured push destination|has no upstream branch|no upstream configured/iu,
  ],
  [
    'git/not-fast-forward',
    /not possible to fast-forward|non-fast-forward|fetch first/iu,
  ],
  ['git/conflict', /CONFLICT|automatic merge failed|needs merge/u],
  [
    'git/authentication',
    /authentication failed|permission denied|could not read username|access denied/iu,
  ],
  ['git/branch-not-merged', /not fully merged/iu],
  ['git/nothing-to-commit', /nothing to commit|nothing added to commit/iu],
];

/** The code for a failed command, from what git wrote to stderr. */
export function classifyGitFailure(stderr: string): GitFailureCode {
  for (const [code, pattern] of RULES) {
    if (pattern.test(stderr)) {
      return code;
    }
  }
  return 'git/command-failed';
}
