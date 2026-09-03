import { describe, expect, it } from 'vitest';
import type { Disposable, LibraryWatcher } from '@opera-incerta/project-node';
import { ProjectWatch } from '../src/project-watch.js';

/** A watcher that records what it was asked to watch, and what was released. */
function recordingWatcher(): {
  readonly directories: string[];
  readonly files: string[];
  readonly disposed: string[];
  readonly watcher: LibraryWatcher;
  fire: () => void;
} {
  const directories: string[] = [];
  const files: string[] = [];
  const disposed: string[] = [];
  const listeners: Array<() => void> = [];

  const handle = (path: string): Disposable => ({
    dispose: () => disposed.push(path),
  });

  return {
    directories,
    files,
    disposed,
    fire: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    watcher: {
      watchDirectory(absolutePath, onChange) {
        directories.push(absolutePath);
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

describe('what the main process watches', () => {
  it('watches the group as a directory and the sheet as a file', () => {
    const spy = recordingWatcher();
    new ProjectWatch(spy.watcher, () => undefined).set('/book', {
      group: 'part-1',
      sheet: 'part-1/scene.md',
    });

    expect(spy.directories).toEqual(['/book/part-1']);
    expect(spy.files).toEqual(['/book/part-1/scene.md']);
  });

  it('takes the project root as a group like any other', () => {
    const spy = recordingWatcher();
    new ProjectWatch(spy.watcher, () => undefined).set('/book', { group: '.', sheet: null });

    expect(spy.directories).toEqual(['/book']);
    expect(spy.files).toEqual([]);
  });

  it('releases the old targets before taking new ones', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, () => undefined);
    watch.set('/book', { group: 'part-1', sheet: 'part-1/scene.md' });
    watch.set('/book', { group: 'part-2', sheet: null });

    // Otherwise every click leaves a watcher behind, reporting a group nobody
    // is looking at.
    expect(spy.disposed).toEqual(['/book/part-1', '/book/part-1/scene.md']);
    expect(watch.count).toBe(1);
  });

  it('watches nothing without a project', () => {
    const spy = recordingWatcher();
    const watch = new ProjectWatch(spy.watcher, () => undefined);
    watch.set(null, { group: 'part-1', sheet: 'part-1/scene.md' });

    expect(watch.count).toBe(0);
    expect(spy.directories).toEqual([]);
  });

  it('passes a change on, and stops once disposed', () => {
    const spy = recordingWatcher();
    let told = 0;
    const watch = new ProjectWatch(spy.watcher, () => (told += 1));
    watch.set('/book', { group: '.', sheet: null });

    spy.fire();
    expect(told).toBe(1);

    watch.dispose();
    expect(spy.disposed).toEqual(['/book']);
    expect(watch.count).toBe(0);
  });
});
