import { describe, expect, it } from 'vitest';
import type { GroupEntry, SheetEntry, SheetMetadata } from '@opera-incerta/core';
import type {
  BridgeResult,
  OperaIncertaBridge,
  ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
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
      preview: [{ text: 'Preface', level: 1 }],
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
          children: [
            {
              kind: 'sheet',
              name: 'note.md',
              relativePath: 'part-1/pre/note.md',
              displayName: 'Note',
              preview: [],
            },
          ],
        },
      ],
    },
  ],
};

const snapshot: ProjectSnapshot = {
  id: 'project-1',
  displayName: 'A Novel',
  library,
  handles: {
    'preface.md': 'a'.repeat(32),
    'part-1/scene.md': 'b'.repeat(32),
    'part-1/pre/note.md': 'c'.repeat(32),
  },
  categories: [{ id: 'draft', name: 'Draft', color: '#ffcc00' }],
};

/** A bridge whose behavior each test scripts. */
function fakeBridge(overrides: Partial<OperaIncertaBridge> = {}): OperaIncertaBridge & {
  readonly writes: Array<{ id: string; text: string }>;
} {
  const writes: Array<{ id: string; text: string }> = [];
  const files = new Map<string, string>([
    // Owned front matter plus foreign keys: saving must keep both.
    [
      'a'.repeat(32),
      '---\nopera-incerta:\n  title: Preface\n---\n# Preface\n',
    ],
    ['b'.repeat(32), '---\nlayout: post\nauthor: Someone\n---\n# A Scene\n'],
    ['c'.repeat(32), 'A note\n'],
  ]);

  return {
    ...baseBridge(),
    writes,
    openProject: async (): Promise<BridgeResult<ProjectSnapshot | null>> => ({
      ok: true,
      value: snapshot,
    }),
    reopenProject: async (): Promise<BridgeResult<ProjectSnapshot | null>> => ({
      ok: true,
      value: snapshot,
    }),
    readSheet: async (request) => {
      const text = files.get(request.handle.id);
      return text === undefined
        ? { ok: false, code: 'handle/unknown', message: 'no such handle' }
        : { ok: true, value: text };
    },
    writeSheet: async (request) => {
      writes.push({ id: request.handle.id, text: request.text });
      files.set(request.handle.id, request.text);
      return { ok: true, value: null };
    },
    ...overrides,
  };
}

describe('opening a project', () => {
  it('adopts the snapshot and selects the root group', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();

    expect(store.project()?.displayName).toBe('A Novel');
    expect(store.selectedGroupPath()).toBe('.');
    expect(store.selectedGroup()?.displayName).toBe('A Novel');
  });

  it('shows only the direct sheets of the selected group', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();

    expect(store.visibleSheets().map((sheet) => sheet.displayName)).toEqual(['Preface']);

    store.selectGroup('part-1');
    expect(store.visibleSheets().map((sheet) => sheet.displayName)).toEqual(['A Scene']);
  });

  it('reports a cancelled dialog as no change', async () => {
    const store = new WorkspaceStore(
      fakeBridge({ openProject: async () => ({ ok: true, value: null }) }),
    );
    await store.openProject();

    expect(store.project()).toBeNull();
    expect(store.failure()).toBeNull();
  });

  it('reports a refusal with the code the main process sent', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: false, code: 'project/no-project', message: 'nope' }),
      }),
    );
    await store.openProject();

    expect(store.project()).toBeNull();
    expect(store.failure()).toBe('project/no-project');
  });

  it('refuses a malformed snapshot at the boundary', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: true, value: { id: 'x' } as never }),
      }),
    );
    await store.openProject();

    expect(store.failure()).toBe('bridge/malformed-snapshot');
    expect(store.project()).toBeNull();
  });
});

describe('opening a sheet', () => {
  it('reads its text through the handle and expands the tree to it', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('part-1/pre/note.md');

    expect(store.openSheet()?.displayName).toBe('Note');
    expect(store.editorDocument()).toEqual({ id: 'c'.repeat(32), text: 'A note\n' });
    expect(store.isExpanded('part-1')).toBe(true);
    expect(store.isExpanded('part-1/pre')).toBe(true);
  });

  it('ignores a path that is not in the library', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('nowhere.md');

    expect(store.openSheet()).toBeNull();
  });

  it('reports a read failure and keeps the previous sheet', async () => {
    const bridge = fakeBridge({
      readSheet: async () => ({ ok: false, code: 'document/too-large', message: 'too big' }),
    });
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');

    expect(store.failure()).toBe('document/too-large');
    expect(store.openSheet()).toBeNull();
  });
});

