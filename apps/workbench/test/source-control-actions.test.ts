import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { parseGitStatus, type GitFileStatus, type GroupEntry } from '@opera-incerta/core';
import type { OperaIncertaBridge, ProjectSnapshot } from '@opera-incerta/desktop-contract';
import type { Overlay } from '../src/app/shell/overlay.js';
import { SourceControlActions } from '../src/app/workspace/source-control-actions.js';
import { SourceControlStore } from '../src/app/workspace/source-control-store.js';
import { WorkspaceStore } from '../src/app/workspace/workspace-store.js';
import { baseBridge } from './fake-bridge.js';

const library: GroupEntry = {
  kind: 'group',
  name: '',
  relativePath: '.',
  displayName: 'A Novel',
  children: [
    { kind: 'sheet', name: 'a.md', relativePath: 'a.md', displayName: 'A', preview: [] },
  ],
};

const snapshot: ProjectSnapshot = {
  id: 'project-1',
  displayName: 'A Novel',
  library,
  handles: { 'a.md': 'a'.repeat(32) },
  categories: [],
  recentSheets: [],
};

function porcelain(...fields: readonly string[]): string {
  return fields.map((field) => `${field}\0`).join('');
}

const tracked: GitFileStatus = parseGitStatus(porcelain(' M a.md'))[0] as GitFileStatus;
const untracked: GitFileStatus = parseGitStatus(porcelain('?? b.md'))[0] as GitFileStatus;
const conflicted: GitFileStatus = parseGitStatus(porcelain('UU a.md'))[0] as GitFileStatus;

async function setUp(overrides: Partial<OperaIncertaBridge> = {}) {
  const calls: string[] = [];
  const bridge: OperaIncertaBridge = {
    ...baseBridge(),
    currentProject: async () => ({ ok: true, value: snapshot }),
    readSheet: async () => ({ ok: true, value: 'Text\n' }),
    writeSheet: async () => {
      calls.push('writeSheet');
      return { ok: true, value: null };
    },
    gitStatus: async () => ({
      ok: true,
      value: {
        root: '/repo',
        entries: [tracked],
        tracking: null,
        merging: false,
        hasCommit: true,
        branch: 'main',
        remote: null,
      },
    }),
    gitDiscard: async (request) => {
      calls.push(`discard ${request.paths.join(',')}`);
      return { ok: true, value: [...request.paths] };
    },
    gitDiff: async (request) => ({ ok: true, value: `diff of ${request.path}` }),
    gitVersions: async () => ({ ok: true, value: { committed: 'old', current: 'new' } }),
    gitMerge: async () => {
      calls.push('merge');
      return { ok: true, value: null };
    },
    gitResolve: async (request) => {
      calls.push(`resolve ${request.path} ${request.text}`);
      return { ok: true, value: null };
    },
    gitPublish: async (request) => {
      calls.push(`publish ${request.url ?? '(recorded remote)'}`);
      return { ok: true, value: null };
    },
    gitBranches: async () => ({
      ok: true,
      value: [
        { name: 'main', current: true },
        { name: 'draft', current: false },
      ],
    }),
    gitSwitchBranch: async (request) => {
      calls.push(`switch ${request.name}`);
      return { ok: true, value: null };
    },
    gitCreateBranch: async (request) => {
      calls.push(`create ${request.name}`);
      return { ok: true, value: null };
    },
    gitDeleteBranch: async (request) => {
      calls.push(`delete ${request.name}`);
      return { ok: true, value: null };
    },
    gitLastMessage: async () => ({ ok: true, value: 'the last message' }),
    gitAmend: async (request) => {
      calls.push(`amend ${JSON.stringify(request.text)}`);
      return { ok: true, value: null };
    },
    gitReadIgnore: async () => ({ ok: true, value: 'node_modules\n' }),
    gitWriteIgnore: async (request) => {
      calls.push(`writeIgnore ${JSON.stringify(request.text)}`);
      return { ok: true, value: null };
    },
    ...overrides,
  };
  const store = new WorkspaceStore(bridge);
  await store.adoptOpenProject();
  const sourceControl = new SourceControlStore(bridge);
  await sourceControl.refresh();
  const overlay = signal<Overlay | null>(null);
  return {
    store,
    sourceControl,
    overlay,
    calls,
    actions: new SourceControlActions(store, sourceControl, overlay),
  };
}

function confirmation(overlay: { (): Overlay | null }) {
  const open = overlay();
  if (open?.kind !== 'confirmation') {
    throw new Error(`no confirmation is open: ${JSON.stringify(open)}`);
  }
  return open;
}

