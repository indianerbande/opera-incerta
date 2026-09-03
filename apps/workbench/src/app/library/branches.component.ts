import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GitBranch } from '@opera-incerta/desktop-contract';

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
  host: { '(document:keydown.escape)': 'close.emit()' },
  template: `
    <div class="backdrop" (mousedown)="close.emit()"></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Branches">
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
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.2);
    }
    .dialog {
      position: fixed;
      top: 45%;
      left: 50%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(440px, calc(100vw - 48px));
      max-height: 60vh;
      padding: 12px 14px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 8px;
      background: Canvas;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
      font: 13px system-ui, sans-serif;
      transform: translate(-50%, -50%);
    }
    header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h2 {
      flex: 1 1 auto;
      margin: 0;
      font-size: 14px;
    }
    .list {
      overflow-y: auto;
      margin: 0;
      padding: 0;
      border-top: 1px solid rgba(128, 128, 128, 0.25);
      list-style: none;
    }
    li {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 4px 0;
    }
    li.empty {
      color: rgba(128, 128, 128, 0.9);
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
      color: rgba(128, 128, 128, 0.95);
    }
    button {
      flex: none;
      padding: 2px 8px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    button.delete {
      border-color: rgba(190, 60, 60, 0.5);
      color: rgb(150, 60, 60);
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
