import { describe, expect, it } from 'vitest';
import { readDiff } from '../src/index.js';

const sample = [
  'diff --git a/part-1/scene.md b/part-1/scene.md',
  'index 1234567..89abcde 100644',
  '--- a/part-1/scene.md',
  '+++ b/part-1/scene.md',
  '@@ -1,4 +1,4 @@',
  ' ## The Second Bell',
  '-A line of text.',
  '+A better line of text.',
  ' ',
  '\\ No newline at end of file',
  '',
].join('\n');

describe('readDiff', () => {
  it('reads the header as a header, not as added and removed lines', () => {
    const lines = readDiff(sample);

    // `--- a/…` and `+++ b/…` start with the same characters as a change.
    expect(lines.slice(0, 4).map((line) => line.kind)).toEqual(['meta', 'meta', 'meta', 'meta']);
  });

  it('reads the change itself', () => {
    const lines = readDiff(sample);
    const kinds = lines.map((line) => line.kind);

    expect(kinds).toEqual([
      'meta',
      'meta',
      'meta',
      'meta',
      'hunk',
      'context',
      'removed',
      'added',
      'context',
      'meta',
    ]);
  });

  it('keeps every line exactly as Git wrote it', () => {
    expect(readDiff(sample).map((line) => line.text).join('\n')).toBe(sample.trimEnd());
  });

  it('is empty for empty output', () => {
    expect(readDiff('')).toEqual([]);
    expect(readDiff('\n')).toEqual([]);
  });

  it('treats a second file’s header as a header again', () => {
    const two = [
      '@@ -1 +1 @@',
      '-one',
      '+two',
      'diff --git a/b.md b/b.md',
      '@@ -1 +1 @@',
      '+added',
    ].join('\n');

    // Once a hunk has started, the `diff --git` line of the *next* file would
    // otherwise be read as context — harmless — but its `---`/`+++` would be
    // read as a removal and an addition, which is not.
    expect(readDiff(two).map((line) => line.kind)).toEqual([
      'hunk',
      'removed',
      'added',
      'context',
      'hunk',
      'added',
    ]);
  });
});
