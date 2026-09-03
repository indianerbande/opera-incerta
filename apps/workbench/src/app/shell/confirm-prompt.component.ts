import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DialogComponent } from './dialog.component.js';

/**
 * Asking before something is taken away. SPEC.md §6.7.
 *
 * Deliberately unlike the naming prompt in one respect: **Return does not
 * confirm** — it cancels, like the default button of a system alert. The
 * destructive button has to be aimed at with the pointer.
 *
 * Return is bound outright rather than left to the focused button. Relying on
 * focus would make the rule true only as long as the focus lands where it was
 * meant to, and a rule about not deleting things should not depend on that.
 *
 * `warning` carries what the author would otherwise only find out afterwards —
 * how much goes along with a group, or that a sheet has unsaved changes.
 */
@Component({
  selector: 'wi-confirm-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  // Escape is the dialog's; Return is this component's rule, see above.
  host: { '(document:keydown.enter)': 'cancel.emit()' },
  template: `
    <wi-dialog
      [label]="title()"
      role="alertdialog"
      width="min(380px, calc(100vw - 48px))"
      (dismiss)="cancel.emit()"
    >
      <h2>{{ title() }}</h2>
      @if (warning(); as note) {
        <p class="warning">{{ note }}</p>
      }
      <p class="hint">{{ hint() }}</p>
      <div class="actions">
        <button type="button" class="cancel" #cancelButton (click)="cancel.emit()">Cancel</button>
        <button type="button" class="danger" (click)="confirm.emit()">{{ confirmLabel() }}</button>
      </div>
    </wi-dialog>
  `,
  styles: `
    p {
      margin: 0;
    }
    .warning {
      font-weight: 600;
    }
    button.cancel:focus-visible {
      outline: 2px solid rgba(128, 128, 128, 0.9);
    }
    button.danger {
      border-color: var(--wi-danger-border);
      color: var(--wi-danger);
    }
  `,
})
export class ConfirmPromptComponent {
  readonly title = input.required<string>();
  readonly warning = input<string | null>(null);
  readonly hint = input('It goes to the desktop trash, where it can be restored.');
  readonly confirmLabel = input('Delete');

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    // Where the keyboard should be: on the harmless button, not on the
    // destructive one. The Return rule above does not depend on it.
    afterNextRender(() => this.cancelButton()?.nativeElement.focus());
  }
}
