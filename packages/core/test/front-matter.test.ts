import { describe, expect, it } from 'vitest';
import {
  FRONT_MATTER_NAMESPACE,
  parseSheet,
  serializeSheet,
  type Sheet,
} from '../src/index.js';

/** Parses, then writes back. The identity operation for a well-formed file. */
function roundTrip(text: string): string {
  const parsed = parseSheet(text);
  expect(parsed.writable).toBe(true);
  return serializeSheet(parsed.sheet);
}

describe('files without an owned block', () => {
  it('reads a plain Markdown file as body only', () => {
    const text = '# Chapter One\n\nThe first line.\n';
    const parsed = parseSheet(text);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.writable).toBe(true);
    expect(parsed.sheet.metadata).toEqual({});
    expect(parsed.sheet.body).toBe(text);
    expect(serializeSheet(parsed.sheet)).toBe(text);
  });

  it('adds no front matter block to a file that has none', () => {
    expect(roundTrip('Just text.\n')).toBe('Just text.\n');
  });

  it('creates the block only when metadata exists, leaving the body untouched', () => {
    const parsed = parseSheet('Just text.\n');
    const withTitle: Sheet = {
      ...parsed.sheet,
      metadata: { title: 'The First Scene' },
    };

    expect(serializeSheet(withTitle)).toBe(
      ['---', 'opera-incerta:', '  title: The First Scene', '---', 'Just text.\n'].join('\n'),
    );
  });

  it('keeps an empty front matter block empty', () => {
    const text = '---\n---\nBody\n';
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(true);
    expect(parsed.sheet.metadata).toEqual({});
    expect(parsed.sheet.body).toBe('Body\n');
  });
});

describe('owned fields', () => {
  const document = [
    '---',
    'opera-incerta:',
    '  title: The First Scene',
    '  topic: departure',
    '  keywords: [draft, scene]',
    '  status: draft',
    '  category: 6f1d0a7e-6c2b-4a19-9a1e-2f3b4c5d6e7f',
    '  notes: |-',
    '    Research on the harbour still open.',
    '    Check the 1893 timetable.',
    '---',
    'The first line of the actual text.',
    '',
  ].join('\n');

  it('reads every owned field', () => {
    const { sheet, diagnostics, writable } = parseSheet(document);

    expect(diagnostics).toEqual([]);
    expect(writable).toBe(true);
    expect(sheet.metadata).toEqual({
      title: 'The First Scene',
      topic: 'departure',
      keywords: ['draft', 'scene'],
      status: 'draft',
      category: '6f1d0a7e-6c2b-4a19-9a1e-2f3b4c5d6e7f',
      notes: 'Research on the harbour still open.\nCheck the 1893 timetable.',
    });
    expect(sheet.body).toBe('The first line of the actual text.\n');
  });

  it('round-trips byte-identically', () => {
    expect(roundTrip(document)).toBe(document);
  });

  it('preserves line breaks and a trailing newline in notes', () => {
    const withTrailing = document.replace('  notes: |-', '  notes: |');
    const { sheet } = parseSheet(withTrailing);

    expect(sheet.metadata.notes?.endsWith('\n')).toBe(true);
    expect(roundTrip(withTrailing)).toBe(withTrailing);
  });

  it('handles an empty keyword list', () => {
    const text = '---\nopera-incerta:\n  keywords: []\n---\n';
    expect(parseSheet(text).sheet.metadata.keywords).toEqual([]);
    expect(roundTrip(text)).toBe(text);
  });

  it('writes fields in a fixed order, so identical metadata gives identical bytes', () => {
    const base = parseSheet('body').sheet;
    const first = serializeSheet({
      ...base,
      metadata: { notes: 'n', title: 't', status: 's' },
    });
    const second = serializeSheet({
      ...base,
      metadata: { status: 's', title: 't', notes: 'n' },
    });

    expect(first).toBe(second);
    expect(first.indexOf('title:')).toBeLessThan(first.indexOf('status:'));
  });
});

