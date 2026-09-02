import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PageCategory, SheetMetadata, TextStatistics } from '@opera-incerta/core';

/**
 * Metadata of the active sheet. SPEC.md §11.
 *
 * This is the only place the owned front matter fields are edited. The block
 * shown beside the text is read-only precisely so that the schema cannot be
 * bypassed through free text (SPEC.md §10.4).
 *
 * `topic` and `keywords` are deliberately different things: one short label
 * saying what the sheet is about, and an open list for filtering.
 */
@Component({
  selector: 'wi-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (available()) {
      <div class="inspector">
        <section class="progress">
          <div><strong>{{ statistics().words }}</strong> words</div>
          <div><strong>{{ statistics().characters }}</strong> characters</div>
          <div><strong>{{ statistics().readingMinutes }}</strong> min reading</div>
        </section>

        <label>
          Title
          <input
            type="text"
            [value]="metadata().title ?? ''"
            (change)="change.emit({ title: value($event) })"
          />
        </label>

        <label>
          Topic
          <input
            type="text"
            placeholder="one short label"
            [value]="metadata().topic ?? ''"
            (change)="change.emit({ topic: value($event) })"
          />
        </label>

        <label>
          Keywords
          <input
            type="text"
            placeholder="comma separated"
            [value]="(metadata().keywords ?? []).join(', ')"
            (change)="change.emit({ keywords: keywords($event) })"
          />
        </label>

        <label>
          Status
          <input
            type="text"
            [value]="metadata().status ?? ''"
            (change)="change.emit({ status: value($event) })"
          />
        </label>

        <label class="category">
          Category
          <span class="row">
            <select
              [value]="metadata().category ?? ''"
              (change)="change.emit({ category: value($event) })"
            >
              <option value="">None</option>
              @for (category of categories(); track category.id) {
                <option [value]="category.id" [selected]="category.id === metadata().category">
                  {{ category.name }}
                </option>
              }
            </select>
            <button type="button" (click)="manage.emit()">Manage…</button>
          </span>
        </label>

        <label class="notes">
          Notes
          <textarea
            rows="6"
            placeholder="research, open questions, reminders"
            [value]="metadata().notes ?? ''"
            (change)="change.emit({ notes: value($event) })"
          ></textarea>
        </label>
      </div>
    } @else {
      <p class="hint">No sheet open.</p>
    }
  `,
  styles: `
    .category .row {
      display: flex;
      gap: 6px;
    }
    .category select {
      flex: 1 1 auto;
      min-width: 0;
    }
    :host {
      display: block;
      overflow-y: auto;
      flex: 1 1 auto;
      min-height: 0;
    }
    .inspector {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 8px;
      font: 12px system-ui, sans-serif;
    }
    .progress {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-block-end: 6px;
      border-block-end: 1px solid rgba(128, 128, 128, 0.3);
      color: rgba(128, 128, 128, 0.95);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    input,
    textarea {
      padding: 3px 5px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      resize: vertical;
    }
    .hint {
      margin: 0;
      padding: 8px;
      color: rgba(128, 128, 128, 0.9);
      font: 12px system-ui, sans-serif;
    }
  `,
})
export class InspectorComponent {
  readonly metadata = input.required<SheetMetadata>();
  readonly statistics = input.required<TextStatistics>();
  readonly available = input.required<boolean>();
  readonly categories = input.required<readonly PageCategory[]>();

  readonly change = output<Partial<SheetMetadata>>();
  /** Asks for the category manager; the shell owns the dialog. */
  readonly manage = output<void>();

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /**
   * Keywords are a list, entered as one line. An empty entry is dropped rather
   * than stored: `keywords: [""]` means nothing in the file.
   */
  protected keywords(event: Event): readonly string[] {
    return this.value(event)
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword !== '');
  }
}
