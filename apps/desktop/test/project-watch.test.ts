import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { Disposable, LibraryWatcher } from '@opera-incerta/project-node';
import { ProjectWatch } from '../src/project-watch.js';

/** A watcher that records what it was asked to watch, and what was released. */
function recordingWatcher(): {
  readonly directories: string[];
  readonly recursive: string[];
  readonly files: string[];
  readonly disposed: string[];
  readonly watcher: LibraryWatcher;
  fire: () => void;
} {
  const directories: string[] = [];
  const recursive: string[] = [];
  const files: string[] = [];
  const disposed: string[] = [];
  const listeners: Array<() => void> = [];

  const handle = (path: string): Disposable => ({
    dispose: () => disposed.push(path),
  });

  return {
    directories,
    recursive,
    files,
    disposed,
    fire: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    watcher: {
      watchDirectory(absolutePath, onChange, options) {
        (options?.recursive === true ? recursive : directories).push(absolutePath);
        listeners.push(onChange);
        return handle(absolutePath);
      },
      watchFile(absolutePath, onChange) {
        files.push(absolutePath);
        listeners.push(onChange);
        return handle(absolutePath);
      },
    },
  };
}

function listeners(
  onLibraryChange: () => void = () => undefined,
  onRepositoryChange: () => void = () => undefined,
): { onLibraryChange: () => void; onRepositoryChange: () => void } {
  return { onLibraryChange, onRepositoryChange };
}

describe('what the main process watches', () => {
  it('watches the group as a directory and the sheet as a file', () => {
    const spy = recordingWatcher();
    new ProjectWatch(spy.watcher, listeners()).set('/book', {
      group: 'part-1',
      sheet: 'part-1/scene.md',
    });

    expect(spy.directories).toEqual([join('/book', 'part-1')]);
    expect(spy.files).toEqual([join('/book', 'part-1', 'scene.md')]);
  });

  it('takes the project root as a group like any other', () => {
    const spy = recordingWatcher();
    new ProjectWatch(spy.watcher, listeners()).set('/book', { group: '.', sheet: null });

    expect(spy.directories).toEqual(['/book']);
    expect(spy.files).toEqual([]);
  });

  it('releases the old targets before taking new ones', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, listeners());
    watch.set('/book', { group: 'part-1', sheet: 'part-1/scene.md' });
    watch.set('/book', { group: 'part-2', sheet: null });

    // Otherwise every click leaves a watcher behind, reporting a group nobody
    // is looking at.
    expect(spy.disposed).toEqual([join('/book', 'part-1'), join('/book', 'part-1', 'scene.md')]);
    expect(watch.count).toBe(1);
  });

  it('watches nothing without a project', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, listeners());
    watch.set(null, { group: 'part-1', sheet: 'part-1/scene.md' });

    expect(watch.count).toBe(0);
    expect(spy.directories).toEqual([]);
  });

  it('passes a change on, and stops once disposed', () => {
    const spy = recordingWatcher();
    let told = 0;
    const watch = new ProjectWatch(spy.watcher, listeners(() => (told += 1)));
    watch.set('/book', { group: '.', sheet: null });

    spy.fire();
    expect(told).toBe(1);

    watch.dispose();
    expect(spy.disposed).toEqual(['/book']);
    expect(watch.count).toBe(0);
  });
});

describe('watching the repository', () => {
  it('watches the root recursively, and nothing else', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, listeners());
    watch.setRepository('/book');

    expect(spy.recursive).toEqual(['/book']);
    expect(watch.count).toBe(1);
  });

  it('is independent of the library targets, in both directions', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, listeners());
    watch.setRepository('/book');
    watch.set('/book', { group: 'part-1', sheet: null });

    // The selection moves constantly; the panel's visibility rarely does.
    expect(watch.count).toBe(2);
    expect(spy.disposed).toEqual([]);

    watch.setRepository(null);
    expect(spy.disposed).toEqual(['/book']);
    expect(watch.count).toBe(1);
  });

  it('stops watching when the panel goes away', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, listeners());
    watch.setRepository('/book');
    watch.setRepository(null);

    expect(spy.disposed).toEqual(['/book']);
    expect(watch.count).toBe(0);
  });

  it('tells the repository listener, not the library one', () => {
    const spy = recordingWatcher();
    let library = 0;
    let repository = 0;
    const watch = new ProjectWatch(
      spy.watcher,
      listeners(() => (library += 1), () => (repository += 1)),
    );
    watch.setRepository('/book');
    spy.fire();

    // Two consumers, two channels: one re-reads the project, the other reads
    // git status.
    expect(repository).toBe(1);
    expect(library).toBe(0);
  });
});
