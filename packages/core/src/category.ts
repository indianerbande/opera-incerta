/**
 * Page category colors. SPEC.md §6.6.
 *
 * The text color is never stored: it is computed from the background so that a
 * category set stays valid when its colors are edited.
 */

/** A color with channels in 0…255. */
export interface RgbColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

/** The two text colors a category badge can use. */
export type BadgeTextColor = 'black' | 'white';

const HEX_COLOR = /^#?([0-9a-fA-F]{6})$/;

/**
 * Parses `#RRGGBB` (with or without the leading `#`).
 * Returns `null` for anything else — an unreadable category color is reported,
 * never guessed (SPEC.md §16).
 */
export function parseHexColor(value: string): RgbColor | null {
  const match = HEX_COLOR.exec(value.trim());
  if (match === null) {
    return null;
  }
  const digits = match[1];
  if (digits === undefined) {
    return null;
  }
  return {
    red: Number.parseInt(digits.slice(0, 2), 16),
    green: Number.parseInt(digits.slice(2, 4), 16),
    blue: Number.parseInt(digits.slice(4, 6), 16),
  };
}

/** Relative luminance in 0…1, using the weights fixed in SPEC.md §6.6. */
export function relativeLuminance(color: RgbColor): number {
  return (0.299 * color.red + 0.587 * color.green + 0.114 * color.blue) / 255;
}

/** Black on a light background, white on a dark one. SPEC.md §6.6. */
export function textColorFor(color: RgbColor): BadgeTextColor {
  return relativeLuminance(color) > 0.5 ? 'black' : 'white';
}

/**
 * Convenience over {@link parseHexColor} and {@link textColorFor}.
 * Returns `null` when the stored color is not a valid `#RRGGBB` value.
 */
export function categoryTextColor(hexColor: string): BadgeTextColor | null {
  const color = parseHexColor(hexColor);
  return color === null ? null : textColorFor(color);
}
