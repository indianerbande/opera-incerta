/**
 * Sheet front matter: reading and writing the head of a `.md` file.
 * SPEC.md §6.2 and §6.3.
 *
 * Two rules govern everything here, and both are data-safety rules:
 *
 * 1. **Only the top-level `opera-incerta:` key is owned.** Every other
 *    top-level key belongs to some other tool, whatever it is called.
 * 2. **Saving discards nothing.** Foreign keys survive as unmodified raw
 *    lines. Preserving foreign YAML does not require understanding it, which
 *    is why this module contains no general YAML parser.
 *
 * This module is text-free by design: failures are typed codes without display
 * text, because the core must know nothing about interface or language
 * (SPEC.md §14.3).
 */

/** The single top-level key this application owns. SPEC.md §6.2. */
export const FRONT_MATTER_NAMESPACE = 'opera-incerta';

/** The delimiter line of a front matter block. */
const MARKER = '---';

/** Indentation this module writes for owned fields. */
const OWNED_INDENT = '  ';

/** Line ending of the parsed document, preserved across a round trip. */
export type LineEnding = '\n' | '\r\n';

/** The fields the application owns, all nested under the namespace key. */
export interface SheetMetadata {
  readonly title?: string;
  readonly topic?: string;
  readonly keywords?: readonly string[];
  readonly status?: string;
  readonly category?: string;
  readonly notes?: string;
}

/** A parsed sheet: owned metadata, everything foreign, and the text. */
export interface Sheet {
  readonly metadata: SheetMetadata;
  /**
   * Lines inside the owned block whose keys this version does not know,
   * carried through verbatim so that an older build cannot delete a field a
   * newer build wrote. SPEC.md §6.2.
   */
  readonly unknownOwnedLines: readonly string[];
  /** Foreign front matter, as unmodified raw lines in their original order. */
  readonly foreignLines: readonly string[];
  /** Everything after the closing marker. */
  readonly body: string;
  readonly lineEnding: LineEnding;
}

/**
 * Stable diagnostic codes. The renderer maps them to localized text; this
 * module never produces a message (SPEC.md §16, §14.3).
 */
export type SheetDiagnosticCode =
  /** A front matter block was opened but never closed. */
  | 'front-matter/unterminated'
  /** The owned key appears more than once; which one is ours is unknowable. */
  | 'front-matter/namespace-duplicated'
  /** The owned key carries a scalar or a sequence instead of a mapping. */
  | 'front-matter/namespace-not-a-mapping';

export interface SheetDiagnostic {
  readonly code: SheetDiagnosticCode;
  /** One-based line number in the file. */
  readonly line: number;
}

export interface ParsedSheet {
  readonly sheet: Sheet;
  readonly diagnostics: readonly SheetDiagnostic[];
  /**
   * False when the file must not be written back. The application reports the
   * diagnostics and leaves the file alone rather than guessing (SPEC.md §6.2).
   */
  readonly writable: boolean;
}

