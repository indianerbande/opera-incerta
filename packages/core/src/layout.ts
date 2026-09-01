/**
 * Pure layout rules. SPEC.md §8.2.
 *
 * Column width belongs to explicit layout state, never to a layout container
 * (CONVENTIONS.md C-U1). The clamp rule lives here so that it is unit-tested
 * once instead of re-implemented per column.
 */

/** Inclusive bounds for a resizable column, in CSS pixels. */
export interface ColumnBounds {
  readonly min: number;
  readonly max: number;
}

/** Column geometry as specified in SPEC.md §8.2. */
export const COLUMN_BOUNDS = {
  navigator: { min: 140, max: 240 },
  sheetList: { min: 190, max: 380 },
  secondarySidebar: { min: 200, max: 380 },
} as const satisfies Record<string, ColumnBounds>;

/** Ideal widths used until the user has dragged a column. SPEC.md §8.2. */
export const COLUMN_IDEAL_WIDTH = {
  navigator: 160,
  sheetList: 200,
  secondarySidebar: 260,
} as const satisfies Record<keyof typeof COLUMN_BOUNDS, number>;

/**
 * Clamps a width into its bounds.
 *
 * Applied both when the user drags and when a stored value is loaded, so that
 * changed constants cannot drag an old stored value into absurdity
 * (SPEC.md §8.2).
 *
 * `NaN` falls back to the minimum, because it has no order and would otherwise
 * propagate through the layout. An infinity is merely an out-of-range value and
 * clamps to the bound it exceeds.
 */
export function clampColumnWidth(value: number, bounds: ColumnBounds): number {
  if (Number.isNaN(value)) {
    return bounds.min;
  }
  if (bounds.max < bounds.min) {
    return bounds.min;
  }
  return Math.min(Math.max(value, bounds.min), bounds.max);
}
