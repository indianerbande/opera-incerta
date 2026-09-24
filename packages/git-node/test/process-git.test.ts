import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GitError,
  GitUnavailableError,
  createGitService,
  systemGitRunner,
  type GitCommandResult,
  type GitCommandRunner,
} from '../src/index.js';

/** Records every invocation and replies from a script. */
function recordingRunner(
  replies: Partial<Record<string, GitCommandResult>> = {},
): GitCommandRunner & { readonly calls: Array<readonly string[]> } {
  const calls: Array<readonly string[]> = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      return (
        replies[args[0] ?? ''] ?? { stdout: '', stderr: '', exitCode: 0 }
      );
    },
  };
}

describe('command construction', () => {
  it('resolves the repository root, not the project root', async () => {
    const runner = recordingRunner({
      'rev-parse': { stdout: '/repo\n', stderr: '', exitCode: 0 },
    });
    const git = createGitService(runner);

    expect(await git.repositoryRoot('/repo/book')).toBe('/repo');
    expect(runner.calls[0]).toEqual(['rev-parse', '--show-toplevel']);
  });

  it('reports no repository as null rather than as a failure', async () => {
    const git = createGitService(
      recordingRunner({ 'rev-parse': { stdout: '', stderr: 'not a repo', exitCode: 128 } }),
    );
    expect(await git.repositoryRoot('/tmp')).toBeNull();
  });

  it('reads status in NUL-separated porcelain v1', async () => {
    const runner = recordingRunner({
      status: { stdout: 'M  a.md\0?? b.md\0', stderr: '', exitCode: 0 },
    });
    const entries = await createGitService(runner).status('/repo');

    expect(runner.calls[0]).toEqual(['status', '--porcelain=v1', '-z']);
    expect(entries.map((entry) => entry.path)).toEqual(['a.md', 'b.md']);
  });

  it('stages every path in one invocation, separated by --', async () => {
    const runner = recordingRunner();
    await createGitService(runner).stage('/repo', ['a.md', '-weird-name.md']);

    expect(runner.calls).toEqual([['add', '--', 'a.md', '-weird-name.md']]);
  });

  it('unstages in one invocation once a commit exists', async () => {
    const runner = recordingRunner({
      'rev-parse': { stdout: 'abc123\n', stderr: '', exitCode: 0 },
    });
    await createGitService(runner).unstage('/repo', ['a.md', 'b.md']);

    expect(runner.calls).toEqual([
      ['rev-parse', '--verify', 'HEAD'],
      ['restore', '--staged', '--', 'a.md', 'b.md'],
    ]);
  });

  it('removes from the index instead when the repository has no commit yet', async () => {
    // A freshly created project is exactly this state, and `restore --staged`
    // resolves against a HEAD that does not exist.
    const runner = recordingRunner({
      'rev-parse': { stdout: '', stderr: 'fatal: needed a single revision', exitCode: 128 },
    });
    await createGitService(runner).unstage('/repo', ['a.md']);

    expect(runner.calls[1]).toEqual(['rm', '--cached', '--quiet', '--', 'a.md']);
  });

  it('does nothing at all for an empty path list', async () => {
    const runner = recordingRunner();
    const git = createGitService(runner);
    await git.stage('/repo', []);
    await git.unstage('/repo', []);

    expect(runner.calls).toEqual([]);
  });

  it('commits with the message as an argument, never interpolated into a shell', async () => {
    const runner = recordingRunner();
    await createGitService(runner).commit('/repo', 'Add chapter; rm -rf /');

    expect(runner.calls).toEqual([['commit', '-m', 'Add chapter; rm -rf /']]);
  });

  it('pushes without creating an upstream, pulling, or fetching', async () => {
    const runner = recordingRunner();
    await createGitService(runner).push('/repo');

    expect(runner.calls).toEqual([['push']]);
    const flattened = runner.calls.flat();
    expect(flattened).not.toContain('--set-upstream');
    expect(flattened).not.toContain('-u');
    expect(flattened).not.toContain('pull');
    expect(flattened).not.toContain('fetch');
  });
});