describe('namespace ownership', () => {
  const foreignLookalike = [
    '---',
    'title: A Jekyll Title',
    'status: published',
    'topic: not ours',
    'keywords: [foreign]',
    'category: blog',
    'notes: also foreign',
    '---',
    'Body\n',
  ].join('\n');

  it('never reads a top-level foreign key as an owned field', () => {
    const { sheet, diagnostics, writable } = parseSheet(foreignLookalike);

    expect(diagnostics).toEqual([]);
    expect(writable).toBe(true);
    expect(sheet.metadata).toEqual({});
    expect(sheet.foreignLines).toHaveLength(6);
  });

  it('preserves those keys byte-identically', () => {
    expect(roundTrip(foreignLookalike)).toBe(foreignLookalike);
  });

  it('never overwrites them when writing owned metadata', () => {
    const parsed = parseSheet(foreignLookalike);
    const written = serializeSheet({
      ...parsed.sheet,
      metadata: { title: 'Ours', status: 'draft' },
    });

    expect(written).toContain('title: A Jekyll Title');
    expect(written).toContain('status: published');
    expect(written).toContain('  title: Ours');
    expect(written).toContain('  status: draft');
    // Ours first, foreign after, each exactly once.
    expect(written.match(/^title:/gm)).toHaveLength(1);
    expect(written.indexOf('opera-incerta:')).toBeLessThan(written.indexOf('title: A Jekyll'));
  });

  it('treats a key nested under a foreign mapping as foreign', () => {
    const text = ['---', 'seo:', '  title: Nested', '  status: live', '---', ''].join('\n');
    const { sheet } = parseSheet(text);

    expect(sheet.metadata).toEqual({});
    expect(roundTrip(text)).toBe(text);
  });

  it('treats a nested opera-incerta key as foreign too', () => {
    const text = ['---', 'wrapper:', '  opera-incerta:', '    title: Not ours', '---', ''].join(
      '\n',
    );
    const { sheet } = parseSheet(text);

    expect(sheet.metadata).toEqual({});
    expect(roundTrip(text)).toBe(text);
  });
});

describe('foreign front matter of every shape', () => {
  const document = [
    '---',
    'opera-incerta:',
    '  title: Ours',
    '# a comment line',
    'layout: post',
    'author: A. Author',
    'tags:',
    '  - novel',
    '  - draft',
    'seo:',
    '  title: Nested title',
    '  description: >',
    '    folded text that',
    '    continues here',
    'published: false',
    'weird line without a colon',
    '---',
    'Body text.\n',
  ].join('\n');

  it('preserves nested mappings, sequences, folded blocks, comments, and unkeyed lines', () => {
    expect(roundTrip(document)).toBe(document);
  });

  it('is idempotent: saving twice equals saving once', () => {
    const once = roundTrip(document);
    expect(roundTrip(once)).toBe(once);
  });

  it('keeps foreign lines in their original relative order', () => {
    const { sheet } = parseSheet(document);
    const joined = sheet.foreignLines.join('\n');

    expect(joined.indexOf('layout: post')).toBeLessThan(joined.indexOf('author:'));
    expect(joined.indexOf('author:')).toBeLessThan(joined.indexOf('tags:'));
    expect(joined.indexOf('  - novel')).toBeLessThan(joined.indexOf('  - draft'));
  });
});

describe('unknown owned fields', () => {
  const document = [
    '---',
    'opera-incerta:',
    '  title: Ours',
    '  futureField: written by a newer build',
    '  futureMapping:',
    '    nested: value',
    '---',
    '',
  ].join('\n');

  it('reads the known fields and keeps the unknown ones', () => {
    const { sheet } = parseSheet(document);

    expect(sheet.metadata).toEqual({ title: 'Ours' });
    expect(sheet.unknownOwnedLines).toEqual([
      '  futureField: written by a newer build',
      '  futureMapping:',
      '    nested: value',
    ]);
  });

  it('never deletes a field a newer build wrote', () => {
    expect(roundTrip(document)).toBe(document);
  });
});

