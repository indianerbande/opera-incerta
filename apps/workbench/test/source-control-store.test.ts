import { describe, expect, it } from 'vitest';
import { parseGitStatus } from '@opera-incerta/core';
import type { BridgeResult, OperaIncertaBridge } from '@opera-incerta/desktop-contract';
import { SourceControlStore } from '../src/app/workspace/source-control-store.js';
import { baseBridge } from './fake-bridge.js';

/** NUL-separated porcelain output, as git produces it. */
function porcelain(...fields: readonly string[]): string {
  return fields.map((field) => `${field}\0`).join('');
}

interface Recorder {
  readonly calls: string[];
}

function fakeBridge(
  script: {
    status?: () => BridgeResult<{ root: string | null; entries: readonly unknown[] }>;
    commit?: () => BridgeResult<null>;
    push?: () => BridgeResult<null>;
  } = {},
): OperaIncertaBridge & Recorder {
  const calls: string[] = [];
  let staged = new Set<string>();

  const status = (): BridgeResult<{ root: string | null; entries: readonly unknown[] }> => {
    const entries = parseGitStatus(
      porcelain(
        `${staged.has('a.md') ? 'M ' : ' M'} a.md`,
        `${staged.has('b.md') ? 'A ' : '??'} b.md`,
      ),
    );
    return { ok: true, value: { root: '/repo', entries } };
  };

  return {
    ...baseBridge(),
    calls,
    gitStatus: async () => (script.status ?? status)(),
    gitStage: async (request) => {
      calls.push(`stage:${request.paths.join(',')}`);
      staged = new Set([...staged, ...request.paths]);
      return { ok: true, value: null };
    },
    gitUnstage: async (request) => {
      calls.push(`unstage:${request.paths.join(',')}`);
      staged = new Set([...staged].filter((path) => !request.paths.includes(path)));
      return { ok: true, value: null };
    },
    gitCommit: async (request) => {
      calls.push(`commit:${request.message}`);
      return script.commit?.() ?? { ok: true, value: null };
    },
    gitPush: async () => {
      calls.push('push');
      return script.push?.() ?? { ok: true, value: null };
    },
  };
}

describe('reading status', () => {
  it('reports the repository root and the changed files', async () => {
    const store = new SourceControlStore(fakeBridge());
    await store.refresh();

    expect(store.repositoryRoot()).toBe('/repo');
    expect(store.entries().map((entry) => entry.path)).toEqual(['a.md', 'b.md']);
  });

  it('treats a project outside a repository as a state, not a failure', async () => {
    const store = new SourceControlStore(
      fakeBridge({ status: () => ({ ok: true, value: { root: null, entries: [] } }) }),
    );
    await store.refresh();

    expect(store.repositoryRoot()).toBeNull();
    expect(store.failure()).toBeNull();
    expect(store.loaded()).toBe(true);
  });

  it('reports a failure with the code the main process sent', async () => {
    const store = new SourceControlStore(
      fakeBridge({
        status: () => ({ ok: false, code: 'git/command-failed', message: 'boom' }),
      }),
    );
    await store.refresh();

    expect(store.failure()).toBe('git/command-failed');
  });
});

describe('staging', () => {
  it('stages one file and re-reads', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();

    const entry = store.entries()[0];
    if (entry === undefined) {
      throw new Error('no entry');
    }
    await store.toggle(entry);

    expect(bridge.calls).toContain('stage:a.md');
    expect(store.entries()[0]?.groups).toContain('staged');
  });

  it('unstages a staged file', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();
    const entry = store.entries()[0];
    if (entry === undefined) {
      throw new Error('no entry');
    }

    await store.toggle(entry);
    await store.toggle(store.entries()[0] as never);

    expect(bridge.calls).toEqual(['stage:a.md', 'unstage:a.md']);
  });

  it('stages everything in one invocation, not one per file', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggleAll();

    expect(bridge.calls).toEqual(['stage:a.md,b.md']);
    expect(store.selectAll()).toBe('all');
  });

  it('unstages everything in one invocation when all are staged', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggleAll();
    await store.toggleAll();

    expect(bridge.calls).toEqual(['stage:a.md,b.md', 'unstage:a.md,b.md']);
    expect(store.selectAll()).toBe('none');
  });

  it('reports the tri-state while only some are staged', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggle(store.entries()[0] as never);

    expect(store.selectAll()).toBe('some');
  });
});

describe('committing', () => {
  it('refuses without staged changes or without a message', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();

    expect(store.canCommit()).toBe(false);
    store.setMessage('Add chapter');
    expect(store.canCommit()).toBe(false);

    await store.toggleAll();
    expect(store.canCommit()).toBe(true);

    store.setMessage('   ');
    expect(store.canCommit()).toBe(false);
  });

  it('commits and clears the message', async () => {
    const bridge = fakeBridge();
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggleAll();
    store.setMessage('Add chapter');
    await store.commit();

    expect(bridge.calls).toContain('commit:Add chapter');
    expect(store.message()).toBe('');
  });

  it('keeps the commit and clears the message when only the push fails', async () => {
    // SPEC.md §12: the commit stands, and only the push failure is reported.
    const bridge = fakeBridge({
      push: () => ({ ok: false, code: 'git/command-failed', message: 'no upstream' }),
    });
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggleAll();
    store.setMessage('Add chapter');
    await store.commitAndPush();

    expect(bridge.calls).toContain('commit:Add chapter');
    expect(bridge.calls).toContain('push');
    expect(store.message()).toBe('');
    expect(store.failure()).toBe('git/command-failed');
  });

  it('does not push when the commit itself failed', async () => {
    const bridge = fakeBridge({
      commit: () => ({ ok: false, code: 'git/command-failed', message: 'nothing to commit' }),
    });
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggleAll();
    store.setMessage('Add chapter');
    await store.commitAndPush();

    expect(bridge.calls).not.toContain('push');
    expect(store.failure()).toBe('git/command-failed');
  });
});

describe('without a shell', () => {
  it('reports the absent bridge on a write instead of doing nothing', async () => {
    const store = new SourceControlStore(null);
    await store.toggle({
      path: 'a.md',
      indexStatus: ' ',
      worktreeStatus: 'M',
      groups: ['unstaged'],
    });

    expect(store.failure()).toBe('bridge/absent');
  });

  it('does nothing at all when there is nothing to stage', async () => {
    const bridge = fakeBridge({ status: () => ({ ok: true, value: { root: '/repo', entries: [] } }) });
    const store = new SourceControlStore(bridge);
    await store.refresh();
    await store.toggleAll();

    expect(bridge.calls).toEqual([]);
    expect(store.failure()).toBeNull();
  });
});
