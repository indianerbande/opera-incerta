import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { DialogComponent } from './dialog.component.js';

/**
 * Asking for one line of text. SPEC.md §6.4, §6.5.
 *
 * Used for every naming action: a new sheet, a new group, a rename. Confirming
 * is refused for an empty or whitespace-only value, because a nameless entry
 * would show as nothing in the tree.
 */
@Component({
  selector: 'wi-text-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog [label]="title()" width="min(360px, calc(100vw - 48px))" (dismiss)="cancel.emit()">
      <h2>{{ title() }}</h2>
      <input
        type="text"
        autofocus
        [value]="text()"
        [placeholder]="placeholder()"
        (input)="text.set(value($event))"
        (keydown.enter)="submit()"
      />
      @if (hint(); as note) {
        <p class="hint">{{ note }}</p>
      }
      <div class="actions">
        <button type="button" (click)="cancel.emit()">Cancel</button>
        <button type="button" [disabled]="!valid()" (click)="submit()">{{ confirmLabel() }}</button>
      </div>
    </wi-dialog>
  `,
  styles: `
    input {
      padding: 4px 6px;
      border: 1px solid var(--wi-border);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }
  `,
})
export class TextPromptComponent {
  readonly title = input.required<string>();
  readonly initial = input('');
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  readonly confirmLabel = input('OK');

  readonly confirm = output<string>();
  readonly cancel = output<void>();

  /** Seeded from `initial`, so a rename shows the current name; then the author's. */
  protected readonly text = linkedSignal(() => this.initial());
  protected readonly valid = computed(() => this.text().trim() !== '');

  protected submit(): void {
    if (this.valid()) {
      this.confirm.emit(this.text().trim());
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
