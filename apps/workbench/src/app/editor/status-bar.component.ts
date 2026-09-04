import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { EditorCursor } from '@opera-incerta/core';
import { Localization } from '../localization/localization.js';
import { STATUS_BAR_HEIGHT } from '../workbench-layout.js';

/**
 * The editor's status bar. SPEC.md §10.5.
 *
 * Information on the left — where the cursor is — and controls on the right:
 * the wrap toggle for this sheet, and later the zoom slider (§18). Progress
 * figures belong to the inspector (§11), not here; the document's name and
 * the save action belong to the header above the text.
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
      color: rgba(128, 128, 128, 0.95);
      font: 11px system-ui, sans-serif;
    }
    .position {
      font-variant-numeric: tabular-nums;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .wrap {
      padding: 1px 7px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }
    .wrap.active {
      border-color: rgba(128, 128, 128, 0.4);
      background: rgba(128, 128, 128, 0.2);
    }
  `,
})
export class StatusBarComponent {
  protected readonly i18n = inject(Localization);
  protected readonly height = STATUS_BAR_HEIGHT;

  readonly cursor = input.required<EditorCursor>();
  readonly wrapping = input.required<boolean>();

  readonly toggleWrap = output<void>();
}
