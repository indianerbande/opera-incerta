import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { subgroupsOf, type GroupEntry } from '@opera-incerta/core';

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
            (select)="select.emit($event)"
            (toggle)="toggle.emit($event)"
            (contextMenu)="contextMenu.emit($event)"
          />
        }
      </div>
    }
  `,
  styles: `
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