describe('editing and saving', () => {
  it('gives the editor the body, never the front matter', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');

    expect(store.editorDocument()?.text).toBe('# Preface\n');
    expect(store.editorDocument()?.text).not.toContain('opera-incerta:');
  });

  it('is not dirty until the body differs from what was saved', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');

    expect(store.dirty()).toBe(false);
    store.noteText('# Preface\n\nA new line.\n');
    expect(store.dirty()).toBe(true);
  });

  it('becomes clean again when the body returns to the saved state', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');

    store.noteText('changed');
    store.noteText('# Preface\n');
    expect(store.dirty()).toBe(false);
  });

  it('reassembles the file on save, so the front matter survives', async () => {
    const bridge = fakeBridge();
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nSaved.\n');
    await store.save();

    expect(bridge.writes).toEqual([
      {
        id: 'a'.repeat(32),
        text: '---\nopera-incerta:\n  title: Preface\n---\n# Preface\n\nSaved.\n',
      },
    ]);
    expect(store.dirty()).toBe(false);
  });

  it('keeps foreign front matter through an edit to the body alone', async () => {
    const bridge = fakeBridge();
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    store.selectGroup('part-1');
    await store.selectSheet('part-1/scene.md');
    store.noteText('# A Scene\n\nRewritten.\n');
    await store.save();

    const written = bridge.writes[0]?.text ?? '';
    expect(written).toContain('layout: post');
    expect(written).toContain('author: Someone');
    expect(written).toContain('Rewritten.');
  });

  it('writes nothing when there is nothing to save', async () => {
    const bridge = fakeBridge();
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.save();

    expect(bridge.writes).toEqual([]);
  });

  it('refuses to write a sheet whose front matter could not be understood', async () => {
    const bridge = fakeBridge({
      readSheet: async () => ({
        ok: true,
        value: '---\nopera-incerta: nonsense\n---\nBody\n',
      }),
    });
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');

    expect(store.diagnostics()[0]?.code).toBe('front-matter/namespace-not-a-mapping');
    store.noteText('changed');
    expect(store.canSave()).toBe(false);

    await store.save();
    expect(bridge.writes).toEqual([]);
    expect(store.failure()).toBe('front-matter/namespace-not-a-mapping');
  });

  it('stays dirty when the write fails, so the change is not lost silently', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        writeSheet: async () => ({ ok: false, code: 'document/too-large', message: 'too big' }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('changed');
    await store.save();

    expect(store.failure()).toBe('document/too-large');
    expect(store.dirty()).toBe(true);
  });
});

describe('reloading after an external change', () => {
  it('keeps the selected group and the open sheet', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    store.selectGroup('part-1');
    await store.selectSheet('part-1/scene.md');
    await store.reloadProject();

    expect(store.selectedGroupPath()).toBe('part-1');
    expect(store.openSheet()?.relativePath).toBe('part-1/scene.md');
  });
});

describe('closing', () => {
  it('clears everything, so nothing of the old project survives', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.closeProject();

    expect(store.project()).toBeNull();
    expect(store.library()).toBeNull();
    expect(store.openSheet()).toBeNull();
    expect(store.visibleSheets()).toEqual([]);
    expect(store.selectedGroupPath()).toBe('.');
  });
});

describe('without a shell', () => {
  it('reports the absent bridge rather than throwing', async () => {
    const store = new WorkspaceStore(null);
    await store.openProject();

    expect(store.hasBridge).toBe(false);
    expect(store.failure()).toBe('bridge/absent');
  });
});