describe('one command at a time per repository', () => {
  /** A runner that records when each command starts and ends, with a delay. */
  function slowRunner(): GitCommandRunner & { readonly log: string[] } {
    const log: string[] = [];
    return {
      log,
      async run(args, cwd) {
        log.push(`start ${cwd} ${args[0] ?? ''}`);
        await new Promise((resolve) => setTimeout(resolve, 15));
        log.push(`end ${cwd} ${args[0] ?? ''}`);
        if (args[0] === 'push') {
          return { stdout: '', stderr: 'rejected', exitCode: 1 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };
  }

  it('runs two commands against one directory one after the other', async () => {
    const runner = slowRunner();
    const git = createGitService(runner);
    // Issued together, as two bridge handlers would: a stage and a status.
    await Promise.all([git.stage('/repo', ['a.md']), git.status('/repo')]);

    expect(runner.log).toEqual([
      'start /repo add',
      'end /repo add',
      'start /repo status',
      'end /repo status',
    ]);
  });

  it('lets a failed command through without blocking the next', async () => {
    const runner = slowRunner();
    const git = createGitService(runner);
    const results = await Promise.allSettled([git.push('/repo'), git.status('/repo')]);

    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    expect(runner.log).toEqual([
      'start /repo push',
      'end /repo push',
      'start /repo status',
      'end /repo status',
    ]);
  });

  it('does not hold one directory up for another', async () => {
    const runner = slowRunner();
    const git = createGitService(runner);
    await Promise.all([git.status('/one'), git.status('/two')]);

    // Both started before either ended: the queues are per directory.
    expect(runner.log.slice(0, 2)).toEqual(['start /one status', 'start /two status']);
  });
});

describe('creating a repository', () => {
  it('asks for main as the initial branch, in the directory it was given', async () => {
    const runner = recordingRunner();
    await createGitService(runner).init('/book');
    expect(runner.calls).toEqual([['init', '--initial-branch=main']]);
  });

  it('leaves a real directory as a repository on main with nothing staged and no commit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opera-incerta-init-'));
    try {
      await writeFile(join(directory, 'a.md'), 'text\n', 'utf8');
      const git = createGitService();
      expect(await git.repositoryRoot(directory)).toBeNull();

      await git.init(directory);

      expect(await git.repositoryRoot(directory)).not.toBeNull();
      expect(await git.currentBranch(directory)).toBe('main');
      expect(await git.hasCommit(directory)).toBe(false);
      const entries = await git.status(directory);
      expect(entries.map((entry) => [entry.path, entry.groups])).toEqual([['a.md', ['untracked']]]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('the identity commits are by', () => {
  it('writes both halves into the repository, never the global configuration', async () => {
    const runner = recordingRunner();
    await createGitService(runner).setIdentity('/book', { name: 'A. Writer', email: 'a@x.test' });
    expect(runner.calls).toEqual([
      ['config', '--local', 'user.name', 'A. Writer'],
      ['config', '--local', 'user.email', 'a@x.test'],
    ]);
  });

  it('reads null when either half is missing', async () => {
    const runner = recordingRunner({ config: { stdout: '', stderr: '', exitCode: 1 } });
    expect(await createGitService(runner).identity('/book', 'global')).toBeNull();
    expect(runner.calls[0]).toEqual(['config', '--global', '--get', 'user.name']);
  });

  it('in a real repository: unset, then set locally, with the global file untouched', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opera-incerta-identity-'));
    const globalFile = join(directory, 'global-gitconfig');
    const previous = process.env['GIT_CONFIG_GLOBAL'];
    process.env['GIT_CONFIG_GLOBAL'] = globalFile;
    try {
      await writeFile(globalFile, '', 'utf8');
      const git = createGitService();
      await git.init(directory);
      expect(await git.identity(directory, 'global')).toBeNull();
      expect(await git.identity(directory, 'local')).toBeNull();

      await git.setIdentity(directory, { name: 'A. Writer', email: 'a@x.test' });

      expect(await git.identity(directory, 'local')).toEqual({
        name: 'A. Writer',
        email: 'a@x.test',
      });
      expect(await git.identity(directory, 'global')).toBeNull();
      expect(await readFile(globalFile, 'utf8')).toBe('');
    } finally {
      if (previous === undefined) {
        delete process.env['GIT_CONFIG_GLOBAL'];
      } else {
        process.env['GIT_CONFIG_GLOBAL'] = previous;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('a machine without git', () => {
  it('is reported as its own condition, not as a project outside a repository', async () => {
    const runner: GitCommandRunner = {
      run: () => Promise.reject(new GitUnavailableError()),
    };
    const git = createGitService(runner);

    await expect(git.repositoryRoot('/book')).rejects.toMatchObject({
      code: 'git/not-installed',
    });
    await expect(git.status('/book')).rejects.toMatchObject({ code: 'git/not-installed' });
  });

  it('is what the real runner reports when git is not on the path', async () => {
    const path = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      await expect(systemGitRunner.run(['--version'], tmpdir())).rejects.toMatchObject({
        code: 'git/not-installed',
      });
    } finally {
      process.env['PATH'] = path;
    }
  });
});

describe('reading what git reports', () => {
  it('reads the remote from the configuration, a path with a space kept whole', async () => {
    const runner = recordingRunner({
      config: {
        stdout: 'remote.origin.url /Users/someone/My Books/remote.git\nremote.backup.url x\n',
        stderr: '',
        exitCode: 0,
      },
    });
    const remote = await createGitService(runner).defaultRemote('/repo');

    expect(remote).toEqual({ name: 'origin', url: '/Users/someone/My Books/remote.git' });
    expect(runner.calls[0]).toEqual(['config', '--get-regexp', '^remote\\..*\\.url$']);
  });

  it('reports no remote when the configuration has none', async () => {
    const runner = recordingRunner({ config: { stdout: '', stderr: '', exitCode: 1 } });
    expect(await createGitService(runner).defaultRemote('/repo')).toBeNull();
  });

  it('reads the upstream and the drift from one status call', async () => {
    const runner = recordingRunner({
      status: {
        stdout:
          '# branch.oid abc\n# branch.head main\n' +
          '# branch.upstream origin/main\n# branch.ab +2 -1\n',
        stderr: '',
        exitCode: 0,
      },
    });
    const tracking = await createGitService(runner).tracking('/repo');

    expect(tracking).toEqual({ upstream: 'origin/main', ahead: 2, behind: 1 });
    expect(runner.calls).toEqual([['status', '--porcelain=v2', '--branch']]);
  });
});

describe('failure reporting', () => {
  it('surfaces git\'s own message with a stable code', async () => {
    const git = createGitService(
      recordingRunner({
        push: { stdout: '', stderr: 'fatal: No configured push destination.', exitCode: 128 },
      }),
    );

    await expect(git.push('/repo')).rejects.toMatchObject({
      code: 'git/no-upstream',
      exitCode: 128,
      stderr: 'fatal: No configured push destination.',
    });
    await expect(git.push('/repo')).rejects.toBeInstanceOf(GitError);
  });

  it('names the failing command, so the report is actionable', async () => {
    const git = createGitService(
      recordingRunner({ commit: { stdout: '', stderr: 'nothing to commit', exitCode: 1 } }),
    );

    await expect(git.commit('/repo', 'msg')).rejects.toMatchObject({
      args: ['commit', '-m', 'msg'],
    });
  });
});

describe('against a real repository', () => {
  let root = '';
  const git = createGitService(systemGitRunner);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'opera-incerta-git-'));
    await systemGitRunner.run(['init', '--initial-branch=main'], root);
    await systemGitRunner.run(['config', 'user.email', 'test@example.invalid'], root);
    await systemGitRunner.run(['config', 'user.name', 'Test'], root);
    await systemGitRunner.run(['config', 'commit.gpgsign', 'false'], root);
    await systemGitRunner.run(['config', 'core.autocrlf', 'false'], root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves the root from a subdirectory', async () => {
    await mkdir(join(root, 'book', 'chapters'), { recursive: true });
    const resolved = await git.repositoryRoot(join(root, 'book', 'chapters'));

    // Compared by suffix: macOS reaches the temporary directory through a
    // firmlink, so the two spellings differ (conventions.md C-F1).
    expect(resolved).not.toBeNull();
    expect(root.endsWith((resolved ?? '').split('/').at(-1) ?? '')).toBe(true);
  });

  it('reports an untracked file, then a staged one', async () => {
    await writeFile(join(root, 'chapter.md'), '# Chapter\n', 'utf8');
    const repositoryRoot = (await git.repositoryRoot(root)) ?? root;

    const untracked = await git.status(repositoryRoot);
    expect(untracked[0]).toMatchObject({ path: 'chapter.md', groups: ['untracked'] });

    await git.stage(repositoryRoot, ['chapter.md']);
    const staged = await git.status(repositoryRoot);
    expect(staged[0]).toMatchObject({ path: 'chapter.md', groups: ['staged'] });
  });

  it('unstages a file again', async () => {
    await writeFile(join(root, 'chapter.md'), '# Chapter\n', 'utf8');
    const repositoryRoot = (await git.repositoryRoot(root)) ?? root;
    await git.stage(repositoryRoot, ['chapter.md']);
    await git.unstage(repositoryRoot, ['chapter.md']);

    expect((await git.status(repositoryRoot))[0]?.groups).toEqual(['untracked']);
  });

  it('commits, leaving a clean tree', async () => {
    await writeFile(join(root, 'chapter.md'), '# Chapter\n', 'utf8');
    const repositoryRoot = (await git.repositoryRoot(root)) ?? root;
    await git.stage(repositoryRoot, ['chapter.md']);
    await git.commit(repositoryRoot, 'Add chapter');

    expect(await git.status(repositoryRoot)).toEqual([]);
  });

  it('handles a path with spaces and non-ASCII characters', async () => {
    await writeFile(join(root, 'Größe und Übermut.md'), 'text\n', 'utf8');
    const repositoryRoot = (await git.repositoryRoot(root)) ?? root;
    await git.stage(repositoryRoot, ['Größe und Übermut.md']);

    expect((await git.status(repositoryRoot))[0]).toMatchObject({
      path: 'Größe und Übermut.md',
      groups: ['staged'],
    });
  });

  it('fails a push without a remote, reporting git\'s message', async () => {
    const repositoryRoot = (await git.repositoryRoot(root)) ?? root;
    await expect(git.push(repositoryRoot)).rejects.toMatchObject({
      code: 'git/no-upstream',
    });
  });

  describe('showing what changed', () => {
    it('reports the change against the last commit', async () => {
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');
      await writeFile(join(root, 'a.md'), 'second\n', 'utf8');

      const diff = await git.diff(root, 'a.md', true);

      expect(diff).toContain('-first');
      expect(diff).toContain('+second');
    });

    it('shows a file with nothing behind it as entirely added', async () => {
      await writeFile(join(root, 'new.md'), 'a new line\n', 'utf8');

      // `--no-index` reports a difference with exit code 1; that is the normal
      // outcome here, not a failure.
      const diff = await git.diff(root, 'new.md', false);

      expect(diff).toContain('+a new line');
      expect(diff).not.toContain('-a new line');
    });

    it('says nothing about a file that has not changed', async () => {
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');

      expect(await git.diff(root, 'a.md', true)).toBe('');
    });
  });

  describe('discarding a change', () => {
    it('puts a tracked file back to its last committed state', async () => {
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');
      await writeFile(join(root, 'a.md'), 'changed by mistake\n', 'utf8');
      await git.stage(root, ['a.md']);

      await git.restore(root, ['a.md']);

      // Index and working tree together: half a restore leaves the file looking
      // unchanged while the index still carries the change.
      expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('first\n');
      expect(await git.status(root)).toEqual([]);
    });

    it('knows whether there is anything to go back to', async () => {
      expect(await git.hasCommit(root)).toBe(false);

      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');

      expect(await git.hasCommit(root)).toBe(true);
    });
  });
  describe('amending the last commit', () => {
    beforeEach(async () => {
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'the first message');
    });

    it('reads the message back, and reports none where there is no commit', async () => {
      expect(await git.lastCommitMessage(root)).toBe('the first message');

      const empty = await mkdtemp(join(tmpdir(), 'opera-incerta-empty-'));
      await systemGitRunner.run(['init', '--initial-branch=main'], empty);
      expect(await git.lastCommitMessage(empty)).toBeNull();
      await rm(empty, { recursive: true, force: true });
    });

    it('replaces the message without adding a commit', async () => {
      await git.amend(root, 'a better message');

      expect(await git.lastCommitMessage(root)).toBe('a better message');
      const count = await systemGitRunner.run(['rev-list', '--count', 'HEAD'], root);
      expect(count.stdout.trim()).toBe('1');
    });

    it('takes what is staged into the commit that is already there', async () => {
      await writeFile(join(root, 'b.md'), 'forgotten\n', 'utf8');
      await git.stage(root, ['b.md']);

      await git.amend(root, null);

      // The message is kept, the file joins the commit, and there is still one.
      expect(await git.lastCommitMessage(root)).toBe('the first message');
      expect(await git.status(root)).toEqual([]);
      const listed = await systemGitRunner.run(['ls-tree', '--name-only', 'HEAD'], root);
      expect(listed.stdout).toContain('b.md');
    });
  });

  describe('branches', () => {
    beforeEach(async () => {
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');
    });

    it('lists what there is, and which one is checked out', async () => {
      expect(await git.branches(root)).toEqual([{ name: 'main', current: true }]);
    });

    it('creates one at the current commit and switches to it', async () => {
      await git.createBranch(root, 'draft/chapter-3');

      expect(await git.currentBranch(root)).toBe('draft/chapter-3');
      expect(await git.branches(root)).toEqual([
        { name: 'draft/chapter-3', current: true },
        { name: 'main', current: false },
      ]);
      // Branched from here, so the file is still there.
      expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('first\n');
    });

    it('switches between them, and the working tree follows', async () => {
      await git.createBranch(root, 'draft');
      await writeFile(join(root, 'b.md'), 'only on the draft\n', 'utf8');
      await git.stage(root, ['b.md']);
      await git.commit(root, 'on the draft');

      await git.switchBranch(root, 'main');
      expect(existsSync(join(root, 'b.md'))).toBe(false);

      await git.switchBranch(root, 'draft');
      expect(existsSync(join(root, 'b.md'))).toBe(true);
    });

    it('refuses to delete work that is not merged', async () => {
      await git.createBranch(root, 'draft');
      await writeFile(join(root, 'b.md'), 'only on the draft\n', 'utf8');
      await git.stage(root, ['b.md']);
      await git.commit(root, 'on the draft');
      await git.switchBranch(root, 'main');

      // The safe delete only: losing a chapter to a click is not a thing this
      // application does.
      await expect(git.deleteBranch(root, 'draft')).rejects.toMatchObject({
        code: 'git/branch-not-merged',
      });
      expect((await git.branches(root)).map((branch) => branch.name)).toContain('draft');
    });

    it('deletes one whose work is already merged', async () => {
      await git.createBranch(root, 'spike');
      await git.switchBranch(root, 'main');

      await git.deleteBranch(root, 'spike');

      expect((await git.branches(root)).map((branch) => branch.name)).toEqual(['main']);
    });
  });

  describe('publishing a branch', () => {
    it('reports the branch, and no remote before there is one', async () => {
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');

      expect(await git.currentBranch(root)).toBe('main');
      expect(await git.defaultRemote(root)).toBeNull();
      expect(await git.tracking(root)).toBeNull();
    });

    it('records a remote and pushes the branch to it', async () => {
      const remote = join(await mkdtemp(join(tmpdir(), 'opera-incerta-publish-')), 'origin.git');
      await systemGitRunner.run(['init', '--bare', '--initial-branch=main', remote], tmpdir());
      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');

      await git.addRemote(root, 'origin', remote);
      expect(await git.defaultRemote(root)).toEqual({ name: 'origin', url: remote });

      await git.publish(root, 'origin', 'main');

      // Published means both: the commit is over there, and this branch knows
      // where it belongs.
      expect(await git.tracking(root)).toEqual({ upstream: 'origin/main', behind: 0, ahead: 0 });
      const listed = await systemGitRunner.run(['ls-tree', '--name-only', 'main'], remote);
      expect(listed.stdout).toContain('a.md');
      await rm(remote, { recursive: true, force: true });
    });

    it('prefers origin when several remotes exist', async () => {
      await systemGitRunner.run(['remote', 'add', 'backup', '/tmp/backup.git'], root);
      await systemGitRunner.run(['remote', 'add', 'origin', '/tmp/origin.git'], root);

      expect((await git.defaultRemote(root))?.name).toBe('origin');
    });
  });

  describe('tracking a remote', () => {
    let remote = '';
    let clone = '';

    beforeEach(async () => {
      remote = join(await mkdtemp(join(tmpdir(), 'opera-incerta-remote-')), 'origin.git');
      await systemGitRunner.run(['init', '--bare', '--initial-branch=main', remote], tmpdir());

      await writeFile(join(root, 'a.md'), 'first\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'first');
      await systemGitRunner.run(['remote', 'add', 'origin', remote], root);
      await systemGitRunner.run(['push', '-u', 'origin', 'main'], root);

      // A second working copy, standing in for the other machine.
      clone = join(await mkdtemp(join(tmpdir(), 'opera-incerta-clone-')), 'clone');
      await systemGitRunner.run(['clone', '--config', 'core.autocrlf=false', remote, clone], tmpdir());
      await systemGitRunner.run(['config', 'user.email', 'other@example.invalid'], clone);
      await systemGitRunner.run(['config', 'user.name', 'Other'], clone);
      await systemGitRunner.run(['config', 'commit.gpgsign', 'false'], clone);
    });

    afterEach(async () => {
      await rm(remote, { recursive: true, force: true });
      await rm(clone, { recursive: true, force: true });
    });

    it('reports the upstream, and nothing apart yet', async () => {
      expect(await git.tracking(root)).toEqual({ upstream: 'origin/main', behind: 0, ahead: 0 });
    });

    it('reports nothing at all for a branch that tracks nothing', async () => {
      const alone = await mkdtemp(join(tmpdir(), 'opera-incerta-alone-'));
      await systemGitRunner.run(['init', '--initial-branch=main'], alone);
      // This application never creates an upstream, so having none is normal.
      expect(await git.tracking(alone)).toBeNull();
      await rm(alone, { recursive: true, force: true });
    });

    it('sees the other machine’s commit only after fetching', async () => {
      await writeFile(join(clone, 'b.md'), 'from elsewhere\n', 'utf8');
      await systemGitRunner.run(['add', 'b.md'], clone);
      await systemGitRunner.run(['commit', '-m', 'from elsewhere'], clone);
      await systemGitRunner.run(['push'], clone);

      expect((await git.tracking(root))?.behind).toBe(0);

      await git.fetch(root);

      // Fetching changes what is known, and no file in the working tree.
      expect((await git.tracking(root))?.behind).toBe(1);
      expect(existsSync(join(root, 'b.md'))).toBe(false);
    });

    it('brings the commit in with a fast-forward', async () => {
      await writeFile(join(clone, 'b.md'), 'from elsewhere\n', 'utf8');
      await systemGitRunner.run(['add', 'b.md'], clone);
      await systemGitRunner.run(['commit', '-m', 'from elsewhere'], clone);
      await systemGitRunner.run(['push'], clone);
      await git.fetch(root);

      await git.pull(root);

      expect(await readFile(join(root, 'b.md'), 'utf8')).toBe('from elsewhere\n');
      expect(await git.tracking(root)).toEqual({ upstream: 'origin/main', behind: 0, ahead: 0 });
    });

    it('merges when asked explicitly, leaving the conflicts marked', async () => {
      await writeFile(join(clone, 'a.md'), 'from elsewhere\n', 'utf8');
      await systemGitRunner.run(['commit', '-am', 'from elsewhere'], clone);
      await systemGitRunner.run(['push'], clone);

      await writeFile(join(root, 'a.md'), 'from here\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'from here');
      await git.fetch(root);

      await expect(git.merge(root)).rejects.toMatchObject({ code: 'git/conflict' });

      // The merge is under way and unfinished: the file carries both versions.
      expect(await git.isMerging(root)).toBe(true);
      const merged = await readFile(join(root, 'a.md'), 'utf8');
      expect(merged).toContain('from here');
      expect(merged).toContain('from elsewhere');
      expect(merged).toContain('<<<<<<<');
    });

    it('puts everything back when the merge is abandoned', async () => {
      await writeFile(join(clone, 'a.md'), 'from elsewhere\n', 'utf8');
      await systemGitRunner.run(['commit', '-am', 'from elsewhere'], clone);
      await systemGitRunner.run(['push'], clone);

      await writeFile(join(root, 'a.md'), 'from here\n', 'utf8');
      await git.stage(root, ['a.md']);
      await git.commit(root, 'from here');
      await git.fetch(root);
      await git.merge(root).catch(() => undefined);

      await git.abortMerge(root);

      expect(await git.isMerging(root)).toBe(false);
      expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('from here\n');
      expect(await git.status(root)).toEqual([]);
    });

    it('merges cleanly when the two sides touched different files', async () => {
      await writeFile(join(clone, 'b.md'), 'from elsewhere\n', 'utf8');
      await systemGitRunner.run(['add', 'b.md'], clone);
      await systemGitRunner.run(['commit', '-m', 'from elsewhere'], clone);
      await systemGitRunner.run(['push'], clone);

      await writeFile(join(root, 'c.md'), 'from here\n', 'utf8');
      await git.stage(root, ['c.md']);
      await git.commit(root, 'from here');
      await git.fetch(root);

      await git.merge(root);

      expect(await git.isMerging(root)).toBe(false);
      expect(existsSync(join(root, 'b.md'))).toBe(true);
      expect(existsSync(join(root, 'c.md'))).toBe(true);
    });

    it('refuses rather than merging when the histories have diverged', async () => {
      await writeFile(join(clone, 'b.md'), 'from elsewhere\n', 'utf8');
      await systemGitRunner.run(['add', 'b.md'], clone);
      await systemGitRunner.run(['commit', '-m', 'from elsewhere'], clone);
      await systemGitRunner.run(['push'], clone);

      await writeFile(join(root, 'c.md'), 'from here\n', 'utf8');
      await git.stage(root, ['c.md']);
      await git.commit(root, 'from here');
      await git.fetch(root);

      // A merge could conflict, and resolving conflicts is not part of this
      // stage: git's refusal is the answer the author gets.
      await expect(git.pull(root)).rejects.toMatchObject({ code: 'git/not-fast-forward' });
      expect(existsSync(join(root, 'b.md'))).toBe(false);
    });
  });
});

describe('what a failure says', () => {
  it('is what Git wrote, because that is what tells the author what to do', () => {
    const error = new GitError(['push'], {
      exitCode: 128,
      stdout: '',
      stderr: "fatal: No configured push destination.\n",
    });

    expect(error.message).toBe('fatal: No configured push destination.');
    // And the code names what the words say, so the interface can act on it.
    expect(error.code).toBe('git/no-upstream');
  });

  it('falls back to a summary when Git said nothing at all', () => {
    const error = new GitError(['status'], { exitCode: 3, stdout: '', stderr: '  ' });
    expect(error.message).toBe('git status failed with 3');
    expect(error.code).toBe('git/command-failed');
  });
});
