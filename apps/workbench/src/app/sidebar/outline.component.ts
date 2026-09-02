import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { OutlineEntry } from '@opera-incerta/core';

/**
 * The heading outline of the current text. SPEC.md §11.
 *
 * Its own view rather than a section of the inspector: the inspector shows
 * metadata, which is the narrow meaning the name carries.
 *
 * The visibility rule — H1 and H2 always, deeper levels only when asked — is a
 * pure function in the core, not logic in this template.
 */
@Component({
  selector: 'wi-outline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length > 0) {
      <ul class="outline">
        @for (entry of entries(); track entry.line) {
          <li>
            <button
              type="button"
              class="entry"
              [style.padding-inline-start.px]="6 + (entry.level - 1) * 10"
              (click)="reveal.emit(entry.line + 1)"
            >
              <span class="level">H{{ entry.level }}</span>
              <span class="text">{{ entry.text || '—' }}</span>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="hint">No headings in this sheet.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      flex: 1 1 auto;
      min-height: 0;
    }
    .outline {
      margin: 0;
      padding: 4px;
      list-style: none;
    }
    .entry {
      display: flex;
      gap: 6px;
      width: 100%;
      padding: 3px 6px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: inherit;
      font: 12px system-ui, sans-serif;
      text-align: start;
      cursor: default;
    }
    .entry:hover {
      background: rgba(128, 128, 128, 0.14);
    }
    .level {
      color: rgba(128, 128, 128, 0.8);
    }
    .text {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .hint {
      margin: 0;
      padding: 8px;
      color: rgba(128, 128, 128, 0.9);
      font: 12px system-ui, sans-serif;
    }
  `,
})
export class OutlineComponent {
  readonly entries = input.required<readonly OutlineEntry[]>();

  /** One-based line to reveal in the editor. */
  readonly reveal = output<number>();
}
