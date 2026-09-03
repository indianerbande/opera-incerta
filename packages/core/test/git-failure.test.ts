import { describe, expect, it } from 'vitest';
import { CodedError, classifyGitFailure } from '../src/index.js';

describe('classifyGitFailure', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['fatal: No configured push destination.', 'git/no-upstream'],
    ["fatal: The current branch draft has no upstream branch.", 'git/no-upstream'],
    ['fatal: Not possible to fast-forward, aborting.', 'git/not-fast-forward'],
    ['! [rejected] main -> main (fetch first)', 'git/not-fast-forward'],
    [
      'CONFLICT (content): Merge conflict in a.md\nAutomatic merge failed; fix conflicts',
      'git/conflict',
    ],
    [
      'remote: Invalid username or password.\nfatal: Authentication failed for',
      'git/authentication',
    ],
    ['git@example.com: Permission denied (publickey).', 'git/authentication'],
    ["error: The branch 'draft' is not fully merged.", 'git/branch-not-merged'],
    ['nothing to commit, working tree clean', 'git/nothing-to-commit'],
    [
      "fatal: Unable to create '/repo/.git/index.lock': File exists.",
      'git/index-locked',
    ],
    [
      'fatal: not a git repository (or any of the parent directories): .git',
      'git/not-a-repository',
    ],
    ['Author identity unknown\n*** Please tell me who you are.', 'git/no-identity'],
    ['error: something nobody has seen before', 'git/command-failed'],
    ['', 'git/command-failed'],
  ];

  for (const [stderr, code] of cases) {
    it(`reads ${JSON.stringify(stderr.split('\n')[0])} as ${code}`, () => {
      expect(classifyGitFailure(stderr)).toBe(code);
    });
  }
});

describe('CodedError', () => {
  it('carries a code, and an empty message unless given one', () => {
    const bare = new CodedError('thing/failed');
    expect(bare.code).toBe('thing/failed');
    expect(bare.message).toBe('');
    expect(bare).toBeInstanceOf(Error);

    const worded = new CodedError('thing/failed', 'in its own words');
    expect(worded.message).toBe('in its own words');
  });
});
