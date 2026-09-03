/**
 * What the main process is watching on the renderer's behalf. SPEC.md §10.6.
 *
 * Targets are named by the interface, because only it knows what the author is
 * looking at: the group whose sheet list is on screen, the document in the
 * editor, and — while source control is showing — the repository, watched
 * recursively (SPEC.md §12).
 *
 * The two are set **independently**: the selection moves constantly while the
 * panel's visibility rarely changes, and one must not disturb the other.
 *
 * The rule with teeth is that setting a target releases what it replaces. A
 * watcher left behind keeps reporting something nobody is looking at, and the
 * handles accumulate for as long as the author keeps clicking.
 */
import { absolutePathOf, type Disposable, type LibraryWatcher } from '@opera-incerta/project-node';

export interface WatchTargets {
  /** The group whose sheets are shown, relative to the project root. */
  readonly group: string | null;
  /** The open sheet, relative to the project root. */
  readonly sheet: string | null;
}

export interface WatchListeners {
  /** The group on screen or the open document changed. SPEC.md §10.6. */
  readonly onLibraryChange: () => void;
  /** The working tree changed. SPEC.md §12. */
  readonly onRepositoryChange: () => void;
}

export class ProjectWatch {
  readonly #watcher: LibraryWatcher;
  readonly #listeners: WatchListeners;
  #handles: readonly Disposable[] = [];
  #repository: Disposable | null = null;

  constructor(watcher: LibraryWatcher, listeners: WatchListeners) {
    this.#watcher = watcher;
    this.#listeners = listeners;
  }

  /** How many watches are live. */
  get count(): number {
    return this.#handles.length + (this.#repository === null ? 0 : 1);
  }

  set(projectPath: string | null, targets: WatchTargets): void {
    this.#releaseLibrary();
    if (projectPath === null) {
      return;
    }

    const handles: Disposable[] = [];
    const notify = this.#listeners.onLibraryChange;
    if (targets.group !== null) {
      handles.push(
        this.#watcher.watchDirectory(absolutePathOf(projectPath, targets.group), notify),
      );
    }
    if (targets.sheet !== null) {
      handles.push(this.#watcher.watchFile(absolutePathOf(projectPath, targets.sheet), notify));
    }
    this.#handles = handles;
  }

  /**
   * Watches a repository root, recursively, or stops watching one.
   *
   * `null` covers both cases §12 asks for: the panel is not on screen, and the
   * project is not inside a repository at all.
   */
  setRepository(absoluteRoot: string | null): void {
    this.#repository?.dispose();
    this.#repository =
      absoluteRoot === null
        ? null
        : this.#watcher.watchDirectory(absoluteRoot, this.#listeners.onRepositoryChange, {
            recursive: true,
          });
  }

  dispose(): void {
    for (const handle of this.#handles) {
      handle.dispose();
    }
    this.#handles = [];
    this.#repository?.dispose();
    this.#repository = null;
  }

  /** Releases the library targets, leaving the repository watch alone. */
  #releaseLibrary(): void {
    for (const handle of this.#handles) {
      handle.dispose();
    }
    this.#handles = [];
  }
}
