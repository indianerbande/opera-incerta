/**
 * What an author may call a stylesheet of their own. SPEC.md §15.2.
 *
 * A name becomes a file name in `.opera-incerta/styles/`, and it is also what
 * the dialog lists. Unlike a sheet's title (§6.4), the two are **not**
 * decoupled: there is no front matter to carry a display name, and a
 * stylesheet has no identity worth preserving across a rename. So the name is
 * constrained rather than slugged into something else — what the author typed
 * is what they will find in the folder.
 *
 * **It lives in the core, not in `@opera-incerta/export`**, because the file
 * store needs it too: a dependency from `project-node` to a module would turn
 * the direction of the architecture around. The core is what both may share.
 */

/** Long enough for a real name, short enough for every filesystem. */
export const STYLESHEET_NAME_LIMIT = 48;

/**
 * Everything a path would read as structure.
 *
 * A list rather than a character class: a class needs a range for the control
 * characters, and a range written inline is how `[ -<]` — space to `<`, which
 * is every digit — gets into a file without anyone seeing it.
 */
const REFUSED_CHARACTERS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/** Below this, a character is a control character and belongs in no name. */
const FIRST_PRINTABLE = 0x20;

/**
 * Whether a name can be used as it stands.
 *
 * Refused: empty, padded with space, anything a path would read as structure,
 * a leading dot (which would hide the file), and anything past the limit.
 *
 * **Refusing beats correcting** here. An author who typed a slash is told it
 * is not allowed, rather than finding later that the file is called something
 * else — the opposite choice from a sheet's title (§6.4), and for the
 * opposite reason: a sheet keeps its file name through every rename, and a
 * stylesheet has no such identity to protect.
 */
export function isUsableStylesheetName(name: string): boolean {
  if (name === '' || name.trim() !== name || name.length > STYLESHEET_NAME_LIMIT) {
    return false;
  }
  if (name.startsWith('.')) {
    return false;
  }
  if (REFUSED_CHARACTERS.some((character) => name.includes(character))) {
    return false;
  }
  return [...name].every((character) => (character.codePointAt(0) ?? 0) >= FIRST_PRINTABLE);
}

/** The file a name becomes. Only ever called with a usable name. */
export function stylesheetFileName(name: string): string {
  return `${name}.css`;
}

/**
 * The name a file carries, or null when it is not one of ours.
 *
 * A file in the directory that this cannot read is simply not offered: the
 * folder is the author's and may hold whatever they put there.
 */
export function stylesheetNameOf(fileName: string): string | null {
  if (!fileName.endsWith('.css')) {
    return null;
  }
  const name = fileName.slice(0, -'.css'.length);
  return isUsableStylesheetName(name) ? name : null;
}
