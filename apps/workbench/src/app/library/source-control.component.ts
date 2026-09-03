import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { isConflicted } from '@opera-incerta/core';
import type { GitFileStatus, SelectAllState } from '@opera-incerta/core';
import type { GitTracking } from '@opera-incerta/desktop-contract';

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
        @if (branch(); as name) {
          <div class="branch-row">
            <span class="branch-name" [title]="'On branch ' + name">{{ name }}</span>
            <button type="button" (click)="showBranches.emit()">Branches…</button>
          </div>
        }

        @if (canPublish()) {
          <div class="tracking">
            <div class="remote">
              <span class="upstream">{{ branch() }} — not published</span>
            </div>
            <div class="remote-actions">
              <button type="button" (click)="publish.emit()">Publish branch…</button>
            </div>
          </div>
        }

        @if (tracking(); as remote) {
          <div class="tracking">
            <div class="remote">
              <span class="upstream" [title]="'Tracking ' + remote.upstream">{{
                remote.upstream
              }}</span>
              <span class="counts">
                @if (remote.behind > 0) {
                  <span class="behind">↓{{ remote.behind }}</span>
                }
                @if (remote.ahead > 0) {
                  <span class="ahead">↑{{ remote.ahead }}</span>
                }
                @if (remote.behind === 0 && remote.ahead === 0) {
                  <span class="even">up to date</span>
                }
              </span>
            </div>
            <div class="remote-actions">
              <button type="button" (click)="fetch.emit()">Fetch</button>
              <button type="button" [disabled]="!canPull()" (click)="pull.emit()">Pull</button>
              @if (canMerge()) {
                <button type="button" (click)="merge.emit()">Merge…</button>
              }
            </div>
          </div>
        }

        @if (merging()) {
          <div class="merging" role="status">
            <span>Merge in progress. Decide each conflict, then commit.</span>
            <button type="button" (click)="abortMerge.emit()">Abort merge</button>
          </div>
        }

        <div class="ignore-row">
          <button type="button" (click)="editIgnore.emit()">Ignored files…</button>
        </div>

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
              @if (isUntracked(entry)) {
                <button
                  type="button"
                  class="ignore"
                  [attr.aria-label]="'Ignore ' + entry.path"
                  title="Add to .gitignore"
                  (click)="ignore.emit(entry)"
                >
                  ⊘
                </button>
              }
              @if (isConflicted(entry)) {
                <button
                  type="button"
                  class="resolve"
                  [attr.aria-label]="'Resolve ' + entry.path"
                  title="Resolve this conflict"
                  (click)="resolve.emit(entry)"
                >
                  Resolve…
                </button>
              }
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
          @if (canAmend()) {
            <button type="button" class="amend" (click)="amend.emit()">Amend last commit…</button>
          }
          <button type="button" [disabled]="!canCommit()" (click)="commit.emit()">Commit</button>
          <button type="button" [disabled]="!canCommit()" (click)="commitAndPush.emit()">
            Commit and push
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .ignore-row {
      display: flex;
      justify-content: flex-end;
      padding-bottom: 6px;
    }
    .ignore-row button {
      padding: 2px 8px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .change .ignore,
    .change .show-diff,
    .change .discard {
      overflow: hidden;
      /* Out of the way until the row is pointed at, and taking no width with
         them: in a narrow column they would otherwise shorten the file name
         for controls nobody can see. */
      flex: none;
      width: 0;
      padding: 0;
      border: 0;
      border-radius: 4px;
      background: none;
      color: rgba(128, 128, 128, 0.9);
      font: inherit;
      cursor: default;
      opacity: 0;
    }
    .change:hover .ignore,
    .change:hover .show-diff,
    .change:hover .discard,
    .change .ignore:focus-visible,
    .change .show-diff:focus-visible,
    .change .discard:focus-visible {
      /* Destructive, so it does not sit under the pointer by accident. */
      width: auto;
      padding: 0 4px;
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
    .branch-row {
      display: flex;
      gap: 6px;
      align-items: center;
      padding-bottom: 6px;
    }
    .branch-name {
      overflow: hidden;
      flex: 1 1 auto;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .branch-row button {
      flex: none;
      padding: 2px 8px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .tracking {
      /* Two rows: in a narrow navigator a single one truncates the upstream's
         name to nothing useful. */
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(128, 128, 128, 0.25);
    }
    .remote,
    .remote-actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .upstream {
      overflow: hidden;
      flex: 1 1 auto;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: rgba(128, 128, 128, 0.95);
    }
    .counts {
      display: flex;
      flex: none;
      gap: 4px;
    }
    .behind {
      color: rgb(150, 90, 40);
    }
    .even {
      color: rgba(128, 128, 128, 0.9);
    }
    .tracking button {
      flex: none;
      padding: 2px 8px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .tracking button:disabled {
      opacity: 0.5;
    }
    .merging {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px;
      border-radius: 4px;
      background: rgba(190, 140, 60, 0.16);
      color: rgb(130, 90, 30);
    }
    .merging span {
      flex: 1 1 auto;
    }
    .merging button {
      flex: none;
      padding: 2px 8px;
      border: 1px solid rgba(130, 90, 30, 0.5);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .change .resolve {
      flex: none;
      padding: 0 6px;
      border: 1px solid rgba(190, 140, 60, 0.6);
      border-radius: 4px;
      background: none;
      color: rgb(130, 90, 30);
      font: inherit;
      cursor: default;
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
  /** What the branch tracks, or null when it tracks nothing. SPEC.md §12. */
  readonly tracking = input<GitTracking | null>(null);
  readonly canPull = input(false);
  readonly canMerge = input(false);
  readonly merging = input(false);
  readonly canPublish = input(false);
  readonly canAmend = input(false);
  readonly branch = input<string | null>(null);

  readonly canCommit = input.required<boolean>();
  readonly root = input.required<string | null>();
  readonly loaded = input.required<boolean>();

  readonly toggle = output<GitFileStatus>();
  /** Asks to throw a change away; the shell confirms it first. */
  readonly discard = output<GitFileStatus>();
  /** Asks to see what changed; the shell fetches and shows it. */
  readonly showDiff = output<GitFileStatus>();
  readonly fetch = output<void>();
  readonly pull = output<void>();
  readonly merge = output<void>();
  readonly abortMerge = output<void>();
  readonly publish = output<void>();
  readonly showBranches = output<void>();
  readonly amend = output<void>();
  readonly editIgnore = output<void>();
  /** Asks to add one untracked file to `.gitignore`. SPEC.md §12. */
  readonly ignore = output<GitFileStatus>();
  /** Asks to decide one file's conflicts; the shell shows the resolver. */
  readonly resolve = output<GitFileStatus>();
  readonly toggleAll = output<void>();
  readonly messageChange = output<string>();
  readonly commit = output<void>();
  readonly commitAndPush = output<void>();

  protected staged(entry: GitFileStatus): boolean {
    return entry.groups.includes('staged');
  }

  /** Ignoring a file only means anything while git is not yet tracking it. */
  protected isUntracked(entry: GitFileStatus): boolean {
    return entry.groups.includes('untracked');
  }

  /** A conflict needs a decision, not a checkbox. SPEC.md §12. */
  protected isConflicted(entry: GitFileStatus): boolean {
    return isConflicted(entry);
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
