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
  | 'front-matter/namespace-not-a-mapping'
  /**
   * An owned field is written in a YAML shape this reader does not read — a
   * folded block, a keep indicator, a mapping under a scalar field. Writing
   * would regenerate the field beside the original, and a mapping with the
   * same key twice is not YAML for anyone.
   */
  | 'front-matter/field-unreadable'
  /** An owned field appears twice; which one is meant is unknowable. */
  | 'front-matter/field-duplicated'
  /**
   * A merge has left both versions in the file, with markers between them.
   * Not a parse problem, but the same consequence: the sheet is shown and
   * never written back (SPEC.md §12).
   */
  | 'merge/conflicted';

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
  const frontLines = lines.slice(1, closingIndex === -1 ? lines.length : closingIndex);
  const blocks = splitTopLevelBlocks(frontLines);

  // Front matter is a mapping. A block with no key in it — a poem between two
  // rules, a heading under a rule — is Markdown that happens to start with a
  // thematic break, and it belongs in the editor, not in a metadata area
  // (SPEC.md §6.2). The empty block is the exception: `---` over `---` is a
  // front matter block with nothing in it yet.
  const hasContent = frontLines.some((line) => line.trim() !== '');
  const hasKey = blocks.some((block) => block.key !== null);
  if (hasContent && !hasKey) {
    return {
      sheet: emptySheet(text, lineEnding),
      diagnostics: [],
      writable: true,
    };
  }

  if (closingIndex === -1) {
    // The whole file stays the body: nothing is lost, and nothing is invented.
    return {
      sheet: emptySheet(text, lineEnding),
      diagnostics: [{ code: 'front-matter/unterminated', line: 1 }],
      writable: false,
    };
  }

  const body = lines.slice(closingIndex + 1).join(lineEnding);

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

  const read = readOwnedMapping(ownedBlock.lines);
  if ('code' in read) {
    // Nothing is claimed as ours: every line of the block stays foreign, so
    // even a mistaken write could not regenerate a field over the original.
    return {
      sheet: {
        metadata: {},
        unknownOwnedLines: [],
        foreignLines: frontLines,
        body,
        lineEnding,
      },
      // Marker line, then the block's first line: +2 turns the offset into a
      // one-based file line.
      diagnostics: [{ code: read.code, line: ownedBlock.startIndex + read.offset + 2 }],
      writable: false,
    };
  }

  return {
    sheet: {
      metadata: read.metadata,
      unknownOwnedLines: read.unknownLines,
      foreignLines: [...foreignLines, ...read.trailingBlankLines],
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
  const ahead = leadingContinuation(sheet.foreignLines);
  const frontLines = [
    ...sheet.foreignLines.slice(0, ahead),
    ...ownedLines,
    ...sheet.foreignLines.slice(ahead),
  ];

  if (frontLines.length === 0) {
    return sheet.body;
  }
  return [MARKER, ...frontLines, MARKER, sheet.body].join(sheet.lineEnding);
}

/**
 * How many leading foreign lines must stay ahead of the owned block.
 *
 * A foreign line that is indented has no top-level key of its own — it
 * continued whatever stood above it in the file. Written after the owned
 * block, it would continue *that*, and the next read would take it for an
 * owned field. The generated-document test found this: a front matter whose
 * first lines were indented came back with a duplicated field. So a run of
 * indented lines at the head, with the blank lines among them, keeps its place
 * in front; the owned block goes before the first line that can stand alone.
 */
function leadingContinuation(foreignLines: readonly string[]): number {
  let end = 0;
  let sawContent = false;
  for (const line of foreignLines) {
    if (line.trim() !== '' && !/^\s/.test(line)) {
      break;
    }
    end += 1;
    sawContent ||= line.trim() !== '';
  }
  return sawContent ? end : 0;
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

/** Why the owned block could not be read, and on which of its lines. */
interface OwnedFailure {
  readonly code: SheetDiagnosticCode;
  /** Zero-based offset into the block's lines. */
  readonly offset: number;
}

/**
 * Reads the children of the owned key.
 *
 * Fails when the value is not a mapping — a scalar on the key line, or a
 * sequence beneath it — and when a field it knows is written in a shape it
 * cannot read, or twice. Both of the latter used to be demoted to "unknown"
 * and carried through verbatim, which honoured "saving discards nothing" to
 * the letter and broke it in spirit: the writer regenerated the field beside
 * the original, and the file left with the same key twice in one mapping.
 */
function readOwnedMapping(blockLines: readonly string[]): OwnedMapping | OwnedFailure {
  const keyLine = blockLines[0] ?? '';
  const inlineValue = stripComment(keyLine.slice(keyLine.indexOf(':') + 1)).trim();
  // `{}` is the empty mapping spelled inline; anything else on the key line
  // is a scalar, and a scalar is not a mapping.
  if (inlineValue !== '' && !/^\{\s*\}$/.test(inlineValue)) {
    return { code: 'front-matter/namespace-not-a-mapping', offset: 0 };
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
  if (inlineValue !== '') {
    // `{}` with children under it: the children belong to nothing.
    return { code: 'front-matter/namespace-not-a-mapping', offset: 0 };
  }

  const baseIndent = indentOf(children[0] ?? '');
  if ((children[0] ?? '').trim().startsWith('- ')) {
    return { code: 'front-matter/namespace-not-a-mapping', offset: 0 };
  }

  let metadata: SheetMetadata = {};
  const unknownLines: string[] = [];
  const seen = new Set<string>();
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

    if (isOwnedField(field)) {
      if (seen.has(field)) {
        return { code: 'front-matter/field-duplicated', offset: index + 1 };
      }
      seen.add(field);
      const applied = applyKnownField(metadata, field, rest, group, baseIndent);
      if (applied === null) {
        return { code: 'front-matter/field-unreadable', offset: index + 1 };
      }
      metadata = applied;
    } else {
      for (const groupLine of group) {
        unknownLines.push(reindent(groupLine, baseIndent));
      }
    }
    index = groupEnd;
  }

  return { metadata, unknownLines, trailingBlankLines };
}

const OWNED_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'topic',
  'keywords',
  'status',
  'category',
  'notes',
]);

