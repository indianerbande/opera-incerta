import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { diffProse, readDiff } from '@opera-incerta/core';
import type { GitVersions } from '@opera-incerta/desktop-contract';

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
  host: { '(document:keydown.escape)': 'close.emit()' },
  template: `
    <div class="backdrop" (mousedown)="close.emit()"></div>
    <div class="viewer" role="dialog" aria-modal="true" [attr.aria-label]="'Changes to ' + path()">
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
              Words
            </button>
            <button
              type="button"
              class="mode"
              [class.active]="mode() === 'lines'"
              [attr.aria-pressed]="mode() === 'lines'"
              (click)="mode.set('lines')"
            >
              Lines
            </button>
          </div>
        }
        <button type="button" (click)="close.emit()">Close</button>
      </header>

      @if (mode() === 'words') {
        @if (words().length === 0) {
          <p class="hint">Nothing changed in this file.</p>
        } @else {
          <p class="prose" tabindex="0" aria-label="Changes, word by word">@for (
            segment of words();
            track $index
          ) {<span
              class="word"
              [class.added]="segment.kind === 'added'"
              [class.removed]="segment.kind === 'removed'"
            >{{ segment.text }}</span>}</p>
        }
      } @else if (lines().length === 0) {
        <p class="hint">Git reports no difference for this file.</p>
      } @else {
        <pre tabindex="0" aria-label="Diff">@for (line of lines(); track $index) {<span
            class="line"
            [class.added]="line.kind === 'added'"
            [class.removed]="line.kind === 'removed'"
            [class.hunk]="line.kind === 'hunk'"
            [class.meta]="line.kind === 'meta'"
          >{{ line.text }}
</span>}</pre>
      }
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.2);
    }
    .viewer {
      position: fixed;
      top: 50%;
      left: 50%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(820px, calc(100vw - 64px));
      max-height: min(70vh, 640px);
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
      overflow: hidden;
      flex: 1 1 auto;
      margin: 0;
      font-size: 13px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    button {
      padding: 3px 10px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    pre {
      overflow: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 6px 0;
      border-top: 1px solid rgba(128, 128, 128, 0.25);
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      line-height: 1.45;
      white-space: pre;
      user-select: text;
    }
    .line {
      display: block;
      padding-inline: 8px;
    }
    .line.added {
      background: rgba(60, 150, 90, 0.14);
      color: rgb(30, 105, 60);
    }
    .line.removed {
      background: rgba(180, 70, 70, 0.12);
      color: rgb(150, 60, 60);
    }
    .line.hunk {
      color: rgba(90, 110, 170, 0.95);
    }
    .line.meta {
      color: rgba(128, 128, 128, 0.9);
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
      border-color: rgba(128, 128, 128, 0.45);
      background: rgba(128, 128, 128, 0.18);
    }
    .prose {
      overflow: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 8px 4px;
      border-top: 1px solid rgba(128, 128, 128, 0.25);
      font: 14px/1.6 Georgia, 'Times New Roman', serif;
      /* The manuscript's own line breaks are part of what changed. */
      white-space: pre-wrap;
      user-select: text;
    }
    .word.added {
      background: rgba(60, 150, 90, 0.18);
      color: rgb(25, 95, 55);
    }
    .word.removed {
      background: rgba(180, 70, 70, 0.14);
      color: rgb(150, 60, 60);
      text-decoration: line-through;
    }
    .hint {
      margin: 0;
      color: rgba(128, 128, 128, 0.95);
    }
  `,
})
export class DiffViewComponent {
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
  protected readonly mode = signal<'words' | 'lines'>('lines');

  protected readonly lines = computed(() => readDiff(this.text()));
  protected readonly words = computed(() => {
    const versions = this.versions();
    return versions === null
      ? []
      : diffProse(versions.committed ?? '', versions.current ?? '');
  });

  constructor() {
    queueMicrotask(() => {
      if (this.versions() !== null && this.path().toLowerCase().endsWith('.md')) {
        this.mode.set('words');
      }
    });
  }
}
