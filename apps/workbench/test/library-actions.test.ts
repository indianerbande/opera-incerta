import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import type { GroupEntry } from '@opera-incerta/core';
import type { OperaIncertaBridge, ProjectSnapshot } from '@opera-incerta/desktop-contract';
import type { Overlay } from '../src/app/shell/overlay.js';
import { LibraryActions } from '../src/app/workspace/library-actions.js';
import { WorkspaceStore } from '../src/app/workspace/workspace-store.js';
import { baseBridge } from './fake-bridge.js';

const library: GroupEntry = {
  kind: 'group',
  name: '',
  relativePath: '.',
  displayName: 'A Novel',
  children: [
    {
      kind: 'sheet',
      name: 'preface.md',
      relativePath: 'preface.md',
      displayName: 'Preface',
      preview: [],
    },
    {
      kind: 'group',
      name: 'part-1',
      relativePath: 'part-1',
      displayName: 'Part 1',
      children: [
        {
          kind: 'sheet',
          name: 'scene.md',
          relativePath: 'part-1/scene.md',
          displayName: 'A Scene',
          preview: [],
        },
        {
          kind: 'group',
          name: 'pre',
          relativePath: 'part-1/pre',
          displayName: 'pre',
          children: [],
        },
      ],
    },
  ],
};

const snapshot: ProjectSnapshot = {
  id: 'project-1',
  displayName: 'A Novel',
  library,
  handles: { 'preface.md': 'a'.repeat(32), 'part-1/scene.md': 'b'.repeat(32) },
  categories: [],
  recentSheets: [],
};

/** A store over a bridge that records the library edits it is asked for. */
async function setUp(overrides: Partial<OperaIncertaBridge> = {}) {
  const calls: string[] = [];
  const bridge: OperaIncertaBridge = {
    ...baseBridge(),
    currentProject: async () => ({ ok: true, value: snapshot }),
    readSheet: async () => ({ ok: true, value: 'Text\n' }),
    createSheet: async (request) => {
      calls.push(`createSheet ${request.path} ${request.name}`);
      return { ok: true, value: { snapshot, revealPath: null } };
    },
    createGroup: async (request) => {
      calls.push(`createGroup ${request.path} ${request.name}`);
      return { ok: true, value: { snapshot, revealPath: null } };
    },
    renameGroup: async (request) => {
      calls.push(`renameGroup ${request.path} ${request.name}`);
      return { ok: true, value: { snapshot, revealPath: null } };
    },
    renameSheet: async (request) => {
      calls.push(`renameSheet ${request.path} ${request.name}`);
      return { ok: true, value: { snapshot, revealPath: null } };
    },
    deleteEntry: async (request) => {
      calls.push(`deleteEntry ${request.path}`);
      return { ok: true, value: { snapshot, revealPath: null } };
    },
    writeCategories: async (categories) => {
      calls.push(`writeCategories ${String(categories.length)}`);
      return { ok: true, value: snapshot };
    },
    ...overrides,
  };
  const store = new WorkspaceStore(bridge);
  await store.adoptOpenProject();
  const overlay = signal<Overlay | null>(null);
  return { store, overlay, calls, actions: new LibraryActions(store, overlay) };
}

/** Runs the menu entry with this label, the way choosing it in the menu would. */
function choose(overlay: { (): Overlay | null }, label: string): void {
  const open = overlay();
  if (open?.kind !== 'menu') {
    throw new Error(`no menu is open: ${JSON.stringify(open)}`);
  }
  const entry = open.entries.find((candidate) => candidate.label === label);
  if (entry === undefined) {
    throw new Error(`no entry "${label}" in ${open.entries.map((e) => e.label).join(', ')}`);
  }
  entry.run();
}

/** Answers the open prompt, the way confirming it in the dialog would. */
function answer(overlay: { (): Overlay | null }, value: string): void {
  const open = overlay();
  if (open?.kind !== 'prompt') {
    throw new Error(`no prompt is open: ${JSON.stringify(open)}`);
  }
  open.action(value);
}

function confirm(overlay: { (): Overlay | null }): void {
  const open = overlay();
  if (open?.kind !== 'confirmation') {
    throw new Error(`no confirmation is open: ${JSON.stringify(open)}`);
  }
  open.action();
}

const at = { x: 10, y: 20 };

