/**
 * Page category colors. specification.md §6.6.
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
 * never guessed (specification.md §16).
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

/** Relative luminance in 0…1, using the weights fixed in specification.md §6.6. */
export function relativeLuminance(color: RgbColor): number {
  return (0.299 * color.red + 0.587 * color.green + 0.114 * color.blue) / 255;
}

/** Black on a light background, white on a dark one. specification.md §6.6. */
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

/** A page category as `categories.json` carries it. specification.md §6.6. */
export interface PageCategory {
  readonly id: string;
  readonly name: string;
  /** Background colour as `#RRGGBB`; the text colour is computed, never stored. */
  readonly color: string;
}

/**
 * How many categories a project may hold. specification.md §6.6 asks for at least eight
 * and at most sixty-four; the lower figure is a capacity, the upper a limit.
 */
export const MAX_CATEGORIES = 64;

/**
 * Reads a parsed `categories.json`, discarding whatever does not match.
 *
 * A missing or malformed file means no categories and is not an error, and one
 * unusable entry costs that entry rather than the set (specification.md §6.6, §16).
 */
export function readCategories(value: unknown): readonly PageCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const categories: PageCategory[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const candidate = entry as Partial<PageCategory>;
    const { id, name, color } = candidate;
    if (typeof id !== 'string' || id === '' || seen.has(id)) {
      continue;
    }
    if (typeof name !== 'string' || typeof color !== 'string' || parseHexColor(color) === null) {
      continue;
    }
    seen.add(id);
    // Stored as `#RRGGBB` whatever the file spelled: the badge binds the
    // string into a style, and a colour without the hash is not a colour there.
    const trimmed = color.trim();
    categories.push({ id, name, color: trimmed.startsWith('#') ? trimmed : `#${trimmed}` });
    if (categories.length === MAX_CATEGORIES) {
      break;
    }
  }
  return categories;
}

/**
 * The category a sheet carries, or null.
 *
 * An id that names nothing counts as uncategorized and is not an error: a
 * category may have been deleted, and deleting one deliberately does not
 * rewrite the sheets that referenced it (specification.md §6.6).
 */
export function findCategory(
  categories: readonly PageCategory[],
  id: string | undefined,
): PageCategory | null {
  return id === undefined ? null : (categories.find((category) => category.id === id) ?? null);
}
