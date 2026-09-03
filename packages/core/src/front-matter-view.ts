/**
 * The front matter area of the editor. SPEC.md §10.4.
 *
 * Two rules live here, both of them pure: what the owned block *says*, and how
 * tall either block is allowed to be. Both have been got wrong before, inside
 * a component, where they could not be tested.
 */
import { serializeSheet, type Sheet } from './front-matter.js';

/** The most lines either block shows before it scrolls. SPEC.md §10.4. */
export const FRONT_MATTER_MAX_LINES = 10;

/**
 * The owned block, exactly as the file would carry it.
 *
 * Produced by the **same serializer that saves**, with the lines between the
 * markers taken out of the result, so display and file cannot drift apart and
 * a newly added field appears here without anyone remembering to add it. An
 * earlier version of this idea rebuilt the lines by hand and showed a bare `|`
 * for `notes` while omitting several fields entirely.
 */
export function ownedFrontMatterLines(sheet: Sheet): readonly string[] {
  const text = serializeSheet({ ...sheet, foreignLines: [], body: '' });
  const lines = text.split(sheet.lineEnding);
  if (lines[0] !== '---') {
    // No owned fields at all: the serializer writes no front matter, and there
    // is nothing to show.
    return [];
  }

  const closing = lines.indexOf('---', 1);
  return closing === -1 ? lines.slice(1) : lines.slice(1, closing);
}

/**
 * How tall a block is, given what was **measured** on screen.
 *
 * The cap is applied *proportionally* to the measured height rather than by
 * multiplying a font metric: the layout engine applies its own line spacing,
 * and two attempts have failed on exactly that — first a guessed constant,
 * then a measured font metric (`CONVENTIONS.md` C-F1).
 *
 * Dragging can only **enlarge**. Shrinking below the content would hide
 * exactly what the area exists to show, so the effective height is the larger
 * of the capped content and whatever the divider was dragged to.
 */
export function frontMatterHeight(
  measured: { readonly contentHeight: number; readonly lineCount: number },
  draggedHeight = 0,
): number {
  const { contentHeight, lineCount } = measured;
  if (!Number.isFinite(contentHeight) || contentHeight <= 0 || lineCount <= 0) {
    return Math.max(0, draggedHeight);
  }

  const capped =
    lineCount <= FRONT_MATTER_MAX_LINES
      ? contentHeight
      : (contentHeight * FRONT_MATTER_MAX_LINES) / lineCount;
  return Math.max(capped, draggedHeight);
}
