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
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 6px;
      background: Canvas;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      font: 13px system-ui, sans-serif;
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
      background: rgba(128, 128, 128, 0.18);
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