describe('malformed input', () => {
  it('reports a duplicated namespace key and refuses to write', () => {
    const text = [
      '---',
      'opera-incerta:',
      '  title: First',
      'other: value',
      'opera-incerta:',
      '  title: Second',
      '---',
      'Body\n',
    ].join('\n');
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(false);
    // Line 5 of the file: marker, key, title, other, second key.
    expect(parsed.diagnostics).toEqual([
      { code: 'front-matter/namespace-duplicated', line: 5 },
    ]);
    expect(parsed.sheet.metadata).toEqual({});
    // Nothing was claimed as ours, so nothing can be rewritten away: every
    // line of the block survives, including both occurrences.
    expect(parsed.sheet.foreignLines).toEqual([
      'opera-incerta:',
      '  title: First',
      'other: value',
      'opera-incerta:',
      '  title: Second',
    ]);
  });

  it('reports a scalar namespace value and refuses to write', () => {
    const text = ['---', 'opera-incerta: nonsense', '---', ''].join('\n');
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(false);
    expect(parsed.diagnostics).toEqual([
      { code: 'front-matter/namespace-not-a-mapping', line: 2 },
    ]);
    expect(parsed.sheet.metadata).toEqual({});
  });

  it('reports a sequence namespace value and refuses to write', () => {
    const text = ['---', 'opera-incerta:', '  - one', '  - two', '---', ''].join('\n');
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('front-matter/namespace-not-a-mapping');
  });

  it('reports an unterminated block, keeps the text whole, and invents no fields', () => {
    const text = '---\nopera-incerta:\n  title: Unclosed\n\nStill text.\n';
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(false);
    expect(parsed.diagnostics).toEqual([{ code: 'front-matter/unterminated', line: 1 }]);
    expect(parsed.sheet.metadata).toEqual({});
    expect(parsed.sheet.body).toBe(text);
  });
});

describe('scalar quoting', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['plain title', 'a plain title'],
    ['colon', 'Chapter 3: The Return'],
    ['leading space', ' leading'],
    ['trailing space', 'trailing '],
    ['hash', '# not a heading'],
    ['quote', 'He said "no"'],
    ['single quote', "it's fine"],
    ['backslash', 'path\\to\\thing'],
    ['bracket', '[bracketed]'],
    ['number-like', '2024'],
    ['boolean-like', 'true'],
    ['null-like', 'null'],
    ['umlauts', 'Größe und Übermut'],
    ['emoji', 'chapter 🌊 sea'],
    ['empty', ''],
  ];

  for (const [name, value] of cases) {
    it(`round-trips a ${name} title`, () => {
      const base = parseSheet('body').sheet;
      const text = serializeSheet({ ...base, metadata: { title: value } });

      expect(parseSheet(text).sheet.metadata.title).toBe(value);
      expect(roundTrip(text)).toBe(text);
    });
  }

  it('quotes values that would otherwise change type or meaning', () => {
    const base = parseSheet('body').sheet;
    const text = serializeSheet({ ...base, metadata: { title: '2024', status: 'true' } });

    expect(text).toContain('title: "2024"');
    expect(text).toContain('status: "true"');
  });

  it('round-trips keywords containing commas and brackets', () => {
    const base = parseSheet('body').sheet;
    const keywords = ['plain', 'with, comma', 'with ] bracket', 'Größe'];
    const text = serializeSheet({ ...base, metadata: { keywords } });

    expect(parseSheet(text).sheet.metadata.keywords).toEqual(keywords);
  });
});

describe('line endings', () => {
  const lf = ['---', 'opera-incerta:', '  title: Ours', '---', 'Body', ''].join('\n');
  const crlf = lf.replace(/\n/g, '\r\n');

  it('parses to the same model regardless of line ending', () => {
    expect(parseSheet(crlf).sheet.metadata).toEqual(parseSheet(lf).sheet.metadata);
    expect(parseSheet(crlf).sheet.body).toBe(parseSheet(lf).sheet.body.replace(/\n/g, '\r\n'));
  });

  it('writes back the line ending it read', () => {
    expect(roundTrip(crlf)).toBe(crlf);
    expect(roundTrip(lf)).toBe(lf);
  });
});

describe('the namespace constant', () => {
  it('matches the key the codec reads and writes', () => {
    const base = parseSheet('body').sheet;
    const text = serializeSheet({ ...base, metadata: { title: 'x' } });

    expect(text).toContain(`${FRONT_MATTER_NAMESPACE}:`);
  });
});

