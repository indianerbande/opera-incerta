import { describe, expect, it } from 'vitest';
import {
  countConflicts,
  hasConflictMarkers,
  parseConflicts,
  resolveConflicts,
  type ConflictRegion,
} from '../src/index.js';

const merged = [
  '## The Second Bell',
  '',
  '<<<<<<< HEAD',
  'The bell rang twice.',
  '=======',
  'The bell rang once.',
  '>>>>>>> origin/main',
  '',
  'A line both agree on.',
].join('\n');

describe('hasConflictMarkers', () => {
  it('recognises a merged file, and leaves an ordinary one alone', () => {
    expect(hasConflictMarkers(merged)).toBe(true);
    expect(hasConflictMarkers('An ordinary sheet.\n')).toBe(false);
    // Prose may talk about anything, including angle brackets.
    expect(hasConflictMarkers('He wrote <<< and then stopped.')).toBe(false);
  });
});

describe('parseConflicts', () => {
  it('keeps both versions, and the text around them', () => {
    const parts = parseConflicts(merged);

    expect(parts.map((part) => part.kind)).toEqual(['settled', 'conflict', 'settled']);
    const region = parts[1] as ConflictRegion;
    expect(region.ours).toBe('The bell rang twice.');
    expect(region.theirs).toBe('The bell rang once.');
    expect(region.oursLabel).toBe('HEAD');
    expect(region.theirsLabel).toBe('origin/main');
    expect(region.base).toBeNull();
  });

  it('reads the common ancestor when git wrote one', () => {
    const withBase = [
      '<<<<<<< HEAD',
      'mine',
      '||||||| merged common ancestors',
      'the original',
      '=======',
      'theirs',
      '>>>>>>> origin/main',
    ].join('\n');

    expect((parseConflicts(withBase)[0] as ConflictRegion).base).toBe('the original');
  });

  it('is one settled part for a file with no conflict at all', () => {
    expect(parseConflicts('Just a sheet.\n')).toEqual([
      { kind: 'settled', text: 'Just a sheet.\n' },
    ]);
    expect(countConflicts(parseConflicts('Just a sheet.\n'))).toBe(0);
  });

  it('treats a marker that never closes as ordinary text', () => {
    const broken = '<<<<<<< HEAD\nsomething\nand nothing else\n';
    // Inventing a region out of a broken file would be a guess, and the file
    // belongs to the author.
    expect(parseConflicts(broken)).toEqual([{ kind: 'settled', text: broken }]);
  });

  it('reads several regions in one file', () => {
    const two = [
      '<<<<<<< HEAD',
      'first mine',
      '=======',
      'first theirs',
      '>>>>>>> origin/main',
      'between',
      '<<<<<<< HEAD',
      'second mine',
      '=======',
      'second theirs',
      '>>>>>>> origin/main',
    ].join('\n');

    expect(countConflicts(parseConflicts(two))).toBe(2);
  });
});

describe('resolveConflicts', () => {
  const parts = parseConflicts(merged);

  it('writes the chosen side and leaves no marker behind', () => {
    const mine = resolveConflicts(parts, ['ours']);
    const theirs = resolveConflicts(parts, ['theirs']);

    expect(mine).toContain('The bell rang twice.');
    expect(mine).not.toContain('rang once');
    expect(theirs).toContain('The bell rang once.');
    expect(hasConflictMarkers(mine)).toBe(false);
    expect(hasConflictMarkers(theirs)).toBe(false);
  });

  it('keeps everything both sides agreed on', () => {
    for (const choice of ['ours', 'theirs'] as const) {
      const resolved = resolveConflicts(parts, [choice]);
      expect(resolved).toContain('## The Second Bell');
      expect(resolved).toContain('A line both agree on.');
    }
  });

  it('keeps this copy’s version when no choice was made', () => {
    // Silently preferring what came in would be a decision the author did not
    // make.
    expect(resolveConflicts(parts, [])).toContain('The bell rang twice.');
  });

  it('reproduces a file that had no conflict', () => {
    const plain = 'Nothing to decide.\nSecond line.\n';
    expect(resolveConflicts(parseConflicts(plain), [])).toBe(plain);
  });

  it('decides each region separately', () => {
    const two = parseConflicts(
      [
        '<<<<<<< HEAD',
        'first mine',
        '=======',
        'first theirs',
        '>>>>>>> origin/main',
        '<<<<<<< HEAD',
        'second mine',
        '=======',
        'second theirs',
        '>>>>>>> origin/main',
      ].join('\n'),
    );

    // Git already merged everything that did not overlap; a decision per file
    // would throw that away.
    expect(resolveConflicts(two, ['theirs', 'ours'])).toBe('first theirs\nsecond mine');
  });
});