describe('creating and renaming', () => {
  /** The project as it looks once `created` has been added to `part-1`. */
  function snapshotWith(created: GroupEntry | SheetEntry): ProjectSnapshot {
    const part1 = library.children.find(
      (child): child is GroupEntry => child.relativePath === 'part-1',
    );
    if (part1 === undefined) {
      throw new Error('the fixture lost part-1');
    }
    return {
      ...snapshot,
      library: {
        ...library,
        children: library.children.map((child) =>
          child === part1 ? { ...part1, children: [...part1.children, created] } : child,
        ),
      },
      handles:
        created.kind === 'sheet'
          ? { ...snapshot.handles, [created.relativePath]: 'd'.repeat(32) }
          : snapshot.handles,
    };
  }

  const newSheet: SheetEntry = {
    kind: 'sheet',
    name: 'a-late-arrival.md',
    relativePath: 'part-1/a-late-arrival.md',
    displayName: 'A Late Arrival',
    preview: [],
  };

  const newGroup: GroupEntry = {
    kind: 'group',
    name: 'chapter-2',
    relativePath: 'part-1/chapter-2',
    displayName: 'Chapter 2',
    children: [],
  };

  it('reveals the group holding a created sheet, and opens it', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        createSheet: async () => ({
          ok: true,
          value: { snapshot: snapshotWith(newSheet), revealPath: newSheet.relativePath },
        }),
        readSheet: async () => ({ ok: true, value: '---\nopera-incerta:\n  title: A Late Arrival\n---\n' }),
      }),
    );
    await store.openProject();
    await store.createSheet('part-1', 'A Late Arrival');

    // The list beside the editor has to show the sheet the editor holds.
    expect(store.selectedGroupPath()).toBe('part-1');
    expect(store.visibleSheets().map((sheet) => sheet.displayName)).toContain('A Late Arrival');
    expect(store.openSheet()?.relativePath).toBe('part-1/a-late-arrival.md');
    expect(store.isExpanded('part-1')).toBe(true);
  });

  it('selects a created group, leaving the open sheet alone', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        createGroup: async () => ({
          ok: true,
          value: { snapshot: snapshotWith(newGroup), revealPath: newGroup.relativePath },
        }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.createGroup('part-1', 'Chapter 2');

    expect(store.selectedGroupPath()).toBe('part-1/chapter-2');
    expect(store.visibleSheets()).toEqual([]);
    expect(store.openSheet()?.relativePath).toBe('preface.md');
  });

  it('keeps the selection when a rename creates nothing', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        renameSheet: async () => ({ ok: true, value: { snapshot, revealPath: null } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('part-1/scene.md');
    store.selectGroup('part-1');
    await store.renameSheet('preface.md', 'A Better Preface');

    expect(store.selectedGroupPath()).toBe('part-1');
    expect(store.openSheet()?.relativePath).toBe('part-1/scene.md');
  });

  it('renames the open sheet through its editing state, not on disk', async () => {
    let asked = 0;
    const store = new WorkspaceStore(
      fakeBridge({
        renameSheet: async () => {
          asked += 1;
          return { ok: true, value: { snapshot, revealPath: null } };
        },
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.renameSheet('preface.md', 'A Better Preface');

    // Writing the file would discard whatever is unsaved in the editor.
    expect(asked).toBe(0);
    expect(store.metadata()['title']).toBe('A Better Preface');
    expect(store.dirty()).toBe(true);
  });

  it('names the open sheet by the title being edited, not the saved one', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.renameSheet('preface.md', 'A Better Preface');

    // A rename nothing visibly answers looks like a rename that failed.
    expect(store.openTitle()).toBe('A Better Preface');
    expect(store.visibleSheets().map((sheet) => sheet.displayName)).toEqual(['A Better Preface']);
  });

  it('falls back to the saved name when the title is emptied', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    store.updateMetadata({ title: '   ' });

    expect(store.openTitle()).toBe('Preface');
  });
});

describe('reordering', () => {
  /** The project with `part-1` holding its sheet after a second one. */
  const reordered: ProjectSnapshot = {
    ...snapshot,
    library: {
      ...library,
      children: library.children.map((child) =>
        child.relativePath === 'part-1'
          ? {
              ...(child as GroupEntry),
              children: [...(child as GroupEntry).children].reverse(),
            }
          : child,
      ),
    },
  };

  it('names the sibling to land before, never a position', async () => {
    let asked: unknown = null;
    const store = new WorkspaceStore(
      fakeBridge({
        placeEntry: async (request) => {
          asked = request;
          return { ok: true, value: { snapshot, revealPath: null } };
        },
      }),
    );
    await store.openProject();
    await store.placeEntry('part-1/scene.md', 'part-1', 'pre');

    // An index would mean something else by the time the group is re-read.
    expect(asked).toEqual({ path: 'part-1/scene.md', into: 'part-1', before: 'pre' });
  });

  it('takes the new order from the refreshed project, without patching its own', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        placeEntry: async () => ({ ok: true, value: { snapshot: reordered, revealPath: null } }),
      }),
    );
    await store.openProject();
    store.selectGroup('part-1');
    await store.selectSheet('preface.md');
    store.selectGroup('part-1');
    await store.placeEntry('part-1/scene.md', 'part-1', null);

    expect(store.selectedGroup()?.children.map((child) => child.name)).toEqual([
      'pre',
      'scene.md',
    ]);
    // A move changes an order, not a selection.
    expect(store.selectedGroupPath()).toBe('part-1');
    expect(store.openSheet()?.relativePath).toBe('preface.md');
  });

  it('reports a refusal instead of leaving the tree in a half-moved state', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        placeEntry: async () => ({ ok: false, code: 'entry/unknown', message: 'gone' }),
      }),
    );
    await store.openProject();
    await store.placeEntry('ghost.md', '.', null);

    expect(store.failure()).toBe('entry/unknown');
    expect(store.library()?.children.map((child) => child.name)).toEqual(['preface.md', 'part-1']);
  });
});

