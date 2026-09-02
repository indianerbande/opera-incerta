import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { COLUMN_IDEAL_WIDTH, type PreviewDensity } from '@opera-incerta/core';
import { EditorComponent } from './editor/editor.component.js';
import { ExplorerNodeComponent } from './library/explorer.component.js';
import {
  DensitySwitchComponent,
  SheetListComponent,
} from './library/sheet-list.component.js';
import { PanelHeaderComponent } from './shell/panel-header.component.js';
import { resolveBridge } from './workspace/bridge.js';
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
    DensitySwitchComponent,
    EditorComponent,
    ExplorerNodeComponent,
    PanelHeaderComponent,
    SheetListComponent,
  ],
  host: {
    '(document:keydown.control.s)': 'save($event)',
    '(document:keydown.meta.s)': 'save($event)',
  },
  template: `
    <div class="workbench">
      <aside class="activity-bar" [style.width.px]="activityBarWidth"></aside>

      <section class="navigator" [style.width.px]="navigatorWidth()">
        <wi-panel-header [verbatimTitle]="store.project()?.displayName ?? null">
          @if (store.project() === null) {
            <button type="button" (click)="store.openProject()">Open project…</button>
          } @else {
            <button type="button" (click)="store.reloadProject()" title="Reload from disk">↻</button>
          }
        </wi-panel-header>

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
      </section>

      <section class="sheet-list" [style.width.px]="sheetListWidth()">
        <wi-panel-header>
          <wi-density-switch [density]="density()" (densityChange)="density.set($event)" />
          <label class="blank-lines">
            <input
              type="checkbox"
              [checked]="showBlankLines()"
              (change)="toggleBlankLines()"
            />
            ¶
          </label>
        </wi-panel-header>
        <wi-sheet-list
          [sheets]="store.visibleSheets()"
          [selectedPath]="store.openSheet()?.relativePath ?? null"
          [density]="density()"
          [showBlankLines]="showBlankLines()"
          (select)="store.selectSheet($event)"
        />
      </section>

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
          <wi-editor [document]="document" (textChange)="store.noteText($event)" />
        } @else {
          <p class="hint">Select a sheet to start writing.</p>
        }
      </section>

      <section class="secondary-sidebar" [style.width.px]="secondarySidebarWidth()">
        <wi-panel-header title="Inspector" />
        <p class="hint">Not built yet.</p>
      </section>

      <aside class="activity-bar" [style.width.px]="activityBarWidth"></aside>
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
  protected readonly store = new WorkspaceStore(resolveBridge());

  protected readonly activityBarWidth = ACTIVITY_BAR_WIDTH;
  protected readonly navigatorWidth = signal(COLUMN_IDEAL_WIDTH.navigator);
  protected readonly sheetListWidth = signal(COLUMN_IDEAL_WIDTH.sheetList);
  protected readonly secondarySidebarWidth = signal(COLUMN_IDEAL_WIDTH.secondarySidebar);

  protected readonly density = signal<PreviewDensity>('standard');
  protected readonly showBlankLines = signal(false);

  /** The dirty marker follows the document name, as in every editor. */
  protected editorTitle(): string | null {
    const sheet = this.store.openSheet();
    if (sheet === null) {
      return null;
    }
    return this.store.dirty() ? `${sheet.displayName} •` : sheet.displayName;
  }

  protected toggleBlankLines(): void {
    this.showBlankLines.set(!this.showBlankLines());
  }

  protected save(event: Event): void {
    event.preventDefault();
    void this.store.save();
  }
}
