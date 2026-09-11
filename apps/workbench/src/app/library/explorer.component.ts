import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { subgroupsOf, type GroupEntry } from '@opera-incerta/core';
import { LibraryDrag } from '../shell/library-drag.js';
import { LibraryActions } from '../workspace/library-actions.js';
import { WorkspaceStore } from '../workspace/workspace-store.js';

/**
 * The project tree. specification.md §9.1.
 *
 * The chosen root directory is itself the top, always visible node — it
 * appears as the first element rather than as an invisible container of its
 * subdirectories.
 *
 * Expansion state lives in the store, not here: the navigator switches between
 * this view and source control, and component-local state would be destroyed
 * on every switch (conventions.md C-U2).
 *
 * Dragging is not handled here either. Each row only *names* itself in the
 * DOM — its kind and its path — and the shell, which contains both library
 * columns, does the measuring and deciding (`shell/library-drag.ts`). A drag
 * that can end in the other column cannot belong to one of them.
 *
 * The store, the drag, and the actions are injected rather than passed:
 * threading them through every level of a recursive tree was the reason the
 * shell's template repeated them (specification.md §8.7).
 */
@Component({
  selector: 'wi-explorer-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="row"
      data-drop="group"
      [attr.data-path]="group().relativePath"
      [class.selected]="store.selectedGroupPath() === group().relativePath"
      [class.dragging]="drag.source()?.path === group().relativePath"
      [class.drop-into]="drag.into() === group().relativePath"
      [class.drop-above]="lineAt() === index()"
      [class.drop-below]="lineAt() !== null && lineAt() === siblingCount() && last()"
      (contextmenu)="onContextMenu($event)"
    >
      <button
        type="button"
        class="twisty"
        [class.hidden]="subgroups().length === 0"
        [attr.aria-label]="expanded() ? 'Collapse' : 'Expand'"
        (click)="store.toggleExpanded(group().relativePath)"
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
            [parentPath]="group().relativePath"
            [index]="$index"
            [siblingCount]="subgroups().length"
            [last]="$last"
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
      border-radius: var(--wi-radius-control);
    }
    .row.selected {
      background: var(--wi-row-selected);
      box-shadow: inset 3px 0 0 var(--wi-accent);
    }
    .row:hover {
      background: var(--wi-row-hover);
    }
    .row.dragging {
      opacity: 0.45;
    }
    .row.drop-into {
      outline: 2px solid var(--wi-muted);
      outline-offset: -2px;
    }
    .row.drop-above {
      box-shadow: inset 0 2px 0 0 var(--wi-muted);
    }
    .row.drop-below {
      box-shadow: inset 0 -2px 0 0 var(--wi-muted);
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
      color: var(--wi-muted);
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
  protected readonly store = inject(WorkspaceStore);
  protected readonly drag = inject(LibraryDrag);
  readonly #actions = inject(LibraryActions);

  readonly group = input.required<GroupEntry>();

  /** Where this node sits among its siblings. The root has no parent. */
  readonly parentPath = input('');
  readonly index = input(-1);
  readonly siblingCount = input(0);
  readonly last = input(false);

  protected readonly subgroups = computed(() => subgroupsOf(this.group()));
  protected readonly expanded = computed(() =>
    this.store.expanded().has(this.group().relativePath),
  );

  /** The insertion line's slot, when it belongs to this node's own list. */
  protected readonly lineAt = computed(() => {
    const line = this.drag.line();
    return line !== null && line.kind === 'group' && line.parent === this.parentPath()
      ? line.index
      : null;
  });

  protected onSelect(): void {
    if (this.drag.consumeClick()) {
      return;
    }
    this.store.selectGroup(this.group().relativePath);
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.#actions.openGroupMenu(this.group().relativePath, { x: event.clientX, y: event.clientY });
  }
}
