import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { EDITOR_ZOOM_BOUNDS, type EditorCursor } from '@opera-incerta/core';
import { Localization } from '../localization/localization.js';
import { STATUS_BAR_HEIGHT } from '../workbench-layout.js';

/**
 * The editor's status bar. SPEC.md §10.5.
 *
 * Information on the left — where the cursor is — and controls on the right:
 * the wrap toggle for this sheet (§10.5) and the zoom slider (§10.9).
 * Progress figures belong to the inspector (§11), not here; the document's
 * name and the save action belong to the header above the text.
 *
 * The bar reports; it decides nothing. The detent at 100 % and the bounds are
 * the core's rule, applied where the value is stored — the slider only says
 * what the author dragged it to.
 */
@Component({
  selector: 'wi-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="status-bar" [style.height.px]="height">
      <span class="position" [attr.aria-label]="i18n.t('statusBar.positionLabel')">
        {{ i18n.t('statusBar.position', { line: cursor().line, column: cursor().column }) }}
      </span>
      <span class="spacer"></span>
      <button
        type="button"
        class="wrap"
        [class.active]="wrapping()"
        [attr.aria-pressed]="wrapping()"
        [title]="i18n.t('statusBar.wrapTitle')"
        (click)="toggleWrap.emit()"
      >
        {{ i18n.t('statusBar.wrap') }}
      </button>

      <input
        type="range"
        class="zoom"
        [min]="bounds.min"
        [max]="bounds.max"
        step="1"
        [value]="zoom()"
        [attr.aria-label]="i18n.t('statusBar.zoomLabel')"
        [title]="i18n.t('statusBar.zoomLabel')"
        (input)="zoomChange.emit(value($event))"
      />
      <button
        type="button"
        class="zoom-value"
        [title]="i18n.t('statusBar.zoomResetTitle')"
        (click)="zoomChange.emit(100)"
      >
        {{ i18n.t('statusBar.zoom', { percent: zoom() }) }}
      </button>
    </div>
  `,
  styles: `
    .status-bar {
      display: flex;
      flex: none;
      box-sizing: border-box;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-top: 1px solid var(--wi-separator);
      color: var(--wi-muted);
      font: 11px var(--wi-sans);
    }
    .position {
      font-variant-numeric: tabular-nums;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .wrap {
      display: inline-flex;
      height: var(--wi-control-height-compact);
      align-items: center;
      padding: 0 var(--wi-space-2);
      border: 1px solid transparent;
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      line-height: 1;
    }
    .wrap:hover {
      background: var(--wi-accent-soft);
    }
    .wrap.active {
      border-color: var(--wi-accent-border);
      background: var(--wi-accent-soft);
      color: var(--wi-accent);
    }
    /* The zoom of SPEC.md §10.9: a slider, and the factor beside it. */
    input.zoom {
      width: 90px;
      height: 12px;
      margin: 0;
      accent-color: var(--wi-muted);
    }
    .zoom-value {
      padding: 1px 4px;
      border: 1px solid transparent;
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      font-variant-numeric: tabular-nums;
      /* The width of "200 %", so the bar does not shift while dragging. */
      min-width: 40px;
      text-align: right;
    }
  `,
})
export class StatusBarComponent {
  protected readonly i18n = inject(Localization);
  protected readonly height = STATUS_BAR_HEIGHT;

  protected readonly bounds = EDITOR_ZOOM_BOUNDS;

  readonly cursor = input.required<EditorCursor>();
  readonly wrapping = input.required<boolean>();
  /** The editor's zoom, in whole percent. SPEC.md §10.9. */
  readonly zoom = input.required<number>();

  readonly toggleWrap = output<void>();
  /** A new zoom, as the slider or the reset button reports it. */
  readonly zoomChange = output<number>();

  protected value(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
}
