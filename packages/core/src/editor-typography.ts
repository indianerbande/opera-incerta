/**
 * The editor's typography as a rule. SPEC.md §13 (Editor), §10.1.
 *
 * Three settings and one invariant. The settings: a font family from a
 * curated list — never a system font picker — a base size within bounds, and
 * whether lines wrap. The invariant: heading sizes keep fixed ratios to the
 * base, so a larger base enlarges the whole hierarchy and never one level
 * alone. The ratios lived in the editor adapter's theme until 2026-09-04;
 * they are a rule, and rules live here.
 */
import type { HeadingLevel } from './heading.js';

/** The curated families. The id is what the record stores (`CONVENTIONS.md` C-N3). */
export type EditorFontFamily = 'serif' | 'sans' | 'mono';

export const EDITOR_FONT_FAMILIES: readonly EditorFontFamily[] = ['serif', 'sans', 'mono'];

/**
 * The stacks behind the ids: families a desktop can be expected to have,
 * with the generic family last. Presentation, not text — no word an author
 * reads is in here (SPEC.md §14.3).
 */
export const EDITOR_FONT_STACKS: Readonly<Record<EditorFontFamily, string>> = {
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
};

export const DEFAULT_EDITOR_FONT_FAMILY: EditorFontFamily = 'serif';

/** In CSS pixels. The bounds keep a stored value from becoming absurd (§8.2). */
export const EDITOR_FONT_SIZE_BOUNDS = { min: 12, max: 24 } as const;

export const DEFAULT_EDITOR_FONT_SIZE = 16;

export const DEFAULT_EDITOR_WORD_WRAP = true;

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
}

export const DEFAULT_EDITOR_TYPOGRAPHY: EditorTypography = {
  fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  fontSize: DEFAULT_EDITOR_FONT_SIZE,
  wordWrap: DEFAULT_EDITOR_WORD_WRAP,
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
