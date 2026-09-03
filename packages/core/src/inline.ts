/**
 * Inline markup detection. SPEC.md §10.3, step 1 of the planned decomposition.
 *
 * Pure and line-local: it knows nothing about an editor, a cursor, or a DOM,
 * which is what makes the focus-line behavior testable without a rendering
 * engine.
 *
 * Scope of this stage is deliberately narrow. Only the asterisk forms are
 * detected; whether `_` is treated identically is an open decision
 * (`SPEC.md` §10.3), and detecting it now would settle that question by
 * accident.
 */

export type InlineKind = 'boldItalic' | 'bold' | 'italic' | 'strikethrough' | 'code';

/** One inline span within a single line, in offsets relative to that line. */
export interface InlineSpan {
  readonly kind: InlineKind;
  /** Start of the opening delimiter. */
  readonly from: number;
  /** End of the closing delimiter. */
  readonly to: number;
  /** Start of the enclosed text. */
  readonly contentFrom: number;
  /** End of the enclosed text. */
  readonly contentTo: number;
}

interface Rule {
  readonly kind: InlineKind;
  readonly delimiter: string;
}

/**
 * Longest delimiter first: `***x***` is bold-italic, not bold followed by a
 * stray asterisk.
 */
const RULES: readonly Rule[] = [
  { kind: 'boldItalic', delimiter: '***' },
  { kind: 'bold', delimiter: '**' },
  { kind: 'italic', delimiter: '*' },
  { kind: 'strikethrough', delimiter: '~~' },
];

/**
 * Finds the inline spans of one line, left to right and never overlapping.
 *
 * Code spans are found first and shadow everything inside them: backticks are
 * the author's way of saying "show this literally", and emphasis inside them
 * would contradict that. A backslash escapes the character after it, and an
 * unclosed delimiter is simply text.
 */
export function inlineSpans(lineText: string): readonly InlineSpan[] {
  const spans: InlineSpan[] = [];
  let index = 0;

  while (index < lineText.length) {
    if (lineText[index] === '\\') {
      index += 2;
      continue;
    }

    const code = matchCode(lineText, index);
    if (code !== null) {
      spans.push(code);
      index = code.to;
      continue;
    }

    const emphasis = matchEmphasis(lineText, index);
    if (emphasis !== null) {
      spans.push(emphasis);
      index = emphasis.to;
      continue;
    }

    index += 1;
  }

  return spans;
}

/** A code span: one or more backticks, closed by the same number. */
function matchCode(lineText: string, start: number): InlineSpan | null {
  if (lineText[start] !== '`') {
    return null;
  }

  let fenceLength = 0;
  while (lineText[start + fenceLength] === '`') {
    fenceLength += 1;
  }

  const fence = '`'.repeat(fenceLength);
  const contentFrom = start + fenceLength;
  const closing = lineText.indexOf(fence, contentFrom);
  if (closing === -1 || closing === contentFrom) {
    return null;
  }
  // A longer run of backticks does not close a shorter fence.
  if (lineText[closing + fenceLength] === '`') {
    return null;
  }

  return {
    kind: 'code',
    from: start,
    to: closing + fenceLength,
    contentFrom,
    contentTo: closing,
  };
}

/**
 * The flanking rule, in its smallest form: an opening delimiter is not
 * followed by whitespace, a closing one is not preceded by it. Without it
 * `2 * 3 * 4` was arithmetic with a hidden operator and ` 3 ` in italics.
 */
function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character);
}

function matchEmphasis(lineText: string, start: number): InlineSpan | null {
  for (const rule of RULES) {
    if (!lineText.startsWith(rule.delimiter, start)) {
      continue;
    }

    const contentFrom = start + rule.delimiter.length;
    if (isWhitespace(lineText[contentFrom])) {
      continue;
    }
    const closing = findClosing(lineText, rule.delimiter, contentFrom);
    if (closing === null) {
      continue;
    }

    return {
      kind: rule.kind,
      from: start,
      to: closing + rule.delimiter.length,
      contentFrom,
      contentTo: closing,
    };
  }
  return null;
}

/**
 * Finds the closing delimiter, skipping escaped characters. Empty content does
 * not count: `****` is four asterisks, not empty bold text.
 */
function findClosing(lineText: string, delimiter: string, contentFrom: number): number | null {
  let index = contentFrom;
  while (index < lineText.length) {
    if (lineText[index] === '\\') {
      index += 2;
      continue;
    }
    if (lineText.startsWith(delimiter, index)) {
      if (index === contentFrom) {
        return null;
      }
      // A closing delimiter preceded by whitespace is not one; keep looking.
      if (!isWhitespace(lineText[index - 1])) {
        return index;
      }
    }
    index += 1;
  }
  return null;
}

/**
 * The ranges of delimiter characters in a line — what the editor hides when
 * the line does not hold the cursor (SPEC.md §10.3).
 */
export function delimiterRanges(
  lineText: string,
): readonly { readonly from: number; readonly to: number }[] {
  const ranges: Array<{ from: number; to: number }> = [];
  for (const span of inlineSpans(lineText)) {
    ranges.push({ from: span.from, to: span.contentFrom });
    ranges.push({ from: span.contentTo, to: span.to });
  }
  return ranges;
}
