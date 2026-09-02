import { describe, expect, it } from 'vitest';
import { delimiterRanges, displayModel, inlineSpans } from '../src/index.js';

/** Compact view of a span for readable expectations. */
function summarize(text: string) {
  return inlineSpans(text).map((span) => ({
    kind: span.kind,
    content: text.slice(span.contentFrom, span.contentTo),
    raw: text.slice(span.from, span.to),
  }));
}

describe('inlineSpans', () => {
  it('finds bold, italic, bold-italic, and strikethrough', () => {
    expect(summarize('**bold**')).toEqual([{ kind: 'bold', content: 'bold', raw: '**bold**' }]);
    expect(summarize('*italic*')).toEqual([
      { kind: 'italic', content: 'italic', raw: '*italic*' },
    ]);
    expect(summarize('***both***')).toEqual([
      { kind: 'boldItalic', content: 'both', raw: '***both***' },
    ]);
    expect(summarize('~~gone~~')).toEqual([
      { kind: 'strikethrough', content: 'gone', raw: '~~gone~~' },
    ]);
  });

  it('prefers the longest delimiter, so *** is not * plus **', () => {
    expect(summarize('***x***')[0]?.kind).toBe('boldItalic');
  });

  it('finds several spans in one line, left to right', () => {
    expect(summarize('a **one** b *two* c')).toEqual([
      { kind: 'bold', content: 'one', raw: '**one**' },
      { kind: 'italic', content: 'two', raw: '*two*' },
    ]);
  });

  it('treats an unclosed delimiter as text', () => {
    expect(summarize('**not closed')).toEqual([]);
    expect(summarize('a * b')).toEqual([]);
  });

  it('does not read empty content as a span', () => {
    expect(summarize('****')).toEqual([]);
    expect(summarize('``')).toEqual([]);
  });

  it('respects a backslash escape', () => {
    expect(summarize('\\*not italic\\*')).toEqual([]);
    expect(summarize('**bold with \\* inside**')).toEqual([
      { kind: 'bold', content: 'bold with \\* inside', raw: '**bold with \\* inside**' },
    ]);
  });

  it('leaves underscores alone, because that decision is still open', () => {
    expect(summarize('__not bold__')).toEqual([]);
    expect(summarize('snake_case_name')).toEqual([]);
  });
});

describe('code spans', () => {
  it('finds a code span', () => {
    expect(summarize('`code`')).toEqual([{ kind: 'code', content: 'code', raw: '`code`' }]);
  });

  it('shadows emphasis inside it, because backticks mean "literally this"', () => {
    expect(summarize('`**not bold**`')).toEqual([
      { kind: 'code', content: '**not bold**', raw: '`**not bold**`' },
    ]);
  });

  it('matches fences of equal length', () => {
    expect(summarize('``a ` b``')).toEqual([{ kind: 'code', content: 'a ` b', raw: '``a ` b``' }]);
  });

  it('does not close a short fence with a longer run', () => {
    expect(summarize('`a``')).toEqual([]);
  });

  it('finds emphasis after a code span ends', () => {
    expect(summarize('`code` and **bold**').map((span) => span.kind)).toEqual(['code', 'bold']);
  });
});

describe('delimiterRanges', () => {
  it('returns the delimiter characters, not the content', () => {
    const text = 'a **bold** b';
    const ranges = delimiterRanges(text);

    expect(ranges.map((range) => text.slice(range.from, range.to))).toEqual(['**', '**']);
  });

  it('returns nothing for a line without markup', () => {
    expect(delimiterRanges('plain text')).toEqual([]);
  });
});

describe('displayModel', () => {
  const document_ = ['# Heading', 'a **bold** line', 'another *italic* line'].join('\n');

  it('reports headings with their line numbers and offsets', () => {
    const model = displayModel(document_, null);

    expect(model.headings).toEqual([{ line: 1, level: 1, from: 0 }]);
  });

  /** The hidden ranges of one kind, as the text they cover. */
  function hiddenText(text: string, focused: number | null, kind: 'heading' | 'inline') {
    return displayModel(text, focused)
      .hidden.filter((range) => range.kind === kind)
      .map((range) => text.slice(range.from, range.to));
  }

  it('hides delimiters on every line when nothing is focused', () => {
    expect(hiddenText(document_, null, 'inline')).toEqual(['**', '**', '*', '*']);
  });

  it('leaves the focused line visible', () => {
    expect(hiddenText(document_, 2, 'inline')).toEqual(['*', '*']);
  });

  it('hides the heading prefix whatever the cursor does', () => {
    // Heading level is a static paragraph attribute, so there is no syntax to
    // edit in place — unlike an inline delimiter (SPEC.md §10.2 against §10.3).
    expect(hiddenText(document_, null, 'heading')).toEqual(['# ']);
    expect(hiddenText(document_, 1, 'heading')).toEqual(['# ']);
  });

  it('hides closing hashes too', () => {
    const text = '## Closed ##';
    expect(hiddenText(text, null, 'heading')).toEqual(['## ', ' ##']);
  });

  it('hides nothing on a plain line', () => {
    expect(displayModel('just text', null).hidden).toEqual([]);
  });

  it('returns hidden ranges in document order', () => {
    const model = displayModel(document_, null);
    const offsets = model.hidden.map((range) => range.from);

    expect([...offsets].sort((left, right) => left - right)).toEqual(offsets);
  });

  it('offsets delimiters past a heading prefix that is not shown', () => {
    // The `## ` prefix is removed from the visible text but present in the
    // document, so a delimiter offset that ignored it would land three
    // characters early.
    const text = '## a **bold** heading';
    const inline = displayModel(text, null).hidden.filter((range) => range.kind === 'inline');

    expect(inline.map((range) => text.slice(range.from, range.to))).toEqual(['**', '**']);
    expect(inline[0]?.from).toBe(text.indexOf('**'));
  });

  it('keeps offsets correct across several lines', () => {
    const text = ['plain', '**bold**'].join('\n');
    const model = displayModel(text, null);

    expect(model.hidden[0]?.from).toBe(text.indexOf('**'));
    expect(model.hidden[0]?.kind).toBe('inline');
    expect(text.slice(model.hidden[0]?.from ?? 0, model.hidden[0]?.to ?? 0)).toBe('**');
  });

  it('hides nothing inside a fenced code block', () => {
    // Backticks mean "show this literally", so hiding the asterisks inside
    // would display something the file does not contain.
    const text = ['```', '**not markup**', '```', '**real markup**'].join('\n');
    const model = displayModel(text, null);

    expect(model.headings).toEqual([]);
    expect(model.hidden).toHaveLength(2);
    expect(model.hidden.every((range) => range.kind === 'inline')).toBe(true);
    expect(model.hidden[0]?.from).toBe(text.lastIndexOf('**real markup**'));
  });

  it('does not treat a heading inside a fence as a heading', () => {
    const text = ['```', '# not a heading', '```'].join('\n');

    expect(displayModel(text, null).headings).toEqual([]);
  });

  it('names the verbatim lines, because a line cannot tell on its own', () => {
    // Every consumer that must not act inside a fence — the gutter, the dot
    // command filter — asks here. Both once judged a line in isolation and got
    // it wrong.
    const text = ['text', '```', '.h1 not a command', '```', 'more text'].join('\n');
    const model = displayModel(text, null);

    expect([...model.verbatimLines].sort()).toEqual([2, 3, 4]);
  });

  it('reports no verbatim lines for a document without fences', () => {
    expect(displayModel('# Heading\ntext', null).verbatimLines.size).toBe(0);
  });
});
