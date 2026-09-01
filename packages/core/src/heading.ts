/**
 * Heading display model. SPEC.md §10.1 and §10.2.
 *
 * On disk a heading is `# Text`. In the editor it is a property of the whole
 * paragraph plus a label in the gutter, and the `#` prefix is not part of the
 * visible text. These two pure transformations own that translation; the
 * editor component never sees Markdown syntax.
 *
 * The raw prefix and suffix are carried on the line rather than reconstructed,
 * so an unusual but valid spelling — extra spaces, closing hashes, up to three
 * leading spaces — survives a round trip untouched.
 */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** One line of the document as the editor shows it. */
export interface DisplayLine {
  /** Heading level, or null for an ordinary paragraph. */
  readonly level: HeadingLevel | null;
  /** The text the editor displays. */
  readonly text: string;
  /** Raw Markdown removed from the front of the line. */
  readonly prefix: string;
  /** Raw Markdown removed from the end of the line (closing hashes). */
  readonly suffix: string;
  /**
   * True for a fenced code block, its fence lines included. Such a line is
   * shown exactly as written: no heading, and no inline markup, because
   * backticks mean "literally this".
   */
  readonly verbatim: boolean;
}

/**
 * ATX heading: up to three leading spaces, one to six hashes, then a space or
 * the end of the line. Four leading spaces make an indented code block, and
 * `#Text` without a space is not a heading — both per CommonMark.
 */
const ATX = /^( {0,3})(#{1,6})(?:([ \t]+)([\s\S]*?))?[ \t]*$/;

/** A closing hash sequence, which CommonMark allows and this codec preserves. */
const CLOSING_HASHES = /^([\s\S]*?)([ \t]+#+)$/;

/** A fenced code block opener or closer. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Converts Markdown text into display lines.
 *
 * Lines inside a fenced code block are never headings, however they begin.
 */
export function markdownToDisplay(markdown: string): readonly DisplayLine[] {
  const lines = markdown.split('\n');
  const display: DisplayLine[] = [];
  let openFence: string | null = null;

  for (const line of lines) {
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = (fence[1] ?? '').charAt(0);
      if (openFence === null) {
        openFence = marker;
      } else if (marker === openFence) {
        openFence = null;
      }
      display.push(plainLine(line, true));
      continue;
    }
    display.push(openFence === null ? readLine(line) : plainLine(line, true));
  }

  return display;
}

/** Converts display lines back to Markdown. The inverse of the above. */
export function displayToMarkdown(lines: readonly DisplayLine[]): string {
  return lines.map((line) => `${line.prefix}${line.text}${line.suffix}`).join('\n');
}

function plainLine(line: string, verbatim = false): DisplayLine {
  return { level: null, text: line, prefix: '', suffix: '', verbatim };
}

function readLine(line: string): DisplayLine {
  const match = ATX.exec(line);
  if (match === null) {
    return plainLine(line);
  }

  const indent = match[1] ?? '';
  const hashes = match[2] ?? '';
  const spacing = match[3] ?? '';
  const rest = match[4] ?? '';

  const trailingSpace = line.slice((indent + hashes + spacing + rest).length);
  const closing = CLOSING_HASHES.exec(rest);
  const text = closing === null ? rest : (closing[1] ?? '');
  const closingSuffix = closing === null ? '' : (closing[2] ?? '');

  return {
    level: hashes.length as HeadingLevel,
    text,
    prefix: `${indent}${hashes}${spacing}`,
    suffix: `${closingSuffix}${trailingSpace}`,
    verbatim: false,
  };
}

/**
 * Applies a heading level to a line, or removes it when `level` is null.
 *
 * Existing spacing is kept when only the level changes, so re-levelling a line
 * does not silently reformat it. A heading applies to exactly one line: the
 * caller starts the next paragraph plain (SPEC.md §10.2).
 */
export function withHeadingLevel(line: DisplayLine, level: HeadingLevel | null): DisplayLine {
  if (level === null) {
    return { level: null, text: line.text, prefix: '', suffix: '', verbatim: line.verbatim };
  }

  const previous = /^( {0,3})(#{1,6})([ \t]*)$/.exec(line.prefix);
  const indent = previous?.[1] ?? '';
  const spacing = previous?.[3] ?? ' ';

  return {
    level,
    text: line.text,
    prefix: `${indent}${'#'.repeat(level)}${spacing}`,
    suffix: line.suffix,
    verbatim: false,
  };
}

/** One heading in the outline. SPEC.md §11. */
export interface OutlineEntry {
  readonly level: HeadingLevel;
  readonly text: string;
  /** Zero-based index into the display lines. */
  readonly line: number;
}

/** Collects the outline of a document. */
export function outlineOf(lines: readonly DisplayLine[]): readonly OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  lines.forEach((line, index) => {
    if (line.level !== null) {
      entries.push({ level: line.level, text: line.text, line: index });
    }
  });
  return entries;
}

/**
 * Which outline entries are visible. H1 and H2 always; H3 to H6 only with the
 * deeper-levels toggle enabled. SPEC.md §11 — a rule, not view logic.
 */
export function visibleOutline(
  entries: readonly OutlineEntry[],
  showDeeperLevels: boolean,
): readonly OutlineEntry[] {
  return showDeeperLevels ? entries : entries.filter((entry) => entry.level <= 2);
}
