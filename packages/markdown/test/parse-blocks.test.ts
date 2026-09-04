import { describe, expect, it } from 'vitest';
import { blockAt, isListItem, quoteDepth } from '@opera-incerta/core';
import { parseBlocks } from '../src/index.js';

const sample = [
  '# Title', // 1
  '', // 2
  '> A quote', // 3
  '> > nested', // 4
  '', // 5
  '- one', // 6
  '- [ ] open task', // 7
  '- [x] done task', // 8
  '  - nested item', // 9
  '', // 10
  '1. first', // 11
  '2) second', // 12
  '', // 13
  '```', // 14
  'code', // 15
  '```', // 16
  '', // 17
  '    indented code', // 18
  '', // 19
  '---', // 20
  '', // 21
  'plain paragraph', // 22
].join('\n');

describe('parseBlocks (SPEC.md §10.7)', () => {
  const model = parseBlocks(sample);

  it('reports block quotes with their depth, inclusive and one-based', () => {
    expect(quoteDepth(model, 3)).toBe(1);
    expect(quoteDepth(model, 4)).toBe(2);
    expect(quoteDepth(model, 5)).toBe(0);
    const outer = blockAt(model, 3, 'blockquote');
    expect(outer).toMatchObject({ startLine: 3, endLine: 4, depth: 0 });
  });

  it('reports list items with their marker, order, and nesting', () => {
    const items = model.blocks.filter(isListItem);
    expect(items.map((item) => [item.startLine, item.marker, item.ordered, item.depth])).toEqual([
      [6, '-', false, 0],
      [7, '-', false, 0],
      [8, '-', false, 0],
      [9, '-', false, 1],
      [11, '1.', true, 0],
      [12, '2)', true, 0],
    ]);
  });

  it('marks task list items by its own rule, which the parser does not have', () => {
    const items = model.blocks.filter(isListItem);
    expect(items.map((item) => item.task)).toEqual([null, 'unchecked', 'checked', null, null, null]);
  });

  it('reports fenced and indented code, and a thematic break', () => {
    expect(blockAt(model, 15, 'codeBlock')).toMatchObject({ startLine: 14, endLine: 16 });
    expect(blockAt(model, 18, 'codeBlock')).toMatchObject({ startLine: 18, endLine: 18 });
    expect(blockAt(model, 20, 'thematicBreak')).toMatchObject({ startLine: 20, endLine: 20 });
    expect(blockAt(model, 22, 'paragraph')).toMatchObject({ startLine: 22 });
  });

  it('keeps every block inside the document, whatever the last token says', () => {
    for (const block of model.blocks) {
      expect(block.startLine).toBeGreaterThanOrEqual(1);
      expect(block.endLine).toBeGreaterThanOrEqual(block.startLine);
      expect(block.endLine).toBeLessThanOrEqual(22);
    }
  });

  it('reads an empty document as no blocks, and an unclosed quote to the end', () => {
    expect(parseBlocks('').blocks).toEqual([]);
    const open = parseBlocks('> unclosed\n> still');
    expect(blockAt(open, 2, 'blockquote')).toMatchObject({ startLine: 1, endLine: 2 });
  });

  it('does not take a task box inside a paragraph for a task', () => {
    const model_ = parseBlocks('[ ] not a task\n\n- [ ]tight\n');
    expect(model_.blocks.filter(isListItem).map((item) => item.task)).toEqual([null]);
  });

  it('reads a table and raw HTML as paragraphs, which the presentation leaves alone', () => {
    const model_ = parseBlocks('| a |\n|---|\n| 1 |\n\n<div>x</div>\n');
    // The CommonMark preset knows no tables, and HTML is off: both are
    // plain text until their own rounds (SPEC.md §10.7).
    expect(blockAt(model_, 1, 'paragraph')).toMatchObject({ startLine: 1, endLine: 3 });
    expect(blockAt(model_, 5, 'paragraph')).not.toBeNull();
    expect(blockAt(model_, 5, 'html')).toBeNull();
  });
});
