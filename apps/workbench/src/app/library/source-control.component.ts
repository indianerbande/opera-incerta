import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { isConflicted } from '@opera-incerta/core';
import type { GitFileStatus } from '@opera-incerta/core';
import { SourceControlActions } from '../workspace/source-control-actions.js';
import { SourceControlStore } from '../workspace/source-control-store.js';

/**
 * The source control panel. SPEC.md §12.
 *
 * The established commit layout, top to bottom: the changed files with a
 * checkbox each, a message field, and the two commit actions. Checked means
 * staged.
 *
 * Below that, what the branch tracks and the actions on it: fetch, pull,
 * merge, publish, branches, amend, the ignore list, discarding. Everything
 * that needs a question first goes through `SourceControlActions`, which
 * puts up the dialog; the plain operations go to the store (SPEC.md §8.7).
 */
@Component({
  selector: 'wi-source-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.repositoryRoot() === null) {
      @if (store.failure(); as reason) {
        <!-- Before any repository is known, a failure is about the machine
             rather than the project: git itself is missing, or cannot be
             asked. Said in its own words (SPEC.md §12). -->
        <p class="failure" role="alert">{{ wording(reason) }}</p>
      } @else {
        <p class="hint">
          {{ store.loaded() ? 'This project is not inside a Git repository.' : 'Reading…' }}
        </p>
      }
    } @else {
      <div class="panel">
        @if (store.branch(); as name) {
          <div class="branch-row">
            <span class="branch-name" [title]="'On branch ' + name">{{ name }}</span>
            <button type="button" (click)="actions.openBranches()">Branches…</button>
          </div>
        }

        @if (store.canPublish()) {
          <div class="tracking">
            <div class="remote">
              <span class="upstream">{{ store.branch() }} — not published</span>
            </div>
            <div class="remote-actions">
              <button type="button" (click)="actions.askToPublish()">Publish branch…</button>
            </div>
          </div>
        }

        @if (store.tracking(); as remote) {
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
              <button type="button" (click)="store.fetch()">Fetch</button>
              <button type="button" [disabled]="!store.canPull()" (click)="store.pull()">
                Pull
              </button>
              @if (store.canMerge()) {
                <button type="button" (click)="actions.askToMerge()">Merge…</button>
              }
            </div>
          </div>
        }

        @if (store.merging()) {
          <div class="merging" role="status">
            <span>Merge in progress. Decide each conflict, then commit.</span>
            <button type="button" (click)="store.abortMerge()">Abort merge</button>
          </div>
        }

        <div class="ignore-row">
          <button type="button" (click)="actions.openIgnore()">Ignored files…</button>
        </div>

        <div class="changes-header">
          <input
            type="checkbox"
            [checked]="store.selectAll() === 'all'"
            [indeterminate]="store.selectAll() === 'some'"
            [disabled]="store.entries().length === 0"
            [attr.aria-label]="'Stage all changes'"
            (change)="store.toggleAll()"
          />
          <span>Changes ({{ store.entries().length }})</span>
        </div>

        <ul class="changes">
          @for (entry of store.entries(); track entry.path) {
            <li class="change">
              <input
                type="checkbox"
                [checked]="staged(entry)"
                [attr.aria-label]="'Stage ' + entry.path"
                (change)="store.toggle(entry)"
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
                  (click)="store.ignorePath(entry.path)"
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
                  (click)="actions.openResolver(entry)"
                >
                  Resolve…
                </button>
              }
              <button
                type="button"
                class="show-diff"
                [attr.aria-label]="'Show changes to ' + entry.path"
                title="Show changes"
                (click)="actions.showDiff(entry)"
              >
                ⤢
              </button>
              <button
                type="button"
                class="discard"
                [attr.aria-label]="'Discard changes to ' + entry.path"
                title="Discard changes"
                (click)="actions.askToDiscard(entry)"
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
          [value]="store.message()"
          (input)="store.setMessage(value($event))"
        ></textarea>

        @if (store.failure(); as reason) {
          <p class="failure" role="alert">{{ reason }}</p>
        }

        <div class="actions">
          @if (store.canAmend()) {
            <button type="button" class="amend" (click)="actions.askToAmend()">
              Amend last commit…
            </button>
          }
          <button type="button" [disabled]="!store.canCommit()" (click)="store.commit()">
            Commit
          </button>
          <button type="button" [disabled]="!store.canCommit()" (click)="store.commitAndPush()">
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
  protected readonly store = inject(SourceControlStore);
  protected readonly actions = inject(SourceControlActions);

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

  /**
   * The one failure the panel words itself. Every other failure is git's own
   * message and is shown as it came (SPEC.md §12); this one has no words of
   * git's, because there is no git.
   */
  protected wording(reason: string): string {
    return reason === 'git/not-installed'
      ? 'Git is not installed on this machine, or not on the path. Source control needs ' +
          'it; everything else works without it.'
      : reason;
  }
}
