import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import type { HeadingLevel, HeadingMarkerActivation } from '@opera-incerta/core';
import { Localization } from '../localization/localization.js';

const LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/**
 * The menu behind a gutter marker. SPEC.md §10.2.
 *
 * Choosing a level or removing the heading entirely; the active level carries a
 * checkmark. It knows nothing about the editor — it reports a choice, and the
 * caller applies it through the adapter.
 */
@Component({
  selector: 'wi-heading-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'dismiss.emit()',
    '(document:mousedown)': 'dismiss.emit()',
  },
  template: `
    <div
      class="menu"
      role="menu"
      [style.left.px]="activation().x"
      [style.top.px]="activation().y"
      (mousedown)="$event.stopPropagation()"
    >
      <button
        type="button"
        role="menuitem"
        class="item"
        (click)="select.emit(null)"
      >
        <span class="check"></span>
        {{ i18n.t('heading.none') }}
      </button>
      <hr />
      @for (level of levels; track level) {
        <button
          type="button"
          role="menuitemradio"
          class="item"
          [attr.aria-checked]="level === activation().level"
          (click)="select.emit(level)"
        >
          <span class="check">{{ level === activation().level ? '✓' : '' }}</span>
          Heading {{ level }}
        </button>
      }
    </div>
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: 10;
      min-width: 160px;
      padding: 4px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 6px;
      background: Canvas;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      font: 13px system-ui, sans-serif;
    }
    .item {
      display: flex;
      gap: 6px;
      width: 100%;
      padding: 4px 8px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: default;
    }
    .item:hover,
    .item:focus-visible {
      background: rgba(128, 128, 128, 0.18);
    }
    .check {
      display: inline-block;
      width: 12px;
    }
    hr {
      margin: 4px 2px;
      border: 0;
      border-block-start: 1px solid rgba(128, 128, 128, 0.3);
    }
  `,
})
export class HeadingMenuComponent {
  protected readonly i18n = inject(Localization);
  readonly activation = input.required<HeadingMarkerActivation>();

  /** The chosen level, or null to remove the heading. */
  readonly select = output<HeadingLevel | null>();
  readonly dismiss = output<void>();

  protected readonly levels = LEVELS;
}
