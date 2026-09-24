import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as nativeJoin, posix } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROJECT_DIRECTORY,
  canonicalPath,
  createMemoryFilesystem,
  createProjectFilesystem,
  type ProjectFilesystem,
} from '../src/index.js';

/**
 * One suite, two implementations. What the Node one does against the disk,
 * the in-memory one must do against its maps, or a test that passes on the
 * double says nothing about the application.
 */
interface Subject {
  readonly filesystem: ProjectFilesystem;
  readonly root: string;
  readonly join: typeof nativeJoin;
  cleanup(): Promise<void>;
}

const subjects: ReadonlyArray<readonly [string, () => Promise<Subject>]> = [
  [
    'over the disk',
    async () => {
      const root = await canonicalPath(await mkdtemp(nativeJoin(tmpdir(), 'opera-incerta-contract-')));
      return {
        filesystem: createProjectFilesystem(),
        root,
        join: nativeJoin,
        cleanup: () => rm(root, { recursive: true, force: true }),
      };
    },
  ],
  [
    'in memory',
    async () => {
      const filesystem = createMemoryFilesystem();
      await filesystem.createDirectory('/books/here');
      return { filesystem, root: '/books/here', join: posix.join, cleanup: async () => undefined };
    },
  ],
];

for (const [name, make] of subjects) {
  describe(`the project filesystem ${name}`, () => {
    let subject: Subject;
    // The virtual filesystem has POSIX paths; the disk has host-native paths.
    const join = (...parts: string[]): string => subject.join(...parts);
    beforeEach(async () => {
      subject = await make();
    });
    afterEach(async () => {
      await subject.cleanup();
    });

    it('creates a project once, reads it back, and refuses to create it twice', async () => {
      const { filesystem, root } = subject;
      expect(await filesystem.inspectFolder(root)).toEqual({ kind: 'no-project' });

      const record = await filesystem.createProject(root, 'A Novel');
      expect(record.displayName).toBe('A Novel');
      expect(record.id).not.toBe('');
      expect(await filesystem.readProject(root)).toEqual(record);
      expect(await filesystem.inspectFolder(root)).toEqual({ kind: 'valid-project' });
      await expect(filesystem.createProject(root, 'Again')).rejects.toMatchObject({
        code: 'project/already-exists',
      });
    });

    it('finds subprojects one level down, and no deeper', async () => {
      const { filesystem, root } = subject;
      await filesystem.createDirectory(join(root, 'one'));
      await filesystem.createProject(join(root, 'one'), 'One');
      expect(await filesystem.inspectFolder(root)).toEqual({
        kind: 'single-subproject',
        relativePath: 'one',
      });
      await filesystem.createDirectory(join(root, 'two'));
      await filesystem.createProject(join(root, 'two'), 'Two');
      expect(await filesystem.inspectFolder(root)).toEqual({
        kind: 'multiple-subprojects',
        relativePaths: ['one', 'two'],
      });
    });

    it('reads a missing structure or category file as the documented fallback', async () => {
      const { filesystem, root } = subject;
      expect(await filesystem.readStructure(root)).toEqual({});
      expect(await filesystem.readCategories(root)).toEqual([]);
      expect(await filesystem.readRecentSheets(root)).toEqual([]);
    });

    it('round-trips what was edited recently, and reads nonsense as nothing', async () => {
      const { filesystem, root } = subject;
      await filesystem.writeRecentSheets(root, ['part-1/scene.md', 'preface.md']);
      expect(await filesystem.readRecentSheets(root)).toEqual(['part-1/scene.md', 'preface.md']);

      // A convenience is never a reason to fail to open a project (specification.md
      // §9.4) — a file a merge left with markers in it reads as an empty list.
      await filesystem.writeSheet(join(root, PROJECT_DIRECTORY, 'recent.json'), '<<<<<<< HEAD\n');
      expect(await filesystem.readRecentSheets(root)).toEqual([]);
    });

    it('round-trips the structure and the categories, creating the marker directory', async () => {
      const { filesystem, root } = subject;
      const structure = { '.': { order: ['b.md', 'a.md'] }, part: { displayName: 'Part' } };
      await filesystem.writeStructure(root, structure);
      expect(await filesystem.readStructure(root)).toEqual(structure);

      const categories = [{ id: 'x', name: 'Draft', color: '#ff0000' }];
      await filesystem.writeCategories(root, categories);
      expect(await filesystem.readCategories(root)).toEqual(categories);
      expect(await filesystem.isDirectory(join(root, PROJECT_DIRECTORY))).toBe(true);
    });

    it('keeps the author\'s own stylesheets, and offers only what it can read', async () => {
      const { filesystem, root } = subject;
      // A project has none until the author duplicates one — the ordinary
      // case, not a failure (specification.md §15.2).
      expect(await filesystem.listStylesheets(root)).toEqual([]);
      expect(await filesystem.readStylesheet(root, 'Mine')).toBeNull();

      await filesystem.writeStylesheet(root, 'Mine', 'body { color: red; }');
      await filesystem.writeStylesheet(root, 'Another', 'body { color: blue; }');
      expect(await filesystem.listStylesheets(root)).toEqual(['Another', 'Mine']);
      expect(await filesystem.readStylesheet(root, 'Mine')).toBe('body { color: red; }');

      // The folder is the author's; whatever else is in it is not offered.
      await filesystem.writeSheet(
        join(root, PROJECT_DIRECTORY, 'styles', 'notes.txt'),
        'not a stylesheet',
      );
      expect(await filesystem.listStylesheets(root)).toEqual(['Another', 'Mine']);

      // A name a path would read as structure never becomes a file.
      await expect(filesystem.writeStylesheet(root, '../escape', 'x')).rejects.toMatchObject({
        code: 'stylesheet/name',
      });
    });

    it('round-trips a sheet, and needs its directory to exist', async () => {
      const { filesystem, root } = subject;
      await filesystem.writeSheet(join(root, 'a.md'), 'Größe\n');
      expect(await filesystem.readSheet(join(root, 'a.md'))).toBe('Größe\n');
      await expect(filesystem.writeSheet(join(root, 'nowhere', 'b.md'), 'x')).rejects.toBeDefined();
      await expect(filesystem.readSheet(join(root, 'missing.md'))).rejects.toBeDefined();
    });

    it('lists entries with their kind, sorted, hidden ones included', async () => {
      const { filesystem, root } = subject;
      await filesystem.createDirectory(join(root, 'part-1'));
      await filesystem.createDirectory(join(root, '.hidden'));
      await filesystem.writeSheet(join(root, 'b.md'), 'b');
      await filesystem.writeSheet(join(root, 'a.md'), 'a');
      await filesystem.writeSheet(join(root, 'notes.txt'), 'n');

      expect(await filesystem.listEntries(root)).toEqual([
        { name: '.hidden', kind: 'directory' },
        { name: 'a.md', kind: 'file' },
        { name: 'b.md', kind: 'file' },
        { name: 'notes.txt', kind: 'file' },
        { name: 'part-1', kind: 'directory' },
      ]);
      expect(await filesystem.listDirectory(root)).toEqual([
        '.hidden',
        'a.md',
        'b.md',
        'notes.txt',
        'part-1',
      ]);
      expect(await filesystem.listEntries(join(root, 'gone'))).toEqual([]);
    });

    it('knows a directory from a file and from nothing', async () => {
      const { filesystem, root } = subject;
      await filesystem.createDirectory(join(root, 'part-1'));
      await filesystem.writeSheet(join(root, 'a.md'), 'a');
      expect(await filesystem.isDirectory(join(root, 'part-1'))).toBe(true);
      expect(await filesystem.isDirectory(join(root, 'a.md'))).toBe(false);
      expect(await filesystem.isDirectory(join(root, 'gone'))).toBe(false);
    });

    it('creates every missing parent of a directory', async () => {
      const { filesystem, root } = subject;
      await filesystem.createDirectory(join(root, 'a', 'b', 'c'));
      expect(await filesystem.isDirectory(join(root, 'a', 'b'))).toBe(true);
      expect(await filesystem.listEntries(join(root, 'a'))).toEqual([
        { name: 'b', kind: 'directory' },
      ]);
    });

    it('moves a file, and a directory with everything in it', async () => {
      const { filesystem, root } = subject;
      await filesystem.createDirectory(join(root, 'from', 'deep'));
      await filesystem.createDirectory(join(root, 'to'));
      await filesystem.writeSheet(join(root, 'from', 'deep', 'a.md'), 'a');
      await filesystem.writeSheet(join(root, 'b.md'), 'b');

      await filesystem.moveEntry(join(root, 'b.md'), join(root, 'to', 'c.md'));
      expect(await filesystem.readSheet(join(root, 'to', 'c.md'))).toBe('b');
      expect(await filesystem.listDirectory(root)).not.toContain('b.md');

      await filesystem.moveEntry(join(root, 'from'), join(root, 'to', 'moved'));
      expect(await filesystem.readSheet(join(root, 'to', 'moved', 'deep', 'a.md'))).toBe('a');
      expect(await filesystem.isDirectory(join(root, 'from'))).toBe(false);
      await expect(
        filesystem.moveEntry(join(root, 'gone'), join(root, 'to', 'x')),
      ).rejects.toBeDefined();
    });
  });
}
