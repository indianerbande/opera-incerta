import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { isConflicted } from '@opera-incerta/core';
import type { GitFileStatus } from '@opera-incerta/core';
import { SourceControlActions } from '../workspace/source-control-actions.js';
import { SourceControlStore } from '../workspace/source-control-store.js';
import { Localization } from '../localization/localization.js';

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
      } @else if (store.loaded()) {
        <!-- A normal starting point, and the one offer that fits it
             (SPEC.md §12). Nothing is staged or committed by it. -->
        <div class="no-repository">
          <p class="hint">{{ i18n.t('sourceControl.noRepository') }}</p>
          <button type="button" class="create-repository" (click)="actions.createRepository()">
            {{ i18n.t('sourceControl.createRepository') }}
          </button>
        </div>
      } @else {
        <p class="hint">{{ i18n.t('sourceControl.reading') }}</p>
      }
    } @else {
      <div class="panel">
        @if (store.branch(); as name) {
          <div class="branch-row">
            <span class="branch-name" [title]="i18n.t('sourceControl.onBranch', { name })">{{ name }}</span>
            <button type="button" (click)="actions.openBranches()">{{ i18n.t('sourceControl.branches') }}</button>
          </div>
        }

        @if (store.canPublish()) {
          <div class="tracking">
            <div class="remote">
              <span class="upstream">{{ i18n.t('sourceControl.notPublished', { branch: store.branch() ?? '' }) }}</span>
            </div>
            <div class="remote-actions">
              <button type="button" (click)="actions.askToPublish()">{{ i18n.t('sourceControl.publish') }}</button>
            </div>
          </div>
        }

        @if (store.tracking(); as remote) {
          <div class="tracking">
            <div class="remote">
              <span class="upstream" [title]="i18n.t('sourceControl.tracking', { upstream: remote.upstream })">{{
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
                  <span class="even">{{ i18n.t('sourceControl.upToDate') }}</span>
                }
              </span>
            </div>
            <div class="remote-actions">
              <button type="button" (click)="store.fetch()">{{ i18n.t('sourceControl.fetch') }}</button>
              <button type="button" [disabled]="!store.canPull()" (click)="store.pull()">
                {{ i18n.t('sourceControl.pull') }}
              </button>
              @if (store.canMerge()) {
                <button type="button" (click)="actions.askToMerge()">{{ i18n.t('sourceControl.merge') }}</button>
              }
            </div>
          </div>
        }

        @if (store.merging()) {
          <div class="merging" role="status">
            <span>{{ i18n.t('sourceControl.merging') }}</span>
            <button type="button" (click)="store.abortMerge()">{{ i18n.t('sourceControl.abortMerge') }}</button>
          </div>
        }

        @if (store.identityMissing()) {
          <!-- The way back to the question a created repository asked, for an
               author who declined it then (SPEC.md §12). -->
          <div class="identity-row">
            <span class="hint">{{ i18n.t('sourceControl.noAuthor') }}</span>
            <button type="button" class="set-identity" (click)="actions.askForIdentity()">
              {{ i18n.t('sourceControl.setIdentity') }}
            </button>
          </div>
        }

        <div class="ignore-row">
          <button type="button" (click)="actions.openIgnore()">{{ i18n.t('sourceControl.ignoredFiles') }}</button>
        </div>

        <div class="changes-header">
          <input
            type="checkbox"
            [checked]="store.selectAll() === 'all'"
            [indeterminate]="store.selectAll() === 'some'"
            [disabled]="store.entries().length === 0"
            [attr.aria-label]="i18n.t('sourceControl.stageAll')"
            (change)="store.toggleAll()"
          />
          <span>{{ i18n.t('sourceControl.changes', { count: store.entries().length }) }}</span>
        </div>

        <ul class="changes">
          @for (entry of store.entries(); track entry.path) {
            <li class="change">
              <input
                type="checkbox"
                [checked]="staged(entry)"
                [attr.aria-label]="i18n.t('sourceControl.stage', { path: entry.path })"
                (change)="store.toggle(entry)"
              />
              <span class="status" [title]="statusTitle(entry)">{{ statusCode(entry) }}</span>
              <span class="name">{{ fileName(entry.path) }}</span>
              <span class="directory">{{ directory(entry.path) }}</span>
              @if (isUntracked(entry)) {
                <button
                  type="button"
                  class="ignore"
                  [attr.aria-label]="i18n.t('sourceControl.ignore', { path: entry.path })"
                  [title]="i18n.t('sourceControl.ignoreTitle')"
                  (click)="store.ignorePath(entry.path)"
                >
                  ⊘
                </button>
              }
              @if (isConflicted(entry)) {
                <button
                  type="button"
                  class="resolve"
                  [attr.aria-label]="i18n.t('sourceControl.resolve', { path: entry.path })"
                  [title]="i18n.t('sourceControl.resolveTitle')"
                  (click)="actions.openResolver(entry)"
                >
                  {{ i18n.t('sourceControl.resolveButton') }}
                </button>
              }
              <button
                type="button"
                class="show-diff"
                [attr.aria-label]="i18n.t('sourceControl.showChanges', { path: entry.path })"
                [title]="i18n.t('sourceControl.showChangesTitle')"
                (click)="actions.showDiff(entry)"
              >
                ⤢
              </button>
              <button
                type="button"
                class="discard"
                [attr.aria-label]="i18n.t('sourceControl.discardChanges', { path: entry.path })"
                [title]="i18n.t('sourceControl.discardTitle')"
                (click)="actions.askToDiscard(entry)"
              >
                ↺
              </button>
            </li>
          } @empty {
            <li class="hint">{{ i18n.t('sourceControl.nothingChanged') }}</li>
          }
        </ul>

        <textarea
          class="message"
          rows="3"
          [placeholder]="i18n.t('sourceControl.messagePlaceholder')"
          [value]="store.message()"
          (input)="store.setMessage(value($event))"
        ></textarea>

        @if (store.failure(); as reason) {
          <p class="failure" role="alert">{{ reason }}</p>
        }

        <div class="actions">
          @if (store.canAmend()) {
            <button type="button" class="amend" (click)="actions.askToAmend()">
              {{ i18n.t('sourceControl.amend') }}
            </button>
          }
          <button type="button" [disabled]="!store.canCommit()" (click)="store.commit()">
            {{ i18n.t('sourceControl.commit') }}
          </button>
          <button type="button" [disabled]="!store.canCommit()" (click)="store.commitAndPush()">
            {{ i18n.t('sourceControl.commitAndPush') }}
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
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
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
      border-radius: var(--wi-radius-control);
      background: none;
      color: var(--wi-muted);
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
      color: var(--wi-danger);
    }
    .failure {
      margin: 0;
      padding: 4px 6px;
      border-radius: var(--wi-radius-control);
      background: color-mix(in srgb, var(--wi-danger) 18%, transparent);
      color: var(--wi-danger);
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
      font: 12px var(--wi-sans);
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
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
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
      border-bottom: 1px solid var(--wi-separator);
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
      color: var(--wi-muted);
    }
    .counts {
      display: flex;
      flex: none;
      gap: 4px;
    }
    .behind {
      color: var(--wi-warning);
    }
    .even {
      color: var(--wi-muted);
    }
    .tracking button {
      flex: none;
      padding: 2px 8px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
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
      border-radius: var(--wi-radius-control);
      background: color-mix(in srgb, var(--wi-warning) 16%, transparent);
      color: var(--wi-warning);
    }
    .merging span {
      flex: 1 1 auto;
    }
    .merging button {
      flex: none;
      padding: 2px 8px;
      border: 1px solid color-mix(in srgb, var(--wi-warning) 50%, transparent);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .change .resolve {
      flex: none;
      padding: 0 6px;
      border: 1px solid color-mix(in srgb, var(--wi-warning) 60%, transparent);
      border-radius: var(--wi-radius-control);
      background: none;
      color: var(--wi-warning);
      font: inherit;
      cursor: default;
    }
    .changes-header {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px 8px;
      color: var(--wi-muted);
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
      border-radius: var(--wi-radius-control);
    }
    .change:hover {
      background: var(--wi-row-hover);
    }
    .status {
      width: 16px;
      color: var(--wi-muted);
      font-family: var(--wi-mono);
    }
    .name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .directory {
      overflow: hidden;
      color: var(--wi-muted);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .message {
      margin: 6px 8px;
      padding: 4px 5px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
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
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    button:disabled {
      opacity: 0.5;
    }
    .identity-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--wi-separator);
    }
    .identity-row .hint {
      margin: 0;
    }

    .no-repository {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      padding: 8px;
    }
    .no-repository .hint {
      padding: 0;
    }
    .create-repository {
      padding: 3px 10px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    .hint {
      margin: 0;
      padding: 8px;
      color: var(--wi-muted);
    }
  `,
})
export class SourceControlComponent {
  protected readonly i18n = inject(Localization);
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
    return reason === 'git/not-installed' ? this.i18n.t('sourceControl.gitNotInstalled') : reason;
  }
}
