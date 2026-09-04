import { ChangeDetectionStrategy, Component, input, linkedSignal, output, inject } from '@angular/core';
import { DialogComponent } from './dialog.component.js';
import { Localization } from '../localization/localization.js';

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
  imports: [DialogComponent],
  template: `
    <wi-dialog [label]="title()" width="min(520px, calc(100vw - 48px))" (dismiss)="close.emit()">
      <header>
        <h2>{{ title() }}</h2>
        <button type="button" (click)="close.emit()">{{ i18n.t('common.cancel') }}</button>
        <button type="button" class="save" (click)="save.emit(draft())">{{ i18n.t('common.save') }}</button>
      </header>

      <textarea
        [value]="draft()"
        [attr.aria-label]="title()"
        spellcheck="false"
        (input)="draft.set(value($event))"
      ></textarea>
      <p class="hint">{{ hint() }}</p>
    </wi-dialog>
  `,
  styles: `
    textarea {
      height: 40vh;
      padding: 6px 8px;
      border: 1px solid var(--wi-border);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      resize: none;
      white-space: pre;
    }
  `,
})
export class TextEditorComponent {
  protected readonly i18n = inject(Localization);
  readonly title = input.required<string>();
  readonly text = input.required<string>();
  readonly hint = input('');

  readonly save = output<string>();
  readonly close = output<void>();

  /** Seeded from the file, then the author's. */
  protected readonly draft = linkedSignal(() => this.text());

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
