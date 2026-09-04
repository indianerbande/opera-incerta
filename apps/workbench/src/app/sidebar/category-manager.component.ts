import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  inject,
} from '@angular/core';
import { MAX_CATEGORIES, categoryTextColor, type PageCategory } from '@opera-incerta/core';
import { DialogComponent } from '../shell/dialog.component.js';
import { Localization } from '../localization/localization.js';

/**
 * Defining the project's page categories. SPEC.md §6.6.
 *
 * They live with the project rather than with the installation, so this is not
 * a setting: it is project data, edited where the sheet that uses it is edited.
 *
 * **Deleting a category does not touch the sheets that used it.** Their `category`
 * keeps the id, and they simply count as uncategorized — rewriting manuscripts
 * to tidy up a definition would be the wrong trade by a wide margin.
 */
@Component({
  selector: 'wi-category-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog
      [label]="i18n.t('categories.title')"
      width="min(460px, calc(100vw - 48px))"
      (dismiss)="cancel.emit()"
    >
      <h2>{{ i18n.t('categories.title') }}</h2>

      <ul class="list">
        @for (category of draft(); track category.id) {
          <li>
            <input
              type="color"
              [value]="category.color"
              [attr.aria-label]="i18n.t('categories.colourOf', { name: category.name })"
              (input)="recolor(category.id, $event)"
            />
            <input
              type="text"
              class="name"
              [value]="category.name"
              [attr.aria-label]="i18n.t('categories.name')"
              (input)="rename(category.id, $event)"
            />
            <span
              class="badge"
              [style.background]="category.color"
              [style.color]="textColor(category.color)"
              >{{ category.name || i18n.t('categories.unnamed') }}</span
            >
            <button type="button" (click)="remove(category.id)" [attr.aria-label]="i18n.t('categories.delete')">
              ✕
            </button>
          </li>
        } @empty {
          <li class="empty">{{ i18n.t('categories.empty') }}</li>
        }
      </ul>

      <div class="actions">
        <button type="button" [disabled]="full()" (click)="add()">{{ i18n.t('categories.add') }}</button>
        <span class="spacer"></span>
        <button type="button" (click)="cancel.emit()">{{ i18n.t('common.cancel') }}</button>
        <button type="button" (click)="confirm.emit(draft())">{{ i18n.t('common.save') }}</button>
      </div>
      @if (full()) {
        <p class="hint">{{ i18n.t('categories.limit', { limit }) }}</p>
      }
    </wi-dialog>
  `,
  styles: `
    .list {
      max-height: 40vh;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }
    li.empty {
      color: var(--wi-muted);
    }
    input[type='color'] {
      width: 26px;
      height: 22px;
      padding: 0;
      border: 1px solid var(--wi-border);
      border-radius: 4px;
      background: none;
    }
    input.name {
      flex: 1 1 auto;
      min-width: 0;
      padding: 3px 6px;
      border: 1px solid var(--wi-border);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }
    .badge {
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 11px;
      white-space: nowrap;
    }
    .spacer {
      flex: 1 1 auto;
    }
  `,
})
export class CategoryManagerComponent {
  protected readonly i18n = inject(Localization);
  readonly categories = input.required<readonly PageCategory[]>();

  readonly confirm = output<readonly PageCategory[]>();
  readonly cancel = output<void>();

  protected readonly limit = MAX_CATEGORIES;
  /** Edited as a copy: closing without saving leaves the project as it was. */
  protected readonly draft = linkedSignal<readonly PageCategory[]>(() => [...this.categories()]);
  protected readonly full = computed(() => this.draft().length >= MAX_CATEGORIES);

  protected textColor(color: string): string {
    return categoryTextColor(color) ?? 'black';
  }

  protected add(): void {
    if (this.full()) {
      return;
    }
    // The id is assigned once and never changes, which is what lets a name be
    // changed freely afterwards (SPEC.md §6.6).
    this.draft.set([
      ...this.draft(),
      { id: crypto.randomUUID(), name: this.i18n.t('categories.new'), color: '#cccccc' },
    ]);
  }

  protected remove(id: string): void {
    this.draft.set(this.draft().filter((category) => category.id !== id));
  }

  protected rename(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.#update(id, (category) => ({ ...category, name }));
  }

  protected recolor(id: string, event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.#update(id, (category) => ({ ...category, color }));
  }

  #update(id: string, change: (category: PageCategory) => PageCategory): void {
    this.draft.set(
      this.draft().map((category) => (category.id === id ? change(category) : category)),
    );
  }
}