describe('unsaved work during a library edit', () => {
  it('survives an edit to another entry', async () => {
    const bridge = fakeBridge({
      createGroup: async () => ({ ok: true, value: { snapshot, revealPath: 'part-2' } }),
    });
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nA paragraph nobody saved yet.\n');
    store.updateMetadata({ title: 'A Better Preface' });

    await store.createGroup('.', 'Part 2');

    // The refreshed project is read from disk; what was typed is not on disk.
    expect(store.dirty()).toBe(true);
    expect(store.metadata()['title']).toBe('A Better Preface');

    // What is finally written is the proof: the paragraph, not the re-read file.
    await store.save();
    expect(bridge.writes.at(-1)?.text).toContain('A paragraph nobody saved yet.');
    expect(bridge.writes.at(-1)?.text).toContain('title: A Better Preface');
  });

  it('does not resurrect anything for a sheet that was clean', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        createGroup: async () => ({ ok: true, value: { snapshot, revealPath: 'part-2' } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.createGroup('.', 'Part 2');

    expect(store.dirty()).toBe(false);
    expect(store.editorDocument()?.text).toBe('# Preface\n');
  });
});

describe('deleting', () => {
  /** The project without the whole of `part-1`. */
  const withoutPart: ProjectSnapshot = {
    ...snapshot,
    library: {
      ...library,
      children: library.children.filter((child) => child.relativePath !== 'part-1'),
    },
  };

  /** Two sheets in the root, so a deletion has a neighbour to fall back on. */
  const twoSheets: ProjectSnapshot = {
    ...snapshot,
    library: {
      ...library,
      children: [
        ...library.children,
        {
          kind: 'sheet',
          name: 'afterword.md',
          relativePath: 'afterword.md',
          displayName: 'Afterword',
          preview: [],
        },
      ],
    },
    handles: { ...snapshot.handles, 'afterword.md': 'd'.repeat(32) },
  };

  /** The same, once `preface.md` has gone to the trash. */
  const withoutPreface: ProjectSnapshot = {
    ...twoSheets,
    library: {
      ...(twoSheets.library as GroupEntry),
      children: (twoSheets.library as GroupEntry).children.filter(
        (child) => child.relativePath !== 'preface.md',
      ),
    },
  };

  it('retires the handle of a deleted sheet, and no other', async () => {
    // Every handle but the deleted sheet's survives the re-read.
    const { 'preface.md': deleted, ...survivors } = twoSheets.handles;
    const afterDeletion: ProjectSnapshot = { ...withoutPreface, handles: survivors };
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: true, value: twoSheets }),
        deleteEntry: async () => ({ ok: true, value: { snapshot: afterDeletion, revealPath: null } }),
        readSheet: async () => ({ ok: true, value: 'Afterword\n' }),
      }),
    );
    await store.openProject();
    expect(store.retiredHandles()).toEqual([]);

    await store.deleteEntry('preface.md');

    // The editor forgets what it remembered for that id; the others stay.
    expect(store.retiredHandles()).toEqual([deleted]);
  });

  it('opens the sheet after the deleted one', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: true, value: twoSheets }),
        deleteEntry: async () => ({ ok: true, value: { snapshot: withoutPreface, revealPath: null } }),
        readSheet: async () => ({ ok: true, value: 'Afterword\n' }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.deleteEntry('preface.md');

    // Deleting what you were reading should leave you somewhere, not nowhere.
    expect(store.openSheet()?.relativePath).toBe('afterword.md');
  });

  it('falls back to the sheet before it when there is no next one', async () => {
    const afterwordGone: ProjectSnapshot = {
      ...twoSheets,
      library: {
        ...library,
        children: library.children.filter((child) => child.relativePath !== 'afterword.md'),
      },
    };
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: true, value: twoSheets }),
        deleteEntry: async () => ({ ok: true, value: { snapshot: afterwordGone, revealPath: null } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('afterword.md');
    await store.deleteEntry('afterword.md');

    expect(store.openSheet()?.relativePath).toBe('preface.md');
  });

  it('leaves the editor empty when the group has nothing left', async () => {
    const emptyRoot: ProjectSnapshot = {
      ...snapshot,
      library: {
        ...library,
        children: library.children.filter((child) => child.relativePath !== 'preface.md'),
      },
    };
    const store = new WorkspaceStore(
      fakeBridge({
        deleteEntry: async () => ({ ok: true, value: { snapshot: emptyRoot, revealPath: null } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.deleteEntry('preface.md');

    expect(store.openSheet()).toBeNull();
  });

  it('keeps the open sheet when some other entry is deleted', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: true, value: twoSheets }),
        deleteEntry: async () => ({ ok: true, value: { snapshot: twoSheets, revealPath: null } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.deleteEntry('part-1/scene.md');

    expect(store.openSheet()?.relativePath).toBe('preface.md');
  });

  it('moves the selection up when the selected group is deleted', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        deleteEntry: async () => ({ ok: true, value: { snapshot: withoutPart, revealPath: null } }),
      }),
    );
    await store.openProject();
    store.selectGroup('part-1/pre');
    await store.deleteEntry('part-1');

    // The columns must not show a place that is gone.
    expect(store.selectedGroupPath()).toBe('.');
  });

  it('reports a refusal and changes nothing', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        deleteEntry: async () => ({ ok: false, code: 'trash/unavailable', message: 'no trash' }),
      }),
    );
    await store.openProject();
    await store.deleteEntry('preface.md');

    expect(store.failure()).toBe('trash/unavailable');
    expect(store.library()?.children.map((child) => child.name)).toEqual(['preface.md', 'part-1']);
  });
});

