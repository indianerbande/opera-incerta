/**
 * Sheet-list preview geometry. SPEC.md §9.2.
 *
 * Preview line sizes follow their own geometric formula, deliberately
 * independent of the real editor sizes: differences must stay visible without
 * the smallest step becoming unreadable at row height.
 */
import type { HeadingLevel } from './heading.js';

export type PreviewDensity = 'compact' | 'standard' | 'large';

export interface PreviewDensitySpec {
  /** Total lines per row, including the title line. */
  readonly totalLines: number;
  /**
   * Whether every line uses the same size. The compact step deliberately hides
   * heading size differences; other attributes still apply.
   */
  readonly uniformSize: boolean;
}

export const PREVIEW_DENSITIES = {
  compact: { totalLines: 3, uniformSize: true },
  standard: { totalLines: 5, uniformSize: false },
  large: { totalLines: 10, uniformSize: false },
} as const satisfies Record<PreviewDensity, PreviewDensitySpec>;

export const DEFAULT_PREVIEW_DENSITY: PreviewDensity = 'standard';

/** Base size in CSS pixels: body text and H6 in a preview. SPEC.md §9.2. */
export const PREVIEW_BASE_FONT_SIZE = 12;

/** Growth per heading level upward from the base. SPEC.md §9.2. */
export const PREVIEW_STEP_RATIO = 1.05;

/** How many preview lines a row shows below its title. */
export function previewLineCount(density: PreviewDensity): number {
  return PREVIEW_DENSITIES[density].totalLines - 1;
}

/**
 * Font size of one preview line.
 *
 * H6 and body text sit at the base; each level upward multiplies by the step,
 * so H1 is base × ratio⁵. Under the compact density every line is base-sized.
 */
export function previewFontSize(
  level: HeadingLevel | null,
  density: PreviewDensity = DEFAULT_PREVIEW_DENSITY,
  base: number = PREVIEW_BASE_FONT_SIZE,
  ratio: number = PREVIEW_STEP_RATIO,
): number {
  if (PREVIEW_DENSITIES[density].uniformSize || level === null) {
    return base;
  }
  return base * ratio ** (6 - level);
}

/**
 * Picks the lines shown in a preview: the body without its blank lines unless
 * they are requested, capped at the density's line count. Generic over the
 * line, so a line keeps whatever else it carries — its heading level — and
 * the list does not have to match levels back to texts.
 */
export function previewLines<T extends { readonly text: string }>(
  bodyLines: readonly T[],
  density: PreviewDensity,
  showBlankLines: boolean,
): readonly T[] {
  const candidates = showBlankLines
    ? bodyLines
    : bodyLines.filter((line) => line.text.trim() !== '');
  return candidates.slice(0, previewLineCount(density));
}