/** Reads a `.md` file into a {@link Sheet}. Never throws on malformed input. */
export function parseSheet(text: string): ParsedSheet {
  const lineEnding: LineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  if (lines[0] !== MARKER) {
    return {
      sheet: emptySheet(text, lineEnding),
      diagnostics: [],
      writable: true,
    };
  }

  const closingIndex = lines.indexOf(MARKER, 1);
  if (closingIndex === -1) {
    // The whole file stays the body: nothing is lost, and nothing is invented.
    return {
      sheet: emptySheet(text, lineEnding),
      diagnostics: [{ code: 'front-matter/unterminated', line: 1 }],
      writable: false,
    };
  }

  const frontLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join(lineEnding);
  const blocks = splitTopLevelBlocks(frontLines);

  const owned = blocks.filter((block) => block.key === FRONT_MATTER_NAMESPACE);
  const foreignLines = blocks
    .filter((block) => block.key !== FRONT_MATTER_NAMESPACE)
    .flatMap((block) => block.lines);

  if (owned.length > 1) {
    const second = owned[1];
    return {
      // Every line is foreign here: nothing may be rewritten as ours.
      sheet: {
        metadata: {},
        unknownOwnedLines: [],
        foreignLines: frontLines,
        body,
        lineEnding,
      },
      diagnostics: [
        {
          code: 'front-matter/namespace-duplicated',
          line: (second?.startIndex ?? 0) + 2,
        },
      ],
      writable: false,
    };
  }

  const ownedBlock = owned[0];
  if (ownedBlock === undefined) {
    return {
      sheet: { metadata: {}, unknownOwnedLines: [], foreignLines, body, lineEnding },
      diagnostics: [],
      writable: true,
    };
  }

  const mapping = readOwnedMapping(ownedBlock.lines);
  if (mapping === null) {
    return {
      sheet: {
        metadata: {},
        unknownOwnedLines: [],
        foreignLines: frontLines,
        body,
        lineEnding,
      },
      diagnostics: [
        {
          code: 'front-matter/namespace-not-a-mapping',
          line: ownedBlock.startIndex + 2,
        },
      ],
      writable: false,
    };
  }

  return {
    sheet: {
      metadata: mapping.metadata,
      unknownOwnedLines: mapping.unknownLines,
      foreignLines: [...foreignLines, ...mapping.trailingBlankLines],
      body,
      lineEnding,
    },
    diagnostics: [],
    writable: true,
  };
}

/**
 * Writes a {@link Sheet} back to file text.
 *
 * Owned fields are regenerated in a fixed order, so identical metadata always
 * produces identical bytes. Foreign lines are copied verbatim. A sheet with
 * neither owned nor foreign front matter is written without a block at all,
 * so the format stays additive (SPEC.md §6.2).
 */
export function serializeSheet(sheet: Sheet): string {
  const ownedLines = formatOwnedBlock(sheet.metadata, sheet.unknownOwnedLines);
  const frontLines = [...ownedLines, ...sheet.foreignLines];

  if (frontLines.length === 0) {
    return sheet.body;
  }
  return [MARKER, ...frontLines, MARKER, sheet.body].join(sheet.lineEnding);
}

function emptySheet(text: string, lineEnding: LineEnding): Sheet {
  return {
    metadata: {},
    unknownOwnedLines: [],
    foreignLines: [],
    body: text,
    lineEnding,
  };
}

interface TopLevelBlock {
  /** The key name, or null for a comment, a blank line, or an unkeyed line. */
  readonly key: string | null;
  readonly startIndex: number;
  readonly lines: readonly string[];
}

/**
 * Groups front matter lines by top-level key.
 *
 * Indentation decides ownership: only a non-indented line opens a new
 * top-level key, so a nested `title:` — or even a nested `opera-incerta:` —
 * belongs to whichever foreign key encloses it (SPEC.md §6.3).
 */
function splitTopLevelBlocks(frontLines: readonly string[]): readonly TopLevelBlock[] {
  const blocks: TopLevelBlock[] = [];
  let index = 0;

  while (index < frontLines.length) {
    const line = frontLines[index] ?? '';
    const start = index;
    const key = topLevelKeyOf(line);
    index += 1;

    while (index < frontLines.length) {
      const next = frontLines[index] ?? '';
      if (next.trim() !== '' && !/^\s/.test(next)) {
        break;
      }
      index += 1;
    }

    blocks.push({ key, startIndex: start, lines: frontLines.slice(start, index) });
  }

  return blocks;
}

/** The key of a non-indented `key:` line, or null for anything else. */
function topLevelKeyOf(line: string): string | null {
  if (/^\s/.test(line) || line.trim() === '' || line.trimStart().startsWith('#')) {
    return null;
  }
  const match = /^([^:]+):(?:\s|$)/.exec(line);
  return match === null ? null : (match[1] ?? '').trim();
}

