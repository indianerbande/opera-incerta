import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import {
  findGroup,
  sheetsOf,
  walkLibrary,
  type GitFileStatus,
  type PageCategory,
} from '@opera-incerta/core';
import { EditorComponent } from './editor/editor.component.js';
import { FrontMatterBlockComponent } from './editor/front-matter.component.js';
import { ExplorerNodeComponent } from './library/explorer.component.js';
import {
  DensitySwitchComponent,
  SheetListComponent,
} from './library/sheet-list.component.js';
import { SourceControlComponent } from './library/source-control.component.js';
import { ActivityBarComponent } from './shell/activity-bar.component.js';
import {
  ContextMenuComponent,
  type ContextMenuEntry,
} from './shell/context-menu.component.js';
import { ConfirmPromptComponent } from './shell/confirm-prompt.component.js';
import { LibraryDrag, type OverRow } from './shell/library-drag.js';
import { TextPromptComponent } from './shell/text-prompt.component.js';
import {
  LayoutState,
  NAVIGATOR_ITEMS,
  SECONDARY_ITEMS,
} from './shell/layout-state.js';
import { PanelHeaderComponent } from './shell/panel-header.component.js';
import { ResizeDividerComponent } from './shell/resize-divider.component.js';
import { DiffViewComponent } from './library/diff-view.component.js';
import { CategoryManagerComponent } from './sidebar/category-manager.component.js';
import { InspectorComponent } from './sidebar/inspector.component.js';
import { OutlineComponent } from './sidebar/outline.component.js';
import { resolveBridge } from './workspace/bridge.js';
import { SourceControlStore } from './workspace/source-control-store.js';
import { WorkspaceStore } from './workspace/workspace-store.js';
import { ACTIVITY_BAR_WIDTH } from './workbench-layout.js';

/**
 * The workbench shell. SPEC.md §8.
 *
 * It composes the regions and routes user actions to the store; it holds no
 * document state and applies no Markdown rule of its own.
 */
