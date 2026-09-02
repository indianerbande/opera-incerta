import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { EditorComponent } from './editor/editor.component.js';
import { ExplorerNodeComponent } from './library/explorer.component.js';
import {
  DensitySwitchComponent,
  SheetListComponent,
} from './library/sheet-list.component.js';
import { SourceControlComponent } from './library/source-control.component.js';
import { ActivityBarComponent } from './shell/activity-bar.component.js';
import {
  LayoutState,
  NAVIGATOR_ITEMS,
  SECONDARY_ITEMS,
} from './shell/layout-state.js';
import { PanelHeaderComponent } from './shell/panel-header.component.js';
import { ResizeDividerComponent } from './shell/resize-divider.component.js';
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
    DensitySwitchComponent,
    EditorComponent,
    ExplorerNodeComponent,
    InspectorComponent,
    OutlineComponent,
    PanelHeaderComponent,
    ResizeDividerComponent,
    SheetListComponent,
    SourceControlComponent,
  ],

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
          <div class="tree">
            @if (store.library(); as library) {
              <wi-explorer-node
                [group]="library"
                [selectedPath]="store.selectedGroupPath()"
                [expandedPaths]="store.expanded()"
                (select)="store.selectGroup($event)"
                (toggle)="store.toggleExpanded($event)"
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
            [canCommit]="sourceControl.canCommit()"
            [root]="sourceControl.repositoryRoot()"
            [loaded]="sourceControl.loaded()"
            (toggle)="sourceControl.toggle($event)"
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
          (select)="store.selectSheet($event)"
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
          @if (store.canSave()) {
            <button type="button" (click)="store.save()">Save</button>
          }
        </wi-panel-header>

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
    inject(DestroyRef).onDestroy(() => stopListening?.());

    // Source control reads when its view is shown, and after a save: both are
    // moments when what git reports has just changed.
    effect(() => {
      if (this.layout.navigatorView() === 'sourceControl' && this.store.project() !== null) {
        void this.sourceControl.refresh();
      }
    });
  }

  protected readonly activityBarWidth = ACTIVITY_BAR_WIDTH;

  /** The dirty marker follows the document name, as in every editor. */
  protected editorTitle(): string | null {
    const sheet = this.store.openSheet();
    if (sheet === null) {
      return null;
    }
    return this.store.dirty() ? `${sheet.displayName} •` : sheet.displayName;
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