function prompt(overlay: { (): Overlay | null }) {
  const open = overlay();
  if (open?.kind !== 'prompt') {
    throw new Error(`no prompt is open: ${JSON.stringify(open)}`);
  }
  return open;
}

/**
 * Lets a confirmed action run to its end: the write, the guard, and the
 * status re-read behind it are several awaits deep, so this waits for a
 * timer tick rather than counting microtasks.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('discarding', () => {
  it('asks first, in different words for a tracked and an untracked file', async () => {
    const { actions, overlay } = await setUp();
    actions.askToDiscard(tracked);
    expect(confirmation(overlay).warning).toContain('last committed state');
    actions.askToDiscard(untracked);
    expect(confirmation(overlay).warning).toContain('goes to the trash');
    expect(confirmation(overlay).confirmLabel).toBe('Discard');
  });

  it('discards on confirmation and forgets the editor’s version of it', async () => {
    const { actions, overlay, calls, store } = await setUp();
    await store.selectSheet('a.md');
    store.noteText('unsaved\n');

    actions.askToDiscard(tracked);
    confirmation(overlay).action();
    await settle();

    expect(calls).toEqual(['discard a.md']);
    expect(store.dirty()).toBe(false);
  });
});

describe('showing a diff', () => {
  it('puts both readings on screen at once', async () => {
    const { actions, overlay } = await setUp();
    await actions.showDiff(tracked);
    expect(overlay()).toEqual({
      kind: 'diff',
      path: 'a.md',
      text: 'diff of a.md',
      versions: { committed: 'old', current: 'new' },
    });
  });

  it('shows nothing when the diff could not be read', async () => {
    const { actions, overlay } = await setUp({
      gitDiff: async () => ({ ok: false, code: 'git/failed', message: 'no' }),
    });
    await actions.showDiff(tracked);
    expect(overlay()).toBeNull();
  });
});

describe('merging and resolving', () => {
  it('confirms a merge before running it', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.askToMerge();
    expect(calls).toEqual([]);
    confirmation(overlay).action();
    await settle();
    expect(calls).toEqual(['merge']);
  });

  it('opens the resolver on the working copy, and applying writes and closes', async () => {
    const { actions, overlay, calls } = await setUp();
    await actions.openResolver(conflicted);
    expect(overlay()).toEqual({ kind: 'resolver', path: 'a.md', text: 'new' });

    await actions.applyResolution('a.md', 'decided');
    expect(overlay()).toBeNull();
    expect(calls).toEqual(['resolve a.md decided']);
  });
});

describe('publishing', () => {
  it('asks for an address when no remote is recorded', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.askToPublish();
    expect(prompt(overlay).title).toBe('Publish this branch');
    prompt(overlay).action('https://example.com/book.git');
    await settle();
    expect(calls).toEqual(['publish https://example.com/book.git']);
  });

  it('only confirms when the remote is known', async () => {
    const { actions, overlay, calls } = await setUp({
      gitStatus: async () => ({
        ok: true,
        value: {
          root: '/repo',
          entries: [],
          tracking: null,
          merging: false,
          hasCommit: true,
          branch: 'main',
          remote: { name: 'origin', url: 'https://example.com/book.git' },
        },
      }),
    });
    actions.askToPublish();
    const open = confirmation(overlay);
    expect(open.title).toBe('Publish “main” to origin?');
    expect(open.warning).toContain('https://example.com/book.git');
    open.action();
    await settle();
    expect(calls).toEqual(['publish (recorded remote)']);
  });
});

describe('branches', () => {
  it('lists them', async () => {
    const { actions, overlay } = await setUp();
    await actions.openBranches();
    const open = overlay();
    expect(open?.kind === 'branches' ? open.branches.map((b) => b.name) : null).toEqual([
      'main',
      'draft',
    ]);
  });

  it('switches at once when nothing is unsaved', async () => {
    const { actions, overlay, calls } = await setUp();
    await actions.openBranches();
    await actions.switchBranch('draft');
    expect(overlay()).toBeNull();
    expect(calls).toEqual(['switch draft']);
  });

  it('stops to ask over unsaved work, and saves before switching on confirmation', async () => {
    const { actions, overlay, calls, store } = await setUp();
    await store.selectSheet('a.md');
    store.noteText('unsaved\n');

    await actions.switchBranch('draft');
    expect(calls).toEqual([]);
    const open = confirmation(overlay);
    expect(open.confirmLabel).toBe('Save and switch');
    open.action();
    await settle();
    expect(calls).toEqual(['writeSheet', 'switch draft']);
    expect(overlay()).toBeNull();
  });

  it('creates from a prompt and deletes after a confirmation', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.askForBranchName();
    prompt(overlay).action('draft/chapter-3');
    await settle();
    expect(calls).toEqual(['create draft/chapter-3']);

    actions.askToDeleteBranch('draft');
    expect(confirmation(overlay).title).toBe('Delete the branch “draft”?');
    confirmation(overlay).action();
    await settle();
    expect(calls).toEqual(['create draft/chapter-3', 'delete draft']);
  });
});

describe('amending', () => {
  it('fills the field with the last message and quotes it in the question', async () => {
    const { actions, overlay, sourceControl } = await setUp();
    await actions.askToAmend();
    expect(sourceControl.message()).toBe('the last message');
    expect(confirmation(overlay).warning).toContain('“the last message”');
  });

  it('keeps a message the author already typed', async () => {
    const { actions, overlay, sourceControl, calls } = await setUp();
    sourceControl.setMessage('mine');
    await actions.askToAmend();
    expect(confirmation(overlay).warning).toContain('“mine”');
    confirmation(overlay).action();
    await settle();
    expect(calls).toEqual(['amend "mine"']);
  });
});

describe('the ignore list', () => {
  it('opens as text, and saving closes and writes', async () => {
    const { actions, overlay, calls } = await setUp();
    await actions.openIgnore();
    expect(overlay()).toEqual({ kind: 'ignore', text: 'node_modules\n' });

    await actions.saveIgnore('node_modules\nbuild\n');
    expect(overlay()).toBeNull();
    expect(calls).toEqual(['writeIgnore "node_modules\\nbuild\\n"']);
  });

  it('opens nothing when the file could not be read', async () => {
    const { actions, overlay, sourceControl } = await setUp({
      gitReadIgnore: async () => ({ ok: false, code: 'git/failed', message: 'unreadable' }),
    });
    await actions.openIgnore();
    expect(overlay()).toBeNull();
    expect(sourceControl.failure()).toBe('unreadable');
  });
});

describe('creating a repository and the identity question', () => {
  function identityQuestion(overlay: { (): Overlay | null }) {
    const open = overlay();
    if (open?.kind !== 'identity') {
      throw new Error(`no identity question is open: ${JSON.stringify(open)}`);
    }
    return open;
  }

  async function projectWithoutRepository(globalIdentity: { name: string; email: string } | null) {
    let created = false;
    return setUp({
      gitStatus: async () => ({
        ok: true,
        value: {
          root: created ? '/repo' : null,
          entries: [],
          tracking: null,
          merging: false,
          hasCommit: false,
          branch: created ? 'main' : null,
          remote: null,
        },
      }),
      gitInit: async () => {
        created = true;
        return { ok: true, value: null };
      },
      gitIdentity: async () => ({ ok: true, value: { global: globalIdentity, local: null } }),
    });
  }

  it('asks for name and e-mail when the author has no global identity', async () => {
    const { actions, overlay, sourceControl } = await projectWithoutRepository(null);
    await actions.createRepository();
    expect(identityQuestion(overlay).initial).toBeNull();
    expect(sourceControl.identityMissing()).toBe(true);
  });

  it('asks nothing when a global identity exists', async () => {
    const { actions, overlay } = await projectWithoutRepository({ name: 'A', email: 'a@x.test' });
    await actions.createRepository();
    expect(overlay()).toBeNull();
  });

  it('records the answer in the repository', async () => {
    const recorded: string[] = [];
    const { actions, overlay } = await setUp({
      gitSetIdentity: async (identity) => {
        recorded.push(`${identity.name} <${identity.email}>`);
        return { ok: true, value: null };
      },
    });
    actions.askForIdentity();
    identityQuestion(overlay).action({ name: 'A. Writer', email: 'a@x.test' });
    await settle();
    expect(recorded).toEqual(['A. Writer <a@x.test>']);
  });

  it('starts a later correction from what the repository has', async () => {
    const { actions, overlay } = await setUp({
      gitIdentity: async () => ({
        ok: true,
        value: { global: null, local: { name: 'Old', email: 'old@x.test' } },
      }),
    });
    actions.askForIdentity();
    expect(identityQuestion(overlay).initial).toEqual({ name: 'Old', email: 'old@x.test' });
  });
});