describe('moving into another group', () => {
  /** The project with `preface.md` living inside `part-1`. */
  const moved: ProjectSnapshot = {
    ...snapshot,
    library: {
      ...library,
      children: library.children
        .filter((child) => child.relativePath !== 'preface.md')
        .map((child) =>
          child.relativePath === 'part-1'
            ? {
                ...(child as GroupEntry),
                children: [
                  ...(child as GroupEntry).children,
                  {
                    kind: 'sheet' as const,
                    name: 'preface.md',
                    relativePath: 'part-1/preface.md',
                    displayName: 'Preface',
                    preview: [],
                  },
                ],
              }
            : child,
        ),
    },
    // Handles are minted fresh on every read; the file behind this one is the
    // same, so the fake answers for it under its new path.
    handles: { 'part-1/preface.md': 'a'.repeat(32), 'part-1/scene.md': 'b'.repeat(32) },
  };

  function movingBridge(): ReturnType<typeof fakeBridge> {
    return fakeBridge({
      placeEntry: async () => ({
        ok: true,
        value: { snapshot: moved, revealPath: 'part-1/preface.md' },
      }),
    });
  }

  it('names the entry and the group it goes into', async () => {
    let asked: unknown = null;
    const store = new WorkspaceStore(
      fakeBridge({
        placeEntry: async (request) => {
          asked = request;
          return { ok: true, value: { snapshot: moved, revealPath: 'part-1/preface.md' } };
        },
      }),
    );
    await store.openProject();
    await store.placeEntry('preface.md', 'part-1', null);

    expect(asked).toEqual({ path: 'preface.md', into: 'part-1', before: null });
  });

  it('reveals the sheet where it ended up, not where it was sent', async () => {
    const store = new WorkspaceStore(movingBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.placeEntry('preface.md', 'part-1', null);

    // A collision can change the name on arrival, so the path comes back from
    // the main process rather than being guessed here.
    expect(store.openSheet()?.relativePath).toBe('part-1/preface.md');
    expect(store.selectedGroupPath()).toBe('part-1');
  });

  it('carries what was unsaved in the moved sheet along with it', async () => {
    const bridge = movingBridge();
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nStill unsaved when it moved.\n');

    await store.placeEntry('preface.md', 'part-1', null);

    expect(store.dirty()).toBe(true);
    await store.save();
    expect(bridge.writes.at(-1)?.text).toContain('Still unsaved when it moved.');
  });

  it('reports a refusal and moves nothing', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        placeEntry: async () => ({ ok: false, code: 'group/into-itself', message: 'no' }),
      }),
    );
    await store.openProject();
    await store.placeEntry('part-1', 'part-1/pre', null);

    expect(store.failure()).toBe('group/into-itself');
    expect(store.library()?.children.map((child) => child.name)).toEqual(['preface.md', 'part-1']);
  });
});

describe('moving a group the open sheet is in', () => {
  /** `part-1` and everything in it, now inside `part-2`. */
  const nested: ProjectSnapshot = {
    ...snapshot,
    library: {
      ...library,
      children: [
        library.children[0] as SheetEntry,
        {
          kind: 'group',
          name: 'part-2',
          relativePath: 'part-2',
          displayName: 'Part 2',
          children: [
            {
              kind: 'group',
              name: 'part-1',
              relativePath: 'part-2/part-1',
              displayName: 'Part 1',
              children: [
                {
                  kind: 'sheet',
                  name: 'scene.md',
                  relativePath: 'part-2/part-1/scene.md',
                  displayName: 'A Scene',
                  preview: [],
                },
              ],
            },
          ],
        },
      ],
    },
    handles: { 'preface.md': 'a'.repeat(32), 'part-2/part-1/scene.md': 'b'.repeat(32) },
  };

  it('keeps the sheet open at the path it travelled to', async () => {
    const bridge = fakeBridge({
      placeEntry: async () => ({ ok: true, value: { snapshot: nested, revealPath: 'part-2/part-1' } }),
    });
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('part-1/scene.md');
    store.noteText('# A Scene\n\nCarried along.\n');

    await store.placeEntry('part-1', 'part-2', null);

    // The sheet was not the thing dragged, but its path changed all the same.
    expect(store.openSheet()?.relativePath).toBe('part-2/part-1/scene.md');
    expect(store.dirty()).toBe(true);
    await store.save();
    expect(bridge.writes.at(-1)?.text).toContain('Carried along.');
  });
});

