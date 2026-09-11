/**
 * Dot commands for heading levels. specification.md §10.2.
 *
 * The author types `.h1` … `.h6` at the start of a line; once recognized the
 * command text disappears entirely and the line becomes a heading of that
 * level, shown as size plus a gutter label.
 *
 * The recognition is applied to the **visible** text of a line, not to the raw
 * Markdown. A line that is already a heading shows its text without the `# `
 * prefix, so typing `.h2` at its visible start changes the level — which is
 * what the author sees themselves doing.
 */
import { withHeadingLevel, type DisplayLine, type HeadingLevel } from './heading.js';

/** A recognized command and how much text it occupies. */
export interface DotCommand {
  readonly level: HeadingLevel;
  /** Number of characters the command occupies at the start of the line. */
  readonly length: number;
}

const DOT_COMMAND = /^\.h([1-6])[ \t]/;

/**
 * Recognizes a dot command at the start of `visibleText`.
 *
 * **The separator is required**, and is consumed with the command.
 *
 * An earlier version also fired on `.h3` at the end of a line, before the
 * author had typed the space. The conversion then happened one keystroke too
 * early, and the space that followed landed in the heading prefix: typing
 * `.h3 Chapter` produced `###  Chapter` with a doubled space — Markdown the
 * author never wrote. Waiting for the separator makes the command complete
 * before it fires, which is also easier to predict: `.h3` sits there visibly
 * until the space triggers it.
 *
 * Anything else after the digit ends the command, so `.h1x` is ordinary text.
 */
export function dotCommandAt(visibleText: string): DotCommand | null {
  const match = DOT_COMMAND.exec(visibleText);
  if (match === null) {
    return null;
  }

  const level = Number.parseInt(match[1] ?? '', 10) as HeadingLevel;
  // The match already covers the separator when there is one, and stops at the
  // digit when the command ends the line.
  return { level, length: match[0].length };
}

/**
 * Applies a dot command to a line, or returns null when there is none.
 *
 * The command text is removed and the level is applied to the whole paragraph.
 * A line that was already a heading keeps its prefix spelling and only changes
 * level.
 *
 * **This is never applied while loading a file.** A document that happens to
 * contain a line starting with `.h1` must open unchanged; converting it would
 * mean opening a file rewrites it (specification.md §6.3's rule, one level up). Callers
 * apply this to typing only.
 */
export function applyDotCommand(line: DisplayLine): DisplayLine | null {
  if (line.verbatim) {
    return null;
  }

  const command = dotCommandAt(line.text);
  if (command === null) {
    return null;
  }

  const remaining = line.text.slice(command.length);
  return withHeadingLevel({ ...line, text: remaining }, command.level);
}
