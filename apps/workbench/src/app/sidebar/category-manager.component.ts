import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MAX_CATEGORIES, categoryTextColor, type PageCategory } from '@opera-incerta/core';

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
  host: { '(document:keydown.escape)': 'cancel.emit()' },
  template: `
    <div class="backdrop" (mousedown)="cancel.emit()"></div>
    <div class="prompt" role="dialog" aria-modal="true" aria-label="Page categories">
      <h2>Page categories</h2>

      <ul class="list">
        @for (category of draft(); track category.id) {
          <li>
            <input
              type="color"
              [value]="category.color"
              [attr.aria-label]="'Colour of ' + category.name"
              (input)="recolor(category.id, $event)"
            />
            <input
              type="text"
              class="name"
              [value]="category.name"
              aria-label="Category name"
              (input)="rename(category.id, $event)"
            />
            <span
              class="badge"
              [style.background]="category.color"
              [style.color]="textColor(category.color)"
              >{{ category.name || 'Unnamed' }}</span
            >
            <button type="button" (click)="remove(category.id)" aria-label="Delete category">
              ✕
            </button>
          </li>
        } @empty {
          <li class="empty">No categories yet.</li>
        }
      </ul>

      <div class="actions">
        <button type="button" [disabled]="full()" (click)="add()">Add</button>
        <span class="spacer"></span>
        <button type="button" (click)="cancel.emit()">Cancel</button>
        <button type="button" (click)="confirm.emit(draft())">Save</button>
      </div>
      @if (full()) {
        <p class="hint">A project holds at most {{ limit }} categories.</p>
      }
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
      width: min(460px, calc(100vw - 48px));
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
      color: rgba(128, 128, 128, 0.9);
    }
    input[type='color'] {
      width: 26px;
      height: 22px;
      padding: 0;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
    }
    input.name {
      flex: 1 1 auto;
      min-width: 0;
      padding: 3px 6px;
      border: 1px solid rgba(128, 128, 128, 0.45);
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
    .actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .hint {
      margin: 0;
      color: rgba(128, 128, 128, 0.95);
      font-size: 11px;
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
export class CategoryManagerComponent {
  readonly categories = input.required<readonly PageCategory[]>();

  readonly confirm = output<readonly PageCategory[]>();
  readonly cancel = output<void>();

  protected readonly limit = MAX_CATEGORIES;
  protected readonly draft = signal<readonly PageCategory[]>([]);
  protected readonly full = computed(() => this.draft().length >= MAX_CATEGORIES);

  constructor() {
    // Edited as a copy: closing without saving leaves the project as it was.
    queueMicrotask(() => this.draft.set([...this.categories()]));
  }

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
      { id: crypto.randomUUID(), name: 'New category', color: '#cccccc' },
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