describe('placing does not open', () => {
  it('leaves the editor on the sheet it was on', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        // A placement reveals where the entry went; revealing is not opening.
        placeEntry: async () => ({ ok: true, value: { snapshot, revealPath: 'part-1/scene.md' } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.placeEntry('part-1/scene.md', 'part-1', null);

    expect(store.openSheet()?.relativePath).toBe('preface.md');
  });
});

describe('placing a group', () => {
  it('does not take the selection with it', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        placeEntry: async () => ({ ok: true, value: { snapshot, revealPath: 'part-1/pre' } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.placeEntry('part-1/pre', 'part-1', null);

    // The author is still looking at the group they were looking at.
    expect(store.selectedGroupPath()).toBe('.');
    expect(store.openSheet()?.relativePath).toBe('preface.md');
    // But the tree is opened down to where it went.
    expect(store.isExpanded('part-1')).toBe(true);
  });
});

describe('re-reading a project with unsaved work', () => {
  const onDisk = '---\nopera-incerta:\n  title: Preface\n---\n# Preface\n';
  const changed = '---\nopera-incerta:\n  title: Preface\n---\n# Changed elsewhere\n';

  /** A bridge whose file for `preface.md` can be changed *after* it was read. */
  function mutableDisk(): {
    readonly bridge: OperaIncertaBridge;
    change: (text: string) => void;
    written: () => string | null;
  } {
    let text = onDisk;
    let lastWritten: string | null = null;
    return {
      bridge: fakeBridge({
        readSheet: async (request) =>
          request.handle.id === 'a'.repeat(32)
            ? { ok: true, value: text }
            : { ok: true, value: 'Other\n' },
        writeSheet: async (request) => {
          lastWritten = request.text;
          return { ok: true, value: null };
        },
      }),
      change: (next: string) => {
        text = next;
      },
      written: () => lastWritten,
    };
  }

  it('keeps what was typed when the file did not change', async () => {
    const disk = mutableDisk();
    const store = new WorkspaceStore(disk.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nTyped, not saved.\n');

    await store.reloadProject();

    expect(store.dirty()).toBe(true);
    expect(store.conflict()).toBeNull();
  });

  it('takes the file when nothing was typed', async () => {
    const disk = mutableDisk();
    const store = new WorkspaceStore(disk.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    expect(store.editorDocument()?.text).toBe('# Preface\n');

    disk.change(changed);
    await store.reloadProject();

    // A silent reload is what an unmodified buffer deserves (SPEC.md §10.6).
    expect(store.conflict()).toBeNull();
    expect(store.dirty()).toBe(false);
    expect(store.editorDocument()?.text).toBe('# Changed elsewhere\n');
  });

  it('asks when both changed, and keeps the author’s version meanwhile', async () => {
    const disk = mutableDisk();
    const store = new WorkspaceStore(disk.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nTyped, not saved.\n');

    disk.change(changed);
    await store.reloadProject();

    expect(store.conflict()).toBe('preface.md');
    // The prompt asks; it does not announce a loss that already happened.
    expect(store.dirty()).toBe(true);

    store.resolveConflict('mine');
    expect(store.conflict()).toBeNull();
    expect(store.dirty()).toBe(true);
  });

  it('takes the file when the author says so', async () => {
    const disk = mutableDisk();
    const store = new WorkspaceStore(disk.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nTyped, not saved.\n');
    disk.change(changed);
    await store.reloadProject();

    store.resolveConflict('disk');

    expect(store.conflict()).toBeNull();
    expect(store.dirty()).toBe(false);
    expect(store.editorDocument()?.text).toBe('# Changed elsewhere\n');
  });

  it('does not take its own save for a foreign change, even with a later edit pending', async () => {
    // The smoke of 2026-09-04 found the prompt up after a save through the
    // menu: the watcher reports the application's own write, and a field
    // edited in the meantime makes the sheet dirty again by the time the
    // debounced re-read arrives.
    const disk = mutableDisk();
    const store = new WorkspaceStore(disk.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    store.updateMetadata({ category: 'memory-1' });
    await store.save();
    disk.change(disk.written() ?? '');
    store.updateMetadata({ status: 'review' });

    await store.reloadProject();

    expect(store.conflict()).toBeNull();
    expect(store.dirty()).toBe(true);
    expect(store.metadata().status).toBe('review');
  });

  it('takes no field it does not own, so a stray object cannot dirty the sheet', async () => {
    const disk = mutableDisk();
    const store = new WorkspaceStore(disk.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');

    // What a DOM Event looks like to Object.entries: one enumerable property.
    store.updateMetadata({ isTrusted: false } as unknown as Partial<SheetMetadata>);

    expect(store.dirty()).toBe(false);
    expect(Object.keys(store.metadata())).not.toContain('isTrusted');
  });

  it('does not raise a conflict for a library edit, which touches no file', async () => {
    const disk = mutableDisk();
    const store = new WorkspaceStore(
      fakeBridge({
        readSheet: disk.bridge.readSheet,
        createGroup: async () => ({ ok: true, value: { snapshot, revealPath: 'part-2' } }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('Typed.\n');
    disk.change(changed);
    await store.createGroup('.', 'Part 2');

    // That operation was not about this file, so it does not ask about it.
    expect(store.conflict()).toBeNull();
    expect(store.dirty()).toBe(true);
  });
});

describe('page categories', () => {
  it('resolves the open sheet’s category, and an unknown id as none', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');

    expect(store.category()).toBeNull();
    store.updateMetadata({ category: 'draft' });
    expect(store.category()?.name).toBe('Draft');

    // A deleted category leaves its id behind in the sheet, on purpose.
    store.updateMetadata({ category: 'gone' });
    expect(store.category()).toBeNull();
  });

  it('shows a category the author has chosen but not saved', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    store.updateMetadata({ category: 'draft' });

    const shown = store.visibleSheets().find((sheet) => sheet.relativePath === 'preface.md');
    // An assignment nothing visibly answers looks like one that failed.
    expect(shown?.category).toBe('draft');
  });

  it('sends the categories and adopts what comes back', async () => {
    let sent: unknown = null;
    const withReview: ProjectSnapshot = {
      ...snapshot,
      categories: [{ id: 'review', name: 'Review', color: '#102040' }],
    };
    const store = new WorkspaceStore(
      fakeBridge({
        writeCategories: async (categories) => {
          sent = categories;
          return { ok: true, value: withReview };
        },
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    await store.saveCategories([{ id: 'review', name: 'Review', color: '#102040' }]);

    expect(sent).toEqual([{ id: 'review', name: 'Review', color: '#102040' }]);
    expect(store.categories().map((category) => category.name)).toEqual(['Review']);
    // Editing the definitions does not close the sheet being worked on.
    expect(store.openSheet()?.relativePath).toBe('preface.md');
  });
});

describe('saying what to watch', () => {
  /** A bridge that records every set of watch targets it was given. */
  function watchingBridge(): {
    readonly targets: unknown[];
    readonly bridge: OperaIncertaBridge;
    fire: () => void;
  } {
    const targets: unknown[] = [];
    let listener: (() => void) | null = null;
    return {
      targets,
      fire: () => listener?.(),
      bridge: fakeBridge({
        watchTargets: async (request) => {
          targets.push(request);
          return { ok: true, value: null };
        },
        onExternalChange: (each) => {
          listener = each;
          return () => (listener = null);
        },
      }),
    };
  }

  it('names the group on screen and the open document', async () => {
    const spy = watchingBridge();
    const store = new WorkspaceStore(spy.bridge);
    await store.openProject();
    store.selectGroup('part-1');
    await store.selectSheet('part-1/scene.md');

    expect(spy.targets.at(-1)).toEqual({ group: 'part-1', sheet: 'part-1/scene.md' });
  });

  it('watches the group the *list* shows, not the one the sheet lives in', async () => {
    const spy = watchingBridge();
    const store = new WorkspaceStore(spy.bridge);
    await store.openProject();
    // Opening a sheet from elsewhere — the outline, a reveal — does not move
    // the sheet list, so the group on screen is still the root.
    await store.selectSheet('part-1/scene.md');

    expect(spy.targets.at(-1)).toEqual({ group: '.', sheet: 'part-1/scene.md' });
  });

  it('follows the selection as it moves', async () => {
    const spy = watchingBridge();
    const store = new WorkspaceStore(spy.bridge);
    await store.openProject();
    store.selectGroup('part-1/pre');

    expect(spy.targets.at(-1)).toEqual({ group: 'part-1/pre', sheet: null });
  });

  it('watches nothing once the project is closed', async () => {
    const spy = watchingBridge();
    const store = new WorkspaceStore(spy.bridge);
    await store.openProject();
    await store.closeProject();

    expect(spy.targets.at(-1)).toEqual({ group: null, sheet: null });
  });

  it('re-reads when something changed, and says nothing when it did not', async () => {
    const spy = watchingBridge();
    const store = new WorkspaceStore(spy.bridge);
    await store.openProject();
    await store.selectSheet('preface.md');
    const stop = store.listenForExternalChanges();

    spy.fire();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The file is unchanged, so a notification about it means nothing — which
    // is the whole point of comparing rather than trusting the message.
    expect(store.conflict()).toBeNull();
    expect(store.failure()).toBeNull();
    stop();
  });
});

describe('what survives a re-read', () => {
  it('keeps the tree open where it was', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    store.toggleExpanded('part-1');
    store.toggleExpanded('part-1/pre');

    await store.reloadProject();

    // Once a watcher is running this happens on every save; a tree that folded
    // itself up each time would be unusable.
    expect(store.isExpanded('part-1')).toBe(true);
    expect(store.isExpanded('part-1/pre')).toBe(true);
  });

  it('forgets a group that is no longer there', async () => {
    const withoutPart: ProjectSnapshot = {
      ...snapshot,
      library: {
        ...library,
        children: library.children.filter((child) => child.relativePath !== 'part-1'),
      },
    };
    const store = new WorkspaceStore(
      fakeBridge({ reopenProject: async () => ({ ok: true, value: withoutPart }) }),
    );
    await store.openProject();
    store.toggleExpanded('part-1');

    await store.reloadProject();

    expect(store.isExpanded('part-1')).toBe(false);
    expect(store.isExpanded('.')).toBe(true);
  });
});

describe('forgetting edits after a discard', () => {
  it('drops what the editor held for the discarded sheet', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nA change about to be discarded.\n');
    store.updateMetadata({ topic: 'harbour' });
    expect(store.dirty()).toBe(true);

    store.forgetEdits(['preface.md']);

    // Otherwise the next save would put the discarded change straight back.
    expect(store.dirty()).toBe(false);
    expect(store.editorDocument()?.text).toBe('# Preface\n');
  });

  it('leaves the edits of another sheet alone', async () => {
    const store = new WorkspaceStore(fakeBridge());
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('Still being written.\n');

    store.forgetEdits(['part-1/scene.md']);

    expect(store.dirty()).toBe(true);
  });
});

describe('a buffer dropped on purpose stays dropped', () => {
  it('is not put back by a re-read that was already in flight', async () => {
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    const store = new WorkspaceStore(
      fakeBridge({
        readSheet: async () => {
          reads += 1;
          // The second read is the one inside the re-read; holding it there
          // puts the discard exactly between reading the file and putting the
          // editor's version back on top.
          if (reads === 2) {
            await held;
          }
          return { ok: true, value: '---\nopera-incerta:\n  title: Preface\n---\n# Preface\n' };
        },
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');
    store.noteText('# Preface\n\nAbout to be discarded.\n');

    const reload = store.reloadProject();
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.forgetEdits(['preface.md']);
    (release as unknown as () => void)();
    await reload;

    // The author decided this while the read was running; putting the text
    // back would undo a decision they had just made.
    expect(store.dirty()).toBe(false);
  });
});

describe('a sheet a merge has not finished with', () => {
  const conflicted = [
    '---',
    'opera-incerta:',
    '  title: Preface',
    '---',
    '<<<<<<< HEAD',
    'The bell rang twice.',
    '=======',
    'The bell rang once.',
    '>>>>>>> origin/main',
    '',
  ].join('\n');

  it('is shown, and never written back', async () => {
    const bridge = fakeBridge({ readSheet: async () => ({ ok: true, value: conflicted }) });
    const store = new WorkspaceStore(bridge);
    await store.openProject();
    await store.selectSheet('preface.md');

    // An author typing around markers would save a file that is neither
    // version, so the sheet is read-only until the merge is decided.
    expect(store.diagnostics().map((diagnostic) => diagnostic.code)).toContain('merge/conflicted');
    expect(store.canSave()).toBe(false);

    store.noteText('typed anyway');
    await store.save();
    expect(bridge.writes).toEqual([]);
  });

  it('is writable again once the markers are gone', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        readSheet: async () => ({
          ok: true,
          value: '---\nopera-incerta:\n  title: Preface\n---\nThe bell rang twice.\n',
        }),
      }),
    );
    await store.openProject();
    await store.selectSheet('preface.md');

    expect(store.diagnostics()).toEqual([]);
    store.noteText('an edit');
    expect(store.canSave()).toBe(true);
  });
});