@Component({
  selector: 'wi-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActivityBarComponent,
    CategoryManagerComponent,
    DiffViewComponent,
    ContextMenuComponent,
    DensitySwitchComponent,
    EditorComponent,
    FrontMatterBlockComponent,
    ExplorerNodeComponent,
    InspectorComponent,
    OutlineComponent,
    PanelHeaderComponent,
    ResizeDividerComponent,
    SheetListComponent,
    SourceControlComponent,
    ConfirmPromptComponent,
    TextPromptComponent,
  ],
  // The whole library drag lives here, because this is the one element that
  // contains both columns it can run between (SPEC.md §6.8).
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp()',
    '(pointercancel)': 'libraryDrag.cancel()',
  },
  template: `
    <div class="workbench">
      <wi-activity-bar
        class="activity-bar"
        [style.width.px]="activityBarWidth"
        [items]="navigatorItems"
        [activeId]="layout.navigatorView()"
        (activate)="layout.showNavigator($event)"
      />

      <section class="navigator" [style.width.px]="layout.columnWidths().navigator">
        <wi-panel-header [verbatimTitle]="store.project()?.displayName ?? null">
          @if (layout.navigatorView() === 'sourceControl') {
            <button type="button" (click)="sourceControl.refresh()" title="Refresh">↻</button>
          } @else {
            <button type="button" (click)="store.reloadProject()" title="Reload from disk">↻</button>
          }
        </wi-panel-header>

        @if (layout.navigatorView() === 'explorer') {
          <div class="tree" data-drop-list="group" data-parent=".">
            @if (store.library(); as library) {
              <wi-explorer-node
                [group]="library"
                [selectedPath]="store.selectedGroupPath()"
                [expandedPaths]="store.expanded()"
                [drag]="libraryDrag"
                (select)="store.selectGroup($event)"
                (toggle)="store.toggleExpanded($event)"
                (contextMenu)="openGroupMenu($event)"
              />
            } @else {
              <p class="hint">No project open.</p>
            }
          </div>
        } @else {
          <wi-source-control
            [entries]="sourceControl.entries()"
            [selectAll]="sourceControl.selectAll()"
            [message]="sourceControl.message()"
            [failure]="sourceControl.failure()"
            [canCommit]="sourceControl.canCommit()"
            [root]="sourceControl.repositoryRoot()"
            [loaded]="sourceControl.loaded()"
            (toggle)="sourceControl.toggle($event)"
            (discard)="askToDiscard($event)"
            (showDiff)="showDiff($event)"
            (toggleAll)="sourceControl.toggleAll()"
            (messageChange)="sourceControl.setMessage($event)"
            (commit)="sourceControl.commit()"
            (commitAndPush)="sourceControl.commitAndPush()"
          />
        }
      </section>

      <wi-resize-divider
        (resize)="layout.resizeColumn('navigator', $event)"
        (reset)="layout.resetColumn('navigator')"
      />

      <section class="sheet-list" [style.width.px]="layout.columnWidths().sheetList">
        <wi-panel-header>
          <wi-density-switch
            [density]="layout.sheetListDensity()"
            (densityChange)="layout.setDensity($event)"
          />
          <label class="blank-lines">
            <input
              type="checkbox"
              [checked]="layout.showBlankLines()"
              (change)="layout.toggleBlankLines()"
            />
            ¶
          </label>
        </wi-panel-header>
        <wi-sheet-list
          [sheets]="store.visibleSheets()"
          [selectedPath]="store.openSheet()?.relativePath ?? null"
          [density]="layout.sheetListDensity()"
          [showBlankLines]="layout.showBlankLines()"
          [drag]="libraryDrag"
          [groupPath]="store.selectedGroupPath()"
          [categories]="store.categories()"
          (select)="store.selectSheet($event)"
          (contextMenu)="openSheetMenu($event)"
        />
      </section>

      <wi-resize-divider
        (resize)="layout.resizeColumn('sheetList', $event)"
        (reset)="layout.resetColumn('sheetList')"
      />

      <section class="editor">
        <wi-panel-header [verbatimTitle]="editorTitle()">
          @if (store.diagnostics().length > 0) {
            <span class="read-only" [title]="store.diagnostics()[0]?.code">read-only</span>
          }
          @if (store.openSheet() !== null) {
            <label class="switch">
              <input
                type="checkbox"
                [checked]="layout.showFrontMatter()"
                (change)="layout.toggleFrontMatter()"
              />
              Variables
            </label>
            @if (layout.showFrontMatter()) {
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="layout.frontMatterWritable()"
                  (change)="layout.toggleFrontMatterWritable()"
                />
                Writable
              </label>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="layout.showOwnedFrontMatter()"
                  (change)="layout.toggleOwnedFrontMatter()"
                />
                System
              </label>
            }
          }
          @if (store.canSave()) {
            <button type="button" (click)="store.save()">Save</button>
          }
        </wi-panel-header>

        @if (layout.showFrontMatter() && store.openSheet() !== null) {
          <!-- Foreign first: it is what an author of a project shared with
               other tools actually came here to look at (SPEC.md §10.4). -->
          @if (store.foreignLines().length > 0) {
            <wi-front-matter-block
              label="Foreign front matter"
              [lines]="store.foreignLines()"
              [writable]="layout.frontMatterWritable()"
              (linesChange)="store.updateForeignLines($event)"
            />
          }
          @if (layout.showOwnedFrontMatter() && store.ownedLines().length > 0) {
            <wi-front-matter-block
              label="Own front matter"
              [lines]="store.ownedLines()"
              [owned]="true"
            />
          }
        }

        @if (store.editorDocument(); as document) {
          <wi-editor #editor [document]="document" (textChange)="store.noteText($event)" />
        } @else {
          <p class="hint">Select a sheet to start writing.</p>
        }
      </section>

      @if (layout.secondaryVisible()) {
        <wi-resize-divider
          side="trailing"
          (resize)="layout.resizeColumn('secondarySidebar', $event)"
          (reset)="layout.resetColumn('secondarySidebar')"
        />

        <section class="secondary-sidebar" [style.width.px]="layout.columnWidths().secondarySidebar">
          <wi-panel-header [title]="secondaryTitle()">
            @if (layout.secondaryView() === 'outline') {
              <button
                type="button"
                [attr.aria-pressed]="layout.showDeeperOutline()"
                title="Show H3 to H6"
                (click)="toggleDeeperOutline()"
              >
                H3–H6
              </button>
            }
          </wi-panel-header>

          @switch (layout.secondaryView()) {
            @case ('inspector') {
              <wi-inspector
                [metadata]="store.metadata()"
                [statistics]="store.statistics()"
                [available]="store.openSheet() !== null"
                [categories]="store.categories()"
                (manage)="managingCategories.set(true)"
                (change)="store.updateMetadata($event)"
              />
            }
            @case ('outline') {
              <wi-outline
                [entries]="store.visibleOutlineEntries()"
                (reveal)="revealLine($event)"
              />
            }
            @default {
              <p class="hint">Not built yet.</p>
            }
          }
        </section>
      }

      <wi-activity-bar
        class="activity-bar"
        [style.width.px]="activityBarWidth"
        [items]="secondaryItems"
        [activeId]="layout.activeSecondaryId()"
        (activate)="layout.showSecondary($event)"
      />
    </div>

    @if (menu(); as open) {
      <wi-context-menu
        [entries]="open.entries"
        [x]="open.x"
        [y]="open.y"
        (choose)="chooseMenuEntry($event)"
        (dismiss)="menu.set(null)"
      />
    }

    @if (prompt(); as open) {
      <wi-text-prompt
        [title]="open.title"
        [initial]="open.initial"
        [placeholder]="open.placeholder"
        [hint]="open.hint"
        [confirmLabel]="open.confirmLabel"
        (confirm)="confirmPrompt($event)"
        (cancel)="prompt.set(null)"
      />
    }

    @if (diff(); as shown) {
      <wi-diff-view [path]="shown.path" [text]="shown.text" (close)="diff.set(null)" />
    }

    @if (managingCategories()) {
      <wi-category-manager
        [categories]="store.categories()"
        (confirm)="saveCategories($event)"
        (cancel)="managingCategories.set(false)"
      />
    }

    @if (store.conflict(); as path) {
      <wi-confirm-prompt
        title="This sheet changed on disk while you were editing it"
        warning="Loading the file discards what you have not saved."
        hint="Keeping yours changes nothing on disk; saving afterwards overwrites the file."
        confirmLabel="Load the file"
        (confirm)="store.resolveConflict('disk')"
        (cancel)="store.resolveConflict('mine')"
      />
    }

    @if (confirmation(); as open) {
      <wi-confirm-prompt
        [title]="open.title"
        [warning]="open.warning"
        [hint]="open.hint ?? 'It goes to the desktop trash, where it can be restored.'"
        [confirmLabel]="open.confirmLabel ?? 'Delete'"
        (confirm)="confirmDeletion()"
        (cancel)="confirmation.set(null)"
      />
    }

    @if (store.failure(); as failure) {
      <div class="failure" role="alert">
        <span>{{ failure }}</span>
        <button type="button" (click)="store.dismissFailure()">Dismiss</button>
      </div>
    }
  `,
  styles: `
    .workbench {
      display: flex;
      height: 100vh;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .workbench > * {
      overflow: hidden;
      border-inline-end: 1px solid rgba(128, 128, 128, 0.35);
    }
    .workbench > :last-child {
      border-inline-end: none;
    }
    .activity-bar {
      flex: none;
    }
    .navigator,
    .sheet-list,
    .secondary-sidebar {
      display: flex;
      flex: none;
      flex-direction: column;
    }
    .editor {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 380px;
    }
    .tree {
      overflow: auto;
      flex: 1 1 auto;
      padding: 4px;
      min-height: 0;
    }
    .hint {
      margin: 0;
      padding: 8px;
      color: rgba(128, 128, 128, 0.9);
    }
    wi-editor {
      flex: 1 1 auto;
      min-height: 0;
    }
    .switch {
      display: flex;
      align-items: center;
      gap: 3px;
      color: rgba(128, 128, 128, 0.95);
      white-space: nowrap;
    }
    .read-only {
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(190, 90, 90, 0.18);
      color: rgba(150, 60, 60, 0.95);
    }
    .blank-lines {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    button {
      padding: 2px 6px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .failure {
      position: fixed;
      right: 12px;
      bottom: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid rgba(190, 90, 90, 0.6);
      border-radius: 6px;
      background: Canvas;
      font: 12px system-ui, sans-serif;
    }
  `,
})
export class AppComponent {
  readonly #bridge = resolveBridge();
  protected readonly store = new WorkspaceStore(this.#bridge);
  protected readonly sourceControl = new SourceControlStore(this.#bridge);
  protected readonly layout = new LayoutState(this.#bridge);

  protected readonly navigatorItems = NAVIGATOR_ITEMS;
  protected readonly secondaryItems = SECONDARY_ITEMS;

  private readonly editor = viewChild<EditorComponent>('editor');

  constructor() {
    // The window exists because a project was opened; it finds it waiting.
    void this.store.adoptOpenProject();
    void this.layout.load();

    // Saving arrives from the menu, not from a key handler: the menu item owns
    // Cmd+S, so the keystroke never reaches this page (SPEC.md §8.5).
    const stopListening = this.#bridge?.onMenuCommand((command) => {
      if (command === 'sheet/save') {
        void this.store.save();
      }
    });
    // A change under the group or the open document arrives without anyone
    // asking (SPEC.md §10.6). What it means is decided by re-reading.
    const stopWatching = this.store.listenForExternalChanges();
    const stopWatchingRepository = this.sourceControl.listenForRepositoryChanges();
    inject(DestroyRef).onDestroy(() => {
      stopListening?.();
      stopWatching();
      stopWatchingRepository();
    });

    // Source control reads when its view is shown, and after a save: both are
    // moments when what git reports has just changed. While it is on screen —
    // and only then — the repository is watched, so a change made elsewhere
    // arrives without asking (SPEC.md §12).
    effect(() => {
      const showing =
        this.layout.navigatorView() === 'sourceControl' && this.store.project() !== null;
      if (showing) {
        void this.sourceControl.refresh();
      }
      void this.#bridge?.watchRepository(showing);
    });
  }

  protected readonly activityBarWidth = ACTIVITY_BAR_WIDTH;

  /** The dirty marker follows the document name, as in every editor. */
  protected editorTitle(): string | null {
    const title = this.store.openTitle();
    if (title === null) {
      return null;
    }
    return this.store.dirty() ? `${title} •` : title;
  }

  /**
   * Dragging in the library. SPEC.md §6.4, §6.8.
   *
   * The columns describe their rows in the DOM and draw what this says; the
   * measuring happens here, where both of them are in reach. `elementFromPoint`
   * is what makes a drop in the *other* column possible at all.
   */
  protected readonly libraryDrag = new LibraryDrag();

  protected onPointerDown(event: PointerEvent): void {
    const over = this.#rowAt(event.clientX, event.clientY);
    // The root has no siblings and no group above it, so it is a destination
    // but never a passenger.
    if (event.button === 0 && over !== null && over.row.parent !== '') {
      this.libraryDrag.press(over.row, event.clientY);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.libraryDrag.moveTo(event.clientY, this.#rowAt(event.clientX, event.clientY))) {
      // Otherwise the pointer selects text while a row is being moved.
      event.preventDefault();
    }
  }

  protected onPointerUp(): void {
    const drop = this.libraryDrag.release();
    if (drop === null) {
      return;
    }
    void this.store.placeEntry(drop.path, drop.into, drop.before);
  }

  /** The library row under a point, with what the drag needs to know about it. */
  #rowAt(x: number, y: number): OverRow | null {
    const under = document.elementFromPoint(x, y);
    const element = under?.closest('[data-drop]') ?? null;
    if (element === null) {
      // Not on a row: the empty space of a list is the end of that list.
      const list = under?.closest('[data-drop-list]') ?? null;
      if (list === null) {
        return null;
      }
      const kind = list.getAttribute('data-drop-list') === 'group' ? 'group' : 'sheet';
      const parent = list.getAttribute('data-parent') ?? '';
      const peers = this.#peers(kind, parent);
      return {
        row: { kind, path: '', parent, index: peers.length },
        box: list.getBoundingClientRect(),
        siblings: peers.map((peer) => peer.getAttribute('data-name') ?? ''),
        past: true,
      };
    }

    const kind = element.getAttribute('data-drop') === 'group' ? 'group' : 'sheet';
    const parent = element.getAttribute('data-parent') ?? '';
    const peers = this.#peers(kind, parent);
    const bounds = element.getBoundingClientRect();

    return {
      row: {
        kind,
        path: element.getAttribute('data-path') ?? '',
        parent,
        index: peers.indexOf(element),
      },
      box: { top: bounds.top, bottom: bounds.bottom },
      siblings: peers.map((peer) => peer.getAttribute('data-name') ?? ''),
    };
  }

  /**
   * The rows of one list, in the order shown.
   *
   * Filtered rather than selected by attribute value: a path may contain
   * anything a directory name may contain, quotes included.
   */
  #peers(kind: 'sheet' | 'group', parent: string): readonly Element[] {
    return [...document.querySelectorAll(`[data-drop="${kind}"]`)].filter(
      (peer) => (peer.getAttribute('data-parent') ?? '') === parent,
    );
  }

