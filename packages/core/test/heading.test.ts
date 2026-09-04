import { describe, expect, it } from 'vitest';
import {
  displayToMarkdown,
  markdownToDisplay,
  outlineOf,
  visibleOutline,
  withHeadingLevel,
  type DisplayLine,
} from '../src/index.js';

function roundTrip(markdown: string): string {
  return displayToMarkdown(markdownToDisplay(markdown));
}

describe('markdownToDisplay', () => {
  it('turns every heading level into a paragraph attribute and strips the prefix', () => {
    const lines = markdownToDisplay(
      ['# One', '## Two', '### Three', '#### Four', '##### Five', '###### Six'].join('\n'),
    );

    expect(lines.map((line) => line.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lines.map((line) => line.text)).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
  });

  it('leaves ordinary paragraphs alone', () => {
    const [line] = markdownToDisplay('Just a sentence.');
    expect(line?.level).toBeNull();
    expect(line?.text).toBe('Just a sentence.');
  });

  it('does not treat seven hashes as a heading', () => {
    expect(markdownToDisplay('####### Seven')[0]?.level).toBeNull();
  });

  it('requires a space after the hashes, per CommonMark', () => {
    expect(markdownToDisplay('#NoSpace')[0]?.level).toBeNull();
  });

  it('accepts an empty heading', () => {
    const [line] = markdownToDisplay('##');
    expect(line?.level).toBe(2);
    expect(line?.text).toBe('');
  });

  it('allows up to three leading spaces but not four', () => {
    expect(markdownToDisplay('   # Indented')[0]?.level).toBe(1);
    expect(markdownToDisplay('    # Code block')[0]?.level).toBeNull();
  });
});

describe('code fences', () => {
  const document = [
    '# Real heading',
    '',
    '```markdown',
    '# Not a heading',
    '## Also not',
    '```',
    '',
    '## Real again',
    '',
    '~~~',
    '### Fenced with tildes',
    '~~~',
  ].join('\n');

  it('never treats a line inside a fence as a heading', () => {
    const levels = markdownToDisplay(document).map((line) => line.level);
    expect(levels).toEqual([1, null, null, null, null, null, null, 2, null, null, null, null]);
  });

  it('marks fence lines and their content as verbatim', () => {
    const lines = markdownToDisplay(['text', '```', '# inside', '```', '# outside'].join('\n'));

    expect(lines.map((line) => line.verbatim)).toEqual([false, true, true, true, false]);
  });

  it('does not close a backtick fence with a tilde fence', () => {
    const lines = markdownToDisplay(['```', '~~~', '# still inside', '```', '# outside'].join('\n'));
    expect(lines[2]?.level).toBeNull();
    expect(lines[4]?.level).toBe(1);
  });

  it('round-trips the whole document unchanged', () => {
    expect(roundTrip(document)).toBe(document);
  });
});

describe('round trip', () => {
  const documents: ReadonlyArray<readonly [string, string]> = [
    ['plain text', 'One line.\nAnother line.\n'],
    ['all levels', '# A\n## B\n### C\n#### D\n##### E\n###### F\n'],
    ['extra spacing', '#   Wide spacing\n'],
    ['closed heading', '## Closed ##\n'],
    ['closed with spacing', '###   Closed   ###\n'],
    ['indented heading', '  ### Indented\n'],
    ['trailing whitespace', '# Trailing   \n'],
    ['empty document', ''],
    ['only newlines', '\n\n\n'],
    ['heading with hash inside', '# C# and F#\n'],
    ['unicode', '# Größe 🌊\n'],
  ];

  for (const [name, document] of documents) {
    it(`preserves ${name} byte-for-byte`, () => {
      expect(roundTrip(document)).toBe(document);
    });
  }

  it('is idempotent', () => {
    const once = roundTrip('# A\n## Closed ##\ntext\n');
    expect(roundTrip(once)).toBe(once);
  });

  it('shows closing hashes as formatting, not as text', () => {
    const [line] = markdownToDisplay('## Closed ##');
    expect(line?.level).toBe(2);
    expect(line?.text).toBe('Closed');
  });
});

describe('withHeadingLevel', () => {
  const plain: DisplayLine = {
    level: null,
    text: 'A line',
    prefix: '',
    suffix: '',
    verbatim: false,
  };

  it('applies a level to a plain line', () => {
    const heading = withHeadingLevel(plain, 3);

    expect(heading.level).toBe(3);
    expect(displayToMarkdown([heading])).toBe('### A line');
  });

  it('changes a level while keeping the existing spacing', () => {
    const [wide] = markdownToDisplay('#   Wide');
    const changed = withHeadingLevel(wide as DisplayLine, 4);

    expect(displayToMarkdown([changed])).toBe('####   Wide');
  });

  it('removes a heading completely, including closing hashes', () => {
    const [closed] = markdownToDisplay('## Closed ##');
    const removed = withHeadingLevel(closed as DisplayLine, null);

    expect(removed.level).toBeNull();
    expect(displayToMarkdown([removed])).toBe('Closed');
  });

  it('keeps a plain line plain when removing a level it does not have', () => {
    expect(withHeadingLevel(plain, null)).toEqual(plain);
  });

  it('does not carry a level into the next line', () => {
    // The rule an earlier implementation of this idea got wrong: pressing
    // Return after a heading must start an ordinary paragraph (SPEC.md §10.2).
    const heading = withHeadingLevel(plain, 2);
    const next: DisplayLine = {
      level: null,
      text: '',
      prefix: '',
      suffix: '',
      verbatim: false,
    };

    expect(displayToMarkdown([heading, next])).toBe('## A line\n');
  });
});

describe('outline', () => {
  const lines = markdownToDisplay(
    ['# Part', 'text', '## Chapter', '### Scene', 'text', '###### Aside', '## Chapter two'].join(
      '\n',
    ),
  );

  it('lists headings with their line numbers', () => {
    // One-based, like every other line number the core hands out.
    expect(outlineOf(lines)).toEqual([
      { level: 1, text: 'Part', line: 1 },
      { level: 2, text: 'Chapter', line: 3 },
      { level: 3, text: 'Scene', line: 4 },
      { level: 6, text: 'Aside', line: 6 },
      { level: 2, text: 'Chapter two', line: 7 },
    ]);
  });

  it('shows H1 and H2 always, deeper levels only when enabled', () => {
    const entries = outlineOf(lines);

    expect(visibleOutline(entries, false).map((entry) => entry.text)).toEqual([
      'Part',
      'Chapter',
      'Chapter two',
    ]);
    expect(visibleOutline(entries, true)).toHaveLength(5);
  });

  it('is empty for a document without headings', () => {
    expect(outlineOf(markdownToDisplay('no headings here'))).toEqual([]);
  });
});

describe('code blocks are verbatim, by CommonMark\'s rules', () => {
  it('closes a fence only on one at least as long, of the same character', () => {
    const lines = markdownToDisplay(
      ['````', '```', '# not a heading', '````', '# heading'].join('\n'),
    );
    expect(lines.map((line) => line.verbatim)).toEqual([true, true, true, true, false]);
    expect(lines[4]?.level).toBe(1);

    const mixed = markdownToDisplay(['```', '~~~', '# still inside', '```'].join('\n'));
    expect(mixed.map((line) => line.verbatim)).toEqual([true, true, true, true]);
  });

  it('treats four-space indented code after a blank line as verbatim', () => {
    const lines = markdownToDisplay(
      ['text', '', '    # code, not a heading', '    **not bold**', '', 'after'].join('\n'),
    );
    expect(lines.map((line) => line.verbatim)).toEqual([false, false, true, true, false, false]);
    expect(lines[2]?.level).toBeNull();
  });

  it('does not take an indented continuation of a paragraph for code', () => {
    const lines = markdownToDisplay(['a paragraph', '    that continues indented'].join('\n'));
    expect(lines.map((line) => line.verbatim)).toEqual([false, false]);
  });
});

describe('fence rules the standard oracle found (TESTING.md §2.11)', () => {
  it('does not open a backtick fence whose info string contains a backtick', () => {
    // CommonMark examples 138 and 145: these are code spans, not fences.
    for (const text of ['``` ```\naaa\n', '``` aa ```\nfoo\n']) {
      const lines = markdownToDisplay(text);
      expect(lines.map((line) => line.verbatim)).toEqual([false, false, false]);
    }
  });

  it('still opens a backtick fence with an ordinary info string', () => {
    const lines = markdownToDisplay('```ts\ncode\n```\n');
    expect(lines.map((line) => line.verbatim)).toEqual([true, true, true, false]);
  });

  it('lets a tilde fence carry a backtick in its info string', () => {
    const lines = markdownToDisplay('~~~ a`b\ncode\n~~~\n');
    expect(lines.map((line) => line.verbatim)).toEqual([true, true, true, false]);
  });

  it('does not close a fence on a line that carries text after the run', () => {
    // CommonMark example 147: the middle line is content, the last one closes.
    const lines = markdownToDisplay('```\n``` aaa\n```\nafter\n');
    expect(lines.map((line) => line.verbatim)).toEqual([true, true, true, false, false]);
  });

  it('closes a fence on a line with trailing spaces after the run', () => {
    const lines = markdownToDisplay('```\ncode\n```   \n# heading\n');
    expect(lines.map((line) => line.verbatim)).toEqual([true, true, true, false, false]);
    expect(lines[3]?.level).toBe(1);
  });
});
