/**
 * Source control over the locally installed `git` executable. specification.md §12.
 *
 * No Git library dependency and no bundled binary: the author's own Git, with
 * their own credentials and configuration, is what synchronizes their
 * manuscript (conventions.md C-P10). This module is a thin process wrapper —
 * the parsing lives in the portable core.
 */
import { execFile } from 'node:child_process';
import {
  CodedError,
  classifyGitFailure,
  parseGitStatus,
  parseTrackingHeader,
  type GitBranch,
  type GitFileStatus,
  type GitIdentity,
  type GitRemote,
  type GitTracking,
} from '@opera-incerta/core';
import type { GitService } from './index.js';

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
 * (specification.md §12): "does not appear to be a git repository" tells them what to
 * do, while a summary of the exit code tells them nothing. The summary is the
 * fallback for a command that failed without saying anything. The `code` is
 * for the interface, read from the same words (`classifyGitFailure`): it can
 * offer publishing for `git/no-upstream` and merging for
 * `git/not-fast-forward`, where one code for everything left it nothing to
 * act on.
 */
export class GitError extends CodedError {
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: readonly string[], result: GitCommandResult) {
    super(
      // Both streams: a merge writes "CONFLICT" and "Automatic merge failed"
      // to stdout, and only the rest to stderr.
      classifyGitFailure(`${result.stderr}\n${result.stdout}`),
      result.stderr.trim() === ''
        ? `git ${args.join(' ')} failed with ${result.exitCode}`
        : result.stderr.trim(),
    );
    this.name = 'GitError';
    this.args = args;
    this.exitCode = result.exitCode;
    this.stderr = result.stderr;
  }
}

/**
 * There is no git to run. specification.md §12, conventions.md C-P10.
 *
 * Its own code, because it is not a property of any command or repository:
 * a machine without git must not look like a project outside a repository,
 * which is what an exit code of 1 with empty stderr used to become. The
 * message is empty on purpose — there are no words of git's to pass on, and
 * the interface words the code itself.
 */
