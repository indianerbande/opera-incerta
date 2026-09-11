/**
 * The workbench regions. specification.md §8.1.
 *
 * A region is a fixed place in the window and is never renamed when new content
 * arrives; a view is interchangeable content inside a region. Keeping the
 * region inventory as plain data makes it testable without Angular and keeps
 * the naming rule in one place instead of scattered across templates.
 */

/** Width of each activity bar, in CSS pixels. specification.md §8.2. */
export const ACTIVITY_BAR_WIDTH = 44;

/** Height of every panel header, in CSS pixels. specification.md §8.3. */
export const PANEL_HEADER_HEIGHT = 36;

/** Height of the editor's status bar, in CSS pixels. specification.md §10.5. */
export const STATUS_BAR_HEIGHT = 24;

/** Project window geometry. specification.md §8.2. */
export const WINDOW_GEOMETRY = {
  defaultWidth: 1600,
  defaultHeight: 1000,
  minimumWidth: 1400,
  minimumHeight: 820,
} as const;

export type RegionId =
  | 'activityBarLeading'
  | 'navigator'
  | 'sheetList'
  | 'editor'
  | 'secondarySidebar'
  | 'activityBarTrailing'
  | 'bottomPanel';

export interface WorkbenchRegion {
  readonly id: RegionId;
  /** Views that can occupy this region. Empty when the region is fixed. */
  readonly views: readonly string[];
  /** Whether the user can drag this region's width. specification.md §8.2. */
  readonly resizable: boolean;
}

export const WORKBENCH_REGIONS: readonly WorkbenchRegion[] = [
  { id: 'activityBarLeading', views: [], resizable: false },
  { id: 'navigator', views: ['explorer', 'sourceControl'], resizable: true },
  { id: 'sheetList', views: [], resizable: true },
  { id: 'editor', views: [], resizable: false },
  {
    id: 'secondarySidebar',
    views: ['inspector', 'outline', 'ai', 'snapshots'],
    resizable: true,
  },
  { id: 'activityBarTrailing', views: [], resizable: false },
  { id: 'bottomPanel', views: ['terminal'], resizable: true },
];
