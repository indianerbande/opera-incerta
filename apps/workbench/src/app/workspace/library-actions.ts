/**
 * What the author can do to the library from its context menus, and the
 * questions asked on the way. SPEC.md §6.4, §6.5, §6.7, §6.6.
 *
 * A flow, not a component: it decides which menu entries an entry gets, what a
 * prompt says, and what happens when it is confirmed. The shell only renders
 * whatever overlay this puts up. Kept free of Angular so that the whole flow —
 * menu to prompt to store — runs in a unit test against the fake bridge.
 */
import { findGroup, sheetsOf, walkLibrary, type PageCategory } from '@opera-incerta/core';
import type { MenuEntry, OverlayHost } from '../shell/overlay.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface MenuPoint {
  readonly x: number;
  readonly y: number;
}

export class LibraryActions {
  readonly #store: WorkspaceStore;
  readonly #overlay: OverlayHost;

  constructor(store: WorkspaceStore, overlay: OverlayHost) {
    this.#store = store;
    this.#overlay = overlay;
  }

  /** The menu of a group in the tree. The root cannot be deleted or renamed away. */
  openGroupMenu(path: string, at: MenuPoint): void {
    if (this.#store.library() === null) {
      return;
    }
    const name = this.#groupName(path);
    const entries: MenuEntry[] = [
      { label: 'New Sheet…', run: () => this.askForNewSheet(path) },
      { label: 'New Group…', run: () => this.askForNewGroup(path) },
      { label: 'Rename…', run: () => this.askToRenameGroup(path, name) },
    ];
    // The project root has no group above it to delete it from.
    if (path !== '.') {
      entries.push({ label: 'Delete Group…', run: () => this.askToDeleteGroup(path, name) });
    }
    this.#overlay.set({ kind: 'menu', entries, x: at.x, y: at.y });
  }

  /** The menu of a sheet in the list. */
  openSheetMenu(path: string, name: string, at: MenuPoint): void {
    this.#overlay.set({
      kind: 'menu',
      entries: [
        { label: 'Rename…', run: () => this.askToRenameSheet(path, name) },
        { label: 'Delete Sheet…', run: () => this.askToDeleteSheet(path, name) },
      ],
      x: at.x,
      y: at.y,
    });
  }

  askForNewSheet(groupPath: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: 'New sheet',
      initial: '',
      placeholder: 'The First Scene',
      // The rule, where it applies: the file name is derived once and then
      // stays, while this title can change any time (SPEC.md §6.4).
      hint: 'The title can change later; the file name is set once, from it.',
      confirmLabel: 'Create',
      action: (value) => void this.#store.createSheet(groupPath, value),
    });
  }

  askForNewGroup(parentPath: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: 'New group',
      initial: '',
      placeholder: 'Part One',
      hint: 'The name can change later; the folder name is set once, from it.',
      confirmLabel: 'Create',
      action: (value) => void this.#store.createGroup(parentPath, value),
    });
  }

  askToRenameGroup(path: string, name: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: 'Rename group',
      initial: name,
      placeholder: '',
      hint: 'Renaming changes the name shown here, never the folder on disk.',
      confirmLabel: 'Rename',
      action: (value) => void this.#store.renameGroup(path, value),
    });
  }

  askToRenameSheet(path: string, name: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: 'Rename sheet',
      initial: name,
      placeholder: '',
      hint: 'Renaming changes the title in the file, never the file name.',
      confirmLabel: 'Rename',
      action: (value) => void this.#store.renameSheet(path, value),
    });
  }

  /** Deleting a sheet. SPEC.md §6.7. */
  askToDeleteSheet(path: string, name: string): void {
    const open = this.#store.openSheet();
    this.#overlay.set({
      kind: 'confirmation',
      title: `Move “${name}” to the trash?`,
      // Unsaved work does not go to the trash with the file: it was never in
      // it. The author has to hear that before, not after.
      warning:
        open?.relativePath === path && this.#store.dirty()
          ? 'It has unsaved changes, and those are not in the trash afterwards.'
          : null,
      action: () => void this.#store.deleteEntry(path),
    });
  }

  /** Deleting a group, with what goes along with it spelled out. SPEC.md §6.7. */
  askToDeleteGroup(path: string, name: string): void {
    this.#overlay.set({
      kind: 'confirmation',
      title: `Move “${name}” to the trash?`,
      warning: this.#groupContents(path),
      action: () => void this.#store.deleteEntry(path),
    });
  }

  /** The category manager. SPEC.md §6.6. */
  manageCategories(): void {
    this.#overlay.set({ kind: 'categories' });
  }

  saveCategories(categories: readonly PageCategory[]): void {
    this.#overlay.set(null);
    void this.#store.saveCategories(categories);
  }

  /** What goes along with a group, in words, or null when it is empty. */
  #groupContents(path: string): string | null {
    const library = this.#store.library();
    const group = library === null ? null : findGroup(library, path);
    if (group === null) {
      return null;
    }
    const sheets = sheetsOf(group).length;
    const groups = [...walkLibrary(group)].filter(
      (entry) => entry.kind === 'group' && entry !== group,
    ).length;
    if (sheets === 0 && groups === 0) {
      return null;
    }

    const parts = [
      sheets === 1 ? '1 sheet' : `${String(sheets)} sheets`,
      ...(groups === 0 ? [] : [groups === 1 ? '1 subgroup' : `${String(groups)} subgroups`]),
    ];
    return `Everything in it goes too: ${parts.join(' and ')}.`;
  }

  #groupName(path: string): string {
    const library = this.#store.library();
    if (library === null) {
      return path;
    }
    return findGroup(library, path)?.displayName ?? path;
  }
}