  /** The open context menu, and what it acts on. */
  protected readonly menu = signal<{
    entries: readonly ContextMenuEntry[];
    x: number;
    y: number;
    target: { kind: 'group' | 'sheet'; path: string; name: string };
  } | null>(null);

  /** Whether the category manager is open. SPEC.md §6.6. */
  protected readonly managingCategories = signal(false);

  protected saveCategories(categories: readonly PageCategory[]): void {
    this.managingCategories.set(false);
    void this.store.saveCategories(categories);
  }

  /** The open confirmation, and what it would take away. SPEC.md §6.7. */
  protected readonly confirmation = signal<{
    title: string;
    warning: string | null;
    /** What the destructive button says, and what happens afterwards. */
    hint?: string;
    confirmLabel?: string;
    action: () => void;
  } | null>(null);

  /** The open prompt, and what confirming it will do. */
  protected readonly prompt = signal<{
    title: string;
    initial: string;
    placeholder: string;
    hint: string | null;
    confirmLabel: string;
    action: (value: string) => void;
  } | null>(null);

  protected openGroupMenu(event: { path: string; x: number; y: number }): void {
    const group = this.store.library() === null ? null : event.path;
    if (group === null) {
      return;
    }
    this.menu.set({
      entries: [
        { id: 'sheet/new', label: 'New Sheet…' },
        { id: 'group/new', label: 'New Group…' },
        { id: 'group/rename', label: 'Rename…' },
        // The project root has no group above it to delete it from.
        ...(event.path === '.' ? [] : [{ id: 'group/delete', label: 'Delete Group…' }]),
      ],
      x: event.x,
      y: event.y,
      target: { kind: 'group', path: event.path, name: this.groupName(event.path) },
    });
  }

