import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sheetsOf, type GroupEntry } from '@opera-incerta/core';
import { PROJECT_DIRECTORY, canonicalPath } from '@opera-incerta/project-node';
import { ProjectSession, ProjectSessionError, libraryOf } from '../src/project-session.js';

let root = '';

beforeEach(async () => {
  root = await canonicalPath(await mkdtemp(join(tmpdir(), 'opera-incerta-session-')));
  await mkdir(join(root, PROJECT_DIRECTORY), { recursive: true });
  await writeFile(
    join(root, PROJECT_DIRECTORY, 'project.json'),
    JSON.stringify({ id: 'project-1', displayName: 'A Novel', created: '2026-01-01T00:00:00Z' }),
    'utf8',
  );
  await writeFile(
    join(root, 'chapter.md'),
    '---\nopera-incerta:\n  title: Chapter One\n---\nText\n',
    'utf8',
  );
  await mkdir(join(root, 'part-1'), { recursive: true });
  await writeFile(join(root, 'part-1', 'scene.md'), 'Scene text\n', 'utf8');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('opening a project', () => {
  it('returns the record, the library, and a handle for every sheet', async () => {
    const session = new ProjectSession();
    const snapshot = await session.open(root);

    expect(snapshot).toMatchObject({ id: 'project-1', displayName: 'A Novel' });
    // The first sheet has a front matter title; the second falls back to its
    // file name, which is lower case on disk.
    expect(sheetsOf(libraryOf(snapshot)).map((sheet) => sheet.displayName)).toEqual([
      'Chapter One',
      'scene',
    ]);
    expect(Object.keys(snapshot.handles).sort()).toEqual(['chapter.md', 'part-1/scene.md']);
  });

  it('mints opaque handles that contain no path', async () => {
    const session = new ProjectSession();
    const snapshot = await session.open(root);

    for (const handle of Object.values(snapshot.handles)) {
      expect(handle).toMatch(/^[0-9a-f]{32}$/);
      expect(handle).not.toContain('/');
      expect(handle).not.toContain('chapter');
    }
  });

  it('refuses a directory that is not a project', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'opera-incerta-plain-'));
    try {
      await expect(new ProjectSession().open(plain)).rejects.toMatchObject({
        code: 'project/no-project',
      });
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

describe('resolving handles', () => {
  it('reads a sheet through its handle', async () => {
    const session = new ProjectSession();
    const snapshot = await session.open(root);
    const handle = snapshot.handles['chapter.md'] as string;

    expect(await session.readSheet(handle)).toContain('title: Chapter One');
  });

  it('writes through a handle and reads the change back', async () => {
    const session = new ProjectSession();
    const snapshot = await session.open(root);
    const handle = snapshot.handles['part-1/scene.md'] as string;

    await session.writeSheet(handle, 'Rewritten\n');
    expect(await session.readSheet(handle)).toBe('Rewritten\n');
  });

  it('rejects a forged handle rather than reaching a file', async () => {
    const session = new ProjectSession();
    await session.open(root);

    await expect(session.readSheet('f'.repeat(32))).rejects.toMatchObject({
      code: 'handle/unknown',
    });
    await expect(session.readSheet('../../etc/passwd')).rejects.toMatchObject({
      code: 'handle/unknown',
    });
  });

  it('rejects a handle from a previous project', async () => {
    const session = new ProjectSession();
    const first = await session.open(root);
    const staleHandle = first.handles['chapter.md'] as string;

    const other = await canonicalPath(await mkdtemp(join(tmpdir(), 'opera-incerta-other-')));
    try {
      await mkdir(join(other, PROJECT_DIRECTORY), { recursive: true });
      await writeFile(
        join(other, PROJECT_DIRECTORY, 'project.json'),
        JSON.stringify({ id: 'project-2', displayName: 'Other', created: '2026-01-01T00:00:00Z' }),
        'utf8',
      );
      await writeFile(join(other, 'note.md'), 'Note\n', 'utf8');
      await session.open(other);

      await expect(session.readSheet(staleHandle)).rejects.toMatchObject({
        code: 'handle/unknown',
      });
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it('refuses every operation when no project is open', async () => {
    const session = new ProjectSession();

    await expect(session.readSheet('a'.repeat(32))).rejects.toBeInstanceOf(ProjectSessionError);
    await expect(session.readSheet('a'.repeat(32))).rejects.toMatchObject({
      code: 'project/none-open',
    });
  });

  it('forgets its handles when the project closes', async () => {
    const session = new ProjectSession();
    const snapshot = await session.open(root);
    const handle = snapshot.handles['chapter.md'] as string;
    session.close();

    await expect(session.readSheet(handle)).rejects.toMatchObject({ code: 'project/none-open' });
  });
});

describe('reopening', () => {
  it('picks up a sheet added outside the application', async () => {
    const session = new ProjectSession();
    await session.open(root);
    await writeFile(join(root, 'added.md'), 'Added elsewhere\n', 'utf8');

    const snapshot = await session.reopen();
    expect(snapshot).not.toBeNull();
    expect(Object.keys((snapshot as { handles: Record<string, string> }).handles)).toContain(
      'added.md',
    );
  });

  it('returns null when nothing is open', async () => {
    expect(await new ProjectSession().reopen()).toBeNull();
  });
});

describe('size limit', () => {
  it('refuses to write more than the contract allows', async () => {
    const session = new ProjectSession();
    const snapshot = await session.open(root);
    const handle = snapshot.handles['chapter.md'] as string;

    await expect(session.writeSheet(handle, 'x'.repeat(9 * 1024 * 1024))).rejects.toMatchObject({
      code: 'document/too-large',
    });
    // The refusal must not have touched the file.
    expect(await session.readSheet(handle)).toContain('Chapter One');
  });
});

describe('the library it hands over', () => {
  it('carries relative paths only, never absolute ones', async () => {
    const session = new ProjectSession();
    const library = libraryOf(await session.open(root));

    const serialized = JSON.stringify(library);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain(tmpdir());
  });

  it('roots the tree at the project display name', async () => {
    const library = libraryOf(await new ProjectSession().open(root));

    expect(library satisfies GroupEntry).toMatchObject({
      kind: 'group',
      relativePath: '.',
      displayName: 'A Novel',
    });
  });
});
