/**
 * The manuscript as one document. specification.md §15.2.
 *
 * Pure rules: a library and the bodies of its sheets go in, one Markdown text
 * comes out. Nothing here reads a file or knows a format — assembling is the
 * part every export format shares, and it is the part worth testing without a
 * window.
 */
import { ancestorPaths, type GroupEntry, type LibraryEntry } from '@opera-incerta/core';
import { parseBlocks } from '@opera-incerta/markdown';

/** The deepest heading Markdown has; a shift never goes past it. */
const MAX_HEADING_LEVEL = 6;

/**
 * One piece of the assembled document, in the order the library records.
 *
 * A group becomes a heading at its own depth; a sheet contributes its body,
 * with its headings moved down by the depth of the group holding it.
 */
export interface DocumentPiece {
  readonly kind: 'group' | 'sheet';
  readonly relativePath: string;
  readonly displayName: string;
  /**
   * Groups below the root that enclose this piece. The root is 0, so a group
   * directly inside it is 1 and becomes `#`, and a sheet beside that group is
   * also 1 and keeps its own heading levels.
   */
  readonly depth: number;
}

/**
 * Every piece of the document, in the library's recorded order. specification.md §15.2.
 *
 * The root group is the document and never becomes a heading of its own.
 * With `from` naming a sheet, the document begins there — and the groups
 * **above** that sheet are put in front of it, so an excerpt keeps its place
 * in the book rather than beginning in mid-air.
 *
 * A `from` that names nothing yields nothing: an export of a sheet that is
 * not there is empty, not the whole manuscript by accident.
 */
export function documentPieces(root: GroupEntry, from: string | null): readonly DocumentPiece[] {
  const all = piecesOf(root, 0);
  if (from === null) {
    return all;
  }

  const start = all.findIndex((piece) => piece.kind === 'sheet' && piece.relativePath === from);
  if (start === -1) {
    return [];
  }

  const ancestors = new Set(ancestorPaths(from));
  const above = all
    .slice(0, start)
    .filter((piece) => piece.kind === 'group' && ancestors.has(piece.relativePath));
  return [...above, ...all.slice(start)];
}

/** Depth-first, in the order the children stand in. */
function piecesOf(entry: LibraryEntry, depth: number): readonly DocumentPiece[] {
  if (entry.kind === 'sheet') {
    return [
      {
        kind: 'sheet',
        relativePath: entry.relativePath,
        displayName: entry.displayName,
        depth,
      },
    ];
  }

  const children = entry.children.flatMap((child) => piecesOf(child, depth + 1));
  // The root is the document itself, not a chapter in it.
  return depth === 0
    ? children
    : [
        { kind: 'group', relativePath: entry.relativePath, displayName: entry.displayName, depth },
        ...children,
      ];
}

/**
 * A piece with its text resolved: what actually goes into the document.
 *
 * Both formats are built from this one list rather than each assembling the
 * library for itself — a Markdown file and a PDF that disagreed about what
 * the document is would be two documents.
 */
export type DocumentPart =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'sheet'; readonly relativePath: string; readonly markdown: string };

/**
 * The pieces with their bodies in place. specification.md §15.2.
 *
 * `bodies` holds each sheet's body **without its front matter** — the codec
 * of §6.3 hands those out separately, which is what makes §15.1's rule
 * ("export modules strip front matter") a matter of using the right value
 * rather than of removing something afterwards.
 *
 * A sheet whose body is missing or empty drops out: one unreadable sheet must
 * not cost the other two hundred (§16), and an empty one has nothing to say.
 */
export function documentParts(
  pieces: readonly DocumentPiece[],
  bodies: ReadonlyMap<string, string>,
): readonly DocumentPart[] {
  const parts: DocumentPart[] = [];
  for (const piece of pieces) {
    if (piece.kind === 'group') {
      parts.push({
        kind: 'heading',
        level: Math.min(piece.depth, MAX_HEADING_LEVEL),
        text: piece.displayName,
      });
      continue;
    }
    const body = bodies.get(piece.relativePath);
    if (body === undefined || body.trim() === '') {
      continue;
    }
    // A sheet beside a group at depth 1 keeps its own levels; one inside that
    // group moves down by the one heading the group contributed.
    parts.push({
      kind: 'sheet',
      relativePath: piece.relativePath,
      markdown: shiftHeadings(body.trim(), piece.depth - 1),
    });
  }
  return parts;
}

/**
 * The parts as one Markdown text — the substrate of specification.md §15.2.
 *
 * Each part is trimmed here rather than trusted to arrive trimmed: exactly
 * one blank line stands between two parts, whatever the sheets ended with,
 * and the file ends with exactly one newline.
 */
export function assembleMarkdown(parts: readonly DocumentPart[]): string {
  const texts = parts
    .map((part) =>
      part.kind === 'heading' ? `${'#'.repeat(part.level)} ${part.text}` : part.markdown.trim(),
    )
    .filter((text) => text !== '');
  return texts.length === 0 ? '' : `${texts.join('\n\n')}\n`;
}

/**
 * Moves every ATX heading down by `by` levels, capped at six.
 *
 * It reads the **block structure** rather than the lines, because a `#` at
 * the start of a line inside a fenced block is text — shifting it would edit
 * the author's code sample. Setext headings (`===` under a line) carry no
 * prefix to extend and are left as they are; the editor writes ATX.
 */
export function shiftHeadings(markdown: string, by: number): string {
  if (by <= 0) {
    return markdown;
  }

  const headingLines = new Set<number>();
  for (const block of parseBlocks(markdown).blocks) {
    if (block.kind === 'heading') {
      headingLines.add(block.startLine);
    }
  }
  if (headingLines.size === 0) {
    return markdown;
  }

  const lines = markdown.split('\n');
  return lines
    .map((line, index) => {
      if (!headingLines.has(index + 1)) {
        return line;
      }
      const prefix = /^(#{1,6})(\s)/u.exec(line);
      if (prefix === null) {
        return line;
      }
      const level = Math.min((prefix[1] as string).length + by, MAX_HEADING_LEVEL);
      return `${'#'.repeat(level)}${prefix[2] as string}${line.slice((prefix[1] as string).length + 1)}`;
    })
    .join('\n');
}