  protected openSheetMenu(event: { path: string; name: string; x: number; y: number }): void {
    this.menu.set({
      entries: [
        { id: 'sheet/rename', label: 'Rename…' },
        { id: 'sheet/delete', label: 'Delete Sheet…' },
      ],
      x: event.x,
      y: event.y,
      target: { kind: 'sheet', path: event.path, name: event.name },
    });
  }

  protected chooseMenuEntry(id: string): void {
    const open = this.menu();
    this.menu.set(null);
    if (open === undefined || open === null) {
      return;
    }
    const { target } = open;

    switch (id) {
      case 'sheet/new':
        this.prompt.set({
          title: 'New sheet',
          initial: '',
          placeholder: 'The First Scene',
          // The rule, where it applies: the file name is derived once and then
          // stays, while this title can change any time (SPEC.md §6.4).
          hint: 'The title can change later; the file name is set once, from it.',
          confirmLabel: 'Create',
          action: (value) => void this.store.createSheet(target.path, value),
        });
        return;
      case 'group/new':
        this.prompt.set({
          title: 'New group',
          initial: '',
          placeholder: 'Part One',
          hint: 'The name can change later; the folder name is set once, from it.',
          confirmLabel: 'Create',
          action: (value) => void this.store.createGroup(target.path, value),
        });
        return;
      case 'group/rename':
        this.prompt.set({
          title: 'Rename group',
          initial: target.name,
          placeholder: '',
          hint: 'Renaming changes the name shown here, never the folder on disk.',
          confirmLabel: 'Rename',
          action: (value) => void this.store.renameGroup(target.path, value),
        });
        return;
      case 'sheet/rename':
        this.prompt.set({
          title: 'Rename sheet',
          initial: target.name,
          placeholder: '',
          hint: 'Renaming changes the title in the file, never the file name.',
          confirmLabel: 'Rename',
          action: (value) => void this.store.renameSheet(target.path, value),
        });
        return;
      case 'sheet/delete':
        this.confirmation.set({
          title: `Move “${target.name}” to the trash?`,
          // Unsaved work does not go to the trash with the file: it was never
          // in it. The author has to hear that before, not after.
          warning:
            this.store.openSheet()?.relativePath === target.path && this.store.dirty()
              ? 'It has unsaved changes, and those are not in the trash afterwards.'
              : null,
          action: () => void this.store.deleteEntry(target.path),
        });
        return;
      case 'group/delete':
        this.confirmation.set({
          title: `Move “${target.name}” to the trash?`,
          warning: this.groupContents(target.path),
          action: () => void this.store.deleteEntry(target.path),
        });
        return;
      default:
        return;
    }
  }

