import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GitError,
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

describe('failure reporting', () => {
  it('surfaces git\'s own message with a stable code', async () => {
    const git = createGitService(
      recordingRunner({
        push: { stdout: '', stderr: 'fatal: No configured push destination.', exitCode: 128 },
      }),
    );

    await expect(git.push('/repo')).rejects.toMatchObject({
      code: 'git/command-failed',
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
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves the root from a subdirectory', async () => {
    await mkdir(join(root, 'book', 'chapters'), { recursive: true });
    const resolved = await git.repositoryRoot(join(root, 'book', 'chapters'));

    // Compared by suffix: macOS reaches the temporary directory through a
    // firmlink, so the two spellings differ (CONVENTIONS.md C-F1).
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
      code: 'git/command-failed',
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
    expect(error.code).toBe('git/command-failed');
  });

  it('falls back to a summary when Git said nothing at all', () => {
    const error = new GitError(['status'], { exitCode: 3, stdout: '', stderr: '  ' });
    expect(error.message).toBe('git status failed with 3');
  });
});
