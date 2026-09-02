import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

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
  host: { '(document:keydown.escape)': 'cancel.emit()' },
  template: `
    <div class="backdrop" (mousedown)="cancel.emit()"></div>
    <div class="prompt" role="dialog" aria-modal="true" [attr.aria-label]="title()">
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
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.2);
    }
    .prompt {
      position: fixed;
      top: 40%;
      left: 50%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(360px, calc(100vw - 48px));
      padding: 14px 16px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 8px;
      background: Canvas;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
      font: 13px system-ui, sans-serif;
      transform: translate(-50%, -50%);
    }
    h2 {
      margin: 0;
      font-size: 14px;
    }
    input {
      padding: 4px 6px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }
    .hint {
      margin: 0;
      color: rgba(128, 128, 128, 0.95);
      font-size: 11px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
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
    button:disabled {
      opacity: 0.5;
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

  protected readonly text = signal('');
  protected readonly valid = computed(() => this.text().trim() !== '');

  constructor() {
    // `initial` arrives before the first render, so seeding it here shows the
    // current name in a rename rather than an empty field.
    queueMicrotask(() => this.text.set(this.initial()));
  }

  protected submit(): void {
    if (this.valid()) {
      this.confirm.emit(this.text().trim());
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
