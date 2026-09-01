import { describe, expect, it } from 'vitest';
import {
  RECENT_PROJECTS_LIMIT,
  readRecentProjects,
  withRecentProject,
  withoutRecentProject,
  type RecentProject,
} from '../src/index.js';

const project = (path: string, displayName = path): RecentProject => ({ path, displayName });

describe('withRecentProject', () => {
  it('puts the newest project first', () => {
    const list = withRecentProject([project('/a')], project('/b'));
    expect(list.map((entry) => entry.path)).toEqual(['/b', '/a']);
  });

  it('moves an existing project up instead of duplicating it', () => {
    const list = withRecentProject([project('/a'), project('/b')], project('/b'));
    expect(list.map((entry) => entry.path)).toEqual(['/b', '/a']);
  });

  it('refreshes the display name of a project reopened after a rename', () => {
    const list = withRecentProject([project('/a', 'Old')], project('/a', 'New'));
    expect(list[0]?.displayName).toBe('New');
  });

  it('caps the list at ten', () => {
    let list: readonly RecentProject[] = [];
    for (let index = 0; index < 15; index += 1) {
      list = withRecentProject(list, project(`/p${index}`));
    }

    expect(list).toHaveLength(RECENT_PROJECTS_LIMIT);
    expect(list[0]?.path).toBe('/p14');
    expect(list.at(-1)?.path).toBe('/p5');
  });
});

describe('withoutRecentProject', () => {
  it('removes the entry for a project that is gone', () => {
    expect(withoutRecentProject([project('/a'), project('/b')], '/a')).toEqual([project('/b')]);
  });

  it('leaves the list alone when the path is not in it', () => {
    const list = [project('/a')];
    expect(withoutRecentProject(list, '/missing')).toEqual(list);
  });
});

describe('readRecentProjects', () => {
  it('reads a well-formed list', () => {
    expect(readRecentProjects([{ path: '/a', displayName: 'A' }])).toEqual([project('/a', 'A')]);
  });

  it('returns an empty list for unreadable storage rather than failing to start', () => {
    expect(readRecentProjects(null)).toEqual([]);
    expect(readRecentProjects({ not: 'an array' })).toEqual([]);
  });

  it('discards malformed entries and duplicates, and defaults a missing name', () => {
    expect(
      readRecentProjects([
        { path: '/a' },
        { path: '/a', displayName: 'duplicate' },
        { displayName: 'no path' },
        { path: '' },
        'nonsense',
        null,
      ]),
    ).toEqual([project('/a', '/a')]);
  });

  it('caps a stored list that grew too long elsewhere', () => {
    const stored = Array.from({ length: 20 }, (_value, index) => ({ path: `/p${index}` }));
    expect(readRecentProjects(stored)).toHaveLength(RECENT_PROJECTS_LIMIT);
  });
});
