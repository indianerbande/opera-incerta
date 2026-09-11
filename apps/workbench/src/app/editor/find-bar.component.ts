import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { EditorSearchState } from '@opera-incerta/core';
import { Localization } from '../localization/localization.js';

/**
 * Finding in the open sheet. specification.md §10.11.
 *
 * A band between the editor's header and the text: it pushes the writing
 * surface down rather than floating over it, because a bar that covers the
 * line one was looking for has to be moved out of the way.
 *
 * It reports and asks; it searches nothing itself. Return steps forward,
 * `Shift+Return` back, Escape closes — the keys belong to the field, which is
 * where the author's hands are.
 */
@Component({
  selector: 'wi-find-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="find-bar" role="search">
      <input
        #field
        type="search"
        class="query"
        [value]="query()"
        [attr.aria-label]="i18n.t('find.label')"
        [placeholder]="i18n.t('find.placeholder')"
        (input)="queryChange.emit(value($event))"
        (keydown.enter)="step.emit('forwards')"
        (keydown.shift.enter)="step.emit('backwards')"
        (keydown.escape)="close.emit()"
      />
      <span class="count" aria-live="polite">{{ countShown() }}</span>
      <button
        type="button"
        class="previous"
        [disabled]="state().matches === 0"
        [title]="i18n.t('find.previous')"
        [attr.aria-label]="i18n.t('find.previous')"
        (click)="step.emit('backwards')"
      >
        ↑
      </button>
      <button
        type="button"
        class="next"
        [disabled]="state().matches === 0"
        [title]="i18n.t('find.next')"
        [attr.aria-label]="i18n.t('find.next')"
        (click)="step.emit('forwards')"
      >
        ↓
      </button>
      <button
        type="button"
        class="close"
        [title]="i18n.t('common.close')"
        [attr.aria-label]="i18n.t('common.close')"
        (click)="close.emit()"
      >
        ×
      </button>
    </div>
  `,
  styles: `
    .find-bar {
      display: flex;
      flex: none;
      gap: var(--wi-space-2);
      align-items: center;
      padding: var(--wi-space-1) var(--wi-space-3);
      border-block-end: 1px solid var(--wi-separator);
      background: var(--wi-surface-subtle);
      font: 12px var(--wi-sans);
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
    .count {
      flex: none;
      color: var(--wi-muted);
      font-variant-numeric: tabular-nums;
    }
    button {
      display: inline-flex;
      width: var(--wi-control-height);
      height: var(--wi-control-height);
      align-items: center;
      justify-content: center;
      flex: none;
      border: 1px solid var(--wi-line-strong);
      border-radius: var(--wi-radius-control);
      background: var(--wi-control-bg);
      color: var(--wi-control-ink);
      font: inherit;
      line-height: 1;
      cursor: default;
    }
    button:hover:not(:disabled) {
      border-color: var(--wi-accent);
      background: var(--wi-accent-soft);
    }
    button:disabled {
      opacity: 0.46;
    }
  `,
})
export class FindBarComponent {
  protected readonly i18n = inject(Localization);

  readonly query = input.required<string>();
  readonly state = input.required<EditorSearchState>();

  readonly queryChange = output<string>();
  readonly step = output<'forwards' | 'backwards'>();
  readonly close = output<void>();

  /** `n of m`, or what there is to say when there is nothing. */
  protected readonly countShown = computed(() => {
    const state = this.state();
    if (this.query().trim() === '') {
      return '';
    }
    return state.matches === 0
      ? this.i18n.t('find.none')
      : this.i18n.t('find.count', { current: state.current, total: state.matches });
  });

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // The bar opens because the author asked to search: the caret belongs in
    // the field, and what was seeded there is selected so typing replaces it.
    afterNextRender(() => {
      const field = this.field()?.nativeElement;
      field?.focus();
      field?.select();
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
