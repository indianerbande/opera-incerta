import { describe, expect, it } from 'vitest';
import type {
  MenuCommand,
  OperaIncertaBridge,
  RecentProjectEntry,
} from '@opera-incerta/desktop-contract';
import { LauncherStore } from '../src/app/workspace/launcher-store.js';
import { baseBridge } from './fake-bridge.js';

const here: RecentProjectEntry = {
  path: '/books/here',
  shortPath: '~/books/here',
  displayName: 'Here',
  available: true,
};
const gone: RecentProjectEntry = {
  ...here,
  path: '/books/gone',
  displayName: 'Gone',
  available: false,
};

function setUp(overrides: Partial<OperaIncertaBridge> = {}) {
  const calls: string[] = [];
  let recent: readonly RecentProjectEntry[] = [here, gone];
  const bridge: OperaIncertaBridge = {
    ...baseBridge(),
    recentProjects: async () => ({ ok: true, value: recent }),
    openProject: async () => {
      calls.push('openProject');
      return { ok: true, value: null };
    },
    openRecentProject: async (request) => {
      calls.push(`openRecent ${request.path}`);
      return { ok: true, value: null };
    },
    forgetRecentProject: async (request) => {
      calls.push(`forget ${request.path}`);
      recent = recent.filter((entry) => entry.path !== request.path);
      return { ok: true, value: null };
    },
    chooseProjectLocation: async () => ({
      ok: true,
      value: { path: '/books', shortPath: '~/books' },
    }),
    createProject: async (request) => {
      calls.push(`create ${request.parentPath} ${request.displayName}`);
      return {
        ok: true,
        value: {
          id: 'new',
          displayName: request.displayName,
          library: {},
          handles: {},
          categories: [],
        },
      };
    },
    ...overrides,
  };
  return { calls, store: new LauncherStore(bridge) };
}

describe('the recent list', () => {
  it('is read on refresh', async () => {
    const { store } = setUp();
    await store.refresh();
    expect(store.recent().map((entry) => entry.displayName)).toEqual(['Here', 'Gone']);
  });

  it('opens an available entry through the bridge', async () => {
    const { store, calls } = setUp();
    await store.openRecent(here);
    expect(calls).toEqual(['openRecent /books/here']);
    expect(store.failure()).toBeNull();
  });

  it('reports a missing one without asking the bridge', async () => {
    const { store, calls } = setUp();
    await store.openRecent(gone);
    expect(calls).toEqual([]);
    expect(store.failure()).toBe('project/not-found');
  });

  it('forgets an entry and re-reads the list', async () => {
    const { store, calls } = setUp();
    await store.refresh();
    await store.forget(gone);
    expect(calls).toEqual(['forget /books/gone']);
    expect(store.recent().map((entry) => entry.displayName)).toEqual(['Here']);
  });

  it('reports the code a failed open sent, and clears it on the next success', async () => {
    const { store } = setUp({
      openProject: async () => ({ ok: false, code: 'project/not-a-project', message: 'no' }),
    });
    await store.open();
    expect(store.failure()).toBe('project/not-a-project');
    await store.refresh();
    expect(store.failure()).toBeNull();
  });
});

describe('creating a project', () => {
  it('opens the dialog, takes a location, creates, and closes', async () => {
    const { store, calls } = setUp();
    store.startCreating();
    expect(store.creating()).toBe(true);
    expect(store.location()).toBeNull();

    await store.chooseLocation();
    expect(store.location()?.path).toBe('/books');

    await store.createProject('The Harbour Novel');
    expect(calls).toEqual(['create /books The Harbour Novel']);
    expect(store.creating()).toBe(false);
    expect(store.location()).toBeNull();
  });

  it('leaves the location alone when the chooser is cancelled', async () => {
    const { store } = setUp({ chooseProjectLocation: async () => ({ ok: true, value: null }) });
    store.startCreating();
    await store.chooseLocation();
    expect(store.location()).toBeNull();
    expect(store.createFailure()).toBeNull();
  });

  it('keeps the dialog open with the reason when creating fails', async () => {
    const { store } = setUp({
      createProject: async () => ({ ok: false, code: 'project/exists', message: 'taken' }),
    });
    store.startCreating();
    await store.chooseLocation();
    await store.createProject('Taken');
    expect(store.creating()).toBe(true);
    expect(store.createFailure()).toBe('project/exists');
  });

  it('refuses to create without a location', async () => {
    const { store, calls } = setUp();
    store.startCreating();
    await store.createProject('Nowhere');
    expect(calls).toEqual([]);
    expect(store.createFailure()).toBe('project/no-location');
  });

  it('closing clears the dialog state', async () => {
    const { store } = setUp();
    store.startCreating();
    await store.chooseLocation();
    store.closeDialog();
    expect(store.creating()).toBe(false);
    expect(store.location()).toBeNull();
  });
});

describe('menu commands', () => {
  it('drive the same actions as the buttons', async () => {
    const menu: { listener: ((command: MenuCommand) => void) | null } = { listener: null };
    const { store, calls } = setUp({
      onMenuCommand: (handler) => {
        menu.listener = handler;
        return () => undefined;
      },
    });
    store.listenForMenuCommands();
    menu.listener?.('project/new');
    expect(store.creating()).toBe(true);
    menu.listener?.('project/open');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['openProject']);
  });
});
