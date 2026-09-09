import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * The one dialog shell. SPEC.md §8.7.
 *
 * A backdrop that dismisses on click, a centred panel, Escape, and the ARIA
 * role and name — and nothing about what is inside. Every dialog of the
 * workbench projects its content into this, so the chrome exists once: eight
 * dialogs used to carry their own copy of these forty lines, and the copies
 * had drifted apart in their top offset, their padding, and their shadow.
 *
 * What the content shares beyond the panel — the heading, the header row,
 * the actions row, the buttons, the hint — is styled in `styles.css` under
 * `wi-dialog`, because projected content is outside this component's own
 * encapsulated styles.
 */
@Component({
  selector: 'wi-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'dismiss.emit()' },
  template: `
    <div class="backdrop" (mousedown)="dismiss.emit()"></div>
    <div
      class="panel"
      [attr.role]="role()"
      aria-modal="true"
      [attr.aria-label]="label()"
      [style.width]="width()"
      [style.max-height]="maxHeight()"
    >
      <ng-content />
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: var(--wi-backdrop);
    }
    .panel {
      position: fixed;
      top: 45%;
      left: 50%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      border: 1px solid var(--wi-border);
      border-radius: 8px;
      background: var(--wi-panel);
      box-shadow: var(--wi-dialog-shadow);
      font: 13px var(--wi-sans);
      transform: translate(-50%, -50%);
    }
  `,
})
export class DialogComponent {
  /** The accessible name. What the dialog is about, in the author's words. */
  readonly label = input.required<string>();
  /** `alertdialog` for a question before something is taken away. */
  readonly role = input<'dialog' | 'alertdialog'>('dialog');
  /** A CSS width; the default fits a prompt. */
  readonly width = input('min(420px, calc(100vw - 48px))');
  /** A CSS max-height for a dialog whose content scrolls; null lets it grow. */
  readonly maxHeight = input<string | null>(null);

  /** Escape, or a click on the backdrop. The content decides what that means. */
  readonly dismiss = output<void>();
}
