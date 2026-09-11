import { describe, expect, it } from 'vitest';
import { HtmlRenderer, Parser } from 'commonmark';
import { parse as parseYaml } from 'yaml';
import {
  displayToMarkdown,
  markdownToDisplay,
  parseSheet,
  serializeSheet,
  withHeadingLevel,
  type Sheet,
  type SheetMetadata,
} from '../src/index.js';

/**
 * The standard oracle. testing.md §2.2 asks that what the codec and the
 * display transform write is standard-conformant and readable by an
 * independent parser; the codec's own tests cannot say so, because a writer
 * and a reader that agree with each other agree just as well on a wrong
 * answer. The parser spike of 2026-09-04 (`spikes/parser-markdown`) found
 * six defects that way on its first run.
 *
 * commonmark.js is the reference implementation of CommonMark and `yaml`
 * reads YAML 1.2; both are development dependencies of this package only
 * (`dependencies.md`). Nothing of either reaches the core's public types
 * (`conventions.md` C-A6): this file translates their output into line
 * numbers and plain values before comparing.
 */

// --- YAML: what the codec writes, read by another reader --------------------

/** Scalars a naive writer would leave bare and a YAML reader would mistype. */
const AWKWARD_SCALARS: readonly string[] = [
  'Plain title',
  'Title: with a colon',
  '# looks like a comment',
  '- looks like a list',
  'yes',
  'no',
  'y',
  'true',
  'null',
  '~',
  '123',
  '1e3',
  '0x1F',
  '0o17',
  '017',
  '0b101',
  '3.14',
  '.5',
  '5.',
  '1_000',
  '1:20',
  '.inf',
  '.NaN',
  '2019-04-02',
  '',
  ' leading and trailing ',
  'tab\there',
  'line\nbreak',
  'literal \\n backslash',
  'a "quote" inside',
  "it's",
  '{not: a mapping}',
  '[not, a, list]',
  '*star',
  '&anchor',
  '!tag',
  '%directive',
  '@at',
  '`tick',
  '| pipe',
  '> fold',
  'Größe und Café — “quotes” 🌊',
  '---',
  '...',
  'key: value: nested',
  'trailing colon:',
  'a #comment',
];

function sheetWith(metadata: SheetMetadata, foreignLines: readonly string[] = []): Sheet {
  return { metadata, unknownOwnedLines: [], foreignLines, body: 'Body.\n', lineEnding: '\n' };
}

/** The lines between the two markers, as the YAML reader gets them. */
function frontMatterOf(text: string): string {
  const lines = text.split('\n');
  expect(lines[0]).toBe('---');
  return lines.slice(1, lines.indexOf('---', 1)).join('\n');
}

function isStringTree(value: unknown): boolean {
  if (typeof value === 'string') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isStringTree);
  }
  return typeof value === 'object' && value !== null && Object.values(value).every(isStringTree);
}

describe('the front matter the codec writes is YAML to an independent reader', () => {
  const sheets: SheetMetadata[] = AWKWARD_SCALARS.flatMap((scalar) => [
    { title: scalar },
    { topic: scalar, status: scalar, category: scalar },
    { keywords: [scalar, 'plain'] },
    { notes: scalar },
    { notes: `${scalar}\n\n  indented after a blank\n${scalar}` },
  ]);
  sheets.push({
    title: 'Everything',
    topic: 'all fields',
    keywords: ['a', 'b: c', ''],
    status: 'draft',
    category: 'Scene',
    notes: 'first\nsecond\n',
  });

  it(`reads back every one of ${sheets.length} generated sheets as the same strings`, () => {
    for (const metadata of sheets) {
      const written = serializeSheet(sheetWith(metadata));
      const owned = (parseYaml(frontMatterOf(written)) as Record<string, unknown>)['opera-incerta'];
      expect(owned, JSON.stringify(metadata)).toEqual(metadata);
      expect(isStringTree(owned), JSON.stringify(metadata)).toBe(true);
      // And the codec agrees with the independent reader, not only with itself.
      expect(parseSheet(written).sheet.metadata, JSON.stringify(metadata)).toEqual(metadata);
    }
  });

  it('keeps foreign front matter of every shape readable across a round trip', () => {
    const foreignLines = [
      'layout: post',
      'title: A Jekyll Title',
      'date: 2019-04-02',
      'tags:',
      '  - travel',
      '  - draft',
      'seo:',
      '  title: Nested title',
      '  description: >',
      '    A folded description that',
      '    continues on a second line.',
      'published: false',
      '# a comment the other tool left behind',
      'aliases: [harbour, quay]',
    ];
    const expected = parseYaml(foreignLines.join('\n')) as Record<string, unknown>;
    const written = serializeSheet(
      sheetWith({ title: 'Ours', keywords: ['a #b'] }, foreignLines),
    );
    const read = parseYaml(frontMatterOf(written)) as Record<string, unknown>;
    expect(read['opera-incerta']).toEqual({ title: 'Ours', keywords: ['a #b'] });
    delete read['opera-incerta'];
    expect(read).toEqual(expected);

    // Written twice, the same bytes; read by the codec, the same foreign lines.
    const again = serializeSheet(parseSheet(written).sheet);
    expect(again).toBe(written);
  });
});