describe('owned fields in shapes the reader does not read', () => {
  // The rule: refuse and say why, never demote to "unknown". A known key
  // carried as unknown lines was regenerated beside the original on write,
  // and the file left with the same key twice in one mapping.
  const unreadable: ReadonlyArray<readonly [string, readonly string[], number]> = [
    ['a folded title', ['  title: >', '    folded text'], 3],
    ['a literal on a single-line field', ['  status: |', '    draft'], 3],
    ['a mapping under a scalar field', ['  topic:', '    nested: value'], 3],
    ['notes with a keep indicator', ['  notes: |+', '    text', ''], 3],
    ['folded notes', ['  notes: >', '    folded'], 3],
    ['notes with an explicit indentation indicator', ['  notes: |2', '    text'], 3],
    ['a keyword sequence with a nested mapping', ['  keywords:', '    - a', '      b: c'], 3],
    ['a keyword item that is itself a block', ['  keywords:', '    - |', '      x'], 3],
    ['a bare block indicator as a title', ['  title: |'], 3],
  ];

  for (const [name, lines, line] of unreadable) {
    it(`refuses ${name} with a diagnostic on its line`, () => {
      const text = ['---', 'opera-incerta:', ...lines, '---', 'Body\n'].join('\n');
      const parsed = parseSheet(text);

      expect(parsed.writable).toBe(false);
      expect(parsed.diagnostics).toEqual([{ code: 'front-matter/field-unreadable', line }]);
      expect(parsed.sheet.metadata).toEqual({});
      // Nothing claimed as ours, so nothing can be rewritten: the block is
      // foreign in its entirety, and the body is untouched.
      expect(parsed.sheet.foreignLines).toEqual(['opera-incerta:', ...lines]);
      expect(parsed.sheet.body).toBe('Body\n');
    });
  }

  it('refuses a field that appears twice, pointing at the second', () => {
    const text = [
      '---',
      'opera-incerta:',
      '  title: First',
      '  topic: x',
      '  title: Second',
      '---',
      '',
    ].join('\n');
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(false);
    expect(parsed.diagnostics).toEqual([{ code: 'front-matter/field-duplicated', line: 5 }]);
    expect(parsed.sheet.metadata).toEqual({});
  });

  it('never writes an owned key twice, whatever shape it was read from', () => {
    // The defect this describes: a block-sequence `keywords:` was carried as
    // unknown lines and written back beside a regenerated `keywords: [x]`.
    const text = ['---', 'opera-incerta:', '  keywords:', '    - a', '    - b', '---', ''].join(
      '\n',
    );
    const parsed = parseSheet(text);
    const written = serializeSheet({ ...parsed.sheet, metadata: { keywords: ['x'] } });

    expect(written.match(/^\s+keywords:/gm)).toHaveLength(1);
    expect(written).toContain('  keywords: [x]');
  });
});

describe('keywords as a block sequence', () => {
  const text = [
    '---',
    'opera-incerta:',
    '  title: Ours',
    '  keywords:',
    '    - draft',
    '    - "with, comma"',
    "    - 'it''s'",
    '',
    '    - Größe',
    '---',
    'Body\n',
  ].join('\n');

  it('reads the items', () => {
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(true);
    expect(parsed.sheet.metadata.keywords).toEqual(['draft', 'with, comma', "it's", 'Größe']);
  });

  it('writes them back in the inline form, and is then stable', () => {
    // Formatting inside the owned block belongs to the application (specification.md
    // §6.2); what must survive is the value.
    const once = roundTrip(text);
    expect(once).toContain('  keywords: [draft, "with, comma", it\'s, Größe]');
    expect(parseSheet(once).sheet.metadata.keywords).toEqual([
      'draft',
      'with, comma',
      "it's",
      'Größe',
    ]);
    expect(roundTrip(once)).toBe(once);
  });

  it('accepts an empty sequence line as no keywords', () => {
    const empty = ['---', 'opera-incerta:', '  keywords:', '    -', '---', ''].join('\n');
    expect(parseSheet(empty).sheet.metadata.keywords).toEqual(['']);
  });
});

