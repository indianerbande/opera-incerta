import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { subgroupsOf, type GroupEntry } from '@opera-incerta/core';
import { ReorderDrag, type RowBox } from '../shell/reorder-drag.js';

/**
 * The project tree. SPEC.md §9.1.
 *
 * The chosen root directory is itself the top, always visible node — it
 * appears as the first element rather than as an invisible container of its
 * subdirectories.
 *
 * Expansion state lives in the store, not here: the navigator switches between
 * this view and source control, and component-local state would be destroyed
 * on every switch (CONVENTIONS.md C-U2).
 *
 * Each node owns the drag of **its own children** (SPEC.md §6.4), not of
 * itself. A dragged node's siblings are not its ancestors, so pointer events
 * during the drag would never reach it; they do reach the one node that
 * contains all of them. That also makes the rule that a group only ever moves
 * among its siblings a property of the structure rather than a check.
 */
@Component({
  selector: 'wi-explorer-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="row"
      [class.selected]="selectedPath() === group().relativePath"
      (contextmenu)="onContextMenu($event)"
    >
      <button
        type="button"
        class="twisty"
        [class.hidden]="subgroups().length === 0"
        [attr.aria-label]="expanded() ? 'Collapse' : 'Expand'"
        (click)="toggle.emit(group().relativePath)"
      >
        {{ expanded() ? '▾' : '▸' }}
      </button>
      <button type="button" class="name" (click)="select.emit(group().relativePath)">
        {{ group().displayName }}
      </button>
    </div>

    @if (expanded()) {
      <div class="children">
        @for (child of subgroups(); track child.relativePath) {
          <wi-explorer-node
            [group]="child"
            [selectedPath]="selectedPath()"
            [expandedPaths]="expandedPaths()"
            [class.dragging]="drag.index() === $index"
            [class.drop-above]="drag.slot() === $index"
            [class.drop-below]="drag.slot() === subgroups().length && $last"
            (select)="onChildSelect($event)"
            (toggle)="toggle.emit($event)"
            (contextMenu)="contextMenu.emit($event)"
            (reorder)="reorder.emit($event)"
          />
        }
      </div>
    }
  `,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp()',
    '(pointercancel)': 'drag.cancel()',
  },
  styles: `
    :host {
      display: block;
      touch-action: none;
    }
    wi-explorer-node.dragging {
      opacity: 0.45;
    }
    wi-explorer-node.drop-above {
      box-shadow: inset 0 2px 0 0 rgba(128, 128, 128, 0.95);
    }
    wi-explorer-node.drop-below {
      box-shadow: inset 0 -2px 0 0 rgba(128, 128, 128, 0.95);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 2px;
      border-radius: 4px;
    }
    .row.selected {
      background: rgba(128, 128, 128, 0.22);
    }
    .row:hover {
      background: rgba(128, 128, 128, 0.12);
    }
    button {
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .twisty {
      width: 16px;
      padding: 0;
      color: rgba(128, 128, 128, 0.9);
    }
    .twisty.hidden {
      visibility: hidden;
    }
    .name {
      flex: 1 1 auto;
      overflow: hidden;
      padding: 3px 2px;
      white-space: nowrap;
      text-align: start;
      text-overflow: ellipsis;
    }
    .children {
      margin-inline-start: 12px;
    }
  `,
})
export class ExplorerNodeComponent {
  readonly group = input.required<GroupEntry>();
  readonly selectedPath = input.required<string>();
  readonly expandedPaths = input.required<ReadonlySet<string>>();

  readonly select = output<string>();
  readonly toggle = output<string>();
  readonly contextMenu = output<{ path: string; x: number; y: number }>();
  readonly reorder = output<{ path: string; before: string | null }>();

  protected readonly drag = new ReorderDrag();
  readonly #host = inject(ElementRef<HTMLElement>);
  #dropped = false;

  protected onPointerDown(event: PointerEvent): void {
    const index = this.#childIndex(event.target);
    if (index !== null && event.button === 0) {
      this.drag.press(index, event.clientY);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.drag.move(event.clientY, this.#rowBoxes())) {
      event.preventDefault();
    }
  }

  protected onPointerUp(): void {
    const children = this.subgroups();
    const drop = this.drag.release(children.map((child) => child.name));
    if (drop === null) {
      return;
    }
    // The click that follows must not also select the group: the author was
    // moving it, not choosing it.
    this.#dropped = true;
    const moved = children[drop.index];
    if (moved !== undefined) {
      this.reorder.emit({ path: moved.relativePath, before: drop.before });
    }
  }

  /** A child's selection, unless that child was just dropped somewhere. */
  protected onChildSelect(relativePath: string): void {
    if (this.#dropped) {
      this.#dropped = false;
      return;
    }
    this.select.emit(relativePath);
  }

  /**
   * The index of the direct child an event started in.
   *
   * `null` for anything deeper: that node's own parent handles it, so exactly
   * one level of the tree answers a press.
   */
  #childIndex(target: EventTarget | null): number | null {
    const container = this.#childrenElement();
    if (container === null || !(target instanceof Element)) {
      return null;
    }
    const node = target.closest('wi-explorer-node');
    if (node === null || node.parentElement !== container) {
      return null;
    }
    return [...container.children].indexOf(node);
  }

  /**
   * Each child's own row, not its whole subtree: an expanded group is as tall
   * as everything under it, and its midpoint would sit nowhere near its name.
   */
  #rowBoxes(): readonly RowBox[] {
    const container = this.#childrenElement();
    if (container === null) {
      return [];
    }
    return [...container.children].map((node) => {
      const bounds = (node.querySelector(':scope > .row') ?? node).getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    });
  }

  #childrenElement(): Element | null {
    return (this.#host.nativeElement as HTMLElement).querySelector(':scope > .children');
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.emit({
      path: this.group().relativePath,
      x: event.clientX,
      y: event.clientY,
    });
  }

  protected readonly subgroups = computed(() => subgroupsOf(this.group()));
  protected readonly expanded = computed(() => this.expandedPaths().has(this.group().relativePath));
}
