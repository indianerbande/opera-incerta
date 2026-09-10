import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { LibrarySearchHit } from '@opera-incerta/desktop-contract';
import { Localization } from '../localization/localization.js';
import { LibrarySearchStore } from '../workspace/library-search-store.js';

/**
 * Searching the library. SPEC.md §9.3.
 *
 * The navigator's third view: a field, and a flat list of matches — the sheet,
 * the line, and the line itself with the match marked. Activating a row opens
 * that sheet and reveals that line, the same path the outline uses.
 *
 * The search runs when it is asked to, not while the author types: it reads
 * every sheet in the project from disk.
 */
@Component({
  selector: 'wi-library-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search">
      <div class="ask">
        <input
          type="search"
          class="query"
          [value]="store.query()"
          [attr.aria-label]="i18n.t('search.label')"
          [placeholder]="i18n.t('search.placeholder')"
          (input)="store.noteQuery(value($event))"
          (keydown.enter)="store.run()"
        />
        <button type="button" class="run" [disabled]="store.running()" (click)="store.run()">
          {{ i18n.t('search.run') }}
        </button>
      </div>

      @if (store.failure(); as code) {
        <p class="hint" role="alert">{{ i18n.t('search.failed', { code }) }}</p>
      } @else if (store.running()) {
        <p class="hint">{{ i18n.t('search.running') }}</p>
      } @else if (store.searched()) {
        @if (store.hits().length === 0) {
          <p class="hint">{{ i18n.t('search.none') }}</p>
        } @else {
          <p class="summary">
            {{ i18n.n('search.hits', store.hits().length) }}
            @if (store.capped()) {
              <span class="capped">{{ i18n.t('search.capped') }}</span>
            }
          </p>
          <ul class="hits">
            @for (hit of store.hits(); track hit.path + ':' + hit.line + ':' + hit.from) {
              <li>
                <button type="button" class="hit" (click)="reveal.emit(hit)">
                  <span class="where">
                    <span class="sheet">{{ hit.displayName }}</span>
                    <span class="line">{{ hit.line }}</span>
                  </span>
                  <span class="text">{{ before(hit) }}<mark>{{ match(hit) }}</mark>{{ after(hit) }}</span>
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="hint">{{ i18n.t('search.hint') }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      overflow: hidden;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    .search {
      display: flex;
      overflow: hidden;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--wi-space-2);
      padding: var(--wi-space-2);
      min-height: 0;
      font: 12px var(--wi-sans);
    }
    .ask {
      display: flex;
      flex: none;
      gap: var(--wi-space-2);
    }
    .query {
      flex: 1 1 auto;
      min-width: 0;
      height: var(--wi-control-height);
      padding: 0 var(--wi-space-2);
      border: 1px solid var(--wi-line-strong);
      border-radius: var(--wi-radius-control);
      background: var(--wi-control-bg);
      color: inherit;
      font: inherit;
    }
    .run {
      flex: none;
      height: var(--wi-control-height);
      padding: 0 var(--wi-space-3);
      border: 1px solid var(--wi-accent-strong);
      border-radius: var(--wi-radius-control);
      background: var(--wi-accent);
      color: var(--wi-accent-ink);
      font: inherit;
      font-weight: 600;
      line-height: 1;
      cursor: default;
    }
    .run:disabled {
      opacity: 0.46;
    }
    .hint,
    .summary {
      flex: none;
      margin: 0;
      color: var(--wi-muted);
    }
    .capped {
      margin-inline-start: var(--wi-space-1);
    }
    ul.hits {
      overflow-y: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 0;
      min-height: 0;
      list-style: none;
    }
    .hit {
      display: flex;
      overflow: hidden;
      width: 100%;
      flex-direction: column;
      gap: 1px;
      padding: var(--wi-space-1) var(--wi-space-2);
      border: 1px solid transparent;
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: default;
    }
    .hit:hover {
      background: var(--wi-row-hover);
    }
    .where {
      display: flex;
      gap: var(--wi-space-2);
      justify-content: space-between;
      color: var(--wi-muted);
      font-size: 11px;
    }
    .sheet {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .line {
      flex: none;
      font-variant-numeric: tabular-nums;
    }
    .text {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    mark {
      border-radius: 2px;
      background: var(--wi-accent-soft);
      color: inherit;
    }
  `,
})
export class LibrarySearchComponent {
  protected readonly i18n = inject(Localization);
  protected readonly store = inject(LibrarySearchStore);

  /** Which sheet and line to open. The shell knows how. */
  readonly reveal = output<LibrarySearchHit>();

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** The line, cut into what stands before, in, and after the match. */
  protected before(hit: LibrarySearchHit): string {
    return hit.text.slice(0, hit.from);
  }

  protected match(hit: LibrarySearchHit): string {
    return hit.text.slice(hit.from, hit.to);
  }

  protected after(hit: LibrarySearchHit): string {
    return hit.text.slice(hit.to);
  }
}
