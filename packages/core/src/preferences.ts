/**
 * The installation-local preference record. SPEC.md §13, §7.2.
 *
 * One versioned document under one stable key, validated at the boundary.
 * Unknown fields are discarded, malformed values fall back to their default,
 * and a stored width is clamped again on read — so changed constants cannot
 * drag an old value into absurdity (SPEC.md §8.2).
 *
 * **A preference never modifies a document.** Everything here is about how the
 * workbench looks and which pane is showing; nothing about a manuscript.
 */
import { COLUMN_BOUNDS, COLUMN_IDEAL_WIDTH, clampColumnWidth } from './layout.js';
import { DEFAULT_PREVIEW_DENSITY, PREVIEW_DENSITIES, type PreviewDensity } from './preview.js';

/** Storage key. A breaking schema needs a new key or an explicit migration. */
export const PREFERENCES_KEY = 'opera-incerta.workbench.preferences';

export const PREFERENCES_VERSION = 1;

export type NavigatorView = 'explorer' | 'sourceControl';
export type SecondarySidebarView = 'inspector' | 'outline' | 'ai' | 'snapshots';

export interface ColumnWidths {
  readonly navigator: number;
  readonly sheetList: number;
  readonly secondarySidebar: number;
}

export interface WorkbenchPreferences {
  readonly version: number;
  readonly columnWidths: ColumnWidths;
  readonly navigatorView: NavigatorView;
  readonly secondaryView: SecondarySidebarView;
  readonly secondaryVisible: boolean;
  readonly sheetListDensity: PreviewDensity;
  readonly showBlankLines: boolean;
  readonly showDeeperOutline: boolean;
  /**
   * The three switches of the front matter area. SPEC.md §10.4: looking is the
   * harmless starting state, so the area is off and, once on, read-only.
   */
  readonly showFrontMatter: boolean;
  readonly frontMatterWritable: boolean;
  readonly showOwnedFrontMatter: boolean;
}

export const DEFAULT_PREFERENCES: WorkbenchPreferences = {
  version: PREFERENCES_VERSION,
  columnWidths: {
    navigator: COLUMN_IDEAL_WIDTH.navigator,
    sheetList: COLUMN_IDEAL_WIDTH.sheetList,
    secondarySidebar: COLUMN_IDEAL_WIDTH.secondarySidebar,
  },
  navigatorView: 'explorer',
  secondaryView: 'inspector',
  secondaryVisible: true,
  sheetListDensity: DEFAULT_PREVIEW_DENSITY,
  showBlankLines: false,
  showFrontMatter: false,
  frontMatterWritable: false,
  showOwnedFrontMatter: true,
  showDeeperOutline: false,
};

const NAVIGATOR_VIEWS: readonly string[] = ['explorer', 'sourceControl'];
const SECONDARY_VIEWS: readonly string[] = ['inspector', 'outline', 'ai', 'snapshots'];

/**
 * Reads a stored record, falling back field by field.
 *
 * A single bad value costs that one setting, never the whole record: an
 * unreadable preference must not send the author back to defaults everywhere
 * (SPEC.md §13).
 */
export function readPreferences(value: unknown): WorkbenchPreferences {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_PREFERENCES;
  }
  const stored = value as Record<string, unknown>;

  return {
    version: PREFERENCES_VERSION,
    columnWidths: readColumnWidths(stored['columnWidths']),
    navigatorView: pick(stored['navigatorView'], NAVIGATOR_VIEWS, DEFAULT_PREFERENCES.navigatorView),
    secondaryView: pick(stored['secondaryView'], SECONDARY_VIEWS, DEFAULT_PREFERENCES.secondaryView),
    secondaryVisible: boolean_(stored['secondaryVisible'], DEFAULT_PREFERENCES.secondaryVisible),
    sheetListDensity: pick(
      stored['sheetListDensity'],
      Object.keys(PREVIEW_DENSITIES),
      DEFAULT_PREFERENCES.sheetListDensity,
    ),
    showBlankLines: boolean_(stored['showBlankLines'], DEFAULT_PREFERENCES.showBlankLines),
    showFrontMatter: boolean_(stored['showFrontMatter'], DEFAULT_PREFERENCES.showFrontMatter),
    frontMatterWritable: boolean_(
      stored['frontMatterWritable'],
      DEFAULT_PREFERENCES.frontMatterWritable,
    ),
    showOwnedFrontMatter: boolean_(
      stored['showOwnedFrontMatter'],
      DEFAULT_PREFERENCES.showOwnedFrontMatter,
    ),
    showDeeperOutline: boolean_(stored['showDeeperOutline'], DEFAULT_PREFERENCES.showDeeperOutline),
  };
}

/** Widths are clamped on read as well as on write. SPEC.md §8.2. */
function readColumnWidths(value: unknown): ColumnWidths {
  const stored = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    navigator: width(stored['navigator'], 'navigator'),
    sheetList: width(stored['sheetList'], 'sheetList'),
    secondarySidebar: width(stored['secondarySidebar'], 'secondarySidebar'),
  };
}

function width(value: unknown, column: keyof typeof COLUMN_BOUNDS): number {
  const candidate = typeof value === 'number' ? value : COLUMN_IDEAL_WIDTH[column];
  return clampColumnWidth(candidate, COLUMN_BOUNDS[column]);
}

function pick<T extends string>(value: unknown, allowed: readonly string[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value) ? (value as T) : fallback;
}

function boolean_(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
