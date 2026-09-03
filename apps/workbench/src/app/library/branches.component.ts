import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GitBranch } from '@opera-incerta/desktop-contract';
import { DialogComponent } from '../shell/dialog.component.js';

/**
 * The branches of the project, and what can be done with them. SPEC.md §12.
 *
 * Switching replaces files in the working tree wholesale, which is why the
 * shell refuses it while the editor holds unsaved work: git cannot know about
 * a buffer, and an author whose text was underneath a file that just became a
 * different file has no way to understand what happened.
 *
 * Deleting is the safe delete only. Git refuses a branch whose work is not
 * merged anywhere, and that refusal is the answer — losing a chapter to a
 * click is not something this application does.
 */
@Component({
  selector: 'wi-branches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog
      label="Branches"
      width="min(440px, calc(100vw - 48px))"
      maxHeight="60vh"
      (dismiss)="close.emit()"
    >
      <header>
        <h2>Branches</h2>
        <button type="button" (click)="create.emit()">New branch…</button>
        <button type="button" (click)="close.emit()">Close</button>
      </header>

      <ul class="list">
        @for (branch of branches(); track branch.name) {
          <li [class.current]="branch.current">
            <span class="name">{{ branch.name }}</span>
            @if (branch.current) {
              <span class="here">checked out</span>
            } @else {
              <button type="button" (click)="switchTo.emit(branch.name)">Switch</button>
              <button type="button" class="delete" (click)="remove.emit(branch.name)">
                Delete…
              </button>
            }
          </li>
        } @empty {
          <li class="empty">This repository has no branch yet.</li>
        }
      </ul>
    </wi-dialog>
  `,
  styles: `
    .list {
      overflow-y: auto;
      margin: 0;
      padding: 0;
      border-top: 1px solid var(--wi-separator);
      list-style: none;
    }
    li {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 4px 0;
    }
    li.empty {
      color: var(--wi-muted);
    }
    .name {
      overflow: hidden;
      flex: 1 1 auto;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    li.current .name {
      font-weight: 600;
    }
    .here {
      flex: none;
      color: var(--wi-muted);
    }
    button.delete {
      border-color: var(--wi-danger-border);
      color: var(--wi-danger);
    }
  `,
})
export class BranchesComponent {
  readonly branches = input.required<readonly GitBranch[]>();

  readonly switchTo = output<string>();
  readonly remove = output<string>();
  readonly create = output<void>();
  readonly close = output<void>();
}
