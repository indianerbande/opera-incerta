import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  inject,
} from '@angular/core';
import { diffProse, readDiff } from '@opera-incerta/core';
import type { GitVersions } from '@opera-incerta/desktop-contract';
import { DialogComponent } from '../shell/dialog.component.js';
import { Localization } from '../localization/localization.js';

/**
 * What changed in one file. SPEC.md §12.
 *
 * Git's own output, shown **unchanged**: it is tool output and is never
 * localized (§14.2). The only thing added is colour, which is presentation —
 * the words, the paths and the line numbers are all Git's.
 *
 * Read-only, and a `<pre>`, for the same reason as the front matter blocks
 * (§10.4): readable and selectable, so it can be copied, and not changeable.
 *
 * **Two readings of the same change.** Git compares lines, which is right for
 * a structure file and wrong for a manuscript: rewording four words shows up
 * as a paragraph removed and a paragraph added, and the author has to find the
 * change by reading both. The word view shows the change itself, in one
 * flowing text. Sheets open in it; everything else opens in Git's, which for a
 * `.json` file is the useful one.
 */
@Component({
  selector: 'wi-diff-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog
      [label]="'Changes to ' + path()"
      width="min(820px, calc(100vw - 64px))"
      maxHeight="min(70vh, 640px)"
      (dismiss)="close.emit()"
    >
      <header>
        <h2>{{ path() }}</h2>
        @if (versions() !== null) {
          <div class="modes">
            <button
              type="button"
              class="mode"
              [class.active]="mode() === 'words'"
              [attr.aria-pressed]="mode() === 'words'"
              (click)="mode.set('words')"
            >
              {{ i18n.t('diff.words') }}
            </button>
            <button
              type="button"
              class="mode"
              [class.active]="mode() === 'lines'"
              [attr.aria-pressed]="mode() === 'lines'"
              (click)="mode.set('lines')"
            >
              {{ i18n.t('diff.lines') }}
            </button>
          </div>
        }
        <button type="button" (click)="close.emit()">{{ i18n.t('common.close') }}</button>
      </header>

      @if (mode() === 'words') {
        @if (words().length === 0) {
          <p class="hint">{{ i18n.t('diff.nothing') }}</p>
        } @else {
          <p class="prose" tabindex="0" [attr.aria-label]="i18n.t('diff.wordsLabel')">@for (
            segment of words();
            track $index
          ) {<span
              class="word"
              [class.added]="segment.kind === 'added'"
              [class.removed]="segment.kind === 'removed'"
            >{{ segment.text }}</span>}</p>
        }
      } @else if (lines().length === 0) {
        <p class="hint">{{ i18n.t('diff.gitNothing') }}</p>
      } @else {
        <pre tabindex="0" [attr.aria-label]="i18n.t('diff.label')">@for (line of lines(); track $index) {<span
            class="line"
            [class.added]="line.kind === 'added'"
            [class.removed]="line.kind === 'removed'"
            [class.hunk]="line.kind === 'hunk'"
            [class.meta]="line.kind === 'meta'"
          >{{ line.text }}
</span>}</pre>
      }
    </wi-dialog>
  `,
  styles: `
    h2 {
      overflow: hidden;
      font-size: 13px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    pre {
      overflow: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 6px 0;
      border-top: 1px solid var(--wi-separator);
      font: 12px var(--wi-mono);
      line-height: 1.45;
      white-space: pre;
      user-select: text;
    }
    .line {
      display: block;
      padding-inline: 8px;
    }
    .line.added {
      background: color-mix(in srgb, var(--wi-success) 14%, transparent);
      color: var(--wi-success);
    }
    .line.removed {
      background: color-mix(in srgb, var(--wi-danger) 12%, transparent);
      color: var(--wi-danger);
    }
    .line.hunk {
      color: var(--wi-accent);
    }
    .line.meta {
      color: var(--wi-muted);
    }
    .modes {
      display: flex;
      flex: none;
      gap: 2px;
    }
    .mode {
      padding: 2px 8px;
      border-color: transparent;
    }
    .mode.active {
      border-color: var(--wi-border);
      background: var(--wi-row-selected);
    }
    .prose {
      overflow: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 8px 4px;
      border-top: 1px solid var(--wi-separator);
      font: 14px/1.6 Georgia, 'Times New Roman', serif;
      /* The manuscript's own line breaks are part of what changed. */
      white-space: pre-wrap;
      user-select: text;
    }
    .word.added {
      background: color-mix(in srgb, var(--wi-success) 18%, transparent);
      color: var(--wi-success);
    }
    .word.removed {
      background: color-mix(in srgb, var(--wi-danger) 14%, transparent);
      color: var(--wi-danger);
      text-decoration: line-through;
    }
  `,
})
export class DiffViewComponent {
  protected readonly i18n = inject(Localization);
  readonly path = input.required<string>();
  /** Git's own diff, shown unchanged in the line view. */
  readonly text = input.required<string>();
  /** The two versions, for the word view. Null when they could not be read. */
  readonly versions = input<GitVersions | null>(null);

  readonly close = output<void>();

  /**
   * Sheets open word by word, everything else in Git's line diff — which for a
   * structure file is the useful one.
   */
  protected readonly mode = linkedSignal<'words' | 'lines'>(() =>
    this.versions() !== null && this.path().toLowerCase().endsWith('.md') ? 'words' : 'lines',
  );

  protected readonly lines = computed(() => readDiff(this.text()));
  protected readonly words = computed(() => {
    const versions = this.versions();
    return versions === null
      ? []
      : diffProse(versions.committed ?? '', versions.current ?? '');
  });

}
