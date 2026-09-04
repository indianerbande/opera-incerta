import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  SETTINGS_CATEGORIES,
  settingsOf,
  type PreviewDensity,
  type Setting,
  type SettingsCategoryId,
} from '@opera-incerta/core';
import type { GitIdentity, GitIdentityReport } from '@opera-incerta/desktop-contract';
import { LayoutState } from './layout-state.js';
import { DialogComponent } from './dialog.component.js';

/**
 * The settings dialog. SPEC.md §13.
 *
 * A category list and one focused content region. The region renders the
 * registry of the core — a switch per boolean preference, the density steps
 * — and the two entries that are not preferences: the project's page
 * categories, which open their own manager, and the repository's commit
 * identity, edited here in place because the panel's row and the question
 * after creating a repository both point here as the place to supply it
 * later (SPEC.md §12).
 *
 * Changes apply immediately and are stored by the layout state, like every
 * other preference. Reset restores the complete default record. Escape and
 * the close button dismiss it; Tab stays inside, and focus returns to the
 * control that opened it.
 */
@Component({
  selector: 'wi-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  host: { '(keydown.tab)': 'keepFocusInside($event)', '(keydown.shift.tab)': 'keepFocusInside($event)' },
  template: `
    <wi-dialog label="Settings" width="min(720px, calc(100vw - 48px))" maxHeight="min(560px, calc(100vh - 48px))" (dismiss)="close.emit()">
      <header>
        <h2>Settings</h2>
        <button type="button" class="close" (click)="close.emit()">Close</button>
      </header>
      <div class="body">
        <nav class="categories" aria-label="Settings categories">
          @for (category of categories; track category.id) {
            <button
              type="button"
              class="category"
              [class.active]="category.id === selected()"
              [attr.aria-current]="category.id === selected() ? 'page' : null"
              (click)="selected.set(category.id)"
            >
              {{ category.label }}
            </button>
          }
        </nav>
        <section class="content" [attr.aria-label]="current().label">
          <h3>{{ current().label }}</h3>
          <p class="hint">{{ current().description }}</p>

          @for (setting of settings(); track setting.id) {
            @if (setting.kind === 'switch') {
              <label class="setting switch">
                <input
                  type="checkbox"
                  [checked]="switchValue(setting)"
                  (change)="layout.setSwitch(setting.key, checked($event))"
                />
                <span class="label">{{ setting.label }}</span>
                @if (setting.hint; as hint) {
                  <span class="hint">{{ hint }}</span>
                }
              </label>
            } @else {
              <fieldset class="setting choice">
                <legend>{{ setting.label }}</legend>
                @for (option of setting.options; track option.value) {
                  <label>
                    <input
                      type="radio"
                      name="density"
                      [value]="option.value"
                      [checked]="layout.sheetListDensity() === option.value"
                      (change)="layout.setDensity(option.value)"
                    />
                    {{ option.label }}
                  </label>
                }
                @if (setting.hint; as hint) {
                  <span class="hint">{{ hint }}</span>
                }
              </fieldset>
            }
          }

          @if (selected() === 'pageCategories') {
            <div class="setting">
              <button type="button" class="manage-categories" (click)="manageCategories.emit()">
                Manage categories…
              </button>
            </div>
          }

          @if (selected() === 'sourceControl') {
            @if (identity() === null) {
              <p class="hint">This project is not inside a Git repository.</p>
            } @else {
              <p class="hint">{{ identitySource() }}</p>
              <label class="setting field">
                <span class="label">Name</span>
                <input type="text" name="name" [value]="name()" (input)="name.set(value($event))" />
              </label>
              <label class="setting field">
                <span class="label">E-mail</span>
                <input type="email" name="email" [value]="email()" (input)="email.set(value($event))" />
              </label>
              <p class="hint">
                Both are written into every commit and go with the manuscript wherever it is
                published. They are recorded in this project only; nothing outside it changes.
              </p>
              <div class="setting">
                <button type="button" class="save-identity" [disabled]="!identityChanged()" (click)="saveIdentity()">
                  Save
                </button>
              </div>
            }
          }
        </section>
      </div>
      <div class="actions">
        <button type="button" class="reset" (click)="layout.resetPreferences()">Reset all settings</button>
        <span class="spacer"></span>
        <span class="hint">Changes apply at once and are kept for this installation.</span>
      </div>
    </wi-dialog>
  `,
  styles: `
    .body {
      display: flex;
      gap: 12px;
      min-height: 320px;
    }
    .categories {
      display: flex;
      flex: none;
      flex-direction: column;
      gap: 2px;
      width: 150px;
      padding-inline-end: 8px;
      border-inline-end: 1px solid var(--wi-separator);
    }
    .category {
      padding: 4px 8px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
    }
    .category:hover {
      background: rgba(128, 128, 128, 0.14);
    }
    .category.active {
      border-color: rgba(128, 128, 128, 0.4);
      background: rgba(128, 128, 128, 0.2);
    }
    .content {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      overflow: auto;
    }
    h3 {
      margin: 0;
      font-size: 13px;
    }
    .setting {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .switch {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 8px;
      align-items: center;
    }
    .switch .hint {
      grid-column: 2;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: none;
    }
    legend {
      padding: 0;
      margin-block-end: 4px;
    }
    .choice label {
      margin-inline-end: 12px;
    }
    .field input {
      padding: 4px 6px;
      border: 1px solid var(--wi-border);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }
    .field .label {
      font-size: 12px;
      color: var(--wi-muted);
    }
    .spacer {
      flex: 1 1 auto;
    }
  `,
})
export class SettingsComponent {
  protected readonly layout = inject(LayoutState);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Who commits would be by, from the source control store; null outside a repository. */
  readonly identity = input<GitIdentityReport | null>(null);
  /** Which category to open on. */
  readonly initialCategory = input<SettingsCategoryId>('sheetList');
  /**
   * What opened the dialog. A click does not focus a button on macOS, so the
   * control to return to cannot be read from the document; it is named.
   */
  readonly opener = input<'activityBar' | 'menu'>('menu');

