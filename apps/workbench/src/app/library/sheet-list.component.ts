import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  PREVIEW_DENSITIES,
  previewFontSize,
  previewLines,
  type PreviewDensity,
  type SheetEntry,
} from '@opera-incerta/core';

const DENSITIES = Object.keys(PREVIEW_DENSITIES) as readonly PreviewDensity[];

/**
 * The sheet list. SPEC.md §9.2.
 *
 * Each row shows the title plus preview lines carrying the **actual
 * formatting from the file** — a heading line appears larger in the preview
 * too — scaled down to row height. The sizes follow the geometric formula of
 * the core, deliberately independent of the real editor sizes: differences
 * must stay visible without the smallest step becoming unreadable.
 */
@Component({
  selector: 'wi-sheet-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list">
      @for (sheet of sheets(); track sheet.relativePath) {
        <li>
          <button
            type="button"
            class="row"
            [class.selected]="sheet.relativePath === selectedPath()"
            (click)="select.emit(sheet.relativePath)"
          >
            <span class="title">{{ sheet.displayName }}</span>
            @for (line of preview(sheet); track $index) {
              <span class="preview" [style.font-size.px]="size(line.level)">{{ line.text }}</span>
            }
          </button>
        </li>
      } @empty {
        <li class="empty">No sheets in this group.</li>
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
    }
    .row {
      display: flex;
      flex-direction: column;
      gap: 1px;
      width: 100%;
      padding: 5px 6px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: default;
    }
    .row:hover {
      background: rgba(128, 128, 128, 0.12);
    }
    .row.selected {
      background: rgba(128, 128, 128, 0.22);
    }
    .title {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .preview {
      overflow: hidden;
      white-space: nowrap;
      color: rgba(128, 128, 128, 0.95);
      text-overflow: ellipsis;
      line-height: 1.25;
    }
    .empty {
      padding: 8px 6px;
      color: rgba(128, 128, 128, 0.9);
      font: 12px system-ui, sans-serif;
    }
  `,
})
export class SheetListComponent {
  readonly sheets = input.required<readonly SheetEntry[]>();
  readonly selectedPath = input<string | null>(null);
  readonly density = input.required<PreviewDensity>();
  readonly showBlankLines = input(false);

  readonly select = output<string>();

  /** The preview lines this density shows for one sheet. */
  protected preview(sheet: SheetEntry): readonly { text: string; level: number | null }[] {
    const texts = previewLines(
      sheet.preview.map((line) => line.text),
      this.density(),
      this.showBlankLines(),
    );
    // Match each kept text back to its level; identical texts are
    // indistinguishable and share a level, which is harmless here.
    return texts.map((text) => ({
      text,
      level: sheet.preview.find((line) => line.text === text)?.level ?? null,
    }));
  }

  protected size(level: number | null): number {
    return previewFontSize(level as 1 | null, this.density());
  }
}

/** The density switcher of the sheet list header. SPEC.md §9.2. */
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
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .option.active {
      border-color: rgba(128, 128, 128, 0.45);
      background: rgba(128, 128, 128, 0.18);
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
