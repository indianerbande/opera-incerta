/**
 * Source control over the locally installed `git` executable. SPEC.md §12.
 *
 * No Git library dependency and no bundled binary: the author's own Git, with
 * their own credentials and configuration, is what synchronizes their
 * manuscript (CONVENTIONS.md C-P10). This module is a thin process wrapper —
 * the parsing lives in the portable core.
 */
import { execFile } from 'node:child_process';
import { parseGitStatus, type GitFileStatus } from '@opera-incerta/core';
import type { GitBranch, GitRemote, GitService, GitTracking } from './index.js';

export interface GitCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** The single point where a process is started, so tests can substitute it. */
export interface GitCommandRunner {
  run(args: readonly string[], cwd: string): Promise<GitCommandResult>;
}

/**
 * A failed Git invocation, carrying Git's own message unchanged.
 *
 * The `message` **is** what Git wrote, because that is what reaches the author
 * (SPEC.md §12): "does not appear to be a git repository" tells them what to
 * do, while a summary of the exit code tells them nothing. The summary is the
 * fallback for a command that failed without saying anything.
 */
export class GitError extends Error {
  readonly code = 'git/command-failed';
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: readonly string[], result: GitCommandResult) {
    super(result.stderr.trim() === ''
      ? `git ${args.join(' ')} failed with ${result.exitCode}`
      : result.stderr.trim());
    this.name = 'GitError';
    this.args = args;
    this.exitCode = result.exitCode;
    this.stderr = result.stderr;
  }
}

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export const systemGitRunner: GitCommandRunner = {
  run(args, cwd) {
    return new Promise((resolve) => {
      execFile(
        'git',
        [...args],
        { cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          const exitCode =
            error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
          resolve({ stdout, stderr, exitCode });
        },
      );
    });
  },
};

export function createGitService(runner: GitCommandRunner = systemGitRunner): GitService {
  return new ProcessGitService(runner);
}

class ProcessGitService implements GitService {
  readonly #runner: GitCommandRunner;

  constructor(runner: GitCommandRunner) {
    this.#runner = runner;
  }

  /**
   * Resolves the repository root, or null when the path is not in a
   * repository. Every other call is made against this root, because porcelain
   * paths are relative to it and can point outside the project directory
   * (SPEC.md §12).
   */
  async repositoryRoot(absolutePath: string): Promise<string | null> {
    const result = await this.#runner.run(['rev-parse', '--show-toplevel'], absolutePath);
    if (result.exitCode !== 0) {
      return null;
    }
    const root = result.stdout.trim();
    return root === '' ? null : root;
  }

  async status(repositoryRoot: string): Promise<readonly GitFileStatus[]> {
    const result = await this.#run(['status', '--porcelain=v1', '-z'], repositoryRoot);
    return parseGitStatus(result.stdout);
  }

  /**
   * Stages every path in one invocation, so the caller's in-flight guard
   * applies once to the whole action rather than per file (SPEC.md §12).
   * `--` separates paths from options, so a file named like a flag is safe.
   */
  async stage(repositoryRoot: string, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.#run(['add', '--', ...paths], repositoryRoot);
  }

  /**
   * Takes paths out of the index.
   *
   * `git restore --staged` resolves against `HEAD`, which does not exist in a
   * repository without a first commit — exactly the state a freshly created
   * project is in. There the file is simply removed from the index instead,
   * which is the same outcome for something that was never committed.
   */
  async unstage(repositoryRoot: string, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    if (await this.#hasCommit(repositoryRoot)) {
      await this.#run(['restore', '--staged', '--', ...paths], repositoryRoot);
      return;
    }
    await this.#run(['rm', '--cached', '--quiet', '--', ...paths], repositoryRoot);
  }

  async restore(repositoryRoot: string, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    // Index and working tree together: half a restore would leave the file
    // looking unchanged while still carrying the change in the index.
    await this.#run(['restore', '--staged', '--worktree', '--', ...paths], repositoryRoot);
  }

