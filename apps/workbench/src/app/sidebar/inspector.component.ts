import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import type { PageCategory, SheetMetadata, TextStatistics } from '@opera-incerta/core';
import { Localization } from '../localization/localization.js';

/**
 * Metadata of the active sheet. specification.md §11.
 *
 * This is the only place the owned front matter fields are edited. The block
 * shown beside the text is read-only precisely so that the schema cannot be
 * bypassed through free text (specification.md §10.4).
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
          <div><strong>{{ statistics().words }}</strong> {{ i18n.n('inspector.words', statistics().words) }}</div>
          <div><strong>{{ statistics().characters }}</strong> {{ i18n.n('inspector.characters', statistics().characters) }}</div>
          <div><strong>{{ statistics().readingMinutes }}</strong> {{ i18n.n('inspector.minutes', statistics().readingMinutes) }}</div>
        </section>

        <label>
          {{ i18n.t('inspector.title') }}
          <input
            type="text"
            [value]="metadata().title ?? ''"
            (change)="metadataChange.emit({ title: value($event) })"
          />
        </label>

        <label>
          {{ i18n.t('inspector.topic') }}
          <input
            type="text"
            [placeholder]="i18n.t('inspector.topicPlaceholder')"
            [value]="metadata().topic ?? ''"
            (change)="metadataChange.emit({ topic: value($event) })"
          />
        </label>

        <label>
          {{ i18n.t('inspector.keywords') }}
          <input
            type="text"
            [placeholder]="i18n.t('inspector.keywordsPlaceholder')"
            [value]="(metadata().keywords ?? []).join(', ')"
            (change)="metadataChange.emit({ keywords: keywords($event) })"
          />
        </label>

        <label>
          {{ i18n.t('inspector.status') }}
          <input
            type="text"
            [value]="metadata().status ?? ''"
            (change)="metadataChange.emit({ status: value($event) })"
          />
        </label>

        <label class="category">
          {{ i18n.t('inspector.category') }}
          <span class="row">
            <select
              [value]="metadata().category ?? ''"
              (change)="metadataChange.emit({ category: value($event) })"
            >
              <option value="">{{ i18n.t('inspector.noCategory') }}</option>
              @for (category of categories(); track category.id) {
                <option [value]="category.id" [selected]="category.id === metadata().category">
                  {{ category.name }}
                </option>
              }
            </select>
            <button type="button" (click)="manage.emit()">{{ i18n.t('inspector.manage') }}</button>
          </span>
        </label>

        <label class="notes">
          {{ i18n.t('inspector.notes') }}
          <textarea
            rows="6"
            [placeholder]="i18n.t('inspector.notesPlaceholder')"
            [value]="metadata().notes ?? ''"
            (change)="metadataChange.emit({ notes: value($event) })"
          ></textarea>
        </label>
      </div>
    } @else {
      <p class="hint">{{ i18n.t('inspector.noSheet') }}</p>
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
      font: 12px var(--wi-sans);
    }
    .progress {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-block-end: 6px;
      border-block-end: 1px solid var(--wi-separator);
      color: var(--wi-muted);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    input,
    textarea {
      padding: 3px 5px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      resize: vertical;
    }
    .hint {
      margin: 0;
      padding: 8px;
      color: var(--wi-muted);
      font: 12px var(--wi-sans);
    }
  `,
})
export class InspectorComponent {
  protected readonly i18n = inject(Localization);
  readonly metadata = input.required<SheetMetadata>();
  readonly statistics = input.required<TextStatistics>();
  readonly available = input.required<boolean>();
  readonly categories = input.required<readonly PageCategory[]>();

  /**
   * Not `change`: the native `change` events of the fields inside bubble up
   * to this element, and a listener bound to an output of that name is
   * called for both — the second time with a DOM Event, whose one enumerable
   * property, `isTrusted`, then sat in the metadata as a seventh field. The
   * sheet stayed dirty for good and every re-read raised a conflict prompt
   * (found by the smoke's screenshot, 2026-09-04).
   */
  readonly metadataChange = output<Partial<SheetMetadata>>();
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
