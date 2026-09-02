import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The header of every panel. SPEC.md §8.3.
 *
 * **Hand-built headers are a defect, not a matter of taste.** In the
 * functional template each panel built its own, so the height followed the
 * content — a segmented control is taller than a text — and the separators of
 * the columns ended up at different heights, which made the window look
 * unfinished.
 *
 * Two things make that impossible here: the height is fixed rather than
 * derived from padding, and the separator belongs to the component instead of
 * being placed beside it. A panel cannot get either wrong.
 *
 * The content is free, so panels without a title use the same component.
 */
@Component({
  selector: 'wi-panel-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      @if (title(); as text) {
        <span class="title">{{ text }}</span>
      }
      @if (verbatimTitle(); as text) {
        <span class="title" [title]="text">{{ text }}</span>
      }
      <span class="spacer"></span>
      <ng-content />
    </header>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 8px;
      border-block-end: 1px solid rgba(128, 128, 128, 0.35);
      font: 12px system-ui, sans-serif;
    }
    .title {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .spacer {
      flex: 1 1 auto;
    }
  `,
})
export class PanelHeaderComponent {
  /**
   * Interface text. Translated when localization arrives.
   */
  readonly title = input<string | null>(null);

  /**
   * User data — a project name, a file name. Never a translation key, which is
   * why it is a separate input rather than the same one (SPEC.md §14.2).
   */
  readonly verbatimTitle = input<string | null>(null);
}
