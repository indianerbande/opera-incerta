import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { COLUMN_IDEAL_WIDTH } from '@opera-incerta/core';
import { BRIDGE_GLOBAL, CONTRACT_VERSION } from '@opera-incerta/desktop-contract';
import { ACTIVITY_BAR_WIDTH } from './workbench-layout.js';

/**
 * Scaffold of the workbench shell: the region skeleton of SPEC.md §8.2 with the
 * specified widths, and nothing else. Views, dividers, and panel headers follow
 * in their own rounds (TODO.md).
 */
@Component({
  selector: 'wi-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="workbench">
      <aside class="activity-bar" [style.width.px]="activityBarWidth"></aside>
      <section class="navigator" [style.width.px]="navigatorWidth()">Navigator</section>
      <section class="sheet-list" [style.width.px]="sheetListWidth()">Sheet list</section>
      <section class="editor">
        <h1>Opera Incerta</h1>
        <p>{{ hostDescription }}</p>
      </section>
      <section class="secondary-sidebar" [style.width.px]="secondarySidebarWidth()">
        Secondary sidebar
      </section>
      <aside class="activity-bar" [style.width.px]="activityBarWidth"></aside>
    </div>
  `,
  styles: `
    .workbench {
      display: flex;
      height: 100vh;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .workbench > * {
      overflow: hidden;
      padding: 8px;
      border-inline-end: 1px solid rgba(128, 128, 128, 0.35);
    }
    .workbench > :last-child {
      border-inline-end: none;
    }
    .activity-bar {
      flex: none;
      padding: 8px 0;
    }
    .navigator,
    .sheet-list,
    .secondary-sidebar {
      flex: none;
    }
    .editor {
      flex: 1 1 auto;
      min-width: 380px;
    }
  `,
})
export class AppComponent {
  protected readonly activityBarWidth = ACTIVITY_BAR_WIDTH;
  protected readonly navigatorWidth = signal(COLUMN_IDEAL_WIDTH.navigator);
  protected readonly sheetListWidth = signal(COLUMN_IDEAL_WIDTH.sheetList);
  protected readonly secondarySidebarWidth = signal(COLUMN_IDEAL_WIDTH.secondarySidebar);

  /**
   * The renderer must work in the desktop shell and in the isolated
   * development harness, so the bridge is detected rather than assumed.
   */
  protected readonly hostDescription =
    BRIDGE_GLOBAL in globalThis
      ? `Desktop shell, bridge contract v${CONTRACT_VERSION}.`
      : 'Development harness — no desktop bridge present.';
}
