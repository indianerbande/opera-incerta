import { describe, expect, it } from 'vitest';
import type { GroupEntry, SheetEntry } from '@opera-incerta/core';
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
          value: { snapshot: snapshotWith(newSheet), createdPath: newSheet.relativePath },
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
          value: { snapshot: snapshotWith(newGroup), createdPath: newGroup.relativePath },
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
        renameSheet: async () => ({ ok: true, value: { snapshot, createdPath: null } }),
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
          return { ok: true, value: { snapshot, createdPath: null } };
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
        reorderEntry: async (request) => {
          asked = request;
          return { ok: true, value: { snapshot, createdPath: null } };
        },
      }),
    );
    await store.openProject();
    await store.reorderEntry('part-1/scene.md', 'pre');

    // An index would mean something else by the time the group is re-read.
    expect(asked).toEqual({ path: 'part-1/scene.md', before: 'pre' });
  });

  it('takes the new order from the refreshed project, without patching its own', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        reorderEntry: async () => ({ ok: true, value: { snapshot: reordered, createdPath: null } }),
      }),
    );
    await store.openProject();
    store.selectGroup('part-1');
    await store.selectSheet('preface.md');
    store.selectGroup('part-1');
    await store.reorderEntry('part-1/scene.md', null);

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
        reorderEntry: async () => ({ ok: false, code: 'entry/unknown', message: 'gone' }),
      }),
    );
    await store.openProject();
    await store.reorderEntry('ghost.md', null);

    expect(store.failure()).toBe('entry/unknown');
    expect(store.library()?.children.map((child) => child.name)).toEqual(['preface.md', 'part-1']);
  });
});

describe('unsaved work during a library edit', () => {
  it('survives an edit to another entry', async () => {
    const bridge = fakeBridge({
      createGroup: async () => ({ ok: true, value: { snapshot, createdPath: 'part-2' } }),
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
        createGroup: async () => ({ ok: true, value: { snapshot, createdPath: 'part-2' } }),
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

  it('opens the sheet after the deleted one', async () => {
    const store = new WorkspaceStore(
      fakeBridge({
        openProject: async () => ({ ok: true, value: twoSheets }),
        deleteEntry: async () => ({ ok: true, value: { snapshot: withoutPreface, createdPath: null } }),
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
        deleteEntry: async () => ({ ok: true, value: { snapshot: afterwordGone, createdPath: null } }),
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
        deleteEntry: async () => ({ ok: true, value: { snapshot: emptyRoot, createdPath: null } }),
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
        deleteEntry: async () => ({ ok: true, value: { snapshot: twoSheets, createdPath: null } }),
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
        deleteEntry: async () => ({ ok: true, value: { snapshot: withoutPart, createdPath: null } }),
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