// --- Markdown: the display transform against the reference parser -----------

/** A top-level block as commonmark.js reports it, in one-based lines. */
interface ReferenceBlock {
  readonly kind: 'heading' | 'code';
  readonly startLine: number;
  readonly endLine: number;
  readonly level: number;
}

const referenceParser = new Parser();
const referenceRenderer = new HtmlRenderer();

function referenceBlocks(markdown: string): readonly ReferenceBlock[] {
  const blocks: ReferenceBlock[] = [];
  const document = referenceParser.parse(markdown);
  for (let node = document.firstChild; node !== null; node = node.next) {
    const position = node.sourcepos;
    if (position === undefined) {
      continue;
    }
    const [[startLine], [endLine]] = position;
    if (node.type === 'heading') {
      blocks.push({ kind: 'heading', startLine, endLine, level: node.level });
    } else if (node.type === 'code_block') {
      blocks.push({ kind: 'code', startLine, endLine, level: 0 });
    }
  }
  return blocks;
}

const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/u;

/**
 * Lines a document can be made of. Deliberately without list markers, block
 * quotes, and whitespace-only lines: the transform models no containers, and
 * those are its recorded limits (`specification.md` §10.1), not what this proves.
 */
const VOCABULARY: readonly string[] = [
  '# Title',
  '## Second',
  '###### Sixth',
  '####### seven is text',
  '#5 bolt',
  '\\## escaped',
  '   # three spaces',
  '    # four spaces',
  '# closing ##',
  '#',
  '```',
  '````',
  '~~~',
  '~~~~',
  '``` js',
  '``` aaa',
  '``` ```',
  '``` aa ```',
  '~~~ a`b',
  '   ```',
  'text',
  'more text',
  '',
  '',
  '    code',
  '    # not a heading',
  '  two spaces',
  '**bold** and *italic*',
  'a * b * c',
  'Setext',
  '===',
  '---',
];

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function generatedDocuments(count: number, seed: number): readonly string[] {
  const next = random(seed);
  const documents: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const length = 2 + Math.floor(next() * 9);
    const lines: string[] = [];
    for (let line = 0; line < length; line += 1) {
      lines.push(VOCABULARY[Math.floor(next() * VOCABULARY.length)] ?? '');
    }
    documents.push(`${lines.join('\n')}\n`);
  }
  return documents;
}

describe('the display transform agrees with the reference parser', () => {
  const documents = generatedDocuments(400, 20260904);

  it(`marks the same ATX headings, at the same level, in ${documents.length} generated documents`, () => {
    for (const document of documents) {
      const lines = document.split('\n');
      const display = markdownToDisplay(document);
      const core = new Map<number, number>();
      display.forEach((line, index) => {
        if (line.level !== null) {
          core.set(index + 1, line.level);
        }
      });
      const reference = new Map<number, number>();
      for (const block of referenceBlocks(document)) {
        if (block.kind === 'heading' && ATX.test(lines[block.startLine - 1] ?? '')) {
          reference.set(block.startLine, block.level);
        }
      }
      expect([...core.entries()], JSON.stringify(document)).toEqual([...reference.entries()]);
    }
  });

  it('shows verbatim exactly the lines the reference parser puts in code blocks', () => {
    for (const document of documents) {
      const lines = document.split('\n');
      lines.pop(); // the empty string after the final newline is not a line
      const display = markdownToDisplay(document);
      const ranges = referenceBlocks(document).filter((block) => block.kind === 'code');
      const inCode = (line: number): boolean =>
        ranges.some((range) => line >= range.startLine && line <= range.endLine);
      lines.forEach((text, index) => {
        const line = index + 1;
        const verbatim = display[index]?.verbatim ?? false;
        if (verbatim) {
          expect(inCode(line), `line ${line} ${JSON.stringify(text)} of ${JSON.stringify(document)}`).toBe(true);
        } else if (text.trim() !== '') {
          expect(inCode(line), `line ${line} ${JSON.stringify(text)} of ${JSON.stringify(document)}`).toBe(false);
        }
      });
    }
  });

  it('writes Markdown the reference parser reads as the headings the author set', () => {
    const next = random(4);
    let checked = 0;
    for (const document of documents) {
      const display = markdownToDisplay(document);
      expect(displayToMarkdown(display)).toBe(document);
      const candidates = display
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => !line.verbatim && line.text.trim() !== '');
      const chosen = candidates[Math.floor(next() * candidates.length)];
      if (chosen === undefined) {
        continue;
      }
      const level = (1 + Math.floor(next() * 6)) as 1 | 2 | 3 | 4 | 5 | 6;
      const edited = display.map((line, index) =>
        index === chosen.index ? withHeadingLevel(line, level) : line,
      );
      const written = displayToMarkdown(edited);
      const heading = referenceBlocks(written).find(
        (block) => block.kind === 'heading' && block.startLine === chosen.index + 1,
      );
      expect(heading?.level, `${JSON.stringify(written)} line ${chosen.index + 1}`).toBe(level);
      expect(referenceRenderer.render(referenceParser.parse(written))).toContain(`<h${level}>`);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(300);
  });
});
