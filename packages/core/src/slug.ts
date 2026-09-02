/**
 * Slug generation for project directories and sheet file names.
 *
 * SPEC.md §6.1 (project directory names) and §6.5 (sheet file names).
 * The generated name is a stable technical identifier: it is created once and
 * never changed by a later rename, which only touches the display name.
 */

/** Maximum length of a generated slug, in characters. SPEC.md §6.1. */
export const SLUG_MAX_LENGTH = 40;

/** Fallback base used when a title yields no usable slug. SPEC.md §6.5. */
export const SHEET_SLUG_FALLBACK = 'sheet';

const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

/**
 * Turns a free-form title into a slug: lowercase, spaces to hyphens, German
 * umlauts transliterated to ASCII, all other non-ASCII characters removed,
 * capped at {@link SLUG_MAX_LENGTH}.
 *
 * Returns an empty string when nothing usable remains; callers decide on a
 * fallback, because the fallback differs by object kind.
 */
export function slugify(title: string): string {
  let value = title.toLowerCase();
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    value = value.replace(pattern, replacement);
  }
  value = value
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (value.length > SLUG_MAX_LENGTH) {
    value = value.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
  }
  return value;
}

/**
 * Appends `-2`, `-3`, … to `base` until the result is not in `taken`.
 * Comparison is case-insensitive, because the target file systems are not
 * reliably case-sensitive.
 */
export function withCollisionSuffix(base: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) {
    used.add(name.toLowerCase());
  }
  if (!used.has(base.toLowerCase())) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

/**
 * The name an entry keeps when it arrives in a group that may already hold one
 * like it. SPEC.md §6.8.
 *
 * A move must never overwrite, and refusing it over a technicality would block
 * something the author plainly wants — so the arrival takes a suffix. This is
 * the one case where a file name changes after it was set, and it is invisible
 * to the author: the title, which is the name they see, is untouched.
 */
export function arrivalName(name: string, existing: Iterable<string>): string {
  const isSheet = name.toLowerCase().endsWith('.md');
  const base = isSheet ? name.slice(0, -3) : name;
  const bases: string[] = [];
  for (const candidate of existing) {
    bases.push(candidate.toLowerCase().endsWith('.md') ? candidate.slice(0, -3) : candidate);
  }
  const unique = withCollisionSuffix(base, bases);
  return isSheet ? `${unique}.md` : unique;
}

/**
 * Builds the file name for a new sheet from its title, avoiding collisions
 * with the `.md` files already present in the target directory.
 * SPEC.md §6.5.
 */
export function sheetFileName(title: string, existingFileNames: Iterable<string>): string {
  const base = slugify(title) || SHEET_SLUG_FALLBACK;
  const existingBases: string[] = [];
  for (const name of existingFileNames) {
    existingBases.push(name.toLowerCase().endsWith('.md') ? name.slice(0, -3) : name);
  }
  return `${withCollisionSuffix(base, existingBases)}.md`;
}

/**
 * Builds the directory name for a new project from its display name, avoiding
 * collisions with the entries already present in the parent directory.
 * SPEC.md §6.1.
 */
export function projectDirectoryName(
  displayName: string,
  existingEntryNames: Iterable<string>,
): string {
  const base = slugify(displayName) || 'project';
  return withCollisionSuffix(base, existingEntryNames);
}
