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
