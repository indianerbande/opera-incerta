import { describe, expect, it } from 'vitest';
import {
  displayModel,
  presentation,
  type Block,
  type BlockModel,
  type ListItemSpan,
} from '../src/index.js';

/** Offsets of each line's start, so expectations can be written in lines. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function item(overrides: Partial<ListItemSpan> & Pick<ListItemSpan, 'startLine'>): ListItemSpan {
  return {
    kind: 'listItem',
    endLine: overrides.startLine,
    depth: 0,
    ordered: false,
    marker: '-',
    task: null,
    ...overrides,
  };
}

function model(blocks: readonly Block[]): BlockModel {
  return { blocks };
}

function present(text: string, blocks: readonly Block[], focused: number | null = null) {
  return presentation(text, displayModel(text, focused), model(blocks), focused);
}

describe('the presentation of GFM constructs (SPEC.md §10.7)', () => {
  it('hides a quote marker off the focus line and styles the line by depth', () => {
    const text = '> quoted\n> > deeper\nplain';
    const quotes: Block[] = [
      { kind: 'blockquote', startLine: 1, endLine: 2, depth: 0 },
      { kind: 'blockquote', startLine: 2, endLine: 2, depth: 1 },
    ];
    const shown = present(text, quotes);
    expect(shown.lines).toEqual([
      { line: 1, style: { kind: 'blockquote', depth: 1 } },
      { line: 2, style: { kind: 'blockquote', depth: 2 } },
    ]);
    const [first, second] = lineStarts(text);
    expect(shown.replacements).toEqual([
      { from: first, to: first! + 2, glyph: null },
      { from: second, to: second! + 4, glyph: null },
    ]);
  });

  it('shows the quote marker as written on the focus line, with the style kept', () => {
    const text = '> quoted';
    const shown = present(text, [{ kind: 'blockquote', startLine: 1, endLine: 1, depth: 0 }], 1);
    expect(shown.replacements).toEqual([]);
    expect(shown.lines).toEqual([{ line: 1, style: { kind: 'blockquote', depth: 1 } }]);
  });

  it('puts a bullet in place of an unordered marker and leaves an ordered one as written', () => {
    const text = '- one\n1. first';
    const shown = present(text, [
      item({ startLine: 1 }),
      item({ startLine: 2, ordered: true, marker: '1.' }),
    ]);
    expect(shown.replacements).toEqual([{ from: 0, to: 2, glyph: 'bullet' }]);
    expect(shown.lines).toEqual([
      { line: 1, style: { kind: 'listItem', depth: 0, ordered: false } },
      { line: 2, style: { kind: 'listItem', depth: 0, ordered: true } },
    ]);
  });

  it('turns a task box into a checkbox glyph after the bullet', () => {
    const text = '- [ ] open\n- [x] done';
    const shown = present(text, [
      item({ startLine: 1, task: 'unchecked' }),
      item({ startLine: 2, task: 'checked' }),
    ]);
    const [, second] = lineStarts(text);
    expect(shown.replacements).toEqual([
      { from: 0, to: 2, glyph: 'bullet' },
      { from: 2, to: 6, glyph: 'unchecked' },
      { from: second, to: second! + 2, glyph: 'bullet' },
      { from: second! + 2, to: second! + 6, glyph: 'checked' },
    ]);
  });

  it('indents a nested item by its depth inside the list, not counting quotes', () => {
    const text = '> - quoted item';
    const shown = present(text, [
      { kind: 'blockquote', startLine: 1, endLine: 1, depth: 0 },
      item({ startLine: 1, depth: 1 }),
    ]);
    expect(shown.lines).toEqual([
      { line: 1, style: { kind: 'blockquote', depth: 1 } },
      { line: 1, style: { kind: 'listItem', depth: 0, ordered: false } },
    ]);
    // The quote marker goes, the bullet stands in for the dash.
    expect(shown.replacements).toEqual([
      { from: 0, to: 2, glyph: null },
      { from: 2, to: 4, glyph: 'bullet' },
    ]);
  });

  it('replaces a thematic break by a rule and shows it as written on focus', () => {
    const text = 'above\n---\nbelow';
    const [, second] = lineStarts(text);
    const blocks: Block[] = [{ kind: 'thematicBreak', startLine: 2, endLine: 2, depth: 0 }];
    expect(present(text, blocks).replacements).toEqual([
      { from: second, to: second! + 3, glyph: 'rule' },
    ]);
    expect(present(text, blocks, 2).replacements).toEqual([]);
    expect(present(text, blocks).lines).toEqual([{ line: 2, style: { kind: 'thematicBreak' } }]);
  });

  it('shows a hard break as a glyph, but not a trailing space on the last line', () => {
    const text = 'first  \nsecond\\\nlast  ';
    const shown = present(text, []);
    const [, second] = lineStarts(text);
    expect(shown.replacements).toEqual([
      { from: 5, to: 7, glyph: 'break' },
      { from: second! + 6, to: second! + 7, glyph: 'break' },
    ]);
  });

  it('hides the backslash of an escape and leaves a backslash before a letter', () => {
    const text = 'a \\* star and a \\n';
    expect(present(text, []).replacements).toEqual([{ from: 2, to: 3, glyph: null }]);
  });

  it('marks the effect of inline markup on every line, the focus line included', () => {
    const text = 'a **bold** word\n~~gone~~ and `code`';
    const [, second] = lineStarts(text);
    const marks = present(text, [], 1).marks;
    expect(marks).toEqual([
      { from: 4, to: 8, kind: 'bold' },
      { from: second! + 2, to: second! + 6, kind: 'strikethrough' },
      { from: second! + 14, to: second! + 18, kind: 'code' },
    ]);
  });

  it('marks nothing and hides nothing inside code, fenced or indented', () => {
    const text = '```\n> not a quote\n- not a list **nor bold**\n```';
    const shown = present(text, [{ kind: 'codeBlock', startLine: 1, endLine: 4, depth: 0 }]);
    expect(shown.replacements).toEqual([]);
    expect(shown.marks).toEqual([]);
    expect(shown.lines.every((line) => line.style.kind === 'codeBlock')).toBe(true);
    expect(shown.lines).toHaveLength(4);
  });

  it('marks the text of a heading after its hidden prefix', () => {
    const text = '# A **bold** title';
    expect(present(text, []).marks).toEqual([{ from: 6, to: 10, kind: 'bold' }]);
  });
});