  protected confirmPrompt(value: string): void {
    const open = this.prompt();
    this.prompt.set(null);
    open?.action(value);
  }

  /** The diff on screen, if any. SPEC.md §12. */
  protected readonly diff = signal<{ path: string; text: string } | null>(null);

  protected async showDiff(entry: GitFileStatus): Promise<void> {
    const text = await this.sourceControl.diff(entry.path);
    if (text !== null) {
      this.diff.set({ path: entry.path, text });
    }
  }

  /**
   * Confirms throwing a change away. SPEC.md §12.
   *
   * The warning says what actually happens, and the two cases differ: a
   * tracked file goes back to its last committed state, while an untracked one
   * has no earlier state to go back to and goes to the trash instead.
   */
  protected askToDiscard(entry: GitFileStatus): void {
    const untracked = entry.groups.includes('untracked');
    this.confirmation.set({
      title: `Discard the changes to “${entry.path}”?`,
      warning: untracked
        ? 'This file is not in the repository yet, so there is nothing to go back to: it goes to the trash.'
        : 'The file goes back to its last committed state, and unsaved changes to it in the editor go with it.',
      hint: untracked
        ? 'It goes to the desktop trash, where it can be restored.'
        : 'The committed version stays in the repository’s history either way.',
      confirmLabel: 'Discard',
      action: () => void this.discardChanges(entry),
    });
  }

