/**
 * The workbench's state: which project is open, what is selected, what is
 * being edited. SPEC.md §6, §9, §10.
 *
 * The rules it applies — which sheets a group shows, which groups must be
 * expanded to reveal a sheet — live in the portable core. This holds the
 * state and drives the bridge.
 */
import { computed, signal } from '@angular/core';
import {
  ancestorPaths,
  withSheetDisplayName,
  findGroup,
  findSheet,
  markdownToDisplay,
  outlineOf,
  parseSheet,
  serializeSheet,
  sheetsInGroup,
  textStatistics,
  visibleOutline,
  type EditorDocument,
  type GroupEntry,
  type OutlineEntry,
  type Sheet,
  type SheetDiagnostic,
  type SheetEntry,
  type SheetMetadata,
  type TextStatistics,
} from '@opera-incerta/core';
import type {
  BridgeResult,
  LibraryEditResult,
  OperaIncertaBridge,
  ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
import { unwrap, unwrapSnapshot } from './bridge.js';

export interface OpenSheet {
  readonly relativePath: string;
  readonly handleId: string;
  readonly displayName: string;
  /**
   * The parsed file: owned metadata, foreign front matter, and the body.
   *
   * The editor is given the **body only**. Front matter belongs to its own
   * area, deliberately outside the writing surface (SPEC.md §10.4), and
   * keeping it out of the editor is also what protects it: the codec puts the
   * file back together on save, so foreign keys survive whatever the author
   * types (SPEC.md §6.3).
   */
  readonly sheet: Sheet;
  /** The body as it was last read from or written to disk. */
  readonly savedBody: string;
  /**
   * Reported problems. A sheet with any is read-only: the application must not
   * guess what a malformed front matter block meant (SPEC.md §6.2).
   */
  readonly diagnostics: readonly SheetDiagnostic[];
  readonly writable: boolean;
}

export class WorkspaceStore {
  readonly #bridge: OperaIncertaBridge | null;

  readonly #project = signal<{ id: string; displayName: string } | null>(null);
  readonly #library = signal<GroupEntry | null>(null);
  readonly #handles = signal<Readonly<Record<string, string>>>({});
  readonly #selectedGroupPath = signal<string>('.');
  readonly #openSheet = signal<OpenSheet | null>(null);
  readonly #currentText = signal<string>('');
  readonly #currentMetadata = signal<SheetMetadata>({});
  readonly #showDeeperOutline = signal(false);
  readonly #expanded = signal<ReadonlySet<string>>(new Set(['.']));
  readonly #failure = signal<string | null>(null);
  readonly #busy = signal(false);

  constructor(bridge: OperaIncertaBridge | null) {
    this.#bridge = bridge;
  }

  readonly project = this.#project.asReadonly();
  readonly openSheet = this.#openSheet.asReadonly();
  readonly failure = this.#failure.asReadonly();
  readonly busy = this.#busy.asReadonly();
  readonly expanded = this.#expanded.asReadonly();
  readonly selectedGroupPath = this.#selectedGroupPath.asReadonly();

  /** True when the shell is present; the harness runs without one. */
  get hasBridge(): boolean {
    return this.#bridge !== null;
  }

  /**
   * The library as the interface shows it: the open sheet carries the title
   * being edited, not the one still on disk. Renaming the open sheet changes
   * its editing state (§6.4), and a rename nothing visibly answers looks like
   * a rename that failed.
   */
  readonly library = computed<GroupEntry | null>(() => {
    const library = this.#library();
    const open = this.#openSheet();
    if (library === null || open === null) {
      return library;
    }
    const edited = this.openTitle();
    return edited === null ? library : withSheetDisplayName(library, open.relativePath, edited);
  });

  /** The name the open sheet goes by, edited or saved. */
  readonly openTitle = computed<string | null>(() => {
    const open = this.#openSheet();
    if (open === null) {
      return null;
    }
    const title = this.#currentMetadata().title?.trim() ?? '';
    return title === '' ? open.displayName : title;
  });

  /** The group whose sheets the middle column shows. */
  readonly selectedGroup = computed<GroupEntry | null>(() => {
    const library = this.library();
    return library === null ? null : findGroup(library, this.#selectedGroupPath());
  });

  /** The sheets of that group — its direct ones only (SPEC.md §9.2). */
  readonly visibleSheets = computed<readonly SheetEntry[]>(() => {
    const group = this.selectedGroup();
    return group === null ? [] : sheetsInGroup(group);
  });

  /** The document the editor shows — the body, never the front matter. */
  readonly editorDocument = computed<EditorDocument | null>(() => {
    const open = this.#openSheet();
    return open === null ? null : { id: open.handleId, text: open.savedBody };
  });

  /**
   * Unsaved changes — in the body **or** in the metadata.
   *
   * The inspector edits the same file as the editor, so a changed keyword is
   * as unsaved as a changed paragraph.
   */
  readonly dirty = computed(() => {
    const open = this.#openSheet();
    if (open === null) {
      return false;
    }
    return (
      this.#currentText() !== open.savedBody ||
      !sameMetadata(this.#currentMetadata(), open.sheet.metadata)
    );
  });

  /** The metadata the inspector shows and edits. */
  readonly metadata = this.#currentMetadata.asReadonly();

  /** Progress figures for the inspector, over the body only (SPEC.md §11). */
  readonly statistics = computed<TextStatistics>(() => textStatistics(this.#currentText()));

  /** The outline of the open document. */
  readonly outline = computed<readonly OutlineEntry[]>(() =>
    outlineOf(markdownToDisplay(this.#currentText())),
  );

  /** The outline entries the sidebar shows, honouring the depth toggle. */
  readonly visibleOutlineEntries = computed<readonly OutlineEntry[]>(() =>
    visibleOutline(this.outline(), this.#showDeeperOutline()),
  );

  readonly showDeeperOutline = this.#showDeeperOutline.asReadonly();

  /** Problems reported for the open sheet, if any. */
  readonly diagnostics = computed<readonly SheetDiagnostic[]>(
    () => this.#openSheet()?.diagnostics ?? [],
  );

  /** False when the open sheet must not be written back. */
  readonly canSave = computed(() => {
    const open = this.#openSheet();
    return open !== null && open.writable && this.dirty();
  });

  /**
   * Adopts the project the main process already has open.
   *
   * The project window is created *because* a project was opened, so it finds
   * one waiting rather than asking for it.
   */
  async adoptOpenProject(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      const snapshot = unwrapSnapshot(await bridge.currentProject());
      if (snapshot !== null) {
        this.#adopt(snapshot);
      }
    });
  }

  async openProject(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      const snapshot = unwrapSnapshot(await bridge.openProject());
      if (snapshot !== null) {
        this.#adopt(snapshot);
      }
    });
  }

  /** Re-reads the project from disk, keeping the selection where possible. */
  async reloadProject(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      const snapshot = unwrapSnapshot(await bridge.reopenProject());
      if (snapshot !== null) {
        const previousSheet = this.#openSheet()?.relativePath ?? null;
        const previousGroup = this.#selectedGroupPath();
        this.#adopt(snapshot);
        this.#selectedGroupPath.set(previousGroup);
        if (previousSheet !== null) {
          await this.selectSheet(previousSheet);
        }
      }
    });
  }

  async closeProject(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      unwrap(await bridge.closeProject());
      this.#project.set(null);
      this.#library.set(null);
      this.#handles.set({});
      this.#openSheet.set(null);
      this.#currentText.set('');
      this.#currentMetadata.set({});
      this.#selectedGroupPath.set('.');
      this.#expanded.set(new Set(['.']));
    });
  }

  selectGroup(relativePath: string): void {
    this.#selectedGroupPath.set(relativePath);
  }

  toggleExpanded(relativePath: string): void {
    const next = new Set(this.#expanded());
    if (next.has(relativePath)) {
      next.delete(relativePath);
    } else {
      next.add(relativePath);
    }
    this.#expanded.set(next);
  }

  isExpanded(relativePath: string): boolean {
    return this.#expanded().has(relativePath);
  }

  /** Opens a sheet in the editor, expanding the tree down to it. */
  async selectSheet(relativePath: string): Promise<void> {
    const library = this.#library();
    const handleId = this.#handles()[relativePath];
    const sheet = library === null ? null : findSheet(library, relativePath);
    if (sheet === null || handleId === undefined) {
      return;
    }

    await this.#withBridge(async (bridge) => {
      const text = unwrap(
        await bridge.readSheet({ handle: { kind: 'opera-incerta/document', id: handleId } }),
      );
      const parsed = parseSheet(text);

      this.#openSheet.set({
        relativePath,
        handleId,
        displayName: sheet.displayName,
        sheet: parsed.sheet,
        savedBody: parsed.sheet.body,
        diagnostics: parsed.diagnostics,
        writable: parsed.writable,
      });
      this.#currentText.set(parsed.sheet.body);
      this.#currentMetadata.set(parsed.sheet.metadata);
      this.#expand(ancestorPaths(relativePath));
    });
  }

  /** Records what the editor currently holds, without writing anything. */
  noteText(text: string): void {
    this.#currentText.set(text);
  }

  /** Changes one or more metadata fields. Marks the sheet dirty, saves nothing. */
  updateMetadata(change: Partial<SheetMetadata>): void {
    const next: Record<string, unknown> = { ...this.#currentMetadata() };
    for (const [key, value] of Object.entries(change)) {
      if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
        // An emptied field is an absent field: writing `topic: ""` would put a
        // meaningless key into the author's file.
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    this.#currentMetadata.set(next as SheetMetadata);
  }

  /** Set from the layout state, which owns the preference. */
  setDeeperOutline(show: boolean): void {
    this.#showDeeperOutline.set(show);
  }

  /**
   * Writes the open sheet. No autosave: saving happens when the author asks
   * (SPEC.md §10.6).
   */
  async save(): Promise<void> {
    const open = this.#openSheet();
    if (open === null || !this.dirty()) {
      return;
    }
    if (!open.writable) {
      // A sheet whose front matter could not be understood is never written
      // back: guessing would destroy what it actually says (SPEC.md §6.2).
      this.#failure.set(open.diagnostics[0]?.code ?? 'sheet/read-only');
      return;
    }

    const body = this.#currentText();
    const metadata = this.#currentMetadata();
    // The codec reassembles the file, which is what keeps foreign front matter
    // intact through an edit the author made to the body or the inspector.
    const text = serializeSheet({ ...open.sheet, metadata, body });

    await this.#withBridge(async (bridge) => {
      unwrap(
        await bridge.writeSheet({
          handle: { kind: 'opera-incerta/document', id: open.handleId },
          text,
        }),
      );
      this.#openSheet.set({
        ...open,
        sheet: { ...open.sheet, metadata, body },
        savedBody: body,
      });
    });
  }

  /** Creates a sheet in a group and opens it. SPEC.md §6.5. */
  async createSheet(groupPath: string, title: string): Promise<void> {
    await this.#libraryEdit(async (bridge) => bridge.createSheet({ path: groupPath, name: title }));
  }

  async createGroup(parentPath: string, displayName: string): Promise<void> {
    await this.#libraryEdit(async (bridge) =>
      bridge.createGroup({ path: parentPath, name: displayName }),
    );
  }

  /**
   * Renames a sheet. SPEC.md §6.4 — the title changes, the file name never
   * does.
   *
   * The open sheet is renamed through its editing state rather than on disk:
   * writing the file would discard whatever is unsaved in the editor. It
   * becomes dirty, exactly as changing the title in the inspector does, since
   * that is the same change.
   */
  async renameSheet(relativePath: string, title: string): Promise<void> {
    if (this.#openSheet()?.relativePath === relativePath) {
      this.updateMetadata({ title });
      return;
    }
    await this.#libraryEdit(async (bridge) =>
      bridge.renameSheet({ path: relativePath, name: title }),
    );
  }

  async renameGroup(relativePath: string, displayName: string): Promise<void> {
    await this.#libraryEdit(async (bridge) =>
      bridge.renameGroup({ path: relativePath, name: displayName }),
    );
  }

  dismissFailure(): void {
    this.#failure.set(null);
  }

  /**
   * Runs a library edit and adopts the refreshed project it returns.
   *
   * The main process re-reads after every edit, so the interface takes one
   * refreshed truth instead of patching its own copy — a patched copy is how a
   * tree starts disagreeing with the disk.
   *
   * What was created decides where the selection lands (SPEC.md §6.5): a new
   * sheet reveals the group holding it, a new group reveals itself, and a
   * rename leaves the selection alone. Keeping the old group after a creation
   * would put a sheet in the editor that the list beside it does not show.
   */
  async #libraryEdit(
    operation: (bridge: OperaIncertaBridge) => Promise<BridgeResult<LibraryEditResult>>,
  ): Promise<void> {
    const previousGroup = this.#selectedGroupPath();
    const previousSheet = this.#openSheet()?.relativePath ?? null;

    await this.#withBridge(async (bridge) => {
      const result = unwrap(await operation(bridge));
      const created = result.createdPath;
      this.#adopt(result.snapshot);

      const ancestors = created === null ? [] : ancestorPaths(created);
      const reveal =
        created === null
          ? previousGroup
          : created.endsWith('.md')
            ? (ancestors[ancestors.length - 1] ?? '.')
            : created;
      this.#expand(ancestors);
      this.#selectedGroupPath.set(reveal);

      // A created sheet is selected and opened; otherwise the previously open
      // one stays open — creating a *group* must not close the editor
      // (SPEC.md §6.5).
      const toOpen = created !== null && created.endsWith('.md') ? created : previousSheet;
      if (toOpen !== null) {
        await this.selectSheet(toOpen);
      }
    });
  }

  #adopt(snapshot: ProjectSnapshot): void {
    this.#project.set({ id: snapshot.id, displayName: snapshot.displayName });
    this.#library.set(snapshot.library as GroupEntry);
    this.#handles.set(snapshot.handles);
    this.#selectedGroupPath.set('.');
    this.#openSheet.set(null);
    this.#currentText.set('');
    this.#currentMetadata.set({});
    this.#expanded.set(new Set(['.']));
  }

  #expand(paths: readonly string[]): void {
    const next = new Set(this.#expanded());
    for (const path of paths) {
      next.add(path);
    }
    this.#expanded.set(next);
  }

  /**
   * Runs one bridge operation, reporting a failure rather than throwing.
   *
   * A rejected promise in a click handler is a failure the author never sees;
   * `failure()` is what the interface shows them.
   */
  async #withBridge(operation: (bridge: OperaIncertaBridge) => Promise<void>): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.#failure.set('bridge/absent');
      return;
    }

    this.#busy.set(true);
    try {
      await operation(bridge);
      this.#failure.set(null);
    } catch (error: unknown) {
      this.#failure.set(
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'bridge/failed',
      );
    } finally {
      this.#busy.set(false);
    }
  }
}

/** Field-by-field comparison; two metadata records with the same values are equal. */
function sameMetadata(left: SheetMetadata, right: SheetMetadata): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const a = left[key as keyof SheetMetadata];
    const b = right[key as keyof SheetMetadata];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) {
        return false;
      }
      continue;
    }
    if (a !== b) {
      return false;
    }
  }
  return true;
}
