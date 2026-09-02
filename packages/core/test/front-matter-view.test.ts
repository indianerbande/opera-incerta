import { describe, expect, it } from 'vitest';
import {
  FRONT_MATTER_MAX_LINES,
  frontMatterHeight,
  ownedFrontMatterLines,
  parseSheet,
} from '../src/index.js';

describe('ownedFrontMatterLines', () => {
  it('shows what the serializer would write, and nothing foreign', () => {
    const parsed = parseSheet(
      [
        '---',
        'layout: post',
        'opera-incerta:',
        '  title: A Scene',
        '  topic: harbour',
        'author: Someone',
        '---',
        '# A Scene',
      ].join('\n'),
    );

    expect(ownedFrontMatterLines(parsed.sheet)).toEqual([
      'opera-incerta:',
      '  title: A Scene',
      '  topic: harbour',
    ]);
  });

  it('shows nothing when the sheet owns no fields', () => {
    expect(ownedFrontMatterLines(parseSheet('Just text\n').sheet)).toEqual([]);
    expect(ownedFrontMatterLines(parseSheet('---\nlayout: post\n---\nText\n').sheet)).toEqual([]);
  });

  it('carries a field the codec learns about without being told twice', () => {
    // The point of going through the serializer: a new field appears here
    // because it appears in the file, not because this function was updated.
    const parsed = parseSheet('---\nopera-incerta:\n  notes: |\n    A note\n---\nText\n');
    const lines = ownedFrontMatterLines(parsed.sheet);

    expect(lines[0]).toBe('opera-incerta:');
    expect(lines.join('\n')).toContain('A note');
  });
});

describe('frontMatterHeight', () => {
  it('is the measured height while the content fits', () => {
    expect(frontMatterHeight({ contentHeight: 84, lineCount: 4 })).toBe(84);
    expect(frontMatterHeight({ contentHeight: 210, lineCount: FRONT_MATTER_MAX_LINES })).toBe(210);
  });

  it('caps proportionally, not by a font metric', () => {
    // Twenty lines measured 400px tall: ten of them are 200, whatever the
    // layout engine decided a line is.
    expect(frontMatterHeight({ contentHeight: 400, lineCount: 20 })).toBe(200);
  });

  it('only ever enlarges when dragged', () => {
    expect(frontMatterHeight({ contentHeight: 84, lineCount: 4 }, 200)).toBe(200);
    // Shrinking below the content would hide what the area exists to show.
    expect(frontMatterHeight({ contentHeight: 84, lineCount: 4 }, 20)).toBe(84);
  });

  it('is nothing for nothing, and survives a measurement that failed', () => {
    expect(frontMatterHeight({ contentHeight: 0, lineCount: 0 })).toBe(0);
    expect(frontMatterHeight({ contentHeight: Number.NaN, lineCount: 3 })).toBe(0);
    expect(frontMatterHeight({ contentHeight: Number.NaN, lineCount: 3 }, 60)).toBe(60);
  });
});
