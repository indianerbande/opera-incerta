/**
 * The block structure of a document, read with markdown-it. specification.md §10.7,
 * §5.4.
 *
 * This is the translation layer the dependency decision asked for
 * (`conventions.md` C-A6): markdown-it's tokens come in, the core's own
 * `BlockModel` goes out, and no token leaves this file. The parser runs in
 * its CommonMark preset — what it adds beyond that, the core decides for
 * itself: strikethrough and code spans are the core's inline rule, task list
 * items are the rule below, tables and links wait for their own rounds.
 *
 * markdown-it was measured against the gate of `testing.md` §2.11 on
 * 2026-09-04 and accepted for this display with two deviations recorded in
 * `dependencies.md`: no task list items of its own, and a PSF-2.0 dependency
 * that serves only its command-line tool and never reaches a bundle.
 */
import MarkdownIt from 'markdown-it';
import type { Block, BlockKind, BlockModel, TaskState } from '@opera-incerta/core';

/**
 * CommonMark, nothing more. Linkification, typographic replacements, and
 * HTML are off: the document is shown, not rendered to a page.
 */
const parser = new MarkdownIt('commonmark', { html: false, linkify: false, typographer: false });

/** A task box at the head of an item's text. Our rule, not the parser's. */
const TASK_BOX = /^\[([ xX])\](?:[ \t]|$)/u;

/**
 * A container on the stack while its children are read. Its range is known
 * from its opening token — markdown-it gives the closing one no map — so the
 * block is pushed at once, and the stack serves depth and the task rule.
 */
interface OpenContainer {
  readonly kind: BlockKind;
  /** The block as pushed; a list item's task is set once its text is seen. */
  readonly block: Block | MutableListItem;
}

interface MutableListItem {
  readonly kind: 'listItem';
  readonly startLine: number;
  readonly endLine: number;
  readonly depth: number;
  readonly ordered: boolean;
  readonly marker: string;
  task: TaskState | null;
}

/** Reads the block structure of a document. Lines are one-based, ranges inclusive. */
export function parseBlocks(markdown: string): BlockModel {
  const tokens = parser.parse(markdown, {});
  const blocks: Array<Block | MutableListItem> = [];
  const open: OpenContainer[] = [];
  let depth = 0;
  let awaitingItemText = false;

  for (const token of tokens) {
    const map = token.map;
    switch (token.type) {
      case 'blockquote_open':
      case 'bullet_list_open':
      case 'ordered_list_open':
      case 'list_item_open': {
        if (map === null) {
          break;
        }
        const kind = kindOf(token.type);
        const range = { startLine: map[0] + 1, endLine: Math.max(map[0] + 1, map[1]), depth };
        const block: Block | MutableListItem =
          kind === 'listItem'
            ? {
                kind,
                ...range,
                ordered: previousListOrdered(open),
                marker: markerOf(token.markup, token.info, open),
                task: null,
              }
            : { kind, ...range };
        blocks.push(block);
        open.push({ kind, block });
        if (kind === 'blockquote' || kind === 'listItem') {
          depth += 1;
        }
        awaitingItemText = kind === 'listItem';
        break;
      }
      case 'blockquote_close':
      case 'bullet_list_close':
      case 'ordered_list_close':
      case 'list_item_close': {
        const container = open.pop();
        if (container !== undefined && (container.kind === 'blockquote' || container.kind === 'listItem')) {
          depth -= 1;
        }
        break;
      }
      case 'inline': {
        if (awaitingItemText) {
          const item = open[open.length - 1]?.block;
          const box = TASK_BOX.exec(token.content);
          if (item !== undefined && item.kind === 'listItem' && box !== null) {
            (item as MutableListItem).task = box[1] === ' ' ? 'unchecked' : 'checked';
          }
          awaitingItemText = false;
        }
        break;
      }
      case 'fence':
      case 'code_block':
        pushLeaf(blocks, 'codeBlock', map, depth);
        break;
      case 'hr':
        pushLeaf(blocks, 'thematicBreak', map, depth);
        break;
      case 'paragraph_open':
        pushLeaf(blocks, 'paragraph', map, depth);
        break;
      case 'heading_open':
        pushLeaf(blocks, 'heading', map, depth);
        break;
      case 'table_open':
        pushLeaf(blocks, 'table', map, depth);
        break;
      case 'html_block':
        pushLeaf(blocks, 'html', map, depth);
        break;
      default:
        // Every other token is inline content, or a closer.
        break;
    }
  }

  blocks.sort((left, right) => left.startLine - right.startLine || left.depth - right.depth);
  return { blocks: blocks as Block[] };
}

function kindOf(type: string): BlockKind {
  switch (type) {
    case 'blockquote_open':
      return 'blockquote';
    case 'bullet_list_open':
      return 'bulletList';
    case 'ordered_list_open':
      return 'orderedList';
    default:
      return 'listItem';
  }
}

function previousListOrdered(open: readonly OpenContainer[]): boolean {
  for (let index = open.length - 1; index >= 0; index -= 1) {
    const container = open[index];
    if (container?.kind === 'orderedList') {
      return true;
    }
    if (container?.kind === 'bulletList') {
      return false;
    }
  }
  return false;
}

/** The item's marker as written: the bullet character, or the number with its delimiter. */
function markerOf(markup: string, info: string, open: readonly OpenContainer[]): string {
  return previousListOrdered(open) ? `${info}${markup}` : markup;
}

function pushLeaf(
  blocks: Array<Block | MutableListItem>,
  kind: Exclude<BlockKind, 'listItem'>,
  map: [number, number] | null,
  depth: number,
): void {
  if (map === null) {
    return;
  }
  blocks.push({ kind, startLine: map[0] + 1, endLine: Math.max(map[0] + 1, map[1]), depth });
}
