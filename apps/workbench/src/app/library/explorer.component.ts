import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { subgroupsOf, type GroupEntry } from '@opera-incerta/core';
import type { LibraryDrag } from '../shell/library-drag.js';

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
 * Dragging is not handled here either. Each row only *describes* itself in the
 * DOM — what it is, where it sits, what it is called — and the shell, which
 * contains both library columns, does the measuring and deciding
 * (`shell/library-drag.ts`). A drag that can end in the other column cannot
 * belong to one of them.
 */
@Component({
  selector: 'wi-explorer-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="row"
      data-drop="group"
      [attr.data-path]="group().relativePath"
      [attr.data-parent]="parentPath()"
      [attr.data-name]="group().name"
      [class.selected]="selectedPath() === group().relativePath"
      [class.dragging]="drag().source()?.path === group().relativePath"
      [class.drop-into]="drag().into() === group().relativePath"
      [class.drop-above]="lineAt() === index()"
      [class.drop-below]="lineAt() !== null && lineAt() === siblingCount() && last()"
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
      <button type="button" class="name" (click)="onSelect()">
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
            [drag]="drag()"
            [parentPath]="group().relativePath"
            [index]="$index"
            [siblingCount]="subgroups().length"
            [last]="$last"
            (select)="select.emit($event)"
            (toggle)="toggle.emit($event)"
            (contextMenu)="contextMenu.emit($event)"
          />
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      touch-action: none;
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
    .row.dragging {
      opacity: 0.45;
    }
    .row.drop-into {
      outline: 2px solid rgba(128, 128, 128, 0.9);
      outline-offset: -2px;
    }
    .row.drop-above {
      box-shadow: inset 0 2px 0 0 rgba(128, 128, 128, 0.95);
    }
    .row.drop-below {
      box-shadow: inset 0 -2px 0 0 rgba(128, 128, 128, 0.95);
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
  readonly drag = input.required<LibraryDrag>();

  /** Where this node sits among its siblings. The root has no parent. */
  readonly parentPath = input('');
  readonly index = input(-1);
  readonly siblingCount = input(0);
  readonly last = input(false);

  readonly select = output<string>();
  readonly toggle = output<string>();
  readonly contextMenu = output<{ path: string; x: number; y: number }>();

  protected readonly subgroups = computed(() => subgroupsOf(this.group()));
  protected readonly expanded = computed(() => this.expandedPaths().has(this.group().relativePath));

  /** The insertion line's slot, when it belongs to this node's own list. */
  protected readonly lineAt = computed(() => {
    const line = this.drag().line();
    return line !== null && line.kind === 'group' && line.parent === this.parentPath()
      ? line.index
      : null;
  });

  protected onSelect(): void {
    if (this.drag().consumeClick()) {
      return;
    }
    this.select.emit(this.group().relativePath);
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.emit({
      path: this.group().relativePath,
      x: event.clientX,
      y: event.clientY,
    });
  }
}
