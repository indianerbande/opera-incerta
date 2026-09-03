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
    onRepositoryChange?: (listener: () => void) => () => void;
    discard?: (request: { paths: readonly string[] }) => BridgeResult<readonly string[]>;
    diff?: () => BridgeResult<string>;
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
    ...(script.onRepositoryChange === undefined
      ? {}
      : { onRepositoryChange: script.onRepositoryChange }),
    calls,
    gitStatus: async () => (script.status ?? status)(),
    gitDiff: async () => script.diff?.() ?? { ok: true, value: '' },
    gitDiscard: async (request) =>
      script.discard?.(request) ?? { ok: true, value: [] as readonly string[] },
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

    expect(store.failure()).toBe('boom');
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
    expect(store.failure()).toBe('no upstream');
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
    expect(store.failure()).toBe('nothing to commit');
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

describe('watching the repository', () => {
  it('reads the status again when the working tree changed', async () => {
    let listener: (() => void) | null = null;
    let reads = 0;
    const store = new SourceControlStore(
      fakeBridge({
        status: () => {
          reads += 1;
          return { ok: true, value: { root: '/book', entries: [] } };
        },
        onRepositoryChange: (each) => {
          listener = each;
          return () => (listener = null);
        },
      }),
    );
    const stop = store.listenForRepositoryChanges();
    const notify = listener as unknown as (() => void) | null;
    expect(notify).not.toBeNull();

    notify?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reads).toBe(1);
    stop();
  });

  it('does nothing without a bridge, rather than failing', () => {
    const store = new SourceControlStore(null);
    expect(() => store.listenForRepositoryChanges()()).not.toThrow();
  });
});

describe('discarding a change', () => {
  it('reports back which sheets the editor must forget', async () => {
    let asked: unknown = null;
    const store = new SourceControlStore(
      fakeBridge({
        discard: (request) => {
          asked = request;
          return { ok: true, value: ['part-1/scene.md'] };
        },
      }),
    );

    expect(await store.discard(['book/part-1/scene.md'])).toEqual(['part-1/scene.md']);
    expect(asked).toEqual({ paths: ['book/part-1/scene.md'] });
  });

  it('asks for nothing when there is nothing to discard', async () => {
    const store = new SourceControlStore(fakeBridge());
    expect(await store.discard([])).toEqual([]);
  });

  it('reports a refusal and forgets nothing', async () => {
    const store = new SourceControlStore(
      fakeBridge({
        discard: () => ({ ok: false, code: 'git/command-failed', message: 'is not tracked' }),
      }),
    );

    expect(await store.discard(['a.md'])).toEqual([]);
    expect(store.failure()).toBe('is not tracked');
  });
});

describe('showing what changed', () => {
  it('hands Git’s text back unchanged', async () => {
    const text = 'diff --git a/a.md b/a.md\n@@ -1 +1 @@\n-one\n+two\n';
    const store = new SourceControlStore(fakeBridge({ diff: () => ({ ok: true, value: text }) }));

    expect(await store.diff('a.md')).toBe(text);
  });

  it('reports a refusal and shows nothing', async () => {
    const store = new SourceControlStore(
      fakeBridge({
        diff: () => ({ ok: false, code: 'git/command-failed', message: 'unknown revision' }),
      }),
    );

    expect(await store.diff('a.md')).toBeNull();
    expect(store.failure()).toBe('unknown revision');
  });

  it('does not wait behind a write, because it changes nothing', async () => {
    const store = new SourceControlStore(
      fakeBridge({
        commit: () => ({ ok: true, value: null }),
        diff: () => ({ ok: true, value: 'read while a write was running' }),
      }),
    );
    await store.refresh();
    store.setMessage('a commit');

    // Started but not awaited: a shared guard would make the read below wait
    // for it, which presents as "the click did nothing" (C-F3).
    const committing = store.commit();
    expect(await store.diff('a.md')).toBe('read while a write was running');
    await committing;
  });
});
