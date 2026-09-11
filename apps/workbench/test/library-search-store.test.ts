import { describe, expect, it } from 'vitest';
import type { LibrarySearchHit, OperaIncertaBridge } from '@opera-incerta/desktop-contract';
import { LibrarySearchStore } from '../src/app/workspace/library-search-store.js';
import { baseBridge } from './fake-bridge.js';

const hit: LibrarySearchHit = {
  path: 'part-1/scene.md',
  displayName: 'A Scene',
  line: 3,
  text: 'The bell rang once.',
  from: 9,
  to: 13,
};

function setUp(overrides: Partial<OperaIncertaBridge> = {}) {
  const asked: string[] = [];
  const bridge: OperaIncertaBridge = {
    ...baseBridge(),
    searchLibrary: async (request) => {
      asked.push(request.query);
      return { ok: true, value: { hits: [hit], capped: false } };
    },
    ...overrides,
  };
  return { asked, store: new LibrarySearchStore(bridge) };
}

describe('the library search (specification.md §9.3)', () => {
  it('asks only when it is run, never while the query is typed', async () => {
    const { store, asked } = setUp();
    store.noteQuery('bell');
    expect(asked).toEqual([]);
    expect(store.searched()).toBe(false);

    await store.run();
    expect(asked).toEqual(['bell']);
    expect(store.hits()).toEqual([hit]);
    expect(store.searched()).toBe(true);
  });

  it('clears rather than asking for a blank query', async () => {
    const { store, asked } = setUp();
    store.noteQuery('   ');
    await store.run();
    expect(asked).toEqual([]);
    expect(store.hits()).toEqual([]);
    expect(store.searched()).toBe(false);
  });

  it('reports that the answer was cut short', async () => {
    const { store } = setUp({
      searchLibrary: async () => ({ ok: true, value: { hits: [hit], capped: true } }),
    });
    store.noteQuery('e');
    await store.run();
    expect(store.capped()).toBe(true);
  });

  it('reports a refusal with the code, and keeps no stale hits', async () => {
    const { store } = setUp({
      searchLibrary: async () => ({ ok: false, code: 'project/none-open', message: 'no' }),
    });
    store.noteQuery('bell');
    await store.run();
    expect(store.failure()).toBe('project/none-open');
    expect(store.hits()).toEqual([]);
  });

  it('refuses a result of a shape it does not know', async () => {
    const { store } = setUp({
      searchLibrary: async () => ({ ok: true, value: { hits: 'many' } as never }),
    });
    store.noteQuery('bell');
    await store.run();
    expect(store.failure()).toBe('bridge/malformed-search-result');
  });

  it('forgets everything when the project closes: a search is transient', async () => {
    const { store } = setUp();
    store.noteQuery('bell');
    await store.run();
    store.clear();
    expect(store.query()).toBe('');
    expect(store.hits()).toEqual([]);
    expect(store.searched()).toBe(false);
  });
});