  async diff(repositoryRoot: string, path: string, tracked: boolean): Promise<string> {
    // `--no-ext-diff` because a configured difftool would otherwise decide
    // what this returns, and `--no-color` because the colours are the
    // interface's business, not Git's.
    const common = ['--no-ext-diff', '--no-color', '--'];
    if (tracked && (await this.#hasCommit(repositoryRoot))) {
      return (await this.#run(['diff', 'HEAD', ...common, path], repositoryRoot)).stdout;
    }

    // Nothing to compare against: the whole file is the change. `--no-index`
    // reports a difference with exit code 1, which here is the normal outcome
    // rather than a failure.
    const result = await this.#runner.run(
      ['diff', '--no-ext-diff', '--no-color', '--no-index', '--', '/dev/null', path],
      repositoryRoot,
    );
    if (result.exitCode > 1) {
      throw new GitError(['diff', '--no-index', path], result);
    }
    return result.stdout;
  }

  async tracking(repositoryRoot: string): Promise<GitTracking | null> {
    const named = await this.#runner.run(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      repositoryRoot,
    );
    if (named.exitCode !== 0) {
      // No upstream is a normal state, not a failure: this application never
      // creates one (SPEC.md §12).
      return null;
    }

    const counted = await this.#runner.run(
      ['rev-list', '--left-right', '--count', '@{u}...HEAD'],
      repositoryRoot,
    );
    if (counted.exitCode !== 0) {
      return null;
    }
    const [behind, ahead] = counted.stdout.trim().split(/\s+/u).map(Number);
    return {
      upstream: named.stdout.trim(),
      behind: Number.isFinite(behind) ? (behind as number) : 0,
      ahead: Number.isFinite(ahead) ? (ahead as number) : 0,
    };
  }

  async currentBranch(repositoryRoot: string): Promise<string | null> {
    const result = await this.#runner.run(['symbolic-ref', '--short', 'HEAD'], repositoryRoot);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async branches(repositoryRoot: string): Promise<readonly GitBranch[]> {
    const result = await this.#runner.run(
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      repositoryRoot,
    );
    if (result.exitCode !== 0) {
      // A repository without a commit has no branch yet, which is not a
      // failure.
      return [];
    }

    const current = await this.currentBranch(repositoryRoot);
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((name) => name !== '')
      .map((name) => ({ name, current: name === current }));
  }

  async createBranch(repositoryRoot: string, name: string): Promise<void> {
    // No separator here: `git switch --create` reads `--` as the start of
    // pathspecs and `--end-of-options` as a start point, and refuses both.
    // The name is checked against `isValidBranchName` before it gets here,
    // which is what keeps a name beginning with `-` out (SPEC.md §12).
    await this.#run(['switch', '--create', name], repositoryRoot);
  }

  async switchBranch(repositoryRoot: string, name: string): Promise<void> {
    await this.#run(['switch', '--end-of-options', name], repositoryRoot);
  }

  async deleteBranch(repositoryRoot: string, name: string): Promise<void> {
    // `-d`, never `-D`: git refuses a branch whose work is not merged, and
    // that refusal is exactly what the author needs to see (SPEC.md §12).
    await this.#run(['branch', '--delete', '--end-of-options', name], repositoryRoot);
  }

  async defaultRemote(repositoryRoot: string): Promise<GitRemote | null> {
    const result = await this.#runner.run(['remote', '-v'], repositoryRoot);
    if (result.exitCode !== 0) {
      return null;
    }

    const remotes = new Map<string, string>();
    for (const line of result.stdout.split('\n')) {
      const [name, rest] = line.split('\t');
      const url = rest?.split(' ')[0];
      if (name !== undefined && name !== '' && url !== undefined && !remotes.has(name)) {
        remotes.set(name, url);
      }
    }

    const origin = remotes.get('origin');
    if (origin !== undefined) {
      return { name: 'origin', url: origin };
    }
    const [first] = remotes;
    return first === undefined ? null : { name: first[0], url: first[1] };
  }

  async addRemote(repositoryRoot: string, name: string, url: string): Promise<void> {
    // `--` so that an address is never read as an option, whatever it starts
    // with. The core refuses those addresses as well (SPEC.md §12).
    await this.#run(['remote', 'add', '--', name, url], repositoryRoot);
  }

  async publish(repositoryRoot: string, remote: string, branch: string): Promise<void> {
    await this.#run(['push', '--set-upstream', '--', remote, branch], repositoryRoot);
  }

  async fetch(repositoryRoot: string): Promise<void> {
    await this.#run(['fetch'], repositoryRoot);
  }

  async pull(repositoryRoot: string): Promise<void> {
    // Never a merge: where a fast-forward is impossible, git refuses and says
    // so, and that refusal is what the author is shown (SPEC.md §12).
    await this.#run(['pull', '--ff-only'], repositoryRoot);
  }

  async merge(repositoryRoot: string): Promise<void> {
    // The plain marker style, so that what lands in the file is the form the
    // parser is tested against rather than whatever the machine is configured
    // for. `--no-edit` because the message is git's own and there is no editor
    // to open here.
    await this.#run(
      ['-c', 'merge.conflictStyle=merge', 'pull', '--no-rebase', '--no-edit'],
      repositoryRoot,
    );
  }

  async isMerging(repositoryRoot: string): Promise<boolean> {
    const result = await this.#runner.run(
      ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'],
      repositoryRoot,
    );
    return result.exitCode === 0;
  }

  async abortMerge(repositoryRoot: string): Promise<void> {
    await this.#run(['merge', '--abort'], repositoryRoot);
  }

  async showAtHead(repositoryRoot: string, path: string): Promise<string | null> {
    // A path the commit does not carry is a normal answer, not a failure: it
    // is what a new file looks like.
    const result = await this.#runner.run(['show', `HEAD:${path}`], repositoryRoot);
    return result.exitCode === 0 ? result.stdout : null;
  }

  async hasCommit(repositoryRoot: string): Promise<boolean> {
    return this.#hasCommit(repositoryRoot);
  }

  async #hasCommit(repositoryRoot: string): Promise<boolean> {
    const result = await this.#runner.run(['rev-parse', '--verify', 'HEAD'], repositoryRoot);
    return result.exitCode === 0;
  }

  async commit(repositoryRoot: string, message: string): Promise<void> {
    await this.#run(['commit', '-m', message], repositoryRoot);
  }

  /**
   * Pushes with the author's own credentials and configuration.
   *
   * Deliberately no `--set-upstream`, no pull, no fetch: a missing remote or a
   * failed authentication surfaces Git's own message rather than the
   * application inventing a remote layout (SPEC.md §12).
   */
  async push(repositoryRoot: string): Promise<void> {
    await this.#run(['push'], repositoryRoot);
  }

  async #run(args: readonly string[], cwd: string): Promise<GitCommandResult> {
    const result = await this.#runner.run(args, cwd);
    if (result.exitCode !== 0) {
      throw new GitError(args, result);
    }
    return result;
  }
}
