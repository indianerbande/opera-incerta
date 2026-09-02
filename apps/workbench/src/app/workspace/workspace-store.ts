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
  findGroup,
  findSheet,
  parseSheet,
  serializeSheet,
  sheetsInGroup,
  type EditorDocument,
  type GroupEntry,
  type Sheet,
  type SheetDiagnostic,
  type SheetEntry,
} from '@opera-incerta/core';
import type { OperaIncertaBridge, ProjectSnapshot } from '@opera-incerta/desktop-contract';
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
  readonly #expanded = signal<ReadonlySet<string>>(new Set(['.']));
  readonly #failure = signal<string | null>(null);
  readonly #busy = signal(false);

  constructor(bridge: OperaIncertaBridge | null) {
    this.#bridge = bridge;
  }

  readonly project = this.#project.asReadonly();
  readonly library = this.#library.asReadonly();
  readonly openSheet = this.#openSheet.asReadonly();
  readonly failure = this.#failure.asReadonly();
  readonly busy = this.#busy.asReadonly();
  readonly expanded = this.#expanded.asReadonly();
  readonly selectedGroupPath = this.#selectedGroupPath.asReadonly();

  /** True when the shell is present; the harness runs without one. */
  get hasBridge(): boolean {
    return this.#bridge !== null;
  }

  /** The group whose sheets the middle column shows. */
  readonly selectedGroup = computed<GroupEntry | null>(() => {
    const library = this.#library();
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

  /** Unsaved changes. Drives the dirty marker and the close guard. */
  readonly dirty = computed(() => {
    const open = this.#openSheet();
    return open !== null && this.#currentText() !== open.savedBody;
  });

  /** Problems reported for the open sheet, if any. */
  readonly diagnostics = computed<readonly SheetDiagnostic[]>(
    () => this.#openSheet()?.diagnostics ?? [],
  );

  /** False when the open sheet must not be written back. */
  readonly canSave = computed(() => {
    const open = this.#openSheet();
    return open !== null && open.writable && this.dirty();
  });

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
      this.#expand(ancestorPaths(relativePath));
    });
  }

  /** Records what the editor currently holds, without writing anything. */
  noteText(text: string): void {
    this.#currentText.set(text);
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
    // The codec reassembles the file, which is what keeps foreign front matter
    // intact through an edit the author made to the body alone.
    const text = serializeSheet({ ...open.sheet, body });

    await this.#withBridge(async (bridge) => {
      unwrap(
        await bridge.writeSheet({
          handle: { kind: 'opera-incerta/document', id: open.handleId },
          text,
        }),
      );
      this.#openSheet.set({ ...open, savedBody: body });
    });
  }

  dismissFailure(): void {
    this.#failure.set(null);
  }

  #adopt(snapshot: ProjectSnapshot): void {
    this.#project.set({ id: snapshot.id, displayName: snapshot.displayName });
    this.#library.set(snapshot.library as GroupEntry);
    this.#handles.set(snapshot.handles);
    this.#selectedGroupPath.set('.');
    this.#openSheet.set(null);
    this.#currentText.set('');
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
