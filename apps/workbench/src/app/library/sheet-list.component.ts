import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  PREVIEW_DENSITIES,
  categoryTextColor,
  findCategory,
  previewFontSize,
  previewLines,
  type HeadingLevel,
  type PageCategory,
  type PreviewDensity,
  type PreviewLine,
  type SheetEntry,
} from '@opera-incerta/core';
import { LibraryDrag } from '../shell/library-drag.js';
import { LayoutState } from '../shell/layout-state.js';
import { LibraryActions } from '../workspace/library-actions.js';
import { WorkspaceStore } from '../workspace/workspace-store.js';
import { Localization } from '../localization/localization.js';

const DENSITIES = Object.keys(PREVIEW_DENSITIES) as readonly PreviewDensity[];

/**
 * The sheet list. specification.md §9.2.
 *
 * Each row shows the title plus preview lines carrying the **actual
 * formatting from the file** — a heading line appears larger in the preview
 * too — scaled down to row height. The sizes follow the geometric formula of
 * the core, deliberately independent of the real editor sizes: differences
 * must stay visible without the smallest step becoming unreadable.
 *
 * Rows can be dragged into a new order (specification.md §6.4) or onto a group in the
 * tree to move there (§6.8). The dragging itself is not handled here: a row
 * only *names* itself in the DOM — its kind and its path — and the shell,
 * which contains both library columns, measures and decides
 * (`shell/library-drag.ts`).
 *
 * Reads the store and the layout directly (specification.md §8.7): what it shows is
 * the selected group's sheets at the chosen density, and nothing about that
 * is the shell's to pass along.
 */
@Component({
  selector: 'wi-sheet-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list" data-drop-list="sheet" [attr.data-parent]="groupPath()">
      @for (sheet of sheets(); track sheet.relativePath) {
        <li
          [class.dragging]="drag.source()?.path === sheet.relativePath"
          [class.drop-above]="lineAt() === $index"
          [class.drop-below]="lineAt() === sheets().length && $last"
        >
          <button
            type="button"
            class="row"
            data-drop="sheet"
            [attr.data-path]="sheet.relativePath"
            [class.selected]="sheet.relativePath === selectedPath()"
            (click)="onSelect(sheet.relativePath)"
            (contextmenu)="onContextMenu($event, sheet)"
          >
            <span class="line">
              <span class="title">{{ sheet.displayName }}</span>
              @if (badge(sheet); as category) {
                <span
                  class="badge"
                  [style.background]="category.color"
                  [style.color]="textColor(category.color)"
                  >{{ category.name }}</span
                >
              }
            </span>
            @for (line of preview(sheet); track $index) {
              <span class="preview" [style.font-size.px]="size(line.level)">{{ line.text }}</span>
            }
          </button>
        </li>
      } @empty {
        <li class="empty">{{ i18n.t('sheetList.empty') }}</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      flex: 1 1 auto;
      min-height: 0;
    }
    .list {
      margin: 0;
      padding: 4px;
      list-style: none;
      touch-action: none;
    }
    li.dragging {
      opacity: 0.45;
    }
    li.drop-above {
      box-shadow: inset 0 2px 0 0 var(--wi-muted);
    }
    li.drop-below {
      box-shadow: inset 0 -2px 0 0 var(--wi-muted);
    }
    .row {
      display: flex;
      flex-direction: column;
      gap: 1px;
      width: 100%;
      padding: 5px 6px;
      border: 0;
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: default;
    }
    .row:hover {
      background: var(--wi-row-hover);
    }
    .row.selected {
      background: var(--wi-row-selected);
      box-shadow: inset 3px 0 0 var(--wi-accent);
    }
    .line {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .title {
      overflow: hidden;
      flex: 1 1 auto;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .badge {
      flex: none;
      max-width: 45%;
      overflow: hidden;
      padding: 0 6px;
      border-radius: var(--wi-radius-pill);
      font-size: 10px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .preview {
      overflow: hidden;
      white-space: nowrap;
      color: var(--wi-muted);
      text-overflow: ellipsis;
      line-height: 1.25;
    }
    .empty {
      padding: 8px 6px;
      color: var(--wi-muted);
      font: 12px var(--wi-sans);
    }
  `,
})
export class SheetListComponent {
  protected readonly i18n = inject(Localization);
  readonly #store = inject(WorkspaceStore);
  readonly #layout = inject(LayoutState);
  readonly #actions = inject(LibraryActions);
  protected readonly drag = inject(LibraryDrag);

  protected readonly sheets = this.#store.visibleSheets;
  protected readonly selectedPath = computed(() => this.#store.openSheet()?.relativePath ?? null);
  protected readonly density = this.#layout.sheetListDensity;
  protected readonly showBlankLines = this.#layout.showBlankLines;
  /** The group these sheets belong to; the list's own name for its empty space. */
  protected readonly groupPath = this.#store.selectedGroupPath;
  protected readonly categories = this.#store.categories;

  /**
   * The category a row shows, or null. An id naming nothing shows nothing:
   * a deleted category leaves its id behind on purpose (specification.md §6.6).
   */
  protected badge(sheet: SheetEntry): PageCategory | null {
    return findCategory(this.categories(), sheet.category);
  }

  protected textColor(color: string): string {
    return categoryTextColor(color) ?? 'black';
  }

  /** The insertion line's slot, when it belongs to this list. */
  protected readonly lineAt = computed(() => {
    const line = this.drag.line();
    return line !== null && line.kind === 'sheet' && line.parent === this.groupPath()
      ? line.index
      : null;
  });

  protected onSelect(relativePath: string): void {
    if (this.drag.consumeClick()) {
      return;
    }
    void this.#store.selectSheet(relativePath);
  }

  protected onContextMenu(event: MouseEvent, sheet: SheetEntry): void {
    event.preventDefault();
    this.#actions.openSheetMenu(sheet.relativePath, sheet.displayName, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  /** The preview lines this density shows for one sheet, level and all. */
  protected preview(sheet: SheetEntry): readonly PreviewLine[] {
    return previewLines(sheet.preview, this.density(), this.showBlankLines());
  }

  protected size(level: HeadingLevel | null): number {
    return previewFontSize(level, this.density());
  }
}

/** The density switcher of the sheet list header. specification.md §9.2. */
@Component({
  selector: 'wi-density-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (option of densities; track option) {
      <button
        type="button"
        class="option"
        [class.active]="option === density()"
        [attr.aria-pressed]="option === density()"
        (click)="densityChange.emit(option)"
      >
        {{ label(option) }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 2px;
    }
    .option {
      padding: 2px 6px;
      border: 1px solid transparent;
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .option.active {
      border-color: var(--wi-border);
      background: var(--wi-row-selected);
    }
  `,
})
export class DensitySwitchComponent {
  readonly density = input.required<PreviewDensity>();
  readonly densityChange = output<PreviewDensity>();

  protected readonly densities = DENSITIES;

  protected label(density: PreviewDensity): string {
    return { compact: 'S', standard: 'M', large: 'L' }[density];
  }
}