describe('the group menu', () => {
  it('offers new sheet, new group, and rename on the root — but not delete', async () => {
    const { actions, overlay } = await setUp();
    actions.openGroupMenu('.', at);

    const open = overlay();
    expect(open?.kind).toBe('menu');
    expect(open?.kind === 'menu' ? open.entries.map((e) => e.label) : []).toEqual([
      'New Sheet…',
      'New Group…',
      'Rename…',
    ]);
    expect(open?.kind === 'menu' ? [open.x, open.y] : null).toEqual([10, 20]);
  });

  it('offers delete on any other group', async () => {
    const { actions, overlay } = await setUp();
    actions.openGroupMenu('part-1', at);
    const open = overlay();
    expect(open?.kind === 'menu' ? open.entries.map((e) => e.label) : []).toContain(
      'Delete Group…',
    );
  });

  it('opens nothing without a project', async () => {
    const overlay = signal<Overlay | null>(null);
    const actions = new LibraryActions(new WorkspaceStore(baseBridge()), overlay);
    actions.openGroupMenu('.', at);
    expect(overlay()).toBeNull();
  });

  it('creates a sheet in the group from the prompt', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.openGroupMenu('part-1', at);
    choose(overlay, 'New Sheet…');

    const open = overlay();
    expect(open?.kind === 'prompt' ? open.confirmLabel : null).toBe('Create');
    answer(overlay, 'The Second Scene');
    await Promise.resolve();
    expect(calls).toEqual(['createSheet part-1 The Second Scene']);
  });

  it('creates a group under the group from the prompt', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.openGroupMenu('.', at);
    choose(overlay, 'New Group…');
    answer(overlay, 'Part Two');
    await Promise.resolve();
    expect(calls).toEqual(['createGroup . Part Two']);
  });

  it('renames the group, with its current name offered', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.openGroupMenu('part-1', at);
    choose(overlay, 'Rename…');
    const open = overlay();
    expect(open?.kind === 'prompt' ? open.initial : null).toBe('Part 1');
    answer(overlay, 'The First Part');
    await Promise.resolve();
    expect(calls).toEqual(['renameGroup part-1 The First Part']);
  });

  it('asks before deleting a group, saying what goes with it', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.openGroupMenu('part-1', at);
    choose(overlay, 'Delete Group…');

    const open = overlay();
    expect(open?.kind).toBe('confirmation');
    expect(open?.kind === 'confirmation' ? open.title : null).toBe(
      'Move “Part 1” to the trash?',
    );
    expect(open?.kind === 'confirmation' ? open.warning : null).toBe(
      'Everything in it goes too: 1 sheet and 1 subgroup.',
    );
    expect(calls).toEqual([]);
    confirm(overlay);
    await Promise.resolve();
    expect(calls).toEqual(['deleteEntry part-1']);
  });

  it('warns of nothing for an empty group', async () => {
    const { actions, overlay } = await setUp();
    actions.askToDeleteGroup('part-1/pre', 'pre');
    const open = overlay();
    expect(open?.kind === 'confirmation' ? open.warning : 'unset').toBeNull();
  });
});

describe('the sheet menu', () => {
  it('offers rename and delete', async () => {
    const { actions, overlay } = await setUp();
    actions.openSheetMenu('preface.md', 'Preface', at);
    const open = overlay();
    expect(open?.kind === 'menu' ? open.entries.map((e) => e.label) : []).toEqual([
      'Rename…',
      'Delete Sheet…',
    ]);
  });

  it('renames a closed sheet on disk', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.openSheetMenu('preface.md', 'Preface', at);
    choose(overlay, 'Rename…');
    answer(overlay, 'Foreword');
    await Promise.resolve();
    expect(calls).toEqual(['renameSheet preface.md Foreword']);
  });

  it('renames the open sheet into its editing state, touching no file', async () => {
    const { actions, overlay, calls, store } = await setUp();
    await store.selectSheet('preface.md');
    actions.askToRenameSheet('preface.md', 'Preface');
    answer(overlay, 'Foreword');
    await Promise.resolve();

    expect(calls).toEqual([]);
    expect(store.openTitle()).toBe('Foreword');
    expect(store.dirty()).toBe(true);
  });

  it('asks before deleting, and warns when the open sheet has unsaved work', async () => {
    const { actions, overlay, calls, store } = await setUp();
    await store.selectSheet('preface.md');
    store.noteText('Changed\n');

    actions.askToDeleteSheet('preface.md', 'Preface');
    const open = overlay();
    expect(open?.kind === 'confirmation' ? open.warning : null).toBe(
      'It has unsaved changes, and those are not in the trash afterwards.',
    );
    confirm(overlay);
    await Promise.resolve();
    expect(calls).toEqual(['deleteEntry preface.md']);
  });

  it('warns of nothing when the sheet is not the open one', async () => {
    const { actions, overlay } = await setUp();
    actions.askToDeleteSheet('part-1/scene.md', 'A Scene');
    const open = overlay();
    expect(open?.kind === 'confirmation' ? open.warning : 'unset').toBeNull();
  });
});

describe('categories', () => {
  it('opens the manager, and saving closes it and writes', async () => {
    const { actions, overlay, calls } = await setUp();
    actions.manageCategories();
    expect(overlay()?.kind).toBe('categories');

    actions.saveCategories([{ id: 'a', name: 'Draft', color: '#ff0000' }]);
    expect(overlay()).toBeNull();
    await Promise.resolve();
    expect(calls).toEqual(['writeCategories 1']);
  });
});
