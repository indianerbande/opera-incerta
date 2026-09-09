import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { MessageKey } from '@opera-incerta/localization';
import { Localization } from '../localization/localization.js';

/**
 * One entry of an activity bar. SPEC.md §8.4.
 *
 * The icon is drawn as a CSS mask so it takes the button's colour in both
 * light and dark themes, and the SVG file stays byte-identical to the one that
 * was licensed — see `src/assets/material-symbols/SOURCE.md`.
 *
 * The icon is decorative. The accessible name is what the button *is*, which
 * is why every entry carries one.
 */
export interface ActivityItem<TId extends string = string> {
  readonly id: TId;
  /** Class selecting the mask, defined in this component's styles. */
  readonly icon: string;
  /** The key of the accessible name; the bar translates it (SPEC.md §14). */
  readonly labelKey: MessageKey;
}

/**
 * A narrow icon-only column that switches what a region shows.
 *
 * The bar selects views; it does not collapse itself. That is why no entry
 * here means "toggle the sidebar" — a symbol for a position among symbols for
 * contents would be misleading (SPEC.md §8.4). Clicking the already active
 * entry of the trailing bar does collapse its region, which is the established
 * behavior, but it is the region's rule rather than an entry of its own.
 */
@Component({
  selector: 'wi-activity-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of items(); track item.id) {
      <button
        type="button"
        class="item"
        [class.active]="item.id === activeId()"
        [attr.aria-label]="i18n.t(item.labelKey)"
        [attr.aria-pressed]="item.id === activeId()"
        [title]="i18n.t(item.labelKey)"
        (click)="activate.emit(item.id)"
      >
        <span class="icon" [class]="item.icon" aria-hidden="true"></span>
      </button>
    }
    @for (item of tools(); track item.id) {
      <button
        type="button"
        class="item tool"
        [attr.aria-label]="i18n.t(item.labelKey)"
        [title]="i18n.t(item.labelKey)"
        (click)="tool.emit(item.id)"
      >
        <span class="icon" [class]="item.icon" aria-hidden="true"></span>
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding-block-start: 4px;
    }
    .item {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 1px solid transparent;
      border-radius: var(--wi-radius-control);
      background: none;
      color: var(--wi-muted);
      cursor: default;
    }
    .icon {
      width: 20px;
      height: 20px;
      background-color: currentColor;
      mask-repeat: no-repeat;
      mask-position: center;
      mask-size: contain;
    }
    .icon-explorer {
      mask-image: url('/icons/folder_open.svg');
    }
    .icon-source-control {
      mask-image: url('/icons/account_tree.svg');
    }
    .icon-inspector {
      mask-image: url('/icons/info.svg');
    }
    .icon-outline {
      mask-image: url('/icons/toc.svg');
    }
    .icon-ai {
      mask-image: url('/icons/neurology.svg');
    }
    .icon-snapshots {
      mask-image: url('/icons/history.svg');
    }
    .icon-settings {
      mask-image: url('/icons/settings.svg');
    }
    /* A tool opens something; it selects no view, so it sits apart, at the foot. */
    .tool {
      margin-block-start: auto;
      margin-block-end: 6px;
    }
    .tool ~ .tool {
      margin-block-start: 0;
    }
    .item:hover {
      background: var(--wi-row-hover);
    }
    .item.active {
      border-color: var(--wi-accent-border);
      background: var(--wi-accent-soft);
      box-shadow: inset 3px 0 0 var(--wi-accent);
      color: var(--wi-accent);
    }
  `,
})
export class ActivityBarComponent<TId extends string = string> {
  protected readonly i18n = inject(Localization);
  readonly items = input.required<readonly ActivityItem<TId>[]>();
  /** The active view of the region this bar drives, or null when collapsed. */
  readonly activeId = input.required<TId | null>();

  /** The id of the chosen entry — a member of the region's own view union. */
  readonly activate = output<TId>();

  /**
   * Entries at the foot that open something rather than select a view — the
   * settings dialog. They carry no active state. SPEC.md §13.
   */
  readonly tools = input<readonly ActivityItem[]>([]);
  readonly tool = output<string>();
}
