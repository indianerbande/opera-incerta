import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STYLESHEET as MANUSCRIPT, builtInStylesheet } from '@opera-incerta/export';
import { exportFileName, runExport, type ExportDependencies } from '../src/export.js';
import type { AssembledDocument } from '../src/project-session.js';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'opera-incerta-export-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const document: AssembledDocument = {
  title: 'A Novel',
  parts: [
    { kind: 'heading', level: 1, text: 'Part One' },
    { kind: 'sheet', relativePath: 'part-1/scene.md', markdown: '## A Scene\n\nThe bell rang.\n' },
  ],
};

/** What the export needs from outside, scripted. */
function dependencies(
  overrides: Partial<ExportDependencies> = {},
): ExportDependencies & { readonly chosen: string[] } {
  const chosen: string[] = [];
  return {
    chosen,
    chooseDestination: async (_parent, defaultName) => {
      chosen.push(defaultName);
      return join(directory, defaultName);
    },
    setPdf: async (html) => Buffer.from(`%PDF-1.7 of ${String(html.length)} bytes`, 'utf8'),
    shortPathOf: (path) => `~/${basename(path)}`,
    ...overrides,
  };
}

describe('writing the manuscript out (specification.md §15.2)', () => {
  it('writes the assembled Markdown, and says where it went', async () => {
    const outcome = await runExport(document, 'markdown', MANUSCRIPT, null, 'Markdown', dependencies());

    expect(outcome).toEqual({ kind: 'written', shortPath: '~/A Novel.md' });
    expect(await readFile(join(directory, 'A Novel.md'), 'utf8')).toBe(
      '# Part One\n\n## A Scene\n\nThe bell rang.\n',
    );
  });

  it('sets a PDF from the document, with the stylesheet it was given', async () => {
    let printed = '';
    const outcome = await runExport(document, 'pdf', builtInStylesheet('typescript'), null, 'PDF', {
      ...dependencies(),
      setPdf: async (html: string) => {
        printed = html;
        return Buffer.from('%PDF-1.7', 'utf8');
      },
    });

    expect(outcome).toEqual({ kind: 'written', shortPath: '~/A Novel.pdf' });
    // What is set is the module's own document: its style, no script — and
    // the style is the one chosen, not the default (specification.md §15.2).
    expect(printed).toContain('<h1>Part One</h1>');
    expect(printed).toContain(`default-src 'none'`);
    expect(printed).toContain('line-height: 2');
    expect(printed).not.toContain('Georgia');
    expect(await readFile(join(directory, 'A Novel.pdf'), 'utf8')).toBe('%PDF-1.7');
  });

  it('writes nothing at all when the author changes their mind', async () => {
    const outcome = await runExport(document, 'markdown', MANUSCRIPT, null, 'Markdown', {
      ...dependencies(),
      chooseDestination: async () => null,
    });

    expect(outcome).toEqual({ kind: 'cancelled' });
    // Not a file with nothing in it, and not a file at the default name.
    await expect(readFile(join(directory, 'A Novel.md'), 'utf8')).rejects.toThrow();
  });

  it('reports an empty document rather than writing one', async () => {
    let asked = false;
    const outcome = await runExport({ title: 'A Novel', parts: [] }, 'pdf', MANUSCRIPT, null, 'PDF', {
      ...dependencies(),
      chooseDestination: async () => {
        asked = true;
        return join(directory, 'x.pdf');
      },
    });

    expect(outcome).toEqual({ kind: 'empty' });
    // And the author is not sent through a save dialog for nothing.
    expect(asked).toBe(false);
  });
});

describe('the name an export is offered under', () => {
  it('takes the project name and the format extension', () => {
    expect(exportFileName('A Novel', 'md')).toBe('A Novel.md');
  });

  it('keeps no character a path would read as structure', () => {
    // A display name is free text — it may hold a slash, a colon, a quote —
    // and it becomes a file name here.
    expect(exportFileName('A/Novel: "Notes" <1>', 'pdf')).toBe('A Novel Notes 1.pdf');
  });

  it('keeps the digits, which a careless character range would eat', () => {
    // `[ -<]` is a range from space to `<`: every digit and most punctuation.
    // The first version of that line was exactly that mistake.
    expect(exportFileName('Book 2 of 3', 'md')).toBe('Book 2 of 3.md');
  });

  it('falls back rather than offering a file with no name', () => {
    expect(exportFileName('///', 'md')).toBe('manuscript.md');
  });
});
