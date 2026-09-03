/**
 * The filesystem watcher over Node's own `fs.watch`. SPEC.md §10.6, §12.
 *
 * Deliberately thin. Everything that decides *what a change means* lives
 * elsewhere and is already tested there: coalescing in `RefreshCoordinator`,
 * the `.git` filter in `touchesWorkingTree`, and — the rule that makes all of
 * this safe — comparing content against the loaded baseline before acting.
 * This adapter only says "something happened under here", after the burst has
 * settled. A library that decided those things for us would be a second answer
 * to questions the core already answers.
 *
 * Three things were measured on this platform before it was written, and each
 * one is a rule below:
 *
 * - a watch on a **file** goes deaf as soon as that file is replaced by a
 *   rename — which is exactly how this application saves (§10.6). So a file is
 *   watched through its directory, filtered by name;
 * - one atomic save produced **seven** events, including two for directories
 *   that had not changed, and the event type said `rename` for an ordinary
 *   write. The type carries no information; only "something, somewhere under
 *   here" does;
 * - a recursive watch reports `.git/index`, so the filter of §12 is not
 *   theoretical.
 *
 * Two further properties of the platform, found while testing this and worth
 * knowing before relying on either: a watch delivers a short **history**, so
 * changes made just before it started still arrive; and a non-recursive watch
 * on macOS reports activity in subdirectories too, naming the subdirectory.
 * Both mean more notifications than asked for, never fewer — which is the
 * harmless direction, because the consumer compares before it acts.
 */
import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { WATCH_DEBOUNCE_MS, touchesWorkingTree } from '@opera-incerta/core';
import type { Disposable, LibraryWatcher, WatchDirectoryOptions } from './ports.js';

/**
 * A watcher over the real filesystem.
 *
 * `debounceMs` is injectable for tests, which cannot afford to wait out the
 * specified interval for every case.
 */
export function createLibraryWatcher(debounceMs: number = WATCH_DEBOUNCE_MS): LibraryWatcher {
  return {
    watchDirectory(absolutePath, onChange, options: WatchDirectoryOptions = {}) {
      return start(absolutePath, options.recursive === true, () => true, onChange, debounceMs);
    },

    watchFile(absolutePath, onChange) {
      // Through the directory, never the file: the application replaces a
      // sheet by renaming a temporary file over it, and a watch on the old
      // path survives that in name only.
      const name = basename(absolutePath);
      return start(
        dirname(absolutePath),
        false,
        (changed) => changed === null || basename(changed) === name,
        onChange,
        debounceMs,
      );
    },
  };
}

function start(
  path: string,
  recursive: boolean,
  concerns: (changed: string | null) => boolean,
  onChange: () => void,
  debounceMs: number,
): Disposable {
  let watcher: FSWatcher | null = null;
  let timer: NodeJS.Timeout | null = null;
  let disposed = false;

  const settle = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      if (!disposed) {
        onChange();
      }
    }, debounceMs);
    // A pending burst must never be a reason for the process to stay alive.
    timer.unref();
  };

  try {
    watcher = watch(path, { recursive }, (_type, name) => {
      const changed = typeof name === 'string' ? name : null;
      // A path the platform could not name counts as concerning us: one
      // refresh too many is harmless, because the consumer compares before it
      // acts. A change missed is a manuscript that disagrees with the disk.
      if (changed !== null && !touchesWorkingTree([changed])) {
        return;
      }
      if (concerns(changed)) {
        settle();
      }
    });
    // A watch that dies — the directory was removed, the platform ran out of
    // handles — stops reporting. It does not take the application with it.
    watcher.on('error', () => {
      watcher?.close();
      watcher = null;
    });
  } catch {
    // Nothing to watch: a group that is not there yet, or no longer. The
    // caller gets a handle that does nothing, which is what it would do
    // anyway.
  }

  return {
    dispose(): void {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      watcher?.close();
      watcher = null;
    },
  };
}
