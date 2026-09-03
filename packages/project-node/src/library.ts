/**
 * The library scan: the folder tree as the application shows it.
 * SPEC.md §6.1, §6.4, §9.1.
 *
 * The folder structure *is* the library. This turns a directory tree into the
 * tree the navigator shows, applying the two things `structure.json` adds on
 * top — display names and explicit order — and resolving each sheet's display
 * name from its own front matter.
 */
import { join } from 'node:path';
import {
  PREVIEW_DENSITIES,
  groupDisplayName,
  markdownToDisplay,
  parseSheet,
  resolveChildOrder,
  type GroupEntry,
  type LibraryEntry,
  type PreviewLine,
  type StructureRecord,
} from '@opera-incerta/core';

/** Enough lines for the largest density step. SPEC.md §9.2. */
const PREVIEW_LINE_LIMIT = PREVIEW_DENSITIES.large.totalLines - 1;
import { isGroupDirectory, isSheetFile } from './node-filesystem.js';
import type { DirectoryEntry, ProjectFilesystem } from './ports.js';

/**
 * The entries of a directory the library shows: groups and sheets, by name,
 * in no particular order. One rule, used by the scan and by the session when
 * it places an entry, so the two cannot disagree about what a group holds.
 */
export function visibleChildren(entries: readonly DirectoryEntry[]): readonly string[] {
  return entries
    .filter(
      (entry) =>
        (entry.kind === 'directory' && isGroupDirectory(entry.name)) ||
        (entry.kind === 'file' && isSheetFile(entry.name)),
    )
    .map((entry) => entry.name);
}

/**
 * Root of the scan. The project directory is itself the top visible node.
 *
 * The entry types live in the portable core: the renderer displays them and
 * must not depend on a package that imports `node:fs`.
 */
export interface Library {
  readonly root: GroupEntry;
}

export interface ScanOptions {
  /**
   * Read each sheet to resolve its front matter title. Switching this off
   * gives a structure-only scan that touches no file content, which is what a
   * large-library refresh will want once performance becomes a concern.
   */
  readonly readTitles?: boolean;
}

/**
 * Scans a project into its library tree.
 *
 * Hidden entries are skipped, which includes the `.opera-incerta/` marker
 * directory: it holds metadata about the library, not part of it. A sheet
 * whose front matter cannot be read keeps its file name as display name rather
 * than disappearing from the tree (SPEC.md §16).
 */
export async function scanLibrary(
  projectPath: string,
  displayName: string,
  filesystem: ProjectFilesystem,
  structure: StructureRecord,
  options: ScanOptions = {},
): Promise<Library> {
  const readTitles = options.readTitles ?? true;
  const children = await scanChildren(projectPath, '.', filesystem, structure, readTitles);

  return {
    root: {
      kind: 'group',
      name: '',
      relativePath: '.',
      displayName,
      children,
    },
  };
}

async function scanChildren(
  projectPath: string,
  relativePath: string,
  filesystem: ProjectFilesystem,
  structure: StructureRecord,
  readTitles: boolean,
): Promise<readonly LibraryEntry[]> {
  const absolutePath = relativePath === '.' ? projectPath : join(projectPath, relativePath);
  const entries = await filesystem.listEntries(absolutePath);

  // The listing says what each entry is; nothing has to be opened to find
  // out. (It used to read every non-Markdown file in full to learn that it
  // was not a directory.)
  const classified = visibleChildren(entries).map((name) => ({
    name,
    isGroup: entries.find((entry) => entry.name === name)?.kind === 'directory',
  }));

  const order = resolveChildOrder(
    classified.map((entry) => entry.name),
    structure[relativePath],
  );

  const children: LibraryEntry[] = [];
  for (const name of order) {
    const entry = classified.find((candidate) => candidate.name === name);
    if (entry === undefined) {
      continue;
    }
    const childRelative = relativePath === '.' ? name : `${relativePath}/${name}`;
    const childAbsolute = join(absolutePath, name);

    if (entry.isGroup) {
      children.push({
        kind: 'group',
        name,
        relativePath: childRelative,
        displayName: groupDisplayName(name, structure[childRelative]),
        children: await scanChildren(projectPath, childRelative, filesystem, structure, readTitles),
      });
      continue;
    }

    const read = await readSheetForList(filesystem, childAbsolute, name, readTitles);
    children.push({
      kind: 'sheet',
      name,
      relativePath: childRelative,
      displayName: read.displayName,
      ...(read.category === undefined ? {} : { category: read.category }),
      preview: read.preview,
    });
  }

  return children;
}

/**
 * Reads a sheet once for both the things the list needs: its display name and
 * its preview lines. Reading the file twice would double the cost of a scan.
 */
async function readSheetForList(
  filesystem: ProjectFilesystem,
  absolutePath: string,
  fileName: string,
  readTitles: boolean,
): Promise<{ displayName: string; category?: string; preview: readonly PreviewLine[] }> {
  const fallback = fileName.replace(/\.md$/i, '');
  if (!readTitles) {
    return { displayName: fallback, preview: [] };
  }

  try {
    const text = await filesystem.readSheet(absolutePath);
    const { sheet } = parseSheet(text);
    const title = sheet.metadata.title?.trim();

    return {
      displayName: title === undefined || title === '' ? fallback : title,
      ...(sheet.metadata.category === undefined ? {} : { category: sheet.metadata.category }),
      preview: markdownToDisplay(sheet.body)
        .slice(0, PREVIEW_LINE_LIMIT)
        .map((line) => ({ text: line.text, level: line.level })),
    };
  } catch {
    return { displayName: fallback, preview: [] };
  }
}

/** Absolute path of an entry inside a project. */
export function absolutePathOf(projectPath: string, relativePath: string): string {
  return relativePath === '.' ? projectPath : join(projectPath, relativePath);
}
