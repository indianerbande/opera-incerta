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
    expect(outlineOf(lines)).toEqual([
      { level: 1, text: 'Part', line: 0 },
      { level: 2, text: 'Chapter', line: 2 },
      { level: 3, text: 'Scene', line: 3 },
      { level: 6, text: 'Aside', line: 5 },
      { level: 2, text: 'Chapter two', line: 6 },
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
