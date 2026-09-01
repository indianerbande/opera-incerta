import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StructureRecord } from '@opera-incerta/core';
import {
  PROJECT_DIRECTORY,
  canonicalPath,
  createProjectFilesystem,
  scanLibrary,
  sheetsOf,
  type GroupEntry,
} from '../src/index.js';

const filesystem = createProjectFilesystem();
let root = '';

beforeEach(async () => {
  root = await canonicalPath(await mkdtemp(join(tmpdir(), 'opera-incerta-library-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function sheet(relativePath: string, title?: string, body = 'Text\n'): Promise<void> {
  const absolute = join(root, relativePath);
  await mkdir(join(absolute, '..'), { recursive: true });
  const front =
    title === undefined ? '' : `---\nopera-incerta:\n  title: ${title}\n---\n`;
  await writeFile(absolute, `${front}${body}`, 'utf8');
}

async function scan(structure: StructureRecord = {}): Promise<GroupEntry> {
  const library = await scanLibrary(root, 'My Project', filesystem, structure);
  return library.root;
}

describe('scanLibrary', () => {
  it('makes the project directory the top visible node', async () => {
    await sheet('preface.md', 'Preface');
    const tree = await scan();

    expect(tree.kind).toBe('group');
    expect(tree.displayName).toBe('My Project');
    expect(tree.relativePath).toBe('.');
    expect(tree.children).toHaveLength(1);
  });

  it('uses the front matter title as a sheet display name', async () => {
    await sheet('scene-1.md', 'The First Scene');
    const [entry] = (await scan()).children;

    expect(entry).toMatchObject({
      kind: 'sheet',
      name: 'scene-1.md',
      displayName: 'The First Scene',
      relativePath: 'scene-1.md',
    });
  });

  it('falls back to the file name when there is no title', async () => {
    await sheet('untitled.md');
    expect((await scan()).children[0]?.displayName).toBe('untitled');
  });

  it('falls back rather than dropping a sheet whose front matter is broken', async () => {
    await writeFile(join(root, 'broken.md'), '---\nopera-incerta: nonsense\n---\n', 'utf8');
    expect((await scan()).children[0]?.displayName).toBe('broken');
  });

  it('nests groups recursively', async () => {
    await sheet('part-1/chapter-1/scene.md', 'Scene');
    const tree = await scan();
    const part = tree.children[0] as GroupEntry;
    const chapter = part.children[0] as GroupEntry;

    expect(part).toMatchObject({ kind: 'group', name: 'part-1', relativePath: 'part-1' });
    expect(chapter.relativePath).toBe('part-1/chapter-1');
    expect(chapter.children[0]).toMatchObject({ displayName: 'Scene' });
  });

  it('hides the marker directory and other hidden entries', async () => {
    await mkdir(join(root, PROJECT_DIRECTORY), { recursive: true });
    await writeFile(join(root, PROJECT_DIRECTORY, 'project.json'), '{}', 'utf8');
    await writeFile(join(root, '.hidden.md'), 'text', 'utf8');
    await sheet('visible.md', 'Visible');

    expect((await scan()).children.map((entry) => entry.name)).toEqual(['visible.md']);
  });

  it('ignores files that are not Markdown', async () => {
    await writeFile(join(root, 'notes.txt'), 'text', 'utf8');
    await writeFile(join(root, 'cover.png'), 'binary', 'utf8');
    await sheet('chapter.md', 'Chapter');

    expect((await scan()).children.map((entry) => entry.name)).toEqual(['chapter.md']);
  });

  it('applies the recorded order and appends unlisted items alphabetically', async () => {
    await sheet('a.md', 'A');
    await sheet('b.md', 'B');
    await sheet('c.md', 'C');

    const tree = await scan({ '.': { order: ['c.md', 'b.md'] } });
    expect(tree.children.map((entry) => entry.name)).toEqual(['c.md', 'b.md', 'a.md']);
  });

  it('applies a recorded group display name without renaming the directory', async () => {
    await sheet('chapter-1/scene.md', 'Scene');
    const tree = await scan({ 'chapter-1': { displayName: 'Part 1: Beginning' } });
    const group = tree.children[0] as GroupEntry;

    expect(group.name).toBe('chapter-1');
    expect(group.displayName).toBe('Part 1: Beginning');
  });

  it('sorts numerically, so chapter-2 precedes chapter-10', async () => {
    await sheet('chapter-10.md', 'Ten');
    await sheet('chapter-2.md', 'Two');

    expect((await scan()).children.map((entry) => entry.name)).toEqual([
      'chapter-2.md',
      'chapter-10.md',
    ]);
  });

  it('skips a stale order entry without disturbing the rest', async () => {
    await sheet('a.md', 'A');
    const tree = await scan({ '.': { order: ['deleted.md', 'a.md'] } });

    expect(tree.children.map((entry) => entry.name)).toEqual(['a.md']);
  });

  it('handles an empty project', async () => {
    expect((await scan()).children).toEqual([]);
  });

  it('reads no file content when titles are not requested', async () => {
    await sheet('scene.md', 'The First Scene');
    const library = await scanLibrary(root, 'My Project', filesystem, {}, { readTitles: false });

    expect(library.root.children[0]?.displayName).toBe('scene');
  });
});

describe('sheetsOf', () => {
  it('collects every sheet in display order, across groups', async () => {
    await sheet('part-1/b.md', 'B');
    await sheet('part-1/a.md', 'A');
    await sheet('preface.md', 'Preface');

    const tree = await scan({ '.': { order: ['preface.md', 'part-1'] } });
    expect(sheetsOf(tree).map((entry) => entry.displayName)).toEqual(['Preface', 'A', 'B']);
  });
});
