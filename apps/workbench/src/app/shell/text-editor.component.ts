import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * A small editor for one plain-text file that is not a sheet. SPEC.md §12.
 *
 * `.gitignore` is what it is for. It belongs to the project but not to the
 * manuscript, so it is edited here rather than in the writing surface, which
 * applies front matter and heading rules that do not fit a list of patterns.
 */
@Component({
  selector: 'wi-text-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close.emit()' },
  template: `
    <div class="backdrop" (mousedown)="close.emit()"></div>
    <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()">
      <header>
        <h2>{{ title() }}</h2>
        <button type="button" (click)="close.emit()">Cancel</button>
        <button type="button" class="save" (click)="save.emit(draft())">Save</button>
      </header>

      <textarea
        [value]="draft()"
        [attr.aria-label]="title()"
        spellcheck="false"
        (input)="draft.set(value($event))"
      ></textarea>
      <p class="hint">{{ hint() }}</p>
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
      width: min(520px, calc(100vw - 48px));
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
    textarea {
      height: 40vh;
      padding: 6px 8px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      resize: none;
      white-space: pre;
    }
    .hint {
      margin: 0;
      color: rgba(128, 128, 128, 0.95);
      font-size: 11px;
    }
    button {
      flex: none;
      padding: 3px 10px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
  `,
})
export class TextEditorComponent {
  readonly title = input.required<string>();
  readonly text = input.required<string>();
  readonly hint = input('');

  readonly save = output<string>();
  readonly close = output<void>();

  protected readonly draft = signal('');

  constructor() {
    // `text` arrives before the first render; seeding it here shows the file
    // as it is rather than an empty box.
    queueMicrotask(() => this.draft.set(this.text()));
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
