import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecentProjectsFile } from '../src/recent-projects-file.js';

let userData = '';

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'opera-incerta-userdata-'));
});

afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
});

describe('RecentProjectsFile', () => {
  it('starts empty', () => {
    expect(new RecentProjectsFile(userData).read()).toEqual([]);
  });

  it('remembers a project and reads it back', () => {
    const file = new RecentProjectsFile(userData);
    file.remember({ path: '/a', displayName: 'A' });

    expect(new RecentProjectsFile(userData).read()).toEqual([{ path: '/a', displayName: 'A' }]);
  });

  it('puts the newest first and never duplicates a path', () => {
    const file = new RecentProjectsFile(userData);
    file.remember({ path: '/a', displayName: 'A' });
    file.remember({ path: '/b', displayName: 'B' });
    file.remember({ path: '/a', displayName: 'A renamed' });

    expect(file.read()).toEqual([
      { path: '/a', displayName: 'A renamed' },
      { path: '/b', displayName: 'B' },
    ]);
  });

  it('caps the list at ten', () => {
    const file = new RecentProjectsFile(userData);
    for (let index = 0; index < 14; index += 1) {
      file.remember({ path: `/p${index}`, displayName: `P${index}` });
    }

    expect(file.read()).toHaveLength(10);
    expect(file.read()[0]?.path).toBe('/p13');
  });

  it('forgets one entry without touching the others', () => {
    const file = new RecentProjectsFile(userData);
    file.remember({ path: '/a', displayName: 'A' });
    file.remember({ path: '/b', displayName: 'B' });

    expect(file.forget('/a')).toEqual([{ path: '/b', displayName: 'B' }]);
  });

  it('treats an unreadable file as an empty list rather than failing to start', async () => {
    await writeFile(join(userData, 'recent-projects.json'), '{ not json', 'utf8');

    expect(new RecentProjectsFile(userData).read()).toEqual([]);
  });

  it('discards malformed entries when reading', async () => {
    await writeFile(
      join(userData, 'recent-projects.json'),
      JSON.stringify([{ path: '/a' }, { displayName: 'no path' }, 42]),
      'utf8',
    );

    expect(new RecentProjectsFile(userData).read()).toEqual([{ path: '/a', displayName: '/a' }]);
  });

  it('writes readable, newline-terminated JSON', async () => {
    new RecentProjectsFile(userData).remember({ path: '/a', displayName: 'A' });
    const raw = await readFile(join(userData, 'recent-projects.json'), 'utf8');

    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n    "displayName": "A"');
  });

  it('does not interrupt when the directory cannot be written', async () => {
    const file = new RecentProjectsFile(join(userData, 'nested', 'deeper'));
    await mkdir(join(userData, 'nested'), { recursive: true });

    expect(() => file.remember({ path: '/a', displayName: 'A' })).not.toThrow();
  });
});
