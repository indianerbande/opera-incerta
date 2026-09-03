/**
 * What the main process is watching on the renderer's behalf. SPEC.md §10.6.
 *
 * Two targets at a time, both named by the interface because only it knows
 * what the author is looking at: the group whose sheet list is on screen, and
 * the document in the editor.
 *
 * The one rule with teeth is that **setting new targets releases the old
 * ones**. A watcher left behind keeps reporting a group nobody is looking at,
 * and the handles accumulate for as long as the author keeps clicking.
 */
import { absolutePathOf, type Disposable, type LibraryWatcher } from '@opera-incerta/project-node';

export interface WatchTargets {
  /** The group whose sheets are shown, relative to the project root. */
  readonly group: string | null;
  /** The open sheet, relative to the project root. */
  readonly sheet: string | null;
}

export class ProjectWatch {
  readonly #watcher: LibraryWatcher;
  readonly #notify: () => void;
  #handles: readonly Disposable[] = [];

  constructor(watcher: LibraryWatcher, notify: () => void) {
    this.#watcher = watcher;
    this.#notify = notify;
  }

  /** How many watches are live. The shell has no business with more than two. */
  get count(): number {
    return this.#handles.length;
  }

  set(projectPath: string | null, targets: WatchTargets): void {
    this.dispose();
    if (projectPath === null) {
      return;
    }

    const handles: Disposable[] = [];
    if (targets.group !== null) {
      handles.push(
        this.#watcher.watchDirectory(absolutePathOf(projectPath, targets.group), this.#notify),
      );
    }
    if (targets.sheet !== null) {
      handles.push(
        this.#watcher.watchFile(absolutePathOf(projectPath, targets.sheet), this.#notify),
      );
    }
    this.#handles = handles;
  }

  dispose(): void {
    for (const handle of this.#handles) {
      handle.dispose();
    }
    this.#handles = [];
  }
}
