import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { findSheet, visibleOutline } from '@opera-incerta/core';

import { EditorComponent } from './editor/editor.component.js';
import { ExportDialogComponent } from './export/export-dialog.component.js';
import { FrontMatterBlockComponent } from './editor/front-matter.component.js';
import { ExplorerNodeComponent } from './library/explorer.component.js';
import {
  DensitySwitchComponent,
  SheetListComponent,
} from './library/sheet-list.component.js';
import { LibrarySearchComponent } from './library/library-search.component.js';
import { SourceControlComponent } from './library/source-control.component.js';
import { ActivityBarComponent, type ActivityItem } from './shell/activity-bar.component.js';
import { startAppearance } from './shell/appearance.js';
import { ContextMenuComponent } from './shell/context-menu.component.js';
import { ConfirmPromptComponent } from './shell/confirm-prompt.component.js';
import { IdentityPromptComponent } from './shell/identity-prompt.component.js';
import { FindBarComponent } from './editor/find-bar.component.js';
import { StatusBarComponent } from './editor/status-bar.component.js';
import { EditorSession } from './editor/editor-session.js';
import { SettingsComponent } from './shell/settings.component.js';
import type { GitIdentity, LibrarySearchHit } from '@opera-incerta/desktop-contract';
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
import { Localization } from './localization/localization.js';

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
    ExportDialogComponent,
    FindBarComponent,
    FrontMatterBlockComponent,
    ExplorerNodeComponent,
    InspectorComponent,
    LibrarySearchComponent,
    OutlineComponent,
    PanelHeaderComponent,
    ResizeDividerComponent,
    SheetListComponent,
    SourceControlComponent,
    ConfirmPromptComponent,
    IdentityPromptComponent,
    StatusBarComponent,
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
          <button
            type="button"
            class="recent"
            [title]="i18n.t('app.recentTitle')"
            (click)="openRecentMenu($event)"
          >
            {{ i18n.t('app.recent') }}
          </button>
          @if (layout.navigatorView() === 'sourceControl') {
            <button type="button" (click)="sourceControl.refresh()" [title]="i18n.t('app.refresh')">↻</button>
          } @else {
            <button type="button" (click)="store.reloadProject()" [title]="i18n.t('app.reload')">↻</button>
          }
        </wi-panel-header>

        @switch (layout.navigatorView()) {
          @case ('explorer') {
            <div class="tree" data-drop-list="group" data-parent=".">
              @if (store.library(); as library) {
                <wi-explorer-node [group]="library" />
              } @else {
                <p class="hint">{{ i18n.t('app.noProject') }}</p>
              }
            </div>
          }
          @case ('search') {
            <wi-library-search (reveal)="openSearchHit($event)" />
          }
          @default {
            <wi-source-control />
          }
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
            <span class="read-only" [title]="store.diagnostics()[0]?.code">{{ i18n.t('app.readOnly') }}</span>
          }
          @if (store.openSheet() !== null) {
            <label class="switch">
              <input
                type="checkbox"
                [checked]="layout.showFrontMatter()"
                (change)="layout.toggleFrontMatter()"
              />
              {{ i18n.t('app.frontMatter.show') }}
            </label>
            @if (layout.showFrontMatter()) {
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="layout.frontMatterWritable()"
                  (change)="layout.toggleFrontMatterWritable()"
                />
                {{ i18n.t('app.frontMatter.writable') }}
              </label>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="layout.showOwnedFrontMatter()"
                  (change)="layout.toggleOwnedFrontMatter()"
                />
                {{ i18n.t('app.frontMatter.system') }}
              </label>
            }
          }
          @if (store.canSave()) {
            <button type="button" (click)="store.save()">{{ i18n.t('common.save') }}</button>
          }
        </wi-panel-header>

        @if (layout.showFrontMatter() && store.openSheet() !== null) {
          <!-- Foreign first: it is what an author of a project shared with
               other tools actually came here to look at (SPEC.md §10.4). -->
          @if (store.foreignLines().length > 0) {
            <wi-front-matter-block
              [label]="i18n.t('app.frontMatter.foreign')"
              [lines]="store.foreignLines()"
              [writable]="layout.frontMatterWritable()"
              (linesChange)="store.updateForeignLines($event)"
            />
          }
          @if (layout.showOwnedFrontMatter() && store.ownedLines().length > 0) {
            <wi-front-matter-block
              [label]="i18n.t('app.frontMatter.own')"
              [lines]="store.ownedLines()"
              [owned]="true"
            />
          }
        }

        @if (session.finding()) {
          <wi-find-bar
            [query]="session.query()"
            [state]="session.searchState()"
            (queryChange)="find($event)"
            (step)="stepFind($event)"
            (close)="closeFind()"
          />
        }

        @if (store.editorDocument(); as document) {
          <wi-editor
            #editor
            [document]="document"
            [retired]="store.retiredHandles()"
            [typography]="editorTypography()"
            [zoom]="layout.editorZoom()"
            (textChange)="store.noteText($event)"
            (cursorChange)="session.noteCursor($event)"
          />
          <wi-status-bar
            [cursor]="session.cursor()"
            [wrapping]="wrapping()"
            [zoom]="layout.editorZoom()"
            (toggleWrap)="session.toggleWrap(document.id, layout.editorWordWrap())"
            (zoomChange)="layout.setEditorZoom($event)"
          />
        } @else {
          <p class="hint">{{ i18n.t('app.selectSheet') }}</p>
        }
      </section>

      @if (layout.secondaryVisible()) {
        <wi-resize-divider
          side="trailing"
          (resize)="layout.resizeColumn('secondarySidebar', $event)"
          (reset)="layout.resetColumn('secondarySidebar')"
        />

        <section class="secondary-sidebar" [style.width.px]="layout.columnWidths().secondarySidebar">
          <wi-panel-header [title]="i18n.t(layout.secondaryTitleKey())">
            @if (layout.secondaryView() === 'outline') {
              <button
                type="button"
                [attr.aria-pressed]="layout.showDeeperOutline()"
                [title]="i18n.t('app.outline.deeperTitle')"
                (click)="layout.toggleDeeperOutline()"
              >
                {{ i18n.t('app.outline.deeper') }}
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
                (metadataChange)="store.updateMetadata($event)"
              />
            }
            @case ('outline') {
              <wi-outline
                [entries]="visibleOutlineEntries()"
                (reveal)="revealLine($event)"
              />
            }
            @default {
              <p class="hint">{{ i18n.t('app.notBuilt') }}</p>
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
          [hint]="open.hint ?? i18n.t('confirm.trashHint')"
          [confirmLabel]="open.confirmLabel ?? i18n.t('common.delete')"
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
      @if (open.kind === 'export') {
        <wi-export-dialog
          [own]="store.stylesheets()"
          [initial]="layout.exportStylesheet()"
          [fetchedCss]="fetchedCss()"
          (requestCss)="fetchCss($event)"
          (save)="saveStylesheet($event)"
          (run)="runExport(open.from, $event)"
          (close)="overlay.set(null)"
        />
      }

      @if (open.kind === 'ignore') {
        <wi-text-editor
          [title]="i18n.t('app.ignore.title')"
          [hint]="i18n.t('app.ignore.hint')"
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
        [title]="i18n.t('app.conflict.title')"
        [warning]="i18n.t('app.conflict.warning')"
        [hint]="i18n.t('app.conflict.hint')"
        [confirmLabel]="i18n.t('app.conflict.confirm')"
        (confirm)="store.resolveConflict('disk')"
        (cancel)="store.resolveConflict('mine')"
      />
    }

    @if (store.failure(); as failure) {
      <div class="failure" role="alert">
        <span>{{ failure }}</span>
        <button type="button" (click)="store.dismissFailure()">{{ i18n.t('app.dismiss') }}</button>
      </div>
    }

    @if (exportNote(); as note) {
      <div class="note" role="status">
        <span>{{ note }}</span>
        <button type="button" (click)="store.dismissNote()">{{ i18n.t('app.dismiss') }}</button>
      </div>
    }
  `,
  styles: `
    /*
     * The regions are panels on a canvas, and the activity bars are the
     * window's rails (SPEC.md §8.2). The air between two panels is the
     * divider itself, so the gap one sees is the thing one grabs.
     */
    .workbench {
      display: flex;
      height: 100vh;
      background: var(--wi-canvas);
      font: 13px/1.4 var(--wi-sans);
    }
    .workbench > * {
      overflow: hidden;
    }
    .activity-bar {
      flex: none;
      background: var(--wi-navigation-bg);
    }
    .workbench > section {
      border: 1px solid var(--wi-line);
      border-radius: var(--wi-radius-panel);
      margin-block: var(--wi-space-3);
      background: var(--wi-panel);
      box-shadow: var(--wi-panel-shadow);
    }
    .workbench > section:first-of-type {
      margin-inline-start: var(--wi-space-3);
    }
    .workbench > section:last-of-type {
      margin-inline-end: var(--wi-space-3);
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
      color: var(--wi-muted);
    }
    wi-editor {
      flex: 1 1 auto;
      min-height: 0;
    }
    .switch {
      display: flex;
      align-items: center;
      gap: 3px;
      color: var(--wi-muted);
      white-space: nowrap;
    }
    .read-only {
      padding: 1px 5px;
      border-radius: var(--wi-radius-control);
      background: color-mix(in srgb, var(--wi-danger) 18%, transparent);
      color: var(--wi-danger);
    }
    .blank-lines {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    button {
      display: inline-flex;
      height: var(--wi-control-height);
      align-items: center;
      padding: 0 var(--wi-space-3);
      border: 1px solid var(--wi-line-strong);
      border-radius: var(--wi-radius-control);
      background: var(--wi-control-bg);
      color: var(--wi-control-ink);
      font: inherit;
      line-height: 1;
      cursor: default;
    }
    button:hover {
      border-color: var(--wi-accent);
      background: var(--wi-accent-soft);
    }
    .failure,
    .note {
      position: fixed;
      right: 12px;
      bottom: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid var(--wi-danger-border);
      border-radius: var(--wi-radius-panel);
      background: var(--wi-panel);
      box-shadow: var(--wi-panel-shadow);
      font: 12px var(--wi-sans);
    }
    /* Something that went right wears the accent, not the danger colour. */
    .note {
      border-color: var(--wi-accent);
    }
  `,
})
export class AppComponent {
  protected readonly i18n = inject(Localization);
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

    // The document's language follows the interface language (SPEC.md §14).
    effect(() => {
      document.documentElement.lang = this.i18n.language();
    });

    // And its scheme and palette follow the appearance settings (SPEC.md §8.8).
    const stopAppearance = startAppearance(
      document.documentElement,
      this.layout.colorScheme,
      this.layout.accentPalette,
    );
    inject(DestroyRef).onDestroy(stopAppearance);

    // Saving arrives from the menu, not from a key handler: the menu item owns
    // Cmd+S, so the keystroke never reaches this page (SPEC.md §8.5).
    const stopListening = this.#bridge?.onMenuCommand((command) => {
      if (command === 'sheet/save') {
        void this.store.save();
      } else if (command === 'editor/find') {
        this.openFind();
      } else if (command === 'go/back') {
        void this.store.step('back');
      } else if (command === 'go/forward') {
        void this.store.step('forward');
      } else if (command === 'export/markdown') {
        // Markdown carries no stylesheet, so it opens no dialog (SPEC.md §15.2).
        void this.store.exportDocument('markdown', null);
      } else if (command === 'export/pdf') {
        void this.openExportDialog(null);
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
  protected readonly session = inject(EditorSession);
  /** For scheduling work after a render, when a signal alone is too early. */
  readonly #injector = inject(Injector);

  /** This sheet's wrapping: its own switch, or the settings' default. SPEC.md §10.5. */
  protected readonly wrapping = computed(() =>
    this.session.isWrapping(this.store.editorDocument()?.id ?? null, this.layout.editorWordWrap()),
  );

  /** The settings' typography, with this sheet's wrap switch applied. */
  protected readonly editorTypography = computed(() => ({
    ...this.layout.editorTypography(),
    wordWrap: this.wrapping(),
  }));
  /** The one tool of the leading bar: the settings dialog (SPEC.md §13). */
  protected readonly toolItems: readonly ActivityItem[] = [
    { id: 'settings', icon: 'icon-settings', labelKey: 'view.settings' },
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
  /**
   * Finding in the open sheet. SPEC.md §10.11.
   *
   * The bar opens seeded with the selection, and every keystroke in it is a
   * fresh search: the editor holds the matches, the session holds what to
   * show, and this component only carries one to the other.
   */
  protected openFind(): void {
    if (this.store.editorDocument() === null) {
      return;
    }
    this.session.startFinding(this.editor()?.selectedText() ?? '');
    this.find(this.session.query());
  }

  protected find(query: string): void {
    this.session.noteQuery(query);
    this.session.noteSearch(this.editor()?.search(query) ?? { matches: 0, current: 0 });
  }

  protected stepFind(direction: 'forwards' | 'backwards'): void {
    this.session.noteSearch(this.editor()?.stepSearch(direction) ?? { matches: 0, current: 0 });
  }

  protected closeFind(): void {
    this.editor()?.clearSearch();
    this.session.stopFinding();
  }

  /**
   * A match from the library search: open that sheet, then that line.
   * SPEC.md §9.3 — the same path the outline takes, one step longer.
   */
  /**
   * What an export has to say, in the interface's language. SPEC.md §15.2.
   *
   * The store holds the outcome; the words are here, where the catalogue is
   * (§14.2). The keys are literal, which is what the localization test
   * requires and what keeps a key from being assembled out of a variable.
   */
  protected readonly exportNote = computed(() => {
    const note = this.store.note();
    if (note === null) {
      return null;
    }
    return note.kind === 'written'
      ? this.i18n.t('export.written', { path: note.shortPath })
      : this.i18n.t('export.empty');
  });

  /**
   * The sheets that were saved most recently, as a menu. SPEC.md §9.4.
   *
   * The list is paths; what the author reads is what the library calls them,
   * and a path the library no longer has is left out rather than offered.
   *
   * It hangs under the button rather than at the pointer: a menu at the
   * pointer would cover the header it was opened from, and opened from the
   * keyboard (§8.10) there is no pointer to hang it on at all.
   */
  protected openRecentMenu(event: Event): void {
    const button = event.currentTarget as HTMLElement;
    const at = button.getBoundingClientRect();
    const library = this.store.library();
    const entries: MenuEntry[] = [];
    for (const path of this.store.recentSheets()) {
      const sheet = library === null ? null : findSheet(library, path);
      if (sheet !== null) {
        entries.push({ label: sheet.displayName, run: () => void this.store.selectSheet(path) });
      }
    }
    if (entries.length === 0) {
      entries.push({ label: this.i18n.t('app.recentEmpty'), run: () => undefined, disabled: true });
    }
    this.overlay.set({ kind: 'menu', x: Math.round(at.left), y: Math.round(at.bottom + 4), entries });
  }

  /**
   * Opens the stylesheet dialog for a PDF. SPEC.md §15.2.
   *
   * The project's own sheets are fetched first: a dialog that listed them a
   * moment later would make the author choose from a list that changed under
   * them.
   */
  protected async openExportDialog(from: string | null): Promise<void> {
    this.fetchedCss.set(null);
    await this.store.loadStylesheets();
    this.overlay.set({ kind: 'export', from });
  }

  /** The CSS the dialog asked for, for editing or for copying. */
  protected readonly fetchedCss = signal<string | null>(null);

  protected async fetchCss(name: string): Promise<void> {
    this.fetchedCss.set(await this.store.readStylesheet(name));
  }

  protected async saveStylesheet(sheet: { name: string; css: string }): Promise<void> {
    await this.store.writeStylesheet(sheet.name, sheet.css);
  }

  /** Confirming the dialog: remember the choice, then export with it. */
  protected async runExport(from: string | null, stylesheet: string): Promise<void> {
    this.overlay.set(null);
    this.layout.setExportStylesheet(stylesheet);
    await this.store.exportDocument('pdf', from, stylesheet);
  }

  protected async openSearchHit(hit: LibrarySearchHit): Promise<void> {
    await this.store.selectSheet(hit.path);
    // The editor adopts the newly selected document in an effect of its own,
    // which has not run yet: revealing here would move the cursor in the
    // document that is on its way out. The reveal waits for the render that
    // shows the new one.
    afterNextRender(() => this.revealLine(hit.line), { injector: this.#injector });
  }

  protected revealLine(line: number): void {
    this.editor()?.revealLine(line);
  }
}
