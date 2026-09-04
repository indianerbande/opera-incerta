import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { visibleOutline } from '@opera-incerta/core';

import { EditorComponent } from './editor/editor.component.js';
import { FrontMatterBlockComponent } from './editor/front-matter.component.js';
import { ExplorerNodeComponent } from './library/explorer.component.js';
import {
  DensitySwitchComponent,
  SheetListComponent,
} from './library/sheet-list.component.js';
import { SourceControlComponent } from './library/source-control.component.js';
import { ActivityBarComponent, type ActivityItem } from './shell/activity-bar.component.js';
import { ContextMenuComponent } from './shell/context-menu.component.js';
import { ConfirmPromptComponent } from './shell/confirm-prompt.component.js';
import { IdentityPromptComponent } from './shell/identity-prompt.component.js';
import { SettingsComponent } from './shell/settings.component.js';
import type { GitIdentity } from '@opera-incerta/desktop-contract';
import { LibraryDrag, describeListEnd, describeRow, type OverRow } from './shell/library-drag.js';
import { TextPromptComponent } from './shell/text-prompt.component.js';
import {
  LayoutState,
  NAVIGATOR_ITEMS,
  SECONDARY_ITEMS,
} from './shell/layout-state.js';
import { PanelHeaderComponent } from './shell/panel-header.component.js';
import { ResizeDividerComponent } from './shell/resize-divider.component.js';
import { BranchesComponent } from './library/branches.component.js';
import { TextEditorComponent } from './shell/text-editor.component.js';
import { ConflictResolverComponent } from './library/conflict-resolver.component.js';
import { DiffViewComponent } from './library/diff-view.component.js';
import { CategoryManagerComponent } from './sidebar/category-manager.component.js';
import { InspectorComponent } from './sidebar/inspector.component.js';
import { OutlineComponent } from './sidebar/outline.component.js';
import { type MenuEntry } from './shell/overlay.js';
import { DESKTOP_BRIDGE } from './workspace/bridge.js';
import { LibraryActions } from './workspace/library-actions.js';
import { OVERLAY, WORKBENCH_PROVIDERS } from './workspace/providers.js';
import { SourceControlActions } from './workspace/source-control-actions.js';
import { SourceControlStore } from './workspace/source-control-store.js';
import { WorkspaceStore } from './workspace/workspace-store.js';
import { ACTIVITY_BAR_WIDTH } from './workbench-layout.js';

/**
 * The workbench shell. SPEC.md §8, §8.7.
 *
 * It composes the regions and renders whatever overlay is up. What a click
 * *means* — which menu an entry gets, what a prompt asks, what confirming does
 * — is decided in `LibraryActions` and `SourceControlActions`, which hold no
 * Angular and are tested without this component. The shell holds no document
 * state and applies no Markdown rule of its own.
 */