interface OwnedMapping {
  readonly metadata: SheetMetadata;
  readonly unknownLines: readonly string[];
  /** Blank lines after the last field; kept so the file round-trips exactly. */
  readonly trailingBlankLines: readonly string[];
}

/**
 * Reads the children of the owned key. Returns null when the value is not a
 * mapping — a scalar on the key line, or a sequence beneath it.
 */
function readOwnedMapping(blockLines: readonly string[]): OwnedMapping | null {
  const keyLine = blockLines[0] ?? '';
  const inlineValue = keyLine.slice(keyLine.indexOf(':') + 1).trim();
  if (inlineValue !== '' && !inlineValue.startsWith('#')) {
    return null;
  }

  const children = [...blockLines.slice(1)];
  const trailingBlankLines: string[] = [];
  while (children.length > 0 && (children[children.length - 1] ?? '').trim() === '') {
    trailingBlankLines.unshift(children.pop() ?? '');
  }
  if (children.length === 0) {
    // `opera-incerta:` with no children is an empty mapping, which is the state
    // a freshly created block has. It is not an error.
    return { metadata: {}, unknownLines: [], trailingBlankLines };
  }

  const baseIndent = indentOf(children[0] ?? '');
  if ((children[0] ?? '').trim().startsWith('- ')) {
    return null;
  }

  let metadata: SheetMetadata = {};
  const unknownLines: string[] = [];
  let index = 0;

  while (index < children.length) {
    const line = children[index] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const match = /^(\s*)([^:]+):(.*)$/.exec(line);
    if (match === null || indentOf(line) !== baseIndent) {
      unknownLines.push(reindent(line, baseIndent));
      index += 1;
      continue;
    }

    const field = (match[2] ?? '').trim();
    const rest = (match[3] ?? '').trim();
    const groupEnd = endOfGroup(children, index, baseIndent);
    const group = children.slice(index, groupEnd);

    const applied = applyKnownField(metadata, field, rest, group, baseIndent);
    if (applied === null) {
      for (const groupLine of group) {
        unknownLines.push(reindent(groupLine, baseIndent));
      }
    } else {
      metadata = applied;
    }
    index = groupEnd;
  }

  return { metadata, unknownLines, trailingBlankLines };
}

/** Index just past the lines belonging to the field starting at `start`. */
function endOfGroup(
  children: readonly string[],
  start: number,
  baseIndent: number,
): number {
  let index = start + 1;
  while (index < children.length) {
    const line = children[index] ?? '';
    if (line.trim() !== '' && indentOf(line) <= baseIndent) {
      break;
    }
    index += 1;
  }
  // Blank lines at the end of a group belong to the document, not the field.
  while (index > start + 1 && (children[index - 1] ?? '').trim() === '') {
    index -= 1;
  }
  return index;
}

/**
 * Applies one known field, or returns null when the key is not one this
 * version owns — in which case the caller preserves its lines verbatim.
 */
function applyKnownField(
  metadata: SheetMetadata,
  field: string,
  rest: string,
  group: readonly string[],
  baseIndent: number,
): SheetMetadata | null {
  switch (field) {
    case 'title':
    case 'topic':
    case 'status':
    case 'category':
      return group.length === 1
        ? { ...metadata, [field]: parseScalar(rest) }
        : null;
    case 'keywords':
      return group.length === 1 ? { ...metadata, keywords: parseInlineList(rest) } : null;
    case 'notes':
      return { ...metadata, notes: parseBlockText(rest, group, baseIndent) };
    default:
      return null;
  }
}

function indentOf(line: string): number {
  return (/^\s*/.exec(line)?.[0] ?? '').length;
}

function reindent(line: string, baseIndent: number): string {
  const current = indentOf(line);
  const relative = Math.max(0, current - baseIndent);
  return `${OWNED_INDENT}${' '.repeat(relative)}${line.trimStart()}`;
}

