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
  findCategory,
  findGroup,
  findSheet,
  hasConflictMarkers,
  markdownToDisplay,
  outlineOf,
  ownedFrontMatterLines,
  parseSheet,
  readCategories,
  serializeSheet,
  sheetsInGroup,
  textStatistics,
  withShownSheet,
  type EditorDocument,
  type GroupEntry,
  type OutlineEntry,
  type PageCategory,
  type Sheet,
  type SheetDiagnostic,
  type SheetEntry,
  type SheetMetadata,
  type TextStatistics,
  RefreshCoordinator,
} from '@opera-incerta/core';
import {
  isLibraryEditResult,
  isProjectSnapshot,
  type BridgeResult,
  type LibraryEditResult,
  type OperaIncertaBridge,
  type ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
import { toBridgeFailure, unwrap, unwrapAs, unwrapSnapshot } from './bridge.js';

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
  readonly #currentForeign = signal<readonly string[]>([]);
  readonly #expanded = signal<ReadonlySet<string>>(new Set(['.']));
  readonly #failure = signal<string | null>(null);
  readonly #conflict = signal<string | null>(null);
  /**
   * Counts the times the editing state was **deliberately** dropped.
   *
   * A re-read captures what the editor holds and puts it back afterwards. If
   * the author decides in between that it should go — by discarding the change
   * (§12) or by taking the file in a conflict (§10.6) — the captured copy must
   * not come back. Comparing the count is how a restore knows it is stale.
   */
  #editingEpoch = 0;
  readonly #reload = new RefreshCoordinator(async () => this.#reloadOnce());
  readonly #editorDocument = signal<EditorDocument | null>(null);
  readonly #categories = signal<readonly PageCategory[]>([]);
  readonly #busy = signal(false);
  /**
   * Handles that a re-read no longer carries: the sheet was deleted or moved.
   * The editor forgets what it remembered for them (SPEC.md §6). Accumulated
   * for the life of the project, so the editor can catch up whenever it looks.
   */
  readonly #retiredHandles = signal<readonly string[]>([]);

  constructor(bridge: OperaIncertaBridge | null) {
    this.#bridge = bridge;
  }

  readonly project = this.#project.asReadonly();
  readonly openSheet = this.#openSheet.asReadonly();
  readonly failure = this.#failure.asReadonly();
  /** The sheet whose file changed under unsaved work. SPEC.md §10.6. */
  readonly conflict = this.#conflict.asReadonly();
  /** The project's page categories. SPEC.md §6.6. */
  readonly categories = this.#categories.asReadonly();
  readonly busy = this.#busy.asReadonly();
  readonly expanded = this.#expanded.asReadonly();
  readonly selectedGroupPath = this.#selectedGroupPath.asReadonly();
  readonly retiredHandles = this.#retiredHandles.asReadonly();

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
    const title = this.openTitle();
    const category = this.#currentMetadata().category ?? null;
    return withShownSheet(library, open.relativePath, {
      ...(title === null ? {} : { displayName: title }),
      category,
    });
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

  /**
   * The document the editor shows — the body, never the front matter.
   *
   * Set deliberately rather than derived: the editor seeds itself from this
   * once and owns the buffer afterwards, so it must change exactly when the
   * text on screen has to, and at no other time. Deriving it from what the
   * author is typing would hand the text back on every keystroke.
   */
  readonly editorDocument = this.#editorDocument.asReadonly();

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
      !sameMetadata(this.#currentMetadata(), open.sheet.metadata) ||
      this.#currentForeign().join('\n') !== open.sheet.foreignLines.join('\n')
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
        this.#selectedGroupPath.set('.');
      }
    });
  }

  async openProject(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      const snapshot = unwrapSnapshot(await bridge.openProject());
      if (snapshot !== null) {
        this.#adopt(snapshot);
        this.#selectedGroupPath.set('.');
      }
    });
  }

  /**
   * Re-reads the project from disk, keeping the selection where possible.
   *
   * Re-reading replaces the open sheet with what is on disk, and what the
   * author typed is not on disk. The comparison rule of `SPEC.md` §10.6
   * decides what happens: nothing when the file is unchanged, a silent reload
   * when it changed and nothing was typed, and the conflict prompt when both
   * are true. The author's version is kept meanwhile — the prompt asks, it does
   * not announce a loss.
   */
  reloadProject(): Promise<void> {
    return this.#reload.request();
  }

  /**
   * One re-read. Behind the coordinator, because two watch reports in quick
   * succession — a save, then a merge — used to start two overlapping
   * re-reads, and the earlier one could finish last with the older file:
   * the editor then showed a sheet the disk no longer had (the smoke's merge
   * check, once, 2026-09-04). Coalesced, a report during a re-read is read
   * after it, and never overtaken by it.
   */
  async #reloadOnce(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      const snapshot = unwrapSnapshot(await bridge.reopenProject());
      if (snapshot === null) {
        return;
      }
      await this.#readopt(snapshot, {
        group: this.#selectedGroupPath(),
        sheet: this.#openSheet()?.relativePath ?? null,
        sameDocument: true,
        mayConflict: true,
      });
    });
  }

  async closeProject(): Promise<void> {
    await this.#withBridge(async (bridge) => {
      unwrap(await bridge.closeProject());
      this.#project.set(null);
      this.#library.set(null);
      this.#handles.set({});
      this.#clearOpenSheet();
      this.#selectedGroupPath.set('.');
      this.#expanded.set(new Set(['.']));
      // Nothing is open, so nothing is watched: a watcher on a closed project
      // reports changes nobody can see.
      this.#watchWhatIsShown();
    });
  }

  selectGroup(relativePath: string): void {
    this.#selectedGroupPath.set(relativePath);
    this.#watchWhatIsShown();
  }

  /**
   * Tells the main process what to watch: the group on screen and the open
   * document. SPEC.md §10.6.
   *
   * Sent from here rather than worked out there, because only the interface
   * knows what the author is looking at. Fire and forget: a watch that could
   * not be established is a missing convenience, not a failed action, and
   * reporting it would put an error in front of an author who did nothing.
   */
  #watchWhatIsShown(): void {
    void this.#bridge?.watchTargets({
      group: this.#project() === null ? null : this.#selectedGroupPath(),
      sheet: this.#openSheet()?.relativePath ?? null,
    });
  }

  /**
   * Reacts to a change under a watched target by re-reading — where the
   * comparison rule of §10.6 decides what, if anything, the author sees.
   */
  listenForExternalChanges(): () => void {
    return this.#bridge?.onExternalChange(() => void this.reloadProject()) ?? ((): void => undefined);
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
      // A file a merge has not finished with carries both versions and the
      // markers between them. It is shown, and it is **not** writable: an
      // author typing around markers would save a file that is neither
      // version (SPEC.md §12).
      const conflicted = hasConflictMarkers(text);

      this.#openSheet.set({
        relativePath,
        handleId,
        displayName: sheet.displayName,
        sheet: parsed.sheet,
        savedBody: parsed.sheet.body,
        diagnostics: conflicted
          ? [{ code: 'merge/conflicted' as const, line: 1 }, ...parsed.diagnostics]
          : parsed.diagnostics,
        writable: parsed.writable && !conflicted,
      });
      this.#currentText.set(parsed.sheet.body);
      this.#currentMetadata.set(parsed.sheet.metadata);
      this.#currentForeign.set(parsed.sheet.foreignLines);
      this.#editorDocument.set({ id: handleId, text: parsed.sheet.body });
      this.#expand(ancestorPaths(relativePath));
      this.#watchWhatIsShown();
    });
  }

  /**
   * Drops whatever the editor still holds for these sheets. SPEC.md §12.
   *
   * Used after discarding a change: the author said to throw it away, and a
   * buffer that survived would put it back on the next save — and would raise
   * the conflict prompt of §10.6 in the meantime, asking about a decision that
   * has just been made.
   */
  forgetEdits(relativePaths: readonly string[]): void {
    const open = this.#openSheet();
    if (open !== null && relativePaths.includes(open.relativePath)) {
      this.#dropEditing(open);
    }
  }

  /** Records what the editor currently holds, without writing anything. */
  noteText(text: string): void {
    this.#currentText.set(text);
  }

  /**
   * Changes one or more metadata fields. Marks the sheet dirty, saves nothing.
   *
   * Only the owned fields are taken. The type says as much, but a template
   * binding is untyped at runtime, and a DOM Event once arrived here through
   * an output named like the event that bubbled beneath it: its `isTrusted`
   * became a field the file would never carry, so the sheet was dirty for
   * good and every re-read a conflict.
   */
  updateMetadata(change: Partial<SheetMetadata>): void {
    const next: Record<string, unknown> = { ...this.#currentMetadata() };
    for (const [key, value] of Object.entries(change)) {
      if (!METADATA_FIELDS.has(key)) {
        continue;
      }
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

  /**
   * The foreign front matter as the area shows it, and edits it. SPEC.md §6.3,
   * §10.4.
   *
   * Lines rather than parsed values: what is foreign is kept verbatim, and the
   * only honest way to let the author change it is to let them change the
   * lines.
   */
  readonly foreignLines = this.#currentForeign.asReadonly();

  /** The owned block, produced by the serializer that saves. SPEC.md §10.4. */
  readonly ownedLines = computed<readonly string[]>(() => {
    const open = this.#openSheet();
    return open === null
      ? []
      : ownedFrontMatterLines({ ...open.sheet, metadata: this.#currentMetadata() });
  });

  /**
   * The category of the open sheet, or null. An id naming nothing counts as
   * uncategorized, because a category may have been deleted (SPEC.md §6.6).
   */
  readonly category = computed(() =>
    findCategory(this.#categories(), this.#currentMetadata().category),
  );

  /** Replaces the project's categories and adopts what came back. */
  async saveCategories(categories: readonly PageCategory[]): Promise<void> {
    await this.#withBridge(async (bridge) => {
      const snapshot = unwrapAs(
        await bridge.writeCategories(categories),
        isProjectSnapshot,
        'snapshot',
      );
      await this.#readopt(snapshot, {
        group: this.#selectedGroupPath(),
        sheet: this.#openSheet()?.relativePath ?? null,
        sameDocument: true,
        mayConflict: false,
      });
    });
  }

  /** Replaces the foreign block. Marks the sheet dirty, saves nothing. */
  updateForeignLines(lines: readonly string[]): void {
    this.#currentForeign.set([...lines]);
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
    const foreignLines = this.#currentForeign();
    // The codec reassembles the file, which is what keeps foreign front matter
    // intact through an edit the author made to the body or the inspector.
    const text = serializeSheet({ ...open.sheet, metadata, foreignLines, body });

    await this.#withBridge(async (bridge) => {
      unwrap(
        await bridge.writeSheet({
          handle: { kind: 'opera-incerta/document', id: open.handleId },
          text,
        }),
      );
      this.#openSheet.set({
        ...open,
        sheet: { ...open.sheet, metadata, foreignLines, body },
        savedBody: body,
      });
    });
  }

  /** Creates a sheet in a group and opens it. SPEC.md §6.5. */
  async createSheet(groupPath: string, title: string): Promise<void> {
    await this.#libraryEdit(
      async (bridge) => bridge.createSheet({ path: groupPath, name: title }),
      { opensReveal: true },
    );
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

  /**
   * Puts an entry in a place: a group, and a position within it.
   * SPEC.md §6.4, §6.8.
   *
   * The interface names the sibling to land in front of, never a position: by
   * the time the main process has re-read the group, an index could point at
   * something else.
   *
   * A moved sheet is followed rather than closed. Its path changes, but it is
   * the same document, and what the author had unsaved in it belongs to it
   * wherever it goes.
   */
  async placeEntry(relativePath: string, into: string, before: string | null): Promise<void> {
    await this.#libraryEdit(
      async (bridge) => bridge.placeEntry({ path: relativePath, into, before }),
      { movedFrom: relativePath },
    );
  }

  /**
   * Moves an entry to the trash. SPEC.md §6.7.
   *
   * The neighbour to fall back on is worked out **before** the entry goes,
   * while it still has neighbours: the sheet after it, else the one before it.
   * Deleting what you were reading should leave you somewhere, not nowhere.
   */
  async deleteEntry(relativePath: string): Promise<void> {
    const siblings = this.visibleSheets();
    const index = siblings.findIndex((sheet) => sheet.relativePath === relativePath);
    const neighbour =
      index === -1
        ? null
        : (siblings[index + 1]?.relativePath ?? siblings[index - 1]?.relativePath ?? null);

    await this.#libraryEdit(async (bridge) => bridge.deleteEntry({ path: relativePath }), {
      fallbackSheet: neighbour,
    });
  }

  /**
   * What the author had in the editor, saved baseline and all — enough to put
   * it back after a re-read, and to tell an external change from our own.
   */
  #editingState(): EditingState | null {
    const open = this.#openSheet();
    if (open === null) {
      return null;
    }
    return {
      epoch: this.#editingEpoch,
      path: open.relativePath,
      savedBody: open.savedBody,
      savedMetadata: open.sheet.metadata,
      savedForeign: open.sheet.foreignLines,
      text: this.#currentText(),
      metadata: this.#currentMetadata(),
      foreign: this.#currentForeign(),
      dirty: this.dirty(),
    };
  }

  /**
   * Puts the editing state back over a freshly read sheet, applying the
   * comparison rule of `SPEC.md` §10.6.
   *
   * `mayConflict` says whether a difference on disk is worth asking about. A
   * library edit does not touch the open sheet's file, so a difference there
   * is not what that operation was about; an explicit re-read is exactly when
   * the author wants to be told.
   */
  #restoreEditing(before: EditingState | null, path: string, mayConflict: boolean): void {
    const open = this.#openSheet();
    // The caller has established that this is the same document; its path may
    // have changed on the way, which is exactly what a move does.
    if (before === null || open === null) {
      return;
    }
    if (before.epoch !== this.#editingEpoch) {
      // Dropped on purpose while this read was in flight. Putting it back
      // would undo a decision the author has just made.
      return;
    }

    // The file itself, compared against the baseline that was loaded — not
    // against what the author typed. Only a real difference counts (§10.6).
    const changedOnDisk =
      open.savedBody !== before.savedBody ||
      !sameMetadata(open.sheet.metadata, before.savedMetadata) ||
      open.sheet.foreignLines.join('\n') !== before.savedForeign.join('\n');

    if (!before.dirty) {
      // Nothing was typed: whatever is on disk is simply the truth now.
      return;
    }

    this.#currentText.set(before.text);
    this.#currentMetadata.set(before.metadata);
    this.#currentForeign.set(before.foreign);
    // The editor was seeded from the file a moment ago; what belongs on screen
    // is the author's version.
    this.#editorDocument.set({ id: open.handleId, text: before.text });
    if (changedOnDisk && mayConflict) {
      this.#conflict.set(path);
    }
  }

  /**
   * Resolves the conflict prompt. `'disk'` takes the file, `'mine'` keeps what
   * the author has — which is what is already in the editor, so it only closes
   * the prompt.
   */
  resolveConflict(take: 'disk' | 'mine'): void {
    const open = this.#openSheet();
    if (take === 'disk' && open !== null) {
      this.#dropEditing(open);
    }
    this.#conflict.set(null);
  }

  /**
   * Puts the editor back to what was last read from or written to disk, on
   * the author's say-so. The epoch moves, so a re-read that is in flight will
   * not put the dropped work back (see `#editingEpoch`).
   */
  #dropEditing(open: OpenSheet): void {
    this.#editingEpoch += 1;
    this.#currentText.set(open.savedBody);
    this.#currentMetadata.set(open.sheet.metadata);
    this.#currentForeign.set(open.sheet.foreignLines);
    this.#editorDocument.set({ id: open.handleId, text: open.savedBody });
    // A conflict prompt asks whether to keep the author's version. Dropped on
    // purpose, that version is gone, and the question with it: a discard's
    // own re-read once raised the prompt a moment before the discard forgot
    // the edits, and the prompt stayed up asking about nothing (2026-09-04).
    if (this.#conflict() === open.relativePath) {
      this.#conflict.set(null);
    }
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
    options: {
      /** Opened when what was open is gone — a deletion. */
      readonly fallbackSheet?: string | null;
      /** The path an entry left: the same document, now somewhere else. */
      readonly movedFrom?: string | null;
      /**
       * Whether the revealed entry is also opened. A created sheet is; a
       * placed one is not — the author was moving it, not choosing it.
       */
      readonly opensReveal?: boolean;
    } = {},
  ): Promise<void> {
    const previousGroup = this.#selectedGroupPath();
    const previousSheet = this.#openSheet()?.relativePath ?? null;

    await this.#withBridge(async (bridge) => {
      const result = unwrapAs(await operation(bridge), isLibraryEditResult, 'edit-result');
      const created = result.revealPath;
      const library = result.snapshot.library;
      const ancestors = created === null ? [] : ancestorPaths(created);
      const placed = (options.movedFrom ?? null) !== null;
      const reveal =
        created === null
          ? previousGroup
          : created.endsWith('.md')
            ? // A sheet is shown where it now is; otherwise it would vanish
              // from the column with no explanation.
              (ancestors[ancestors.length - 1] ?? '.')
            : placed
              ? // A group that was merely moved does not take the selection
                // with it: the author is still looking at what they were.
                previousGroup
              : created;

      // A created sheet is selected and opened; otherwise the previously open
      // one stays open — creating a *group* must not close the editor
      // (SPEC.md §6.5).
      // A move can take the open sheet with it — as itself, or inside a group
      // that moved around it.
      const followed = followMove(previousSheet, options.movedFrom ?? null, created);
      const opens =
        options.opensReveal === true && created !== null && created.endsWith('.md')
          ? created
          : previousSheet;
      const wanted = followed ?? opens;
      const toOpen =
        wanted !== null && findSheet(library, wanted) !== null
          ? wanted
          : (options.fallbackSheet ?? null);

      await this.#readopt(result.snapshot, {
        group: reveal,
        expand: ancestors,
        sheet: toOpen,
        // The same document, either because it never moved or because this is
        // where it went.
        sameDocument: toOpen === previousSheet || toOpen === followed,
        mayConflict: false,
      });
    });
  }

  /**
   * Takes a re-read of the **same** project and puts the author back where
   * they were: the group (or the nearest one that still exists), the sheet,
   * and whatever was in the editor.
   *
   * One choreography for the three things that re-read — an explicit reload,
   * a library edit, saving the categories — because each used to carry its own
   * copy of it, and three copies of "capture, adopt, select, restore" is three
   * places for the order to go wrong.
   */
  async #readopt(
    snapshot: ProjectSnapshot,
    wanted: {
      /** The group to show; the nearest existing one is taken. */
      readonly group: string;
      /** Groups to open in the tree on the way, if any. */
      readonly expand?: readonly string[];
      /** The sheet to open, or null for none. */
      readonly sheet: string | null;
      /** Whether that sheet is the document that was open, so its edits belong to it. */
      readonly sameDocument: boolean;
      /** Whether a difference on disk is worth the conflict prompt (§10.6). */
      readonly mayConflict: boolean;
    },
  ): Promise<void> {
    // Adopting a refreshed project re-reads the open sheet from disk. What the
    // author has typed but not saved is not on disk, and renaming a *different*
    // sheet is no reason to lose it.
    const before = this.#editingState();
    this.#adopt(snapshot, true);
    this.#expand(wanted.expand ?? []);
    // The selection has to land on something that still exists: a deleted
    // group takes the selection with it otherwise, and the columns would show
    // a place that is gone.
    this.#selectedGroupPath.set(nearestGroup(snapshot.library, wanted.group));

    if (wanted.sheet === null) {
      this.#clearOpenSheet();
      return;
    }
    await this.selectSheet(wanted.sheet);
    if (wanted.sameDocument) {
      this.#restoreEditing(before, wanted.sheet, wanted.mayConflict);
    }
  }

  /**
   * Takes a freshly read project.
   *
   * `keepOpen` is for a **re-read of the same project**: the open sheet is
   * replaced a moment later by the caller, and clearing it in between empties
   * the editor for exactly as long as one bridge round trip takes. With a
   * watcher running that happens after every save, and the author watches
   * their text blink. Opening a *different* project clears it, because the
   * sheet that was open belongs to the other one.
   */
  #adopt(snapshot: ProjectSnapshot, keepOpen = false): void {
    this.#project.set({ id: snapshot.id, displayName: snapshot.displayName });
    this.#library.set(snapshot.library);
    const surviving = new Set(Object.values(snapshot.handles));
    const gone = Object.values(this.#handles()).filter((id) => !surviving.has(id));
    if (gone.length > 0) {
      this.#retiredHandles.set([...this.#retiredHandles(), ...gone]);
    }
    this.#handles.set(snapshot.handles);
    this.#categories.set(readCategories(snapshot.categories));
    if (!keepOpen) {
      this.#clearOpenSheet();
    }
    // The tree keeps what it had open, minus whatever no longer exists. A
    // re-read that collapsed it would do so on every save once a watcher is
    // running, and the author would watch their tree fold itself up.
    const kept = new Set<string>(['.']);
    for (const path of this.#expanded()) {
      if (findGroup(snapshot.library, path) !== null) {
        kept.add(path);
      }
    }
    this.#expanded.set(kept);
    this.#watchWhatIsShown();
  }

  #clearOpenSheet(): void {
    this.#openSheet.set(null);
    this.#editorDocument.set(null);
    this.#currentText.set('');
    this.#currentMetadata.set({});
    this.#currentForeign.set([]);
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
      this.#failure.set(toBridgeFailure(error).code);
    } finally {
      this.#busy.set(false);
    }
  }
}