describe('the empty mapping spelled inline', () => {
  it('reads `opera-incerta: {}` as an empty mapping that can be written', () => {
    const parsed = parseSheet('---\nopera-incerta: {}\n---\nBody\n');

    expect(parsed.writable).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sheet.metadata).toEqual({});
  });

  it('refuses `{}` with children under it', () => {
    const parsed = parseSheet('---\nopera-incerta: {}\n  title: x\n---\n');

    expect(parsed.writable).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('front-matter/namespace-not-a-mapping');
  });

  it('ignores a comment after the namespace key', () => {
    const parsed = parseSheet('---\nopera-incerta: # ours\n  title: x\n---\n');

    expect(parsed.writable).toBe(true);
    expect(parsed.sheet.metadata).toEqual({ title: 'x' });
  });
});

describe('quoting, read back exactly', () => {
  const values: ReadonlyArray<readonly [string, string]> = [
    // A literal backslash before an `n`: three sequential replaces read each
    // other's output and turned this into a real newline.
    ['backslash-n', 'a: \\nb'],
    ['backslash then quote', 'x\\"y'],
    ['two backslashes', 'a\\\\b'],
    ['a tab', 'a\tb'],
    ['a newline', 'line one\nline two'],
    ['newline then backslash', 'one\n\\two'],
  ];

  for (const [name, value] of values) {
    it(`round-trips a title with ${name}`, () => {
      const base = parseSheet('body').sheet;
      const text = serializeSheet({ ...base, metadata: { title: value } });

      expect(parseSheet(text).sheet.metadata.title).toBe(value);
      expect(roundTrip(text)).toBe(text);
    });
  }

  it('leaves an escape it does not know as it is, rather than dropping it', () => {
    const parsed = parseSheet('---\nopera-incerta:\n  title: "a\\qb"\n---\n');
    expect(parsed.sheet.metadata.title).toBe('a\\qb');
  });

  it('round-trips keywords with a quote inside them', () => {
    // The reader honours a quote only at the start of an item; one in the
    // middle used to open a quoted run and join three keywords into one.
    const base = parseSheet('body').sheet;
    const keywords = ["it's", 'fine', "o'clock", 'said "so"', "o'clock, x", 'a\nb'];
    const text = serializeSheet({ ...base, metadata: { keywords } });

    expect(parseSheet(text).sheet.metadata.keywords).toEqual(keywords);
    expect(roundTrip(text)).toBe(text);
  });

  it('reads a hand-written inline list with quotes in the middle of items', () => {
    const parsed = parseSheet("---\nopera-incerta:\n  keywords: [it's, o'clock, \"q, r\"]\n---\n");
    expect(parsed.sheet.metadata.keywords).toEqual(["it's", "o'clock", 'q, r']);
  });
});

describe('block literals as a hand writes them', () => {
  it('reads content indented by more than the writer would', () => {
    const text = [
      '---',
      'opera-incerta:',
      '  notes: |',
      '     three-space indent',
      '     kept',
      '---',
      '',
    ].join('\n');
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(true);
    expect(parsed.sheet.metadata.notes).toBe('three-space indent\nkept\n');
  });

  it('keeps blank lines inside the block, and relative indentation', () => {
    const text = [
      '---',
      'opera-incerta:',
      '  notes: |-',
      '    first',
      '',
      '      indented more',
      '    last',
      '---',
      '',
    ].join('\n');
    const parsed = parseSheet(text);

    expect(parsed.sheet.metadata.notes).toBe('first\n\n  indented more\nlast');
    expect(roundTrip(text)).toBe(text);
  });

  it('reads a literal with nothing under it as the empty value', () => {
    const clipped = ['---', 'opera-incerta:', '  notes: |', '---', ''].join('\n');
    const stripped = ['---', 'opera-incerta:', '  notes: |-', '---', ''].join('\n');

    expect(parseSheet(clipped).sheet.metadata.notes).toBe('\n');
    expect(parseSheet(stripped).sheet.metadata.notes).toBe('');
    // Written back without a blank line to carry the nothing.
    expect(roundTrip(clipped)).toBe(clipped);
    expect(roundTrip(stripped)).toBe(stripped);
  });

  it('keeps a stray unkeyed line in the owned block as an unknown line', () => {
    // Not YAML for anyone, but not ours to drop either: the forward
    // compatibility rule keeps it, and the literal above it stays empty.
    const text = ['---', 'opera-incerta:', '  notes: |', '  a line without a key', '---', ''].join(
      '\n',
    );
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(true);
    expect(parsed.sheet.metadata.notes).toBe('\n');
    expect(parsed.sheet.unknownOwnedLines).toEqual(['  a line without a key']);
    expect(roundTrip(text)).toBe(text);
  });
});

