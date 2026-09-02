import { describe, expect, it } from 'vitest';
import {
  applyDotCommand,
  displayToMarkdown,
  dotCommandAt,
  markdownToDisplay,
  type DisplayLine,
} from '../src/index.js';

function line(markdown: string): DisplayLine {
  const [parsed] = markdownToDisplay(markdown);
  if (parsed === undefined) {
    throw new Error('no line');
  }
  return parsed;
}

describe('dotCommandAt', () => {
  it('recognizes every level', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      expect(dotCommandAt(`.h${level} Title`)?.level).toBe(level);
    }
  });

  it('recognizes a command that is the whole line', () => {
    expect(dotCommandAt('.h1')).toEqual({ level: 1, length: 3 });
  });

  it('includes the separating space, so the heading does not start with one', () => {
    expect(dotCommandAt('.h2 Title')).toEqual({ level: 2, length: 4 });
    expect(dotCommandAt('.h2\tTitle')).toEqual({ level: 2, length: 4 });
  });

  it('rejects a level outside one to six', () => {
    expect(dotCommandAt('.h0 Title')).toBeNull();
    expect(dotCommandAt('.h7 Title')).toBeNull();
  });

  it('rejects a command that is not at the start of the line', () => {
    expect(dotCommandAt('text .h1 more')).toBeNull();
    expect(dotCommandAt(' .h1')).toBeNull();
  });

  it('rejects anything but a separator after the digit', () => {
    expect(dotCommandAt('.h1x')).toBeNull();
    expect(dotCommandAt('.h12')).toBeNull();
    expect(dotCommandAt('.h1.')).toBeNull();
  });

  it('rejects near misses', () => {
    expect(dotCommandAt('.H1 Title')).toBeNull();
    expect(dotCommandAt('h1 Title')).toBeNull();
    expect(dotCommandAt('..h1')).toBeNull();
  });
});

describe('applyDotCommand', () => {
  it('turns a plain line into a heading and removes the command', () => {
    const applied = applyDotCommand(line('.h1 The First Scene'));

    expect(applied?.level).toBe(1);
    expect(applied?.text).toBe('The First Scene');
    expect(displayToMarkdown([applied as DisplayLine])).toBe('# The First Scene');
  });

  it('leaves an empty heading when the command is alone on the line', () => {
    const applied = applyDotCommand(line('.h3'));

    expect(applied?.text).toBe('');
    expect(displayToMarkdown([applied as DisplayLine])).toBe('### ');
  });

  it('changes the level of a line that is already a heading', () => {
    // The author sees "Title" without the `# `, types `.h4` in front of it,
    // and the raw line is `# .h4 Title` — the command is at the start of the
    // *visible* text, which is where it is recognized.
    const heading = line('# .h4 Title');
    const applied = applyDotCommand(heading);

    expect(applied?.level).toBe(4);
    expect(displayToMarkdown([applied as DisplayLine])).toBe('#### Title');
  });

  it('returns null for a line without a command', () => {
    expect(applyDotCommand(line('ordinary text'))).toBeNull();
    expect(applyDotCommand(line('# A heading'))).toBeNull();
  });

  it('never fires inside a fenced code block', () => {
    const lines = markdownToDisplay(['```', '.h1 not a command', '```'].join('\n'));

    expect(applyDotCommand(lines[1] as DisplayLine)).toBeNull();
  });

  it('produces standard Markdown that round-trips', () => {
    const applied = applyDotCommand(line('.h2 Chapter'));
    const markdown = displayToMarkdown([applied as DisplayLine]);

    expect(markdown).toBe('## Chapter');
    expect(displayToMarkdown(markdownToDisplay(markdown))).toBe(markdown);
  });
});