export class GitUnavailableError extends CodedError {
  constructor() {
    super('git/not-installed');
    this.name = 'GitUnavailableError';
  }
}

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export const systemGitRunner: GitCommandRunner = {
  run(args, cwd) {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        [...args],
        { cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          if (error !== null && error.code === 'ENOENT') {
            // The executable, not a file it was asked about: `git` itself
            // was not found on the path.
            reject(new GitUnavailableError());
            return;
          }
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
  /**
   * One command at a time per directory. specification.md §12.
   *
   * Every bridge handler runs concurrently, and two git processes in one
   * repository at once — a status refresh racing a commit — fail on
   * `index.lock` with a message the author cannot act on. The queue is the
   * tail of the last invocation for that directory; a new one waits for it,
   * succeed or fail. Reads wait too: a status behind a push is late, and a
   * status beside a push is a lock error.
   */
  readonly #queues = new Map<string, Promise<unknown>>();

  constructor(runner: GitCommandRunner) {
    this.#runner = runner;
  }

  /**
   * Resolves the repository root, or null when the path is not in a
   * repository. Every other call is made against this root, because porcelain
   * paths are relative to it and can point outside the project directory
   * (specification.md §12).
   */
  async repositoryRoot(absolutePath: string): Promise<string | null> {
    const result = await this.#invoke(['rev-parse', '--show-toplevel'], absolutePath);
    if (result.exitCode !== 0) {
      return null;
    }
    const root = result.stdout.trim();
    return root === '' ? null : root;
  }

  async init(absolutePath: string): Promise<void> {
    // `--initial-branch` needs git 2.28 (2020); older gits are not a target.
    await this.#run(['init', '--initial-branch=main'], absolutePath);
  }

  async status(repositoryRoot: string): Promise<readonly GitFileStatus[]> {
    const result = await this.#run(['status', '--porcelain=v1', '-z'], repositoryRoot);
    return parseGitStatus(result.stdout);
  }

  /**
   * Stages every path in one invocation, so the caller's in-flight guard
   * applies once to the whole action rather than per file (specification.md §12).
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
    if (await this.hasCommit(repositoryRoot)) {
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
    if (tracked && (await this.hasCommit(repositoryRoot))) {
      return (await this.#run(['diff', 'HEAD', ...common, path], repositoryRoot)).stdout;
    }

    // Nothing to compare against: the whole file is the change. `--no-index`
    // reports a difference with exit code 1, which here is the normal outcome
    // rather than a failure.
    const result = await this.#invoke(
      ['diff', '--no-ext-diff', '--no-color', '--no-index', '--', '/dev/null', path],
      repositoryRoot,
    );
    if (result.exitCode > 1) {
      throw new GitError(['diff', '--no-index', path], result);
    }
    return result.stdout;
  }

  async tracking(repositoryRoot: string): Promise<GitTracking | null> {
    // One command: the branch header of porcelain v2 carries the upstream and
    // the drift. No upstream is a normal state, not a failure — this
    // application creates one only when asked to publish (specification.md §12).
    const result = await this.#invoke(['status', '--porcelain=v2', '--branch'], repositoryRoot);
    return result.exitCode === 0 ? parseTrackingHeader(result.stdout) : null;
  }

  async currentBranch(repositoryRoot: string): Promise<string | null> {
    const result = await this.#invoke(['symbolic-ref', '--short', 'HEAD'], repositoryRoot);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async branches(repositoryRoot: string): Promise<readonly GitBranch[]> {
    const result = await this.#invoke(
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
    // which is what keeps a name beginning with `-` out (specification.md §12).
    await this.#run(['switch', '--create', name], repositoryRoot);
  }

  async switchBranch(repositoryRoot: string, name: string): Promise<void> {
    await this.#run(['switch', '--end-of-options', name], repositoryRoot);
  }

  async deleteBranch(repositoryRoot: string, name: string): Promise<void> {
    // `-d`, never `-D`: git refuses a branch whose work is not merged, and
    // that refusal is exactly what the author needs to see (specification.md §12).
    await this.#run(['branch', '--delete', '--end-of-options', name], repositoryRoot);
  }

  async identity(
    absolutePath: string,
    scope: 'global' | 'local',
  ): Promise<GitIdentity | null> {
    // Exit code 1 means the key is unset; a missing global file counts as
    // unset too, which is the case for an author who has never used git.
    const name = await this.#invoke(['config', `--${scope}`, '--get', 'user.name'], absolutePath);
    const email = await this.#invoke(['config', `--${scope}`, '--get', 'user.email'], absolutePath);
    if (name.exitCode !== 0 || email.exitCode !== 0) {
      return null;
    }
    const identity = { name: name.stdout.trim(), email: email.stdout.trim() };
    return identity.name === '' || identity.email === '' ? null : identity;
  }

  async setIdentity(repositoryRoot: string, identity: GitIdentity): Promise<void> {
    await this.#run(['config', '--local', 'user.name', identity.name], repositoryRoot);
    await this.#run(['config', '--local', 'user.email', identity.email], repositoryRoot);
  }

  async defaultRemote(repositoryRoot: string): Promise<GitRemote | null> {
    // From the configuration rather than `remote -v`, whose lines end in
    // ` (fetch)` and were split on a space — which cut a local path with a
    // space in it. Exit code 1 means no remote is configured.
    const result = await this.#invoke(
      ['config', '--get-regexp', '^remote\\..*\\.url$'],
      repositoryRoot,
    );
    if (result.exitCode !== 0) {
      return null;
    }

    const remotes = new Map<string, string>();
    for (const line of result.stdout.split('\n')) {
      const match = /^remote\.(.+)\.url (.*)$/u.exec(line);
      if (match !== null && !remotes.has(match[1] ?? '')) {
        remotes.set(match[1] ?? '', match[2] ?? '');
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
    // with. The core refuses those addresses as well (specification.md §12).
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
    // so, and that refusal is what the author is shown (specification.md §12).
    await this.#run(['pull', '--ff-only'], repositoryRoot);
  }

  async lastCommitMessage(repositoryRoot: string): Promise<string | null> {
    const result = await this.#invoke(['log', '-1', '--pretty=%B'], repositoryRoot);
    return result.exitCode === 0 ? result.stdout.replace(/\n+$/u, '') : null;
  }

  async amend(repositoryRoot: string, message: string | null): Promise<void> {
    const argv =
      message === null
        ? ['commit', '--amend', '--no-edit']
        : ['commit', '--amend', '--message', message];
    await this.#run(argv, repositoryRoot);
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
    const result = await this.#invoke(
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
    const result = await this.#invoke(['show', `HEAD:${path}`], repositoryRoot);
    return result.exitCode === 0 ? result.stdout : null;
  }

  async hasCommit(repositoryRoot: string): Promise<boolean> {
    const result = await this.#invoke(['rev-parse', '--verify', 'HEAD'], repositoryRoot);
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
   * application inventing a remote layout (specification.md §12).
   */
  async push(repositoryRoot: string): Promise<void> {
    await this.#run(['push'], repositoryRoot);
  }

  /** Runs a command and turns a non-zero exit into a `GitError`. */
  async #run(args: readonly string[], cwd: string): Promise<GitCommandResult> {
    const result = await this.#invoke(args, cwd);
    if (result.exitCode !== 0) {
      throw new GitError(args, result);
    }
    return result;
  }

  /**
   * The one place a process is started: behind the directory's queue, so two
   * commands never run in one repository at once.
   */
  #invoke(args: readonly string[], cwd: string): Promise<GitCommandResult> {
    const previous = this.#queues.get(cwd) ?? Promise.resolve();
    const next = previous.then(
      () => this.#runner.run(args, cwd),
      () => this.#runner.run(args, cwd),
    );
    // The queue must not stay rejected: a later command waits for the tail,
    // whatever became of the one before it.
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    this.#queues.set(cwd, settled);
    void settled.then(() => {
      if (this.#queues.get(cwd) === settled) {
        this.#queues.delete(cwd);
      }
    });
    return next;
  }
}