describe('a file that starts with a thematic break', () => {
  // Front matter is a mapping. A block with no key in it is not one, and the
  // text between the rules is the author's, not metadata.
  it('keeps a poem between two rules in the body', () => {
    const text = '---\n\nA poem\n\n---\n\nMore text\n';
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sheet.foreignLines).toEqual([]);
    expect(parsed.sheet.body).toBe(text);
    expect(roundTrip(text)).toBe(text);
  });

  it('keeps a heading under a rule in the body', () => {
    const text = '---\n# Title\n\nText\n---\n';
    expect(parseSheet(text).sheet.body).toBe(text);
  });

  it('keeps a single rule with nothing to close it in the body, writable', () => {
    const text = '---\nA poem\n';
    const parsed = parseSheet(text);

    expect(parsed.writable).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sheet.body).toBe(text);
  });

  it('still reports an unterminated block that carries keys', () => {
    const parsed = parseSheet('---\ntitle: x\nText\n');
    expect(parsed.writable).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('front-matter/unterminated');
  });

  it('adds owned metadata in front of such a body and reads it back', () => {
    const text = '---\n\nA poem\n\n---\n';
    const parsed = parseSheet(text);
    const written = serializeSheet({ ...parsed.sheet, metadata: { title: 'Poem' } });
    const again = parseSheet(written);

    expect(again.sheet.metadata).toEqual({ title: 'Poem' });
    expect(again.sheet.body).toBe(text);
    expect(roundTrip(written)).toBe(written);
  });
});

describe('generated front matter never throws, and what it writes it reads back', () => {
  // testing.md §5. Seeded, so a failure is a case and not a rumour.
  function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }

  const fragments = [
    'opera-incerta:',
    'opera-incerta: {}',
    'opera-incerta: scalar',
    '  title: Ours',
    '  title: "2024"',
    '  title: >',
    '  title: |',
    '  topic:',
    '  keywords: [a, b]',
    '  keywords:',
    '    - a',
    "    - 'it''s'",
    '  status: draft',
    '  notes: |',
    '  notes: |-',
    '  notes: |+',
    '    a line',
    '     deeper',
    '',
    '  future: value',
    '    nested: deeper',
    'layout: post',
    'title: Foreign',
    '# a comment',
    'tags:',
    '  - x',
    'weird line',
    '---',
    '    ',
    '  - stray item',
  ];

  /**
   * The lines under `opera-incerta:` in the written front matter, up to the
   * next top-level line. Only the front matter: a body may carry the same
   * words, and a keyless block is a body.
   */
  function ownedBlockOf(written: string): readonly string[] {
    const lines = written.split(/\r?\n/);
    const closing = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
    const front = closing === -1 ? [] : lines.slice(1, closing);
    const start = front.indexOf('opera-incerta:');
    if (start === -1) {
      return [];
    }
    const block: string[] = [];
    for (const line of front.slice(start + 1)) {
      if (line.trim() !== '' && !/^\s/.test(line)) {
        break;
      }
      block.push(line);
    }
    return block;
  }

  function document(next: () => number): string {
    const count = Math.floor(next() * 12);
    const lines: string[] = [];
    for (let index = 0; index < count; index += 1) {
      lines.push(fragments[Math.floor(next() * fragments.length)] as string);
    }
    const lineEnding = next() < 0.2 ? '\r\n' : '\n';
    const closed = next() < 0.9;
    return ['---', ...lines, ...(closed ? ['---'] : []), 'Body', ''].join(lineEnding);
  }

  it('holds for five hundred generated documents', () => {
    const next = random(20260903);

    for (let index = 0; index < 500; index += 1) {
      const text = document(next);
      const parsed = parseSheet(text);
      expect(parsed.writable).toBe(parsed.diagnostics.length === 0);
      if (!parsed.writable) {
        continue;
      }

      const once = serializeSheet(parsed.sheet);
      const again = parseSheet(once);
      // What was written is readable, means the same, and is stable.
      expect(again.writable).toBe(true);
      expect(again.sheet.metadata).toEqual(parsed.sheet.metadata);
      expect(serializeSheet(again.sheet)).toBe(once);
      // No owned key twice, whatever shape it was read from. Unknown lines
      // may repeat as they came in; the known fields never. Only the owned
      // block counts: a foreign line may be indented and look like one.
      const ownedKeys = ownedBlockOf(once)
        .map((line) => /^  (title|topic|keywords|status|category|notes):/.exec(line)?.[1])
        .filter((key): key is string => key !== undefined);
      expect(new Set(ownedKeys).size).toBe(ownedKeys.length);
      // Every foreign line went out as it came in.
      for (const line of parsed.sheet.foreignLines) {
        expect(once).toContain(line);
      }
    }
  });
});

