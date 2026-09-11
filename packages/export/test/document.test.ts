import { describe, expect, it } from 'vitest';
import type { GroupEntry } from '@opera-incerta/core';
import {
  assembleMarkdown,
  documentParts,
  documentPieces,
  shiftHeadings,
} from '../src/index.js';

/**
 * A library two groups deep, with a sheet beside the first group so that both
 * depths are exercised: one that keeps its heading levels and one that moves.
 */
const library: GroupEntry = {
  kind: 'group',
  name: '',
  relativePath: '.',
  displayName: 'A Novel',
  children: [
    {
      kind: 'sheet',
      name: 'opening.md',
      relativePath: 'opening.md',
      displayName: 'Opening',
      preview: [],
    },
    {
      kind: 'group',
      name: 'part-1',
      relativePath: 'part-1',
      displayName: 'Part One',
      children: [
        {
          kind: 'sheet',
          name: 'scene.md',
          relativePath: 'part-1/scene.md',
          displayName: 'A Scene',
          preview: [],
        },
        {
          kind: 'group',
          name: 'notes',
          relativePath: 'part-1/notes',
          displayName: 'Notes',
          children: [
            {
              kind: 'sheet',
              name: 'note.md',
              relativePath: 'part-1/notes/note.md',
              displayName: 'A Note',
              preview: [],
            },
          ],
        },
      ],
    },
  ],
};

const bodies = new Map([
  ['opening.md', '# Opening\n\nThe harbour, before six.\n'],
  ['part-1/scene.md', '# A Scene\n\nThe bell rang twice.\n'],
  ['part-1/notes/note.md', '# A Note\n\nCheck the tide table.\n'],
]);

describe('assembling the document (specification.md §15.2)', () => {
  it('walks the library in its recorded order, the root not a heading of its own', () => {
    const pieces = documentPieces(library, null);

    expect(pieces.map((piece) => `${piece.kind}:${piece.relativePath}@${piece.depth}`)).toEqual([
      'sheet:opening.md@1',
      'group:part-1@1',
      'sheet:part-1/scene.md@2',
      'group:part-1/notes@2',
      'sheet:part-1/notes/note.md@3',
    ]);
  });

  it('makes a group a heading and moves the sheets inside it down', () => {
    const markdown = assembleMarkdown(documentParts(documentPieces(library, null), bodies));

    expect(markdown).toBe(
      [
        '# Opening',
        '',
        'The harbour, before six.',
        '',
        '# Part One',
        '',
        '## A Scene',
        '',
        'The bell rang twice.',
        '',
        '## Notes',
        '',
        '### A Note',
        '',
        'Check the tide table.',
        '',
      ].join('\n'),
    );
  });

  it('begins where it was asked to, keeping the groups above it', () => {
    const pieces = documentPieces(library, 'part-1/notes/note.md');

    // The excerpt keeps its place in the book: Part One and Notes come with
    // it, the sheets before it do not.
    expect(pieces.map((piece) => piece.relativePath)).toEqual([
      'part-1',
      'part-1/notes',
      'part-1/notes/note.md',
    ]);
    expect(assembleMarkdown(documentParts(pieces, bodies))).toBe(
      '# Part One\n\n## Notes\n\n### A Note\n\nCheck the tide table.\n',
    );
  });

  it('exports nothing for a sheet the library does not have', () => {
    // Not the whole manuscript by accident, which is the failure that would
    // actually cost something.
    expect(documentPieces(library, 'gone.md')).toEqual([]);
  });

  it('leaves out a sheet whose body never arrived, and keeps the rest', () => {
    const partial = new Map(bodies);
    partial.delete('part-1/scene.md');
    const markdown = assembleMarkdown(documentParts(documentPieces(library, null), partial));

    expect(markdown).not.toContain('The bell rang twice');
    expect(markdown).toContain('The harbour, before six.');
    expect(markdown).toContain('Check the tide table.');
  });

  it('never carries front matter, because it is handed only bodies', () => {
    // The codec of §6.3 splits the file; this module is given the body, which
    // is what makes §15.1's rule structural rather than a later removal.
    const markdown = assembleMarkdown(documentParts(documentPieces(library, null), bodies));

    expect(markdown).not.toContain('---');
    expect(markdown).not.toContain('opera-incerta:');
  });
});

describe('moving headings down (specification.md §15.2)', () => {
  it('shifts every level and caps at six', () => {
    expect(shiftHeadings('# One\n\n##### Five\n\n###### Six\n', 2)).toBe(
      '### One\n\n###### Five\n\n###### Six\n',
    );
  });

  it('leaves a hash inside a fenced block alone', () => {
    const text = ['# Title', '', '```bash', '# not a heading', '```', ''].join('\n');

    // The block structure is read for exactly this: shifting it would edit
    // the author's code sample.
    expect(shiftHeadings(text, 1)).toBe(
      ['## Title', '', '```bash', '# not a heading', '```', ''].join('\n'),
    );
  });

  it('changes nothing when there is nowhere to move to', () => {
    expect(shiftHeadings('# One\n', 0)).toBe('# One\n');
    expect(shiftHeadings('Plain text, no heading.\n', 3)).toBe('Plain text, no heading.\n');
  });
});
