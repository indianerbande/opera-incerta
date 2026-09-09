/**
 * The scheme and the palette of the visual system. SPEC.md §8.8.
 *
 * The values themselves are CSS — the stylesheet owns them. What lives here
 * is what the record may hold, what it falls back to, and the one rule that
 * turns a stored choice into the two attributes the root element carries.
 *
 * `system` is resolved rather than expressed in CSS: a second copy of the
 * dark token set under `prefers-color-scheme` would be the same twenty-five
 * declarations twice, and the pair would drift. The renderer asks the machine
 * once, and asks again when the machine changes its mind — the same shape the
 * interface language already has (`resolveLanguage`).
 */

/** What the author chose, or "whatever the system says". */
export type ColorScheme = 'system' | 'light' | 'dark';

/** What the root element ends up carrying. */
export type ResolvedColorScheme = 'light' | 'dark';

export const COLOR_SCHEMES: readonly ColorScheme[] = ['system', 'light', 'dark'];

export const DEFAULT_COLOR_SCHEME: ColorScheme = 'system';

/**
 * The accent palettes. `blue` is the default and the one the surfaces are
 * written for; the other seven derive their surfaces from the accent.
 */
export type AccentPalette =
  | 'blue'
  | 'gray'
  | 'yellow'
  | 'green'
  | 'violet'
  | 'red'
  | 'orange'
  | 'turquoise';

export const ACCENT_PALETTES: readonly AccentPalette[] = [
  'blue',
  'gray',
  'yellow',
  'green',
  'violet',
  'red',
  'orange',
  'turquoise',
];

export const DEFAULT_ACCENT_PALETTE: AccentPalette = 'blue';

export function isColorScheme(value: unknown): value is ColorScheme {
  return typeof value === 'string' && (COLOR_SCHEMES as readonly string[]).includes(value);
}

export function isAccentPalette(value: unknown): value is AccentPalette {
  return typeof value === 'string' && (ACCENT_PALETTES as readonly string[]).includes(value);
}

/** The stored choice against what the machine reports. */
export function resolveColorScheme(choice: ColorScheme, prefersDark: boolean): ResolvedColorScheme {
  if (choice !== 'system') {
    return choice;
  }
  return prefersDark ? 'dark' : 'light';
}
