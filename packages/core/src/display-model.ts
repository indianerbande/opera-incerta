/**
 * The document as the editor should present it. SPEC.md §10.
 *
 * This is the contract between the portable rules and whichever component
 * renders them: the core says *what* is a heading and *which* characters are
 * delimiters to hide; the adapter translates that into its own decorations. No
 * editor type appears here, and no DOM.
 */
import { markdownToDisplay, type HeadingLevel } from './heading.js';
import { delimiterRanges } from './inline.js';

/** A heading line, addressed by document offset. */
export interface HeadingSpan {
  /** One-based line number. */
  readonly line: number;
  readonly level: HeadingLevel;
  /** Offset of the line start in the whole document. */
  readonly from: number;
}

/** A range of characters the editor hides. */
export interface HiddenRange {
  readonly from: number;
  readonly to: number;
  /**
   * Why it is hidden.
   *
   * A `heading` range is the `#` prefix, hidden unconditionally: heading level
   * is a static paragraph attribute, so there is no syntax for the author to
   * edit in place. An `inline` range is a delimiter, hidden only while the
   * cursor is elsewhere (SPEC.md §10.2 against §10.3).
   */
  readonly kind: 'heading' | 'inline';
}

export interface DisplayModel {
  readonly headings: readonly HeadingSpan[];
  /** Delimiter ranges outside the focused line. */
  readonly hidden: readonly HiddenRange[];
  /**
   * One-based numbers of lines inside a fenced code block, its fences
   * included. Whether a line is verbatim cannot be judged from the line
   * itself, so every consumer that needs to know asks here.
   */
  readonly verbatimLines: ReadonlySet<number>;
}

/**
 * Computes the presentation of a document.
 *
 * `focusedLine` is the one-based line holding the cursor; its delimiters stay
 * visible so the author can edit them. Pass null to hide them everywhere,
 * which is what a preview or an unfocused editor wants.
 *
 * Lines inside a fenced code block are left exactly as written.
 */
export function displayModel(markdown: string, focusedLine: number | null): DisplayModel {
  const lines = markdownToDisplay(markdown);
  const headings: HeadingSpan[] = [];
  const hidden: HiddenRange[] = [];
  const verbatimLines = new Set<number>();

  let offset = 0;
  lines.forEach((line, index) => {
    const number = index + 1;
    const rawLength = line.prefix.length + line.text.length + line.suffix.length;

    if (line.verbatim) {
      verbatimLines.add(number);
    }

    if (line.level !== null) {
      headings.push({ line: number, level: line.level, from: offset });

      // The prefix and any closing hashes leave the visible line entirely: the
      // level shows as size and as a gutter label instead (SPEC.md §10.2).
      if (line.prefix.length > 0) {
        hidden.push({ from: offset, to: offset + line.prefix.length, kind: 'heading' });
      }
      if (line.suffix.length > 0) {
        const suffixFrom = offset + line.prefix.length + line.text.length;
        hidden.push({ from: suffixFrom, to: suffixFrom + line.suffix.length, kind: 'heading' });
      }
    }

    if (number !== focusedLine && !line.verbatim) {
      // Delimiter offsets are relative to the visible text, which starts after
      // whatever prefix the line carries.
      const textStart = offset + line.prefix.length;
      for (const range of delimiterRanges(line.text)) {
        hidden.push({
          from: textStart + range.from,
          to: textStart + range.to,
          kind: 'inline',
        });
      }
    }

    offset += rawLength + 1; // the newline
  });

  hidden.sort((left, right) => left.from - right.from);
  return { headings, hidden, verbatimLines };
}

/**
 * Where the visible text of a line begins.
 *
 * For a heading this is past the hidden `#` prefix; for any other line it is
 * the line start. Cursor motion, `Home`, backspace, and the clipboard all need
 * this same answer, and deriving it four times is how they would drift apart.
 */
export function visibleLineStart(model: DisplayModel, lineFrom: number): number {
  const prefix = model.hidden.find(
    (range) => range.kind === 'heading' && range.from === lineFrom,
  );
  return prefix === undefined ? lineFrom : prefix.to;
}

/**
 * The hidden heading prefix of a line, or null when it has none.
 * The clipboard prepends it so that copying a heading yields Markdown.
 */
export function headingPrefixRange(model: DisplayModel, lineFrom: number): HiddenRange | null {
  return (
    model.hidden.find((range) => range.kind === 'heading' && range.from === lineFrom) ?? null
  );
}