@Component({
  selector: 'wi-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [...WORKBENCH_PROVIDERS],
  imports: [
    ActivityBarComponent,
    BranchesComponent,
    CategoryManagerComponent,
    TextEditorComponent,
    ConflictResolverComponent,
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
    IdentityPromptComponent,
    SettingsComponent,
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
        [tools]="toolItems"
        (activate)="layout.showNavigator($event)"
        (tool)="overlay.set({ kind: 'settings', opener: 'activityBar' })"
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
              <wi-explorer-node [group]="library" />
            } @else {
              <p class="hint">No project open.</p>
            }
          </div>
        } @else {
          <wi-source-control />
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
        <wi-sheet-list />
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
          <wi-editor
            #editor
            [document]="document"
            [retired]="store.retiredHandles()"
            (textChange)="store.noteText($event)"
          />
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
          <wi-panel-header [title]="layout.secondaryTitle()">
            @if (layout.secondaryView() === 'outline') {
              <button
                type="button"
                [attr.aria-pressed]="layout.showDeeperOutline()"
                title="Show H3 to H6"
                (click)="layout.toggleDeeperOutline()"
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
                (manage)="libraryActions.manageCategories()"
                (change)="store.updateMetadata($event)"
              />
            }
            @case ('outline') {
              <wi-outline
                [entries]="visibleOutlineEntries()"
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

    <!-- One overlay at a time (SPEC.md §8.7). The conflict prompt below is
         the store's own and may stand beside it: it is raised by a re-read,
         not by a click. -->
    @if (overlay(); as open) {
      @if (open.kind === 'menu') {
        <wi-context-menu
          [entries]="open.entries"
          [x]="open.x"
          [y]="open.y"
          (choose)="chooseMenuEntry($event)"
          (dismiss)="overlay.set(null)"
        />
      }
      @if (open.kind === 'prompt') {
        <wi-text-prompt
          [title]="open.title"
          [initial]="open.initial"
          [placeholder]="open.placeholder"
          [hint]="open.hint"
          [confirmLabel]="open.confirmLabel"
          (confirm)="confirmPrompt($event)"
          (cancel)="overlay.set(null)"
        />
      }
      @if (open.kind === 'confirmation') {
        <wi-confirm-prompt
          [title]="open.title"
          [warning]="open.warning"
          [hint]="open.hint ?? 'It goes to the desktop trash, where it can be restored.'"
          [confirmLabel]="open.confirmLabel ?? 'Delete'"
          (confirm)="confirmAction()"
          (cancel)="overlay.set(null)"
        />
      }
      @if (open.kind === 'identity') {
        <wi-identity-prompt
          [initial]="open.initial"
          (confirm)="confirmIdentity($event)"
          (cancel)="overlay.set(null)"
        />
      }
      @if (open.kind === 'ignore') {
        <wi-text-editor
          title="Ignored files"
          hint="One path or pattern per line, as git reads them."
          [text]="open.text"
          (save)="gitActions.saveIgnore($event)"
          (close)="overlay.set(null)"
        />
      }
      @if (open.kind === 'branches') {
        <wi-branches
          [branches]="open.branches"
          (switchTo)="gitActions.switchBranch($event)"
          (remove)="gitActions.askToDeleteBranch($event)"
          (create)="gitActions.askForBranchName()"
          (close)="overlay.set(null)"
        />
      }
      @if (open.kind === 'resolver') {
        <wi-conflict-resolver
          [path]="open.path"
          [text]="open.text"
          [incoming]="sourceControl.tracking()?.upstream ?? null"
          (resolved)="gitActions.applyResolution(open.path, $event)"
          (close)="overlay.set(null)"
        />
      }
      @if (open.kind === 'diff') {
        <wi-diff-view
          [path]="open.path"
          [text]="open.text"
          [versions]="open.versions"
          (close)="overlay.set(null)"
        />
      }
      @if (open.kind === 'settings') {
        <wi-settings
          [identity]="sourceControl.identity()"
          [opener]="open.opener"
          (close)="overlay.set(null)"
          (manageCategories)="overlay.set({ kind: 'categories' })"
          (saveIdentityRequest)="sourceControl.setIdentity($event)"
        />
      }
      @if (open.kind === 'categories') {
        <wi-category-manager
          [categories]="store.categories()"
          (confirm)="libraryActions.saveCategories($event)"
          (cancel)="overlay.set(null)"
        />
      }
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
  // Everything below is provided once, in `WORKBENCH_PROVIDERS`, and injected
  // here and in every region that reads it (SPEC.md §8.7).
  readonly #bridge = inject(DESKTOP_BRIDGE);
  protected readonly store = inject(WorkspaceStore);
  protected readonly sourceControl = inject(SourceControlStore);
  protected readonly layout = inject(LayoutState);
  /** What lies over the workbench, if anything. SPEC.md §8.7. */
  protected readonly overlay = inject(OVERLAY);
  protected readonly libraryActions = inject(LibraryActions);
  protected readonly gitActions = inject(SourceControlActions);
  /**
   * Dragging in the library. SPEC.md §6.4, §6.8.
   *
   * The columns name their rows in the DOM and draw what this says; the
   * measuring happens here, where both of them are in reach. `elementFromPoint`
   * is what makes a drop in the *other* column possible at all.
   */
  protected readonly libraryDrag = inject(LibraryDrag);

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
      } else if (command === 'settings/open') {
        this.overlay.set({ kind: 'settings', opener: 'menu' });
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
  /** The one tool of the leading bar: the settings dialog (SPEC.md §13). */
  protected readonly toolItems: readonly ActivityItem[] = [
    { id: 'settings', icon: 'icon-settings', label: 'Settings' },
  ];

  /** The dirty marker follows the document name, as in every editor. */
  protected editorTitle(): string | null {
    const title = this.store.openTitle();
    if (title === null) {
      return null;
    }
    return this.store.dirty() ? `${title} •` : title;
  }

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

  /**
   * The library row under a point, with what the drag needs to know about it.
   *
   * The DOM says which row and where its box is; the model says the rest —
   * its place among its siblings, their names, the group above. A row names
   * itself by kind and path only.
   */
  #rowAt(x: number, y: number): OverRow | null {
    const library = this.store.library();
    if (library === null) {
      return null;
    }
    const under = document.elementFromPoint(x, y);
    const element = under?.closest('[data-drop]') ?? null;
    if (element === null) {
      // Not on a row: the empty space of a list is the end of that list.
      const list = under?.closest('[data-drop-list]') ?? null;
      if (list === null) {
        return null;
      }
      const kind = list.getAttribute('data-drop-list') === 'group' ? 'group' : 'sheet';
      const end = describeListEnd(library, kind, list.getAttribute('data-parent') ?? '.');
      return end === null ? null : { ...end, box: list.getBoundingClientRect(), past: true };
    }

    const kind = element.getAttribute('data-drop') === 'group' ? 'group' : 'sheet';
    const described = describeRow(library, kind, element.getAttribute('data-path') ?? '');
    if (described === null) {
      return null;
    }
    const bounds = element.getBoundingClientRect();
    return { ...described, box: { top: bounds.top, bottom: bounds.bottom } };
  }

  /** A chosen menu entry runs after the menu is gone, so it may put up the next overlay. */
  protected chooseMenuEntry(entry: MenuEntry): void {
    this.overlay.set(null);
    entry.run();
  }

  protected confirmPrompt(value: string): void {
    const open = this.overlay();
    this.overlay.set(null);
    if (open?.kind === 'prompt') {
      open.action(value);
    }
  }

  protected confirmAction(): void {
    const open = this.overlay();
    this.overlay.set(null);
    if (open?.kind === 'confirmation') {
      open.action();
    }
  }

  protected confirmIdentity(identity: GitIdentity): void {
    const open = this.overlay();
    this.overlay.set(null);
    if (open?.kind === 'identity') {
      open.action(identity);
    }
  }

  /** The outline at the depth the layout preference asks for. SPEC.md §11. */
  protected readonly visibleOutlineEntries = computed(() =>
    visibleOutline(this.store.outline(), this.layout.showDeeperOutline()),
  );

  /** Outline navigation, routed to the editor. */
  protected revealLine(line: number): void {
    this.editor()?.revealLine(line);
  }
}