/** The fields of `SheetMetadata`, for the runtime check the type cannot make. */
const METADATA_FIELDS: ReadonlySet<string> = new Set<keyof SheetMetadata>([
  'title',
  'topic',
  'keywords',
  'status',
  'category',
  'notes',
]);

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

/** The editor's state at a moment: the baseline it was read from, and the work on top. */
interface EditingState {
  readonly epoch: number;
  readonly path: string;
  readonly savedBody: string;
  readonly savedMetadata: SheetMetadata;
  readonly savedForeign: readonly string[];
  readonly text: string;
  readonly metadata: SheetMetadata;
  readonly foreign: readonly string[];
  readonly dirty: boolean;
}

/**
 * Where a path ended up after a move, or null when the move did not touch it.
 *
 * A group that moves takes everything under it along, so the open sheet may
 * have a new path without having been the thing that was dragged.
 */
function followMove(open: string | null, movedFrom: string | null, movedTo: string | null): string | null {
  if (open === null || movedFrom === null || movedTo === null) {
    return null;
  }
  if (open === movedFrom) {
    return movedTo;
  }
  return open.startsWith(`${movedFrom}/`) ? `${movedTo}${open.slice(movedFrom.length)}` : null;
}

/**
 * The nearest group that still exists, walking up from a path.
 *
 * After a deletion the remembered selection may name a group that is gone; its
 * parent is the honest place to land, and the root always exists.
 */
function nearestGroup(library: GroupEntry, relativePath: string): string {
  for (const candidate of [relativePath, ...[...ancestorPaths(relativePath)].reverse()]) {
    if (findGroup(library, candidate) !== null) {
      return candidate;
    }
  }
  return '.';
}