/** Removes YAML quoting from a scalar. Unquoted values are used as they are. */
function parseScalar(raw: string): string {
  const value = stripComment(raw).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** A trailing ` # comment` is not part of an unquoted scalar. */
function stripComment(raw: string): string {
  if (raw.startsWith('"') || raw.startsWith("'")) {
    return raw;
  }
  const index = raw.indexOf(' #');
  return index === -1 ? raw : raw.slice(0, index);
}

function parseInlineList(raw: string): readonly string[] {
  const value = raw.trim();
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return value === '' ? [] : [parseScalar(value)];
  }
  const inner = value.slice(1, -1).trim();
  if (inner === '') {
    return [];
  }
  return splitTopLevelCommas(inner).map((item) => parseScalar(item));
}

/** Splits on commas that are not inside quotes. */
function splitTopLevelCommas(value: string): readonly string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const character of value) {
    if (quote !== null) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

/**
 * Reads a multi-line value. `|` keeps one trailing newline, `|-` strips it, so
 * a value round-trips exactly either way.
 */
function parseBlockText(rest: string, group: readonly string[], baseIndent: number): string {
  const indicator = rest.trim();
  if (!indicator.startsWith('|')) {
    return parseScalar(rest);
  }

  const contentLines = group.slice(1).map((line) => line.slice(baseIndent + OWNED_INDENT.length));
  const text = contentLines.join('\n');
  return indicator.startsWith('|-') ? text : `${text}\n`;
}

function formatOwnedBlock(
  metadata: SheetMetadata,
  unknownOwnedLines: readonly string[],
): readonly string[] {
  const fields: string[] = [];

  if (metadata.title !== undefined) {
    fields.push(`${OWNED_INDENT}title: ${formatScalar(metadata.title)}`);
  }
  if (metadata.topic !== undefined) {
    fields.push(`${OWNED_INDENT}topic: ${formatScalar(metadata.topic)}`);
  }
  if (metadata.keywords !== undefined) {
    fields.push(`${OWNED_INDENT}keywords: ${formatInlineList(metadata.keywords)}`);
  }
  if (metadata.status !== undefined) {
    fields.push(`${OWNED_INDENT}status: ${formatScalar(metadata.status)}`);
  }
  if (metadata.category !== undefined) {
    fields.push(`${OWNED_INDENT}category: ${formatScalar(metadata.category)}`);
  }
  if (metadata.notes !== undefined) {
    fields.push(...formatBlockText('notes', metadata.notes));
  }
  fields.push(...unknownOwnedLines);

  return fields.length === 0 ? [] : [`${FRONT_MATTER_NAMESPACE}:`, ...fields];
}

const NEEDS_QUOTES = /^$|^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|[\n\r]/;
const LOOKS_LIKE_OTHER_TYPE = /^(?:true|false|yes|no|on|off|null|~|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)$/i;

/**
 * Quotes a value whenever leaving it bare would change its meaning — for
 * another tool or for a human reader, not only for this parser. A title of
 * `2024` must not come back as a number.
 */
function formatScalar(value: string): string {
  if (NEEDS_QUOTES.test(value) || LOOKS_LIKE_OTHER_TYPE.test(value)) {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, '\\n');
    return `"${escaped}"`;
  }
  return value;
}

function formatInlineList(values: readonly string[]): string {
  return `[${values.map((value) => formatListItem(value)).join(', ')}]`;
}

function formatListItem(value: string): string {
  return value.includes(',') || value.includes(']')
    ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : formatScalar(value);
}

function formatBlockText(field: string, value: string): readonly string[] {
  const endsWithNewline = value.endsWith('\n');
  const indicator = endsWithNewline ? '|' : '|-';
  const content = endsWithNewline ? value.slice(0, -1) : value;
  const contentIndent = `${OWNED_INDENT}${OWNED_INDENT}`;

  return [
    `${OWNED_INDENT}${field}: ${indicator}`,
    ...content.split('\n').map((line) => (line === '' ? '' : `${contentIndent}${line}`)),
  ];
}