  private async discardChanges(entry: GitFileStatus): Promise<void> {
    const affected = await this.sourceControl.discard([entry.path]);
    // Whatever the editor still held for those sheets would otherwise put the
    // discarded change back on the next save.
    this.store.forgetEdits(affected);
  }

  protected confirmDeletion(): void {
    const open = this.confirmation();
    this.confirmation.set(null);
    open?.action();
  }

  /** What goes along with a group, in words, or null when it is empty. */
  private groupContents(path: string): string | null {
    const library = this.store.library();
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

  private groupName(path: string): string {
    const library = this.store.library();
    if (library === null) {
      return path;
    }
    return findGroup(library, path)?.displayName ?? path;
  }

  /** The toggle lives in the layout state; the outline reads it from there. */
  protected toggleDeeperOutline(): void {
    this.layout.toggleDeeperOutline();
    this.store.setDeeperOutline(this.layout.showDeeperOutline());
  }

  /** Outline navigation, routed to the editor. */
  protected revealLine(line: number): void {
    this.editor()?.revealLine(line);
  }

  protected secondaryTitle(): string {
    return {
      inspector: 'Inspector',
      outline: 'Outline',
      ai: 'AI assistant',
      snapshots: 'Snapshots',
    }[this.layout.secondaryView()];
  }
}
