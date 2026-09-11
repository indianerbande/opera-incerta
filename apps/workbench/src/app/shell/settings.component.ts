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
  EDITOR_FONT_STACKS,
  SETTINGS_CATEGORIES,
  settingsOf,
  type EditorFontFamily,
  type PreviewDensity,
  type Setting,
  type SettingsCategoryId,
} from '@opera-incerta/core';
import type { GitIdentity, GitIdentityReport } from '@opera-incerta/desktop-contract';
import type { MessageKey } from '@opera-incerta/localization';
import { LayoutState } from './layout-state.js';
import { DialogComponent } from './dialog.component.js';
import { Localization } from '../localization/localization.js';

/**
 * The settings dialog. specification.md §13.
 *
 * A category list and one focused content region. The region renders the
 * registry of the core — a switch per boolean preference, the density steps
 * — and the two entries that are not preferences: the project's page
 * categories, which open their own manager, and the repository's commit
 * identity, edited here in place because the panel's row and the question
 * after creating a repository both point here as the place to supply it
 * later (specification.md §12).
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
    <wi-dialog [label]="i18n.t('settings.title')" width="min(720px, calc(100vw - 48px))" maxHeight="min(560px, calc(100vh - 48px))" (dismiss)="close.emit()">
      <header>
        <h2>{{ i18n.t('settings.title') }}</h2>
        <button type="button" class="close" (click)="close.emit()">{{ i18n.t('common.close') }}</button>
      </header>
      <div class="body">
        <nav class="categories" [attr.aria-label]="i18n.t('settings.categories')">
          @for (category of categories; track category.id) {
            <button
              type="button"
              class="category"
              [class.active]="category.id === selected()"
              [attr.aria-current]="category.id === selected() ? 'page' : null"
              (click)="selected.set(category.id)"
            >
              {{ i18n.t(key(category.labelKey)) }}
            </button>
          }
        </nav>
        <section class="content" [attr.aria-label]="i18n.t(key(current().labelKey))">
          <h3>{{ i18n.t(key(current().labelKey)) }}</h3>
          <p class="hint">{{ i18n.t(key(current().descriptionKey)) }}</p>

          @for (setting of settings(); track setting.id) {
            @if (setting.kind === 'switch') {
              <label class="setting switch">
                <input
                  type="checkbox"
                  [checked]="switchValue(setting)"
                  (change)="layout.setSwitch(setting.key, checked($event))"
                />
                <span class="label">{{ i18n.t(key(setting.labelKey)) }}</span>
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint)) }}</span>
                }
              </label>
            } @else if (setting.kind === 'density') {
              <fieldset class="setting choice">
                <legend>{{ i18n.t(key(setting.labelKey)) }}</legend>
                @for (option of setting.options; track option.value) {
                  <label>
                    <input
                      type="radio"
                      name="density"
                      [value]="option.value"
                      [checked]="layout.sheetListDensity() === option.value"
                      (change)="layout.setDensity(option.value)"
                    />
                    {{ i18n.t(key(option.labelKey)) }}
                  </label>
                }
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint)) }}</span>
                }
              </fieldset>
            } @else if (setting.kind === 'fontFamily') {
              <fieldset class="setting choice font-family">
                <legend>{{ i18n.t(key(setting.labelKey)) }}</legend>
                @for (option of setting.options; track option.value) {
                  <label [style.font-family]="stackOf(option.value)">
                    <input
                      type="radio"
                      name="fontFamily"
                      [value]="option.value"
                      [checked]="layout.editorFontFamily() === option.value"
                      (change)="layout.setEditorFontFamily(option.value)"
                    />
                    {{ i18n.t(key(option.labelKey)) }}
                  </label>
                }
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint)) }}</span>
                }
              </fieldset>
            } @else if (setting.kind === 'colorScheme') {
              <fieldset class="setting choice scheme">
                <legend>{{ i18n.t(key(setting.labelKey)) }}</legend>
                @for (option of setting.options; track option.value) {
                  <label>
                    <input
                      type="radio"
                      name="colorScheme"
                      [value]="option.value"
                      [checked]="layout.colorScheme() === option.value"
                      (change)="layout.setColorScheme(option.value)"
                    />
                    {{ i18n.t(key(option.labelKey)) }}
                  </label>
                }
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint)) }}</span>
                }
              </fieldset>
            } @else if (setting.kind === 'accentPalette') {
              <fieldset class="setting palette">
                <legend>{{ i18n.t(key(setting.labelKey)) }}</legend>
                <div class="swatches">
                  @for (option of setting.options; track option.value) {
                    <label
                      class="swatch"
                      [attr.data-color-palette]="option.value"
                      [class.chosen]="layout.accentPalette() === option.value"
                      [title]="i18n.t(key(option.labelKey))"
                    >
                      <input
                        type="radio"
                        name="accentPalette"
                        [value]="option.value"
                        [checked]="layout.accentPalette() === option.value"
                        (change)="layout.setAccentPalette(option.value)"
                      />
                      <span class="name">{{ i18n.t(key(option.labelKey)) }}</span>
                    </label>
                  }
                </div>
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint)) }}</span>
                }
              </fieldset>
            } @else if (setting.kind === 'number') {
              <label class="setting number">
                <span class="label">{{ i18n.t(key(setting.labelKey)) }}</span>
                <input
                  type="number"
                  name="fontSize"
                  [min]="setting.min"
                  [max]="setting.max"
                  [step]="setting.step"
                  [value]="layout.editorFontSize()"
                  (change)="layout.setEditorFontSize(numberOf($event))"
                />
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint), { min: setting.min, max: setting.max }) }}</span>
                }
              </label>
            } @else {
              <fieldset class="setting choice language">
                <legend>{{ i18n.t(key(setting.labelKey)) }}</legend>
                @for (option of setting.options; track option.value) {
                  <label>
                    <input
                      type="radio"
                      name="language"
                      [value]="option.value"
                      [checked]="layout.interfaceLanguage() === option.value"
                      (change)="layout.setLanguage(option.value)"
                    />
                    {{ i18n.t(key(option.labelKey)) }}
                  </label>
                }
                @if (setting.hintKey; as hint) {
                  <span class="hint">{{ i18n.t(key(hint)) }}</span>
                }
              </fieldset>
            }
          }

          @if (selected() === 'pageCategories') {
            <div class="setting">
              <button type="button" class="manage-categories" (click)="manageCategories.emit()">
                {{ i18n.t('settings.manageCategories') }}
              </button>
            </div>
          }

          @if (selected() === 'sourceControl') {
            @if (identity() === null) {
              <p class="hint">{{ i18n.t('sourceControl.noRepository') }}</p>
            } @else {
              <p class="hint">{{ identitySource() }}</p>
              <label class="setting field">
                <span class="label">{{ i18n.t('identity.name') }}</span>
                <input type="text" name="name" [value]="name()" (input)="name.set(value($event))" />
              </label>
              <label class="setting field">
                <span class="label">{{ i18n.t('identity.email') }}</span>
                <input type="email" name="email" [value]="email()" (input)="email.set(value($event))" />
              </label>
              <p class="hint">{{ i18n.t('identity.hint') }}</p>
              <div class="setting">
                <button type="button" class="save-identity" [disabled]="!identityChanged()" (click)="saveIdentity()">
                  {{ i18n.t('common.save') }}
                </button>
              </div>
            }
          }
        </section>
      </div>
      <div class="actions">
        <button type="button" class="reset" (click)="layout.resetPreferences()">{{ i18n.t('settings.reset') }}</button>
        <span class="spacer"></span>
        <span class="hint">{{ i18n.t('settings.applyNote') }}</span>
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
      display: flex;
      min-height: var(--wi-control-height);
      align-items: center;
      padding: 0 var(--wi-space-3);
      border: 1px solid transparent;
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
    }
    .category:hover {
      background: var(--wi-row-hover);
    }
    .category.active {
      border-color: var(--wi-accent-border);
      background: var(--wi-accent-soft);
      box-shadow: inset 3px 0 0 var(--wi-accent);
      color: var(--wi-accent);
      font-weight: 600;
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
    /* The palette swatches of specification.md §8.8: the choice is the colour, and the
     * name is what a screen reader hears and the pointer reveals. */
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
    .swatch {
      display: grid;
      width: 22px;
      height: 22px;
      margin: 0;
      place-items: center;
      border: 1px solid var(--wi-line-strong);
      border-radius: 50%;
      background: var(--wi-accent);
      cursor: default;
    }
    .swatch.chosen {
      box-shadow: 0 0 0 2px var(--wi-panel), 0 0 0 4px var(--wi-accent);
    }
    .swatch input,
    .swatch .name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .swatch:has(input:focus-visible) {
      outline: 2px solid var(--wi-ink);
      outline-offset: 2px;
    }
    .number input {
      width: 5em;
      padding: 4px 6px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
    }
    .field input {
      padding: 4px 6px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
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
  protected readonly i18n = inject(Localization);
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
      return this.i18n.t('settings.identity.local');
    }
    if (report?.global !== null && report?.global !== undefined) {
      return this.i18n.t('settings.identity.global');
    }
    return this.i18n.t('settings.identity.none');
  });

  /**
   * The registry names its keys as strings, because the core is text-free
   * and knows no catalogue; here they meet the catalogue's type. A key the
   * catalogue lacks would show as itself — the localization tests keep the
   * registry and the catalogue in step.
   */
  protected key(registryKey: string): MessageKey {
    return registryKey as MessageKey;
  }

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

  protected numberOf(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  /** The family's own look on its label, so the choice can be seen before it is made. */
  protected stackOf(family: EditorFontFamily): string {
    return EDITOR_FONT_STACKS[family];
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
