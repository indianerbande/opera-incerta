import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROJECT_DIRECTORY,
  ProjectError,
  canonicalPath,
  createProjectFilesystem,
  isGroupDirectory,
  isInside,
  isProjectDirectory,
  isSheetFile,
  projectFilePath,
  type ProjectEnvironment,
} from '../src/index.js';

/** Deterministic identity and time, so records are comparable. */
function fixedEnvironment(): ProjectEnvironment {
  let counter = 0;
  return {
    newId: () => `id-${(counter += 1)}`,
    now: () => '2026-09-01T00:00:00.000Z',
  };
}

let root = '';

beforeEach(async () => {
  // Canonicalized: on macOS the temporary directory is reached through a
  // firmlink, and an uncanonicalized path compares unequal to a scanned one
  // (CONVENTIONS.md C-F1).
  root = await canonicalPath(await mkdtemp(join(tmpdir(), 'opera-incerta-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeProject(path: string, displayName = 'A Project'): Promise<void> {
  await mkdir(join(path, PROJECT_DIRECTORY), { recursive: true });
  await writeFile(
    projectFilePath(path),
    JSON.stringify({ id: 'existing-id', displayName, created: '2026-01-01T00:00:00.000Z' }),
    'utf8',
  );
}

describe('inspectFolder', () => {
  const filesystem = createProjectFilesystem(fixedEnvironment());

  it('recognizes a valid project', async () => {
    await makeProject(root);
    expect(await filesystem.inspectFolder(root)).toEqual({ kind: 'valid-project' });
  });

  it('reports a plain directory', async () => {
    await writeFile(join(root, 'notes.md'), 'text', 'utf8');
    expect(await filesystem.inspectFolder(root)).toEqual({ kind: 'no-project' });
  });

  it('reports a directory that does not exist as having no project', async () => {
    expect(await filesystem.inspectFolder(join(root, 'missing'))).toEqual({ kind: 'no-project' });
  });

  it('offers a single subproject', async () => {
    await makeProject(join(root, 'book'));
    expect(await filesystem.inspectFolder(root)).toEqual({
      kind: 'single-subproject',
      relativePath: 'book',
    });
  });

  it('lists several subprojects by name', async () => {
    await makeProject(join(root, 'novel'));
    await makeProject(join(root, 'essays'));
    expect(await filesystem.inspectFolder(root)).toEqual({
      kind: 'multiple-subprojects',
      relativePaths: ['essays', 'novel'],
    });
  });

  it('does not look deeper than the immediate children', async () => {
    await makeProject(join(root, 'a', 'b'));
    expect(await filesystem.inspectFolder(root)).toEqual({ kind: 'no-project' });
  });
});

describe('createProject and readProject', () => {
  it('writes a record with an id and a creation time, and reads it back', async () => {
    const filesystem = createProjectFilesystem(fixedEnvironment());
    const created = await filesystem.createProject(root, 'My Novel');

    expect(created).toEqual({
      id: 'id-1',
      displayName: 'My Novel',
      created: '2026-09-01T00:00:00.000Z',
    });
    expect(await filesystem.readProject(root)).toEqual(created);
    expect(await isProjectDirectory(root)).toBe(true);
  });

  it('never overwrites an existing record', async () => {
    const filesystem = createProjectFilesystem(fixedEnvironment());
    await makeProject(root, 'Original');

    await expect(filesystem.createProject(root, 'Replacement')).rejects.toBeInstanceOf(
      ProjectError,
    );
    expect((await filesystem.readProject(root)).displayName).toBe('Original');
  });

  it('reports a malformed record with a stable code instead of guessing', async () => {
    const filesystem = createProjectFilesystem(fixedEnvironment());
    await mkdir(join(root, PROJECT_DIRECTORY), { recursive: true });
    await writeFile(projectFilePath(root), '{"displayName": "no id"}', 'utf8');

    await expect(filesystem.readProject(root)).rejects.toMatchObject({
      code: 'project/malformed-record',
    });
  });

  it('writes the record as readable, newline-terminated JSON', async () => {
    const filesystem = createProjectFilesystem(fixedEnvironment());
    await filesystem.createProject(root, 'My Novel');
    const raw = await readFile(projectFilePath(root), 'utf8');

    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "displayName": "My Novel"');
  });
});

describe('structure.json', () => {
  const filesystem = createProjectFilesystem(fixedEnvironment());

  it('returns an empty record when the file is missing', async () => {
    expect(await filesystem.readStructure(root)).toEqual({});
  });

  it('returns an empty record when the file is malformed, rather than failing', async () => {
    await mkdir(join(root, PROJECT_DIRECTORY), { recursive: true });
    await writeFile(join(root, PROJECT_DIRECTORY, 'structure.json'), '{ not json', 'utf8');

    expect(await filesystem.readStructure(root)).toEqual({});
  });

  it('round-trips a record', async () => {
    const structure = {
      '.': { order: ['chapter-1', 'preface.md'] },
      'chapter-1': { displayName: 'Part 1', order: ['intro.md'] },
    };
    await filesystem.writeStructure(root, structure);

    expect(await filesystem.readStructure(root)).toEqual(structure);
  });

  it('creates the marker directory if writing comes first', async () => {
    await filesystem.writeStructure(root, { '.': { order: [] } });
    expect(await filesystem.readStructure(root)).toEqual({ '.': { order: [] } });
  });

  it('fails rather than reading an empty record when the file cannot be read', async () => {
    // A directory where the file should be: exists, cannot be read as a
    // file. An empty record here would be written back over it on the next
    // edit.
    await mkdir(join(root, PROJECT_DIRECTORY, 'structure.json'), { recursive: true });
    await expect(filesystem.readStructure(root)).rejects.toMatchObject({
      code: 'structure/unreadable',
    });
    await mkdir(join(root, PROJECT_DIRECTORY, 'categories.json'), { recursive: true });
    await expect(filesystem.readCategories(root)).rejects.toMatchObject({
      code: 'categories/unreadable',
    });
  });

  it('writes the record atomically, leaving no temporary file behind', async () => {
    await filesystem.writeStructure(root, { '.': { order: ['a.md'] } });
    const names = await readdir(join(root, PROJECT_DIRECTORY));
    expect(names).toEqual(['structure.json']);
  });
});

describe('sheets', () => {
  const filesystem = createProjectFilesystem(fixedEnvironment());

  it('round-trips content exactly, including unicode', async () => {
    const path = join(root, 'sheet.md');
    const text = '---\nopera-incerta:\n  title: Größe 🌊\n---\nBody\n';
    await filesystem.writeSheet(path, text);

    expect(await filesystem.readSheet(path)).toBe(text);
  });

  it('leaves no temporary file behind after an atomic write', async () => {
    await filesystem.writeSheet(join(root, 'sheet.md'), 'text');
    expect(await filesystem.listDirectory(root)).toEqual(['sheet.md']);
  });

  it('replaces existing content rather than appending', async () => {
    const path = join(root, 'sheet.md');
    await filesystem.writeSheet(path, 'first');
    await filesystem.writeSheet(path, 'second');

    expect(await filesystem.readSheet(path)).toBe('second');
  });
});

describe('listDirectory', () => {
  const filesystem = createProjectFilesystem(fixedEnvironment());

  it('sorts entries and includes hidden ones', async () => {
    await writeFile(join(root, 'b.md'), '', 'utf8');
    await writeFile(join(root, 'a.md'), '', 'utf8');
    await mkdir(join(root, PROJECT_DIRECTORY));

    expect(await filesystem.listDirectory(root)).toEqual([PROJECT_DIRECTORY, 'a.md', 'b.md']);
  });

  it('returns nothing for a directory that does not exist', async () => {
    expect(await filesystem.listDirectory(join(root, 'missing'))).toEqual([]);
  });
});

describe('path handling', () => {
  it('canonicalizes a path that exists', async () => {
    expect(await canonicalPath(root)).toBe(root);
  });

  it('canonicalizes a path that does not exist yet, through its parent', async () => {
    expect(await canonicalPath(join(root, 'not-yet', 'file.md'))).toBe(
      join(root, 'not-yet', 'file.md'),
    );
  });

  it('recognizes containment', async () => {
    await mkdir(join(root, 'inside'), { recursive: true });

    expect(await isInside(root, join(root, 'inside'))).toBe(true);
    expect(await isInside(root, root)).toBe(true);
  });

  it('rejects a path outside the root, including traversal', async () => {
    expect(await isInside(root, resolve(root, '..'))).toBe(false);
    expect(await isInside(root, join(root, '..', 'elsewhere.md'))).toBe(false);
    expect(await isInside(root, '/etc/passwd')).toBe(false);
  });

  it('compares through a symlinked temporary directory without a false negative', async () => {
    // The regression this guards: an uncanonicalized /var vs /private/var
    // comparison silently reports "outside the project" on macOS.
    const uncanonical = join(tmpdir(), '..', tmpdir().split('/').at(-1) ?? '', 'x');
    expect(await isInside(root, join(root, 'sheet.md'))).toBe(true);
    expect(await isInside(root, uncanonical)).toBe(false);
  });
});

describe('library entry classification', () => {
  it('shows Markdown files and hides hidden ones', () => {
    expect(isSheetFile('chapter.md')).toBe(true);
    expect(isSheetFile('Chapter.MD')).toBe(true);
    expect(isSheetFile('notes.txt')).toBe(false);
    expect(isSheetFile('.hidden.md')).toBe(false);
  });

  it('hides the marker directory from the group tree', () => {
    expect(isGroupDirectory('chapter-1')).toBe(true);
    expect(isGroupDirectory(PROJECT_DIRECTORY)).toBe(false);
    expect(isGroupDirectory('.git')).toBe(false);
  });
});