  readonly close = output<void>();
  readonly manageCategories = output<void>();
  readonly saveIdentityRequest = output<GitIdentity>();

  protected readonly categories = SETTINGS_CATEGORIES;
  protected readonly selected = linkedSignal<SettingsCategoryId>(() => this.initialCategory());
  protected readonly current = computed(
    () => SETTINGS_CATEGORIES.find((category) => category.id === this.selected()) ?? SETTINGS_CATEGORIES[0]!,
  );
  protected readonly settings = computed(() => settingsOf(this.selected()));

  /** The identity in effect: this repository's first, the author's global one otherwise. */
  readonly #effective = computed<GitIdentity | null>(() => {
    const report = this.identity();
    return report === null ? null : (report.local ?? report.global);
  });
  protected readonly name = linkedSignal(() => this.#effective()?.name ?? '');
  protected readonly email = linkedSignal(() => this.#effective()?.email ?? '');
  protected readonly identityChanged = computed(() => {
    const trimmed = { name: this.name().trim(), email: this.email().trim() };
    const effective = this.#effective();
    return (
      trimmed.name !== '' &&
      trimmed.email !== '' &&
      (effective === null || effective.name !== trimmed.name || effective.email !== trimmed.email)
    );
  });
  protected readonly identitySource = computed(() => {
    const report = this.identity();
    if (report?.local !== null && report?.local !== undefined) {
      return 'Recorded in this repository.';
    }
    if (report?.global !== null && report?.global !== undefined) {
      return 'From your global Git configuration; saving here records a copy in this repository.';
    }
    return 'Commits have no author yet.';
  });

  readonly #opener = typeof document === 'undefined' ? null : document.activeElement;
  readonly #focusables = signal<readonly HTMLElement[]>([]);

  constructor() {
    afterNextRender(() => {
      this.#host.nativeElement.querySelector<HTMLElement>('.category.active')?.focus();
    });
    this.close.subscribe(() => {
      const target =
        this.opener() === 'activityBar'
          ? document.querySelector<HTMLElement>('wi-activity-bar button[aria-label="Settings"]')
          : this.#opener;
      if (target instanceof HTMLElement && target !== document.body) {
        target.focus();
      }
    });
  }

  protected switchValue(setting: Setting): boolean {
    return setting.kind === 'switch' ? this.layout.switchValue(setting.key) : false;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected densityOf(value: string): PreviewDensity {
    return value as PreviewDensity;
  }

  protected saveIdentity(): void {
    if (this.identityChanged()) {
      this.saveIdentityRequest.emit({ name: this.name().trim(), email: this.email().trim() });
    }
  }

  /** Tab cycles within the dialog: the workbench behind it is not reachable. */
  protected keepFocusInside(event: Event): void {
    const keyboard = event as KeyboardEvent;
    const focusables = [...this.#host.nativeElement.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )];
    this.#focusables.set(focusables);
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (keyboard.shiftKey && active === first) {
      keyboard.preventDefault();
      last.focus();
    } else if (!keyboard.shiftKey && active === last) {
      keyboard.preventDefault();
      first.focus();
    } else if (!focusables.includes(active as HTMLElement)) {
      keyboard.preventDefault();
      first.focus();
    }
  }
}
