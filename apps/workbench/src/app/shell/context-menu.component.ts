import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MenuEntry } from './overlay.js';

/**
 * A menu at a point on screen, for right-clicking an entry in the library.
 *
 * It knows nothing about what its entries mean: each entry carries what
 * choosing it does, and the caller runs that. Escape and a click outside
 * dismiss it.
 */
@Component({
  selector: 'wi-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'dismiss.emit()',
    '(document:mousedown)': 'dismiss.emit()',
    '(document:contextmenu)': 'dismiss.emit()',
  },
  template: `
    <div
      class="menu"
      role="menu"
      [style.left.px]="x()"
      [style.top.px]="y()"
      (mousedown)="$event.stopPropagation()"
    >
      @for (entry of entries(); track entry.label) {
        <button type="button" role="menuitem" class="item" (click)="choose.emit(entry)">
          {{ entry.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: 20;
      min-width: 150px;
      padding: 4px;
      border: 1px solid var(--wi-border);
      border-radius: 6px;
      background: var(--wi-panel);
      box-shadow: var(--wi-panel-shadow);
      font: 13px var(--wi-sans);
    }
    .item {
      display: block;
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
    .item:hover {
      background: var(--wi-row-selected);
    }
  `,
})
export class ContextMenuComponent {
  readonly entries = input.required<readonly MenuEntry[]>();
  readonly x = input.required<number>();
  readonly y = input.required<number>();

  readonly choose = output<MenuEntry>();
  readonly dismiss = output<void>();
}
