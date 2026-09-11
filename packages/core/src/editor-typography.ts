/**
 * The editor's typography as a rule. specification.md §13 (Editor), §10.1, §10.8.
 *
 * Four settings and one invariant. The settings: a font family from a
 * curated list — never a system font picker — a base size within bounds,
 * whether lines wrap, and whether the line-number gutter is shown. The
 * invariant: heading sizes keep fixed ratios to the base, so a larger base
 * enlarges the whole hierarchy and never one level alone. The ratios lived in
 * the editor adapter's theme until 2026-09-04; they are a rule, and rules live
 * here.
 *
 * All four are what the **author configured**. The zoom factor of §10.9 is
 * not one of them: it is a display factor with its own control, and mixing it
 * in here would make a viewing gesture look like a setting.
 */
import type { HeadingLevel } from './heading.js';

/** The curated families. The id is what the record stores (`conventions.md` C-N3). */
export type EditorFontFamily = 'serif' | 'sans' | 'mono';

export const EDITOR_FONT_FAMILIES: readonly EditorFontFamily[] = ['serif', 'sans', 'mono'];

/**
 * The stacks behind the ids: families a desktop can be expected to have,
 * with the generic family last. Presentation, not text — no word an author
 * reads is in here (specification.md §14.3).
 */
export const EDITOR_FONT_STACKS: Readonly<Record<EditorFontFamily, string>> = {
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  // The two packaged faces first (specification.md §8.8): where the application brings
  // a face, the manuscript may use it and look the same everywhere. The serif
  // is not packaged, so it names what a desktop is likely to have.
  sans: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
};

export const DEFAULT_EDITOR_FONT_FAMILY: EditorFontFamily = 'serif';

/** In CSS pixels. The bounds keep a stored value from becoming absurd (§8.2). */
export const EDITOR_FONT_SIZE_BOUNDS = { min: 12, max: 24 } as const;

export const DEFAULT_EDITOR_FONT_SIZE = 16;

export const DEFAULT_EDITOR_WORD_WRAP = true;

/**
 * The line-number gutter is off until it is asked for. specification.md §10.8: a
 * manuscript is not source code, and the quieter surface is where to start.
 */
export const DEFAULT_EDITOR_LINE_NUMBERS = false;

/**
 * The zoom of specification.md §10.9, in whole percent. Not a setting: a display
 * factor with its own control in the status bar.
 */
export const EDITOR_ZOOM_BOUNDS = { min: 50, max: 200 } as const;

export const DEFAULT_EDITOR_ZOOM = 100;

/**
 * The detent at 100 %, in percentage points either side. Dragging past the
 * middle lands on it; the points it swallows are the price of being able to
 * hit the middle at all.
 */
export const EDITOR_ZOOM_DETENT = 3;

/**
 * A zoom value as the editor may use it: whole percent, within bounds, and
 * snapped to 100 near the middle.
 *
 * Applied on the way in from the slider **and** on the way in from the stored
 * record, like a column width (specification.md §8.2): changed bounds must not drag an
 * old value into absurdity.
 */
export function clampEditorZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EDITOR_ZOOM;
  }
  const whole = Math.round(value);
  if (Math.abs(whole - DEFAULT_EDITOR_ZOOM) <= EDITOR_ZOOM_DETENT) {
    return DEFAULT_EDITOR_ZOOM;
  }
  return Math.min(EDITOR_ZOOM_BOUNDS.max, Math.max(EDITOR_ZOOM_BOUNDS.min, whole));
}

/** The factor a size is multiplied by. 100 % is exactly 1. */
export function editorZoomFactor(zoom: number): number {
  return clampEditorZoom(zoom) / 100;
}

/**
 * Heading size as a multiple of the base. H5 and H6 sit at the base size and
 * differ by weight and style, as the adapter's theme has it.
 */
export const HEADING_SCALE: Readonly<Record<HeadingLevel, number>> = {
  1: 2,
  2: 1.6,
  3: 1.3,
  4: 1.15,
  5: 1,
  6: 1,
};

export interface EditorTypography {
  readonly fontFamily: EditorFontFamily;
  /** The base size in CSS pixels, already within bounds. */
  readonly fontSize: number;
  readonly wordWrap: boolean;
  /** Whether the gutter of §10.8 numbers the lines. */
  readonly lineNumbers: boolean;
}

export const DEFAULT_EDITOR_TYPOGRAPHY: EditorTypography = {
  fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  fontSize: DEFAULT_EDITOR_FONT_SIZE,
  wordWrap: DEFAULT_EDITOR_WORD_WRAP,
  lineNumbers: DEFAULT_EDITOR_LINE_NUMBERS,
};

/** A stored size, brought within bounds and to a whole pixel. */
export function clampEditorFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EDITOR_FONT_SIZE;
  }
  return Math.min(EDITOR_FONT_SIZE_BOUNDS.max, Math.max(EDITOR_FONT_SIZE_BOUNDS.min, Math.round(value)));
}

export function isEditorFontFamily(value: unknown): value is EditorFontFamily {
  return typeof value === 'string' && (EDITOR_FONT_FAMILIES as readonly string[]).includes(value);
}

/** The size of a heading level at a base size, by the fixed ratio. */
export function headingFontSize(level: HeadingLevel, base: number): number {
  return base * HEADING_SCALE[level];
}
