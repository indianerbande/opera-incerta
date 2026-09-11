/**
 * The block structure of a document, as the core owns it. specification.md §10.7,
 * §5.4.
 *
 * A parser produces this; nothing of the parser's own types comes along
 * (`conventions.md` C-A6). Lines are one-based and ranges inclusive, the way
 * every other line number in the core is. The translation from a parser's
 * tokens lives in `@opera-incerta/markdown`; the rules that turn this into a
 * presentation live here, beside the display model.
 */

export type BlockKind =
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'codeBlock'
  | 'thematicBreak'
  | 'paragraph'
  | 'heading'
  | 'table'
  | 'html';

export type TaskState = 'checked' | 'unchecked';

interface BlockBase {
  /** One-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
  /** How many containers (block quotes, list items) enclose it. */
  readonly depth: number;
}

export interface BlockSpan extends BlockBase {
  /** Every kind but the list item, which carries more and is its own type. */
  readonly kind: Exclude<BlockKind, 'listItem'>;
}

/** A list item, with what its first line begins with. */
export interface ListItemSpan extends BlockBase {
  readonly kind: 'listItem';
  readonly ordered: boolean;
  /** The marker as written — `-`, `*`, `+`, `1.`, `2)` — without the space after it. */
  readonly marker: string;
  /**
   * A task list item, when the item's text begins with `[ ]` or `[x]`. The
   * parser knows no task lists; this is the translation's own rule
   * (specification.md §10.7).
   */
  readonly task: TaskState | null;
}

export type Block = BlockSpan | ListItemSpan;

export interface BlockModel {
  readonly blocks: readonly Block[];
}

export const EMPTY_BLOCK_MODEL: BlockModel = { blocks: [] };

export function isListItem(block: Block): block is ListItemSpan {
  return block.kind === 'listItem';
}

/** The innermost block of a kind on a line, or null. */
export function blockAt(model: BlockModel, line: number, kind: BlockKind): Block | null {
  let found: Block | null = null;
  for (const block of model.blocks) {
    if (block.kind === kind && block.startLine <= line && line <= block.endLine) {
      if (found === null || block.depth >= found.depth) {
        found = block;
      }
    }
  }
  return found;
}

/** How many block quotes enclose a line. */
export function quoteDepth(model: BlockModel, line: number): number {
  return model.blocks.filter(
    (block) => block.kind === 'blockquote' && block.startLine <= line && line <= block.endLine,
  ).length;
}
