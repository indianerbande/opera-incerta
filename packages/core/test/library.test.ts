import { describe, expect, it } from 'vitest';
import {
  ancestorPaths,
  findGroup,
  findSheet,
  groupsOf,
  sheetsInGroup,
  sheetsOf,
  subgroupsOf,
  type GroupEntry,
  type SheetEntry,
} from '../src/index.js';

function sheet(name: string, relativePath: string): SheetEntry {
  return {
    kind: 'sheet',
    name,
    relativePath,
    displayName: name.replace(/\.md$/, ''),
    preview: [],
  };
}

function group(name: string, relativePath: string, children: GroupEntry['children']): GroupEntry {
  return { kind: 'group', name, relativePath, displayName: name, children };
}

const library = group('', '.', [
  sheet('preface.md', 'preface.md'),
  group('part-1', 'part-1', [
    sheet('scene-1.md', 'part-1/scene-1.md'),
    group('pre', 'part-1/pre', [sheet('note.md', 'part-1/pre/note.md')]),
    sheet('scene-2.md', 'part-1/scene-2.md'),
  ]),
]);

describe('sheetsInGroup', () => {
  it('returns only the direct sheets, in order', () => {
    const part = subgroupsOf(library)[0] as GroupEntry;

    expect(sheetsInGroup(part).map((entry) => entry.name)).toEqual([
      'scene-1.md',
      'scene-2.md',
    ]);
  });

  it('does not flatten nested groups, which would make the list a search result', () => {
    const part = subgroupsOf(library)[0] as GroupEntry;

    expect(sheetsInGroup(part).some((entry) => entry.name === 'note.md')).toBe(false);
    expect(sheetsOf(part)).toHaveLength(3);
  });

  it('returns nothing for a group holding only subgroups', () => {
    const empty = group('holder', 'holder', [group('inner', 'holder/inner', [])]);
    expect(sheetsInGroup(empty)).toEqual([]);
  });
});

describe('finding entries', () => {
  it('finds a group and a sheet by relative path', () => {
    expect(findGroup(library, 'part-1/pre')?.name).toBe('pre');
    expect(findSheet(library, 'part-1/scene-2.md')?.name).toBe('scene-2.md');
  });

  it('finds the root by its own path', () => {
    expect(findGroup(library, '.')).toBe(library);
  });

  it('returns null for a path that is not there', () => {
    expect(findGroup(library, 'missing')).toBeNull();
    expect(findSheet(library, 'missing.md')).toBeNull();
  });

  it('lists every group including the root', () => {
    expect(groupsOf(library).map((entry) => entry.relativePath)).toEqual([
      '.',
      'part-1',
      'part-1/pre',
    ]);
  });
});

describe('ancestorPaths', () => {
  it('lists the groups that must be expanded to reveal an entry', () => {
    expect(ancestorPaths('part-1/pre/note.md')).toEqual(['.', 'part-1', 'part-1/pre']);
  });

  it('returns just the root for a top-level entry', () => {
    expect(ancestorPaths('preface.md')).toEqual(['.']);
  });

  it('returns nothing for the root itself', () => {
    expect(ancestorPaths('.')).toEqual([]);
    expect(ancestorPaths('')).toEqual([]);
  });
});