function isOwnedField(field: string): field is keyof SheetMetadata {
  return OWNED_FIELDS.has(field);
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
 * Applies one owned field, or returns null when it is written in a shape this
 * reader does not read. What it reads: a scalar on the line for the single
 * fields; an inline list or a block sequence for `keywords`; a scalar or a
 * literal block (`|`, `|-`) for `notes`. Everything else — a folded block, a
 * keep indicator, a mapping under a scalar field — is refused rather than
 * guessed at.
 */
function applyKnownField(
  metadata: SheetMetadata,
  field: keyof SheetMetadata,
  rest: string,
  group: readonly string[],
  baseIndent: number,
): SheetMetadata | null {
  switch (field) {
    case 'title':
    case 'topic':
    case 'status':
    case 'category': {
      const value = group.length === 1 ? parseScalar(rest) : null;
      return value === null ? null : { ...metadata, [field]: value };
    }
    case 'keywords': {
      const keywords =
        group.length === 1 ? parseInlineList(rest) : parseBlockList(rest, group, baseIndent);
      return keywords === null ? null : { ...metadata, keywords };
    }
    case 'notes': {
      const notes = parseBlockText(rest, group, baseIndent);
      return notes === null ? null : { ...metadata, notes };
    }
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

/**
 * Removes YAML quoting from a scalar. Unquoted values are used as they are;
 * a block indicator (`|`, `>`) on a single-field line is not a value at all.
 */
function parseScalar(raw: string): string | null {
  const value = stripComment(raw).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuoted(value.slice(1, -1));
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[|>]/.test(value)) {
    return null;
  }
  return value;
}

/**
 * One pass over the escapes, because sequential replaces read each other's
 * output: `\\n` — a backslash and an `n` — became a newline once the `\\`
 * replacement ran after the `\n` one.
 */
function unescapeDoubleQuoted(inner: string): string {
  return inner.replace(/\\(.)/g, (whole, escaped: string) => {
    switch (escaped) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case '"':
        return '"';
      case '\\':
        return '\\';
      default:
        return whole;
    }
  });
}

/**
 * A trailing ` # comment` is not part of a value — unless it is inside a
 * quoted run. The standard oracle found the version that looked for ` #` in
 * the whole line: `keywords: ["a #comment", plain]`, which the writer itself
 * produces, read back as `["a`. A quote opens a run only where a value or a
 * list item starts, the same rule `splitTopLevelCommas` follows, so a quote
 * in the middle of a plain item (`it's`) is a character.
 */
function stripComment(raw: string): string {
  let quote: '"' | "'" | null = null;
  let atValueStart = true;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quote !== null) {
      if (quote === '"' && character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (atValueStart && (character === '"' || character === "'")) {
      quote = character;
      atValueStart = false;
      continue;
    }
    if (character === '#' && index > 0 && /\s/.test(raw[index - 1] ?? '')) {
      return raw.slice(0, index - 1);
    }
    atValueStart =
      character === '[' || character === ',' || (atValueStart && /\s/.test(character ?? ''));
  }
  return raw;
}

function parseInlineList(raw: string): readonly string[] | null {
  const value = stripComment(raw).trim();
  if (!value.startsWith('[') || !value.endsWith(']')) {
    if (value === '') {
      return [];
    }
    const single = parseScalar(value);
    return single === null ? null : [single];
  }
  const inner = value.slice(1, -1).trim();
  if (inner === '') {
    return [];
  }
  const items = splitTopLevelCommas(inner).map((item) => parseScalar(item));
  return items.every((item): item is string => item !== null) ? items : null;
}

/**
 * Reads `keywords:` written as a block sequence — the shape a hand or
 * another tool most often writes:
 *
 *     keywords:
 *       - draft
 *       - scene
 *
 * Every line must be an item; a nested mapping or a further-indented
 * continuation is a shape this reader does not read.
 */
function parseBlockList(
  rest: string,
  group: readonly string[],
  baseIndent: number,
): readonly string[] | null {
  if (stripComment(rest).trim() !== '') {
    return null;
  }
  const items: string[] = [];
  for (const line of group.slice(1)) {
    if (line.trim() === '') {
      continue;
    }
    const match = /^(\s*)-(?:\s+(.*))?$/.exec(line);
    if (match === null || indentOf(line) <= baseIndent) {
      return null;
    }
    const item = parseScalar(match[2] ?? '');
    if (item === null) {
      return null;
    }
    items.push(item);
  }
  return items;
}

/**
 * Splits on commas that are not inside quotes.
 *
 * A quote counts only at the start of an item. The writer quotes whole items
 * or not at all, so a quote in the middle of one — `it's`, `o'clock` — is a
 * character, and treating it as an opening quote once joined three keywords
 * into one.
 */
function splitTopLevelCommas(value: string): readonly string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let atItemStart = true;

  for (const character of value) {
    if (quote !== null) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (atItemStart && (character === '"' || character === "'")) {
      quote = character;
      current += character;
      atItemStart = false;
      continue;
    }
    if (character === ',') {
      parts.push(current);
      current = '';
      atItemStart = true;
      continue;
    }
    if (character !== ' ' && character !== '\t') {
      atItemStart = false;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

/**
 * Reads a multi-line value. `|` keeps one trailing newline, `|-` strips it, so
 * a value round-trips exactly either way. The content's indentation is read
 * from its first line, as YAML does, rather than assumed to be the writer's
 * own: a hand-written block indented by three spaces lost its first character
 * per line when the reader sliced a fixed two.
 *
 * `|+`, an explicit indentation indicator, and the folded `>` are shapes this
 * reader does not read.
 */
function parseBlockText(
  rest: string,
  group: readonly string[],
  baseIndent: number,
): string | null {
  const indicator = stripComment(rest).trim();
  if (indicator === '|' || indicator === '|-') {
    const content = group.slice(1);
    const first = content.find((line) => line.trim() !== '');
    const contentIndent =
      first === undefined ? baseIndent + OWNED_INDENT.length : indentOf(first);
    if (contentIndent <= baseIndent) {
      return null;
    }
    const text = content
      .map((line) => (line.trim() === '' ? '' : line.slice(contentIndent)))
      .join('\n');
    return indicator === '|-' ? text : `${text}\n`;
  }
  return group.length === 1 ? parseScalar(rest) : null;
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

const NEEDS_QUOTES = /^$|^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|:\s|:$|\s#|[\n\r]/;
/**
 * What another YAML reader would take for something other than a string.
 * Wider than YAML 1.2's core schema on purpose: a tool built on YAML 1.1 reads
 * `y`, `1:20`, `1_000` and a date as a boolean, a sexagesimal, an integer and
 * a timestamp, and a title is none of those. The standard oracle found `0x1F`
 * read as 31 (`TESTING.md` §2.11).
 */
const LOOKS_LIKE_OTHER_TYPE = new RegExp(
  '^(?:' +
    [
      'true|false|yes|no|y|n|on|off|null|~',
      '[-+]?0x[0-9a-f_]+',
      '[-+]?0o?[0-7_]+',
      '[-+]?0b[01_]+',
      '[-+]?[0-9][0-9_]*(?:\\.[0-9_]*)?(?:e[-+]?[0-9]+)?',
      '[-+]?\\.[0-9_]+(?:e[-+]?[0-9]+)?',
      '[-+]?\\.(?:inf|nan)',
      '[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\\.[0-9_]*)?',
      '[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[t ].*)?',
    ].join('|') +
    ')$',
  'i',
);

/**
 * Quotes a value whenever leaving it bare would change its meaning — for
 * another tool or for a human reader, not only for this parser. A title of
 * `2024` must not come back as a number.
 */
function formatScalar(value: string): string {
  return NEEDS_QUOTES.test(value) || LOOKS_LIKE_OTHER_TYPE.test(value)
    ? quoteScalar(value)
    : value;
}

/** The one escaping, so a list item and a field cannot disagree about it. */
function quoteScalar(value: string): string {
  const escaped = value.replace(/[\\"\t\r\n]|\r\n/g, (character) => {
    switch (character) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\t':
        return '\\t';
      default:
        return '\\n';
    }
  });
  return `"${escaped}"`;
}

function formatInlineList(values: readonly string[]): string {
  return `[${values.map((value) => formatListItem(value)).join(', ')}]`;
}

/**
 * An item is quoted for the same reasons a scalar is, and also when a comma
 * or a bracket would end it early. A quote *inside* an item needs nothing:
 * the reader honours a quote only at the start of an item.
 */
function formatListItem(value: string): string {
  return value.includes(',') || value.includes(']') ? quoteScalar(value) : formatScalar(value);
}

/**
 * Writes `notes` as a literal block, or as a quoted scalar where a block
 * cannot carry the text. YAML reads a block's indentation from its first
 * non-empty line, so a text whose first line begins with whitespace would
 * need an indentation indicator — a shape the reader refuses — and a line
 * holding only spaces reads back empty. The standard oracle found both
 * (`TESTING.md` §2.11); the reader accepts a quoted scalar with escaped
 * newlines, so that is the fallback.
 */
function formatBlockText(field: string, value: string): readonly string[] {
  const lines = value.split('\n');
  const firstText = lines.find((line) => line.trim() !== '');
  const blockCannotCarry =
    (firstText !== undefined && /^\s/.test(firstText)) ||
    lines.some((line) => line !== '' && line.trim() === '') ||
    /\r/.test(value);
  if (blockCannotCarry) {
    return [`${OWNED_INDENT}${field}: ${quoteScalar(value)}`];
  }
  const endsWithNewline = value.endsWith('\n');
  const indicator = endsWithNewline ? '|' : '|-';
  const content = endsWithNewline ? value.slice(0, -1) : value;
  const contentIndent = `${OWNED_INDENT}${OWNED_INDENT}`;

  // An empty value has no content lines: a lone `|-` reads back as the empty
  // string, and a lone `|` as one newline, without a blank line to carry.
  const contentLines =
    content === ''
      ? []
      : content.split('\n').map((line) => (line === '' ? '' : `${contentIndent}${line}`));
  return [`${OWNED_INDENT}${field}: ${indicator}`, ...contentLines];
}
