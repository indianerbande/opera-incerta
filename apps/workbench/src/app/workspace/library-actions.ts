/**
 * What the author can do to the library from its context menus, and the
 * questions asked on the way. specification.md §6.4, §6.5, §6.7, §6.6.
 *
 * A flow, not a component: it decides which menu entries an entry gets, what a
 * prompt says, and what happens when it is confirmed. The shell only renders
 * whatever overlay this puts up. Kept free of Angular so that the whole flow —
 * menu to prompt to store — runs in a unit test against the fake bridge.
 */
import { findGroup, sheetsOf, walkLibrary, type PageCategory } from '@opera-incerta/core';
import type { MenuEntry, OverlayHost } from '../shell/overlay.js';
import type { WorkspaceStore } from './workspace-store.js';
import { signal } from '@angular/core';
import { Localization } from '../localization/localization.js';

export interface MenuPoint {
  readonly x: number;
  readonly y: number;
}

export class LibraryActions {
  readonly #i18n: Localization;
  readonly #store: WorkspaceStore;
  readonly #overlay: OverlayHost;

  constructor(store: WorkspaceStore, overlay: OverlayHost, i18n: Localization = englishLocalization()) {
    this.#store = store;
    this.#overlay = overlay;
    this.#i18n = i18n;
  }

  /** The menu of a group in the tree. The root cannot be deleted or renamed away. */
  openGroupMenu(path: string, at: MenuPoint): void {
    if (this.#store.library() === null) {
      return;
    }
    const name = this.#groupName(path);
    const entries: MenuEntry[] = [
      { label: this.#i18n.t('library.menu.newSheet'), run: () => this.askForNewSheet(path) },
      { label: this.#i18n.t('library.menu.newGroup'), run: () => this.askForNewGroup(path) },
      { label: this.#i18n.t('library.menu.rename'), run: () => this.askToRenameGroup(path, name) },
    ];
    // The project root has no group above it to delete it from.
    if (path !== '.') {
      entries.push({
        label: this.#i18n.t('library.menu.deleteGroup'),
        run: () => this.askToDeleteGroup(path, name),
      });
    }
    this.#overlay.set({ kind: 'menu', entries, x: at.x, y: at.y });
  }

  /** The menu of a sheet in the list. */
  openSheetMenu(path: string, name: string, at: MenuPoint): void {
    this.#overlay.set({
      kind: 'menu',
      entries: [
        { label: this.#i18n.t('library.menu.rename'), run: () => this.askToRenameSheet(path, name) },
        { label: this.#i18n.t('library.menu.deleteSheet'), run: () => this.askToDeleteSheet(path, name) },
        // Exporting from this sheet on. specification.md §15.2: the whole document is
        // in the File menu, and the part that begins here belongs to the
        // sheet that begins it.
        {
          label: this.#i18n.t('export.markdownFromHere'),
          run: () => void this.#store.exportDocument('markdown', path),
        },
        {
          // A PDF is set with a stylesheet, so it asks which (specification.md §15.2);
          // the shell owns that dialog, and this says what it is for.
          label: this.#i18n.t('export.pdfFromHere'),
          run: () => this.#overlay.set({ kind: 'export', from: path }),
        },
      ],
      x: at.x,
      y: at.y,
    });
  }

  askForNewSheet(groupPath: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: this.#i18n.t('library.newSheet.title'),
      initial: '',
      placeholder: this.#i18n.t('library.newSheet.placeholder'),
      // The rule, where it applies: the file name is derived once and then
      // stays, while this title can change any time (specification.md §6.4).
      hint: this.#i18n.t('library.newSheet.hint'),
      confirmLabel: this.#i18n.t('common.create'),
      action: (value) => void this.#store.createSheet(groupPath, value),
    });
  }

  askForNewGroup(parentPath: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: this.#i18n.t('library.newGroup.title'),
      initial: '',
      placeholder: this.#i18n.t('library.newGroup.placeholder'),
      hint: this.#i18n.t('library.newGroup.hint'),
      confirmLabel: this.#i18n.t('common.create'),
      action: (value) => void this.#store.createGroup(parentPath, value),
    });
  }

  askToRenameGroup(path: string, name: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: this.#i18n.t('library.renameGroup.title'),
      initial: name,
      placeholder: '',
      hint: this.#i18n.t('library.renameGroup.hint'),
      confirmLabel: this.#i18n.t('common.rename'),
      action: (value) => void this.#store.renameGroup(path, value),
    });
  }

  askToRenameSheet(path: string, name: string): void {
    this.#overlay.set({
      kind: 'prompt',
      title: this.#i18n.t('library.renameSheet.title'),
      initial: name,
      placeholder: '',
      hint: this.#i18n.t('library.renameSheet.hint'),
      confirmLabel: this.#i18n.t('common.rename'),
      action: (value) => void this.#store.renameSheet(path, value),
    });
  }

  /** Deleting a sheet. specification.md §6.7. */
  askToDeleteSheet(path: string, name: string): void {
    const open = this.#store.openSheet();
    this.#overlay.set({
      kind: 'confirmation',
      title: this.#i18n.t('library.trash.title', { name }),
      // Unsaved work does not go to the trash with the file: it was never in
      // it. The author has to hear that before, not after.
      warning:
        open?.relativePath === path && this.#store.dirty()
          ? this.#i18n.t('library.trash.unsaved')
          : null,
      action: () => void this.#store.deleteEntry(path),
    });
  }

  /** Deleting a group, with what goes along with it spelled out. specification.md §6.7. */
  askToDeleteGroup(path: string, name: string): void {
    this.#overlay.set({
      kind: 'confirmation',
      title: this.#i18n.t('library.trash.title', { name }),
      warning: this.#groupContents(path),
      action: () => void this.#store.deleteEntry(path),
    });
  }

  /** The category manager. specification.md §6.6. */
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

    // By the platform's plural rules, never by a count-equals-one test
    // (specification.md §14.1) — which is what stood here before.
    const parts = [
      this.#i18n.n('library.sheets', sheets),
      ...(groups === 0 ? [] : [this.#i18n.n('library.subgroups', groups)]),
    ];
    return this.#i18n.t('library.trash.contents', {
      parts: parts.join(this.#i18n.t('library.trash.and')),
    });
  }

  #groupName(path: string): string {
    const library = this.#store.library();
    if (library === null) {
      return path;
    }
    return findGroup(library, path)?.displayName ?? path;
  }
}

/** The flows speak English unless told otherwise: what a unit test reads. */
export function englishLocalization(): Localization {
  return new Localization(signal<'system' | 'en' | 'de'>('en'), 'en');
}
