/**
 * What the editor shows for the GFM constructs. specification.md §10.7.
 *
 * One pure function from the text, the display model, and the block model
 * to a list of instructions an adapter translates one-to-one: a class on a
 * line, a range hidden, a range replaced by a glyph, a mark over a range.
 * The rule that decides each of them is here, where it can be tested without
 * a rendering engine; the adapter only draws.
 *
 * The focus line rule, everywhere: on the line holding the cursor, every
 * marker is shown as written so it can be edited; the effect — a weight, a
 * rule at the left, a bullet's indent — stays, so the author sees what the
 * line is while editing what it says.
 */
import { blockAt, quoteDepth, type BlockModel } from './block-model.js';
import type { DisplayModel } from './display-model.js';
import { inlineSpans, type InlineKind } from './inline.js';

export type LineStyle =
  | { readonly kind: 'blockquote'; readonly depth: number }
  | { readonly kind: 'listItem'; readonly depth: number; readonly ordered: boolean }
  | { readonly kind: 'codeBlock' }
  | { readonly kind: 'thematicBreak' };

export interface LineInstruction {
  /** One-based. */
  readonly line: number;
  readonly style: LineStyle;
}

/** What stands in for a hidden range, if anything. */
export type Glyph = 'bullet' | 'checked' | 'unchecked' | 'rule' | 'break';

export interface ReplaceInstruction {
  readonly from: number;
  readonly to: number;
  /** Null hides the range outright. */
  readonly glyph: Glyph | null;
}

export interface MarkInstruction {
  readonly from: number;
  readonly to: number;
  readonly kind: InlineKind;
}

export interface Presentation {
  readonly lines: readonly LineInstruction[];
  readonly replacements: readonly ReplaceInstruction[];
  readonly marks: readonly MarkInstruction[];
}

/** The `>` markers at the head of a quoted line, with the spaces around them. */
const QUOTE_MARKERS = /^( {0,3}>[ \t]?)+/u;
/** A list marker at the head of a line, after any indentation. */
const LIST_MARKER = /^(\s*)([-+*]|\d{1,9}[.)])([ \t]+)/u;
/** A task box right after the marker. */
const TASK_BOX = /^\[([ xX])\][ \t]/u;
/** A hard break: a backslash, or two or more spaces, at the end of a line. */
const HARD_BREAK = /(\\| {2,})$/u;
/** A backslash escape of an ASCII punctuation character. */
const ESCAPE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu;

/**
 * Computes the presentation of a document.
 *
 * `focusedLine` is the one-based line holding the cursor, or null for none.
 */
export function presentation(
  markdown: string,
  display: DisplayModel,
  blocks: BlockModel,
  focusedLine: number | null,
): Presentation {
  const lines: LineInstruction[] = [];
  const replacements: ReplaceInstruction[] = [];
  const marks: MarkInstruction[] = [];
  const texts = markdown.split('\n');
  let offset = 0;

  texts.forEach((text, index) => {
    const line = index + 1;
    const focused = line === focusedLine;
    const verbatim = display.verbatimLines.has(line);
    const code = blockAt(blocks, line, 'codeBlock');
    const depth = quoteDepth(blocks, line);

    if (depth > 0) {
      lines.push({ line, style: { kind: 'blockquote', depth } });
    }
    if (code !== null || verbatim) {
      lines.push({ line, style: { kind: 'codeBlock' } });
    }

    const found = blockAt(blocks, line, 'listItem');
    const item = found !== null && found.kind === 'listItem' ? found : null;
    if (item !== null) {
      lines.push({
        line,
        style: { kind: 'listItem', depth: item.depth - depth, ordered: item.ordered },
      });
    }
    const isBreak = blockAt(blocks, line, 'thematicBreak') !== null;
    if (isBreak) {
      lines.push({ line, style: { kind: 'thematicBreak' } });
    }

    // The quote markers come first on a line; every other marker is read
    // after them.
    const quotes = code === null && depth > 0 ? QUOTE_MARKERS.exec(text) : null;
    const contentStart = quotes === null ? 0 : quotes[0].length;
    const marker = code === null ? LIST_MARKER.exec(text.slice(contentStart)) : null;

    // Everything below is markup shown as written on the focus line and
    // inside code, which is exactly what it says (specification.md §10.1).
    if (!focused && code === null && !verbatim) {
      if (quotes !== null) {
        replacements.push({ from: offset, to: offset + quotes[0].length, glyph: null });
      }

      if (item !== null && item.startLine === line && marker !== null) {
        const markerFrom = offset + contentStart + (marker[1] ?? '').length;
        const markerTo = offset + contentStart + marker[0].length;
        if (!item.ordered) {
          replacements.push({ from: markerFrom, to: markerTo, glyph: 'bullet' });
        }
        const afterMarker = text.slice(contentStart + marker[0].length);
        const box = TASK_BOX.exec(afterMarker);
        if (box !== null && item.task !== null) {
          replacements.push({
            from: markerTo,
            to: markerTo + box[0].length,
            glyph: item.task === 'checked' ? 'checked' : 'unchecked',
          });
        }
      }

      if (isBreak) {
        replacements.push({ from: offset, to: offset + text.length, glyph: 'rule' });
      }

      const hardBreak = HARD_BREAK.exec(text);
      if (hardBreak !== null && index < texts.length - 1 && text.trim() !== '') {
        replacements.push({
          from: offset + text.length - hardBreak[0].length,
          to: offset + text.length,
          glyph: 'break',
        });
      }

      const body = text.slice(contentStart);
      for (const escape of body.matchAll(ESCAPE)) {
        const at = offset + contentStart + escape.index;
        replacements.push({ from: at, to: at + 1, glyph: null });
      }
    }

    if (code === null && !verbatim) {
      // The effect of inline markup, on every line the focus line included:
      // the delimiters' hiding is the display model's (§10.3), the weight is
      // this function's.
      const visibleStart = display.hidden.find(
        (range) => range.kind === 'heading' && range.from === offset,
      );
      const textStart = visibleStart === undefined ? offset : visibleStart.to;
      const visible = markdown.slice(textStart, offset + text.length);
      for (const span of inlineSpans(visible)) {
        marks.push({
          from: textStart + span.contentFrom,
          to: textStart + span.contentTo,
          kind: span.kind,
        });
      }
    }

    offset += text.length + 1;
  });

  replacements.sort((left, right) => left.from - right.from);
  marks.sort((left, right) => left.from - right.from);
  return { lines, replacements, marks };
}
