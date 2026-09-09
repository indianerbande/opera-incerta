import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  inject,
} from '@angular/core';
import type { GitIdentity } from '@opera-incerta/desktop-contract';
import { DialogComponent } from './dialog.component.js';
import { Localization } from '../localization/localization.js';

/**
 * Asking who commits are by. SPEC.md §12.
 *
 * Put up when a repository is created on a machine without a global identity,
 * and reachable from the panel afterwards. The hint says the one thing the
 * author cannot see from the fields: that both travel with the manuscript.
 * Declining is an ordinary answer — the repository is useful without them.
 */
@Component({
  selector: 'wi-identity-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog [label]="i18n.t('identity.title')" (dismiss)="cancel.emit()">
      <h2>{{ i18n.t('identity.title') }}</h2>
      <label>
        <span>{{ i18n.t('identity.name') }}</span>
        <input
          type="text"
          name="name"
          autofocus
          [value]="name()"
          (input)="name.set(value($event))"
          (keydown.enter)="submit()"
        />
      </label>
      <label>
        <span>{{ i18n.t('identity.email') }}</span>
        <input
          type="email"
          name="email"
          [value]="email()"
          (input)="email.set(value($event))"
          (keydown.enter)="submit()"
        />
      </label>
      <p class="hint">{{ i18n.t('identity.hint') }}</p>
      <div class="actions">
        <button type="button" class="decline" (click)="cancel.emit()">{{ i18n.t('identity.notNow') }}</button>
        <button type="button" class="save primary" [disabled]="!valid()" (click)="submit()">{{ i18n.t('common.save') }}</button>
      </div>
    </wi-dialog>
  `,
  styles: `
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--wi-muted);
    }
    input {
      padding: 4px 6px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
    }
  `,
})
export class IdentityPromptComponent {
  protected readonly i18n = inject(Localization);
  /** What the repository already has, so a correction starts from it. */
  readonly initial = input<GitIdentity | null>(null);

  readonly confirm = output<GitIdentity>();
  readonly cancel = output<void>();

  protected readonly name = linkedSignal(() => this.initial()?.name ?? '');
  protected readonly email = linkedSignal(() => this.initial()?.email ?? '');
  protected readonly valid = computed(
    () => this.name().trim() !== '' && this.email().trim() !== '',
  );

  protected submit(): void {
    if (this.valid()) {
      this.confirm.emit({ name: this.name().trim(), email: this.email().trim() });
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