describe('what the standard oracle found (testing.md §2.11)', () => {
  const base = parseSheet('body').sheet;

  it('reads back a quoted keyword that contains a space and a hash', () => {
    // The reader stripped the ` #comment` from the whole line before it split
    // the list, and read `["a`.
    const keywords = ['a #comment', 'plain'];
    const text = serializeSheet({ ...base, metadata: { keywords } });
    expect(text).toContain('keywords: ["a #comment", plain]');
    expect(parseSheet(text).sheet.metadata.keywords).toEqual(keywords);
    expect(roundTrip(text)).toBe(text);
  });

  it('still drops a real comment after a list, and after a quoted scalar', () => {
    const list = parseSheet('---\nopera-incerta:\n  keywords: ["a #b", c] # note\n---\n');
    expect(list.sheet.metadata.keywords).toEqual(['a #b', 'c']);
    const scalar = parseSheet('---\nopera-incerta:\n  title: "x # y" # note\n---\n');
    expect(scalar.sheet.metadata.title).toBe('x # y');
    const plain = parseSheet("---\nopera-incerta:\n  title: it's # note\n---\n");
    expect(plain.sheet.metadata.title).toBe("it's");
  });

  const otherTypes = [
    '0x1F',
    '0o17',
    '017',
    '0b101',
    '.inf',
    '-.Inf',
    '.NaN',
    '.5',
    '5.',
    '1_000',
    '1:20',
    '2019-04-02',
    '2019-04-02T10:00:00Z',
    'y',
    'N',
    'Null',
  ];
  for (const value of otherTypes) {
    it(`quotes ${JSON.stringify(value)}, which another reader would not take for a string`, () => {
      const text = serializeSheet({ ...base, metadata: { title: value, keywords: [value] } });
      expect(text).toContain(`title: "${value}"`);
      expect(text).toContain(`keywords: ["${value}"]`);
      expect(parseSheet(text).sheet.metadata).toEqual({ title: value, keywords: [value] });
    });
  }

  it('leaves a word that merely contains digits bare', () => {
    const text = serializeSheet({ ...base, metadata: { title: 'Chapter 12', topic: '12b' } });
    expect(text).toContain('title: Chapter 12\n');
    expect(text).toContain('topic: 12b\n');
  });

  it('quotes a scalar that ends in a colon, which is not YAML bare', () => {
    const text = serializeSheet({ ...base, metadata: { title: 'trailing colon:' } });
    expect(text).toContain('title: "trailing colon:"');
    expect(parseSheet(text).sheet.metadata.title).toBe('trailing colon:');
  });

  const awkwardNotes = [
    ' leading space',
    '\n\n  indented after a blank\n',
    '  deeper first line\nthen shallower',
    'a\n   \nb',
    '   ',
  ];
  for (const notes of awkwardNotes) {
    it(`round-trips notes a block literal cannot carry: ${JSON.stringify(notes)}`, () => {
      const text = serializeSheet({ ...base, metadata: { notes } });
      expect(text).toMatch(/notes: "/);
      expect(parseSheet(text).sheet.metadata.notes).toBe(notes);
      expect(roundTrip(text)).toBe(text);
    });
  }

  it('keeps the literal block for ordinary notes', () => {
    const text = serializeSheet({ ...base, metadata: { notes: 'one\n\ntwo\n' } });
    expect(text).toContain('notes: |\n    one\n\n    two\n');
  });
});
