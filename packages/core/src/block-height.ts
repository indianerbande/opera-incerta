/**
 * Height of the front matter blocks in the editor. SPEC.md §10.4.
 *
 * Two attempts computed this from font metrics and both failed, because the
 * layout engine applies its own line spacing. The
 * rendered height is therefore measured by the view and capped here
 * proportionally, which is independent of any font (CONVENTIONS.md C-U5).
 */

/** How many lines a front matter block shows before it scrolls. SPEC.md §10.4. */
export const FRONT_MATTER_MAX_VISIBLE_LINES = 10;

/**
 * Caps a measured height proportionally to the visible-line limit.
 *
 * At twice the allowed lines, half the measured height is shown. A block with
 * no content has no height, and a non-finite measurement collapses to zero
 * rather than propagating through the layout.
 */
export function cappedBlockHeight(
  measuredHeight: number,
  lineCount: number,
  maxVisibleLines: number = FRONT_MATTER_MAX_VISIBLE_LINES,
): number {
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0 || lineCount <= 0) {
    return 0;
  }
  if (lineCount <= maxVisibleLines) {
    return measuredHeight;
  }
  return measuredHeight * (maxVisibleLines / lineCount);
}

/**
 * The height a block actually occupies.
 *
 * Dragging can only enlarge: shrinking below the content would hide exactly
 * what the feature exists to show (SPEC.md §10.4). The dragged height is
 * deliberately not persisted — that is the view's concern, and the reason is
 * recorded in the specification.
 */
export function effectiveBlockHeight(contentHeight: number, draggedHeight: number | null): number {
  if (draggedHeight === null || !Number.isFinite(draggedHeight)) {
    return contentHeight;
  }
  return Math.max(contentHeight, draggedHeight);
}
