import { signal } from '@angular/core';
import type { ActivityItem } from './activity-bar.component.js';

/** The views the navigator can show. SPEC.md §8.1. */
export type NavigatorView = 'explorer' | 'sourceControl';

/** The views the secondary sidebar can show. SPEC.md §8.1. */
export type SecondarySidebarView = 'inspector' | 'outline' | 'ai' | 'snapshots';

export const NAVIGATOR_ITEMS: readonly ActivityItem[] = [
  { id: 'explorer', icon: 'icon-explorer', label: 'Explorer' },
  { id: 'sourceControl', icon: 'icon-source-control', label: 'Source control' },
];

export const SECONDARY_ITEMS: readonly ActivityItem[] = [
  { id: 'inspector', icon: 'icon-inspector', label: 'Inspector' },
  { id: 'outline', icon: 'icon-outline', label: 'Outline' },
  { id: 'ai', icon: 'icon-ai', label: 'AI assistant' },
  { id: 'snapshots', icon: 'icon-snapshots', label: 'Snapshots' },
];

/**
 * Which view each region shows, and whether the secondary sidebar is visible.
 * SPEC.md §8.1, §8.4.
 *
 * Region state lives here rather than inside a view, because a region switches
 * between views and component-local state would be destroyed on every switch
 * (`CONVENTIONS.md` C-U2).
 *
 * Not persisted yet: preferences belong in the installation-local record of
 * `SPEC.md` §13, which is its own round.
 */
export class LayoutState {
  readonly navigatorView = signal<NavigatorView>('explorer');
  readonly secondaryView = signal<SecondarySidebarView>('inspector');
  readonly secondaryVisible = signal(true);

  showNavigator(view: string): void {
    if (view === 'explorer' || view === 'sourceControl') {
      this.navigatorView.set(view);
    }
  }

  /**
   * Activating the already visible view collapses the sidebar, and activating
   * anything else opens it on that view.
   */
  showSecondary(view: string): void {
    if (view !== 'inspector' && view !== 'outline' && view !== 'ai' && view !== 'snapshots') {
      return;
    }
    if (this.secondaryVisible() && this.secondaryView() === view) {
      this.secondaryVisible.set(false);
      return;
    }
    this.secondaryView.set(view);
    this.secondaryVisible.set(true);
  }

  /** The active entry of the trailing bar, or null while it is collapsed. */
  activeSecondaryId(): string | null {
    return this.secondaryVisible() ? this.secondaryView() : null;
  }
}
