import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GitFileStatus, SelectAllState } from '@opera-incerta/core';

/**
 * The source control panel. SPEC.md §12.
 *
 * The established commit layout, top to bottom: the changed files with a
 * checkbox each, a message field, and the two commit actions. Checked means
 * staged.
 *
 * Not offered, deliberately: pull, fetch, upstream creation, branches, merge
 * resolution, amend, and discarding changes. The last is destructive and needs
 * a confirmation prompt of its own.
 */
@Component({
  selector: 'wi-source-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (root() === null) {
      <p class="hint">
        {{ loaded() ? 'This project is not inside a Git repository.' : 'Reading…' }}
      </p>
    } @else {
      <div class="panel">
        <div class="changes-header">
          <input
            type="checkbox"
            [checked]="selectAll() === 'all'"
            [indeterminate]="selectAll() === 'some'"
            [disabled]="entries().length === 0"
            [attr.aria-label]="'Stage all changes'"
            (change)="toggleAll.emit()"
          />
          <span>Changes ({{ entries().length }})</span>
        </div>

        <ul class="changes">
          @for (entry of entries(); track entry.path) {
            <li class="change">
              <input
                type="checkbox"
                [checked]="staged(entry)"
                [attr.aria-label]="'Stage ' + entry.path"
                (change)="toggle.emit(entry)"
              />
              <span class="status" [title]="statusTitle(entry)">{{ statusCode(entry) }}</span>
              <span class="name">{{ fileName(entry.path) }}</span>
              <span class="directory">{{ directory(entry.path) }}</span>
              <button
                type="button"
                class="show-diff"
                [attr.aria-label]="'Show changes to ' + entry.path"
                title="Show changes"
                (click)="showDiff.emit(entry)"
              >
                ⤢
              </button>
              <button
                type="button"
                class="discard"
                [attr.aria-label]="'Discard changes to ' + entry.path"
                title="Discard changes"
                (click)="discard.emit(entry)"
              >
                ↺
              </button>
            </li>
          } @empty {
            <li class="hint">Nothing has changed.</li>
          }
        </ul>

        <textarea
          class="message"
          rows="3"
          placeholder="Commit message"
          [value]="message()"
          (input)="messageChange.emit(value($event))"
        ></textarea>

        @if (failure(); as reason) {
          <p class="failure" role="alert">{{ reason }}</p>
        }

        <div class="actions">
          <button type="button" [disabled]="!canCommit()" (click)="commit.emit()">Commit</button>
          <button type="button" [disabled]="!canCommit()" (click)="commitAndPush.emit()">
            Commit and push
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .change .show-diff,
    .change .discard {
      flex: none;
      padding: 0 4px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: rgba(128, 128, 128, 0.9);
      font: inherit;
      cursor: default;
      opacity: 0;
    }
    .change:hover .show-diff,
    .change:hover .discard,
    .change .show-diff:focus-visible,
    .change .discard:focus-visible {
      /* Destructive, so it does not sit under the pointer by accident. */
      opacity: 1;
    }
    .change .discard:hover {
      color: rgba(150, 60, 60, 0.95);
    }
    .failure {
      margin: 0;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(190, 90, 90, 0.18);
      color: rgba(150, 60, 60, 0.95);
      /* Git output is tool output: shown as it came (SPEC.md §12, §14.2). */
      white-space: pre-wrap;
      word-break: break-word;
    }
    :host {
      display: flex;
      overflow: hidden;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    .panel {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      font: 12px system-ui, sans-serif;
    }
    .changes-header {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px 8px;
      color: rgba(128, 128, 128, 0.95);
    }
    .changes {
      overflow-y: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 0 4px;
      min-height: 0;
      list-style: none;
    }
    .change {
      display: flex;
      gap: 5px;
      align-items: baseline;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .change:hover {
      background: rgba(128, 128, 128, 0.12);
    }
    .status {
      width: 16px;
      color: rgba(128, 128, 128, 0.9);
      font-family: ui-monospace, monospace;
    }
    .name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .directory {
      overflow: hidden;
      color: rgba(128, 128, 128, 0.8);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .message {
      margin: 6px 8px;
      padding: 4px 5px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      resize: vertical;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0 8px 8px;
    }
    button {
      padding: 4px 6px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    button:disabled {
      opacity: 0.5;
    }
    .hint {
      margin: 0;
      padding: 8px;
      color: rgba(128, 128, 128, 0.9);
    }
  `,
})
export class SourceControlComponent {
  readonly entries = input.required<readonly GitFileStatus[]>();
  readonly selectAll = input.required<SelectAllState>();
  readonly message = input.required<string>();
  /** What the last Git action reported, if it failed. SPEC.md §12. */
  readonly failure = input<string | null>(null);

  readonly canCommit = input.required<boolean>();
  readonly root = input.required<string | null>();
  readonly loaded = input.required<boolean>();

  readonly toggle = output<GitFileStatus>();
  /** Asks to throw a change away; the shell confirms it first. */
  readonly discard = output<GitFileStatus>();
  /** Asks to see what changed; the shell fetches and shows it. */
  readonly showDiff = output<GitFileStatus>();
  readonly toggleAll = output<void>();
  readonly messageChange = output<string>();
  readonly commit = output<void>();
  readonly commitAndPush = output<void>();

  protected staged(entry: GitFileStatus): boolean {
    return entry.groups.includes('staged');
  }

  protected statusCode(entry: GitFileStatus): string {
    return `${entry.indexStatus}${entry.worktreeStatus}`.trim();
  }

  protected statusTitle(entry: GitFileStatus): string {
    return entry.groups.join(', ');
  }

  protected fileName(path: string): string {
    return path.split('/').at(-1) ?? path;
  }

  protected directory(path: string): string {
    const segments = path.split('/');
    return segments.length > 1 ? segments.slice(0, -1).join('/') : '';
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
