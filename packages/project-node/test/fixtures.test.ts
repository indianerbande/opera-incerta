import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSheet, serializeSheet, sheetsOf, type GroupEntry } from '@opera-incerta/core';
import { createProjectFilesystem, scanLibrary } from '../src/index.js';

const EXAMPLES = fileURLToPath(new URL('../../../examples/', import.meta.url));
const filesystem = createProjectFilesystem();

function fixture(name: string): string {
  return join(EXAMPLES, name);
}

async function markdownFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

describe('nested-project', () => {
  const root = fixture('nested-project');

  it('scans into the recorded order with recorded display names', async () => {
    const structure = await filesystem.readStructure(root);
    const project = await filesystem.readProject(root);
    const tree = (await scanLibrary(root, project.displayName, filesystem, structure)).root;

    expect(tree.displayName).toBe('The Harbour Novel');
    expect(tree.children.map((entry) => entry.name)).toEqual(['preface.md', 'part-1']);

    const part = tree.children[1] as GroupEntry;
    expect(part.displayName).toBe('Part 1: Departure');
    expect(part.children.map((entry) => entry.name)).toEqual(['scene-2.md', 'scene-1.md', 'pre']);
  });

  it('takes sheet display names from front matter', async () => {
    const structure = await filesystem.readStructure(root);
    const tree = (await scanLibrary(root, 'x', filesystem, structure)).root;

    expect(sheetsOf(tree).map((entry) => entry.displayName)).toEqual([
      'Preface',
      'The Second Bell',
      'Arrival at the Harbour',
      'Research note',
    ]);
  });

  it('round-trips every sheet byte-for-byte', async () => {
    for (const path of await markdownFiles(root)) {
      const original = await readFile(path, 'utf8');
      const parsed = parseSheet(original);

      expect(parsed.writable, path).toBe(true);
      expect(serializeSheet(parsed.sheet), path).toBe(original);
    }
  });
});

describe('foreign-front-matter', () => {
  const root = fixture('foreign-front-matter');

  it('is idempotent for every file: saving twice equals saving once', async () => {
    for (const path of await markdownFiles(root)) {
      const parsed = parseSheet(await readFile(path, 'utf8'));
      expect(parsed.writable, path).toBe(true);

      const once = serializeSheet(parsed.sheet);
      expect(serializeSheet(parseSheet(once).sheet), path).toBe(once);
    }
  });

  it('preserves every foreign line verbatim, in its original relative order', async () => {
    for (const path of await markdownFiles(root)) {
      const original = await readFile(path, 'utf8');
      const written = serializeSheet(parseSheet(original).sheet);

      for (const line of parseSheet(original).sheet.foreignLines) {
        expect(written.split('\n'), path).toContain(line);
      }
    }
  });

  it('round-trips byte-for-byte when the owned block already comes first', async () => {
    for (const name of ['jekyll-post.md', 'untouched.md']) {
      const original = await readFile(join(root, name), 'utf8');
      expect(serializeSheet(parseSheet(original).sheet), name).toBe(original);
    }
  });

  it('moves a trailing owned block to the front once, and only once', async () => {
    // specification.md §6.3: owned fields are written first, foreign lines follow in
    // their original relative order. A file whose block sat at the end is
    // therefore reordered on the first save — and never again.
    const original = await readFile(join(root, 'obsidian-note.md'), 'utf8');
    const once = serializeSheet(parseSheet(original).sheet);

    expect(once).not.toBe(original);
    expect(once.indexOf('opera-incerta:')).toBeLessThan(once.indexOf('aliases:'));
    expect(once.indexOf('aliases:')).toBeLessThan(once.indexOf('cssclass:'));
    expect(serializeSheet(parseSheet(once).sheet)).toBe(once);
    expect(parseSheet(once).sheet.metadata).toEqual(parseSheet(original).sheet.metadata);
  });

  it('claims only the namespaced fields of the Jekyll post', async () => {
    const original = await readFile(join(root, 'jekyll-post.md'), 'utf8');
    const { sheet } = parseSheet(original);

    expect(sheet.metadata).toEqual({ title: 'A Post We Adopted', topic: 'import' });
    expect(sheet.foreignLines.join('\n')).toContain('title: A Jekyll Title');
    expect(sheet.foreignLines.join('\n')).toContain('status: published');
  });

  it('invents no block for a file that has none', async () => {
    const original = await readFile(join(root, 'untouched.md'), 'utf8');
    const { sheet } = parseSheet(original);

    expect(sheet.metadata).toEqual({});
    expect(serializeSheet(sheet)).toBe(original);
  });

  it('keeps a nested mapping, a sequence, a folded block, and a comment', async () => {
    const original = await readFile(join(root, 'jekyll-post.md'), 'utf8');
    const foreign = parseSheet(original).sheet.foreignLines.join('\n');

    expect(foreign).toContain('  - travel');
    expect(foreign).toContain('  description: >');
    expect(foreign).toContain('# a comment the other tool left behind');
  });
});

describe('stale-structure', () => {
  const root = fixture('stale-structure');

  it('ignores the removed entry and appends the unlisted one', async () => {
    const structure = await filesystem.readStructure(root);
    const tree = (await scanLibrary(root, 'x', filesystem, structure)).root;

    expect(tree.children.map((entry) => entry.name)).toEqual([
      'second.md',
      'added-externally.md',
    ]);
  });
});

describe('broken-metadata', () => {
  const root = fixture('broken-metadata');

  it('reports the malformed project record instead of guessing', async () => {
    await expect(filesystem.readProject(root)).rejects.toMatchObject({
      code: 'project/malformed-record',
    });
  });

  it('falls back to an empty structure rather than failing to open', async () => {
    expect(await filesystem.readStructure(root)).toEqual({});
  });

  it('marks each failure mode read-only with its own diagnostic', async () => {
    const cases = [
      ['scalar-namespace.md', 'front-matter/namespace-not-a-mapping'],
      ['duplicated-namespace.md', 'front-matter/namespace-duplicated'],
      ['unterminated.md', 'front-matter/unterminated'],
    ] as const;

    for (const [name, code] of cases) {
      const parsed = parseSheet(await readFile(join(root, name), 'utf8'));

      expect(parsed.writable, name).toBe(false);
      expect(parsed.diagnostics[0]?.code, name).toBe(code);
      expect(parsed.sheet.metadata, name).toEqual({});
    }
  });

  it('still scans the project, showing every sheet by file name', async () => {
    const tree = (await scanLibrary(root, 'Broken', filesystem, {})).root;

    expect(sheetsOf(tree).map((entry) => entry.displayName)).toEqual([
      'duplicated-namespace',
      'scalar-namespace',
      'unterminated',
    ]);
  });
});
