import { describe, expect, it } from 'vitest';
import type { GroupEntry } from '@opera-incerta/core';
import type {
  BridgeResult,
  OperaIncertaBridge,
  ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
import { WorkspaceStore } from '../src/app/workspace/workspace-store.js';

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
    writes,
    contractVersion: async () => 1,
    openProject: async (): Promise<BridgeResult<ProjectSnapshot | null>> => ({
      ok: true,
      value: snapshot,
    }),
    reopenProject: async (): Promise<BridgeResult<ProjectSnapshot | null>> => ({
      ok: true,
      value: snapshot,
    }),
    closeProject: async () => ({ ok: true, value: null }),
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
