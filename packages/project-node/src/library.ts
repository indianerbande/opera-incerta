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
  groupDisplayName,
  parseSheet,
  resolveChildOrder,
  type StructureRecord,
} from '@opera-incerta/core';
import { isGroupDirectory, isSheetFile } from './node-filesystem.js';
import type { ProjectFilesystem } from './ports.js';

export interface SheetEntry {
  readonly kind: 'sheet';
  /** File name, the stable technical identifier. Never renamed by the app. */
  readonly name: string;
  /** Path relative to the project root, with forward slashes. */
  readonly relativePath: string;
  readonly absolutePath: string;
  /** Front matter title, or the file name without its extension. */
  readonly displayName: string;
}

export interface GroupEntry {
  readonly kind: 'group';
  readonly name: string;
  readonly relativePath: string;
  readonly absolutePath: string;
  /** Recorded display name, or the real directory name. */
  readonly displayName: string;
  readonly children: readonly LibraryEntry[];
}

export type LibraryEntry = SheetEntry | GroupEntry;

/** Root of the scan. The project directory is itself the top visible node. */
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
      absolutePath: projectPath,
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
  const names = await filesystem.listDirectory(absolutePath);

  const visible = names.filter((name) =>
    name.includes('.') ? isSheetFile(name) || isVisibleDirectoryName(name) : isGroupDirectory(name),
  );

  // The directory listing does not say what is a directory, so each candidate
  // is classified by trying to list it. A file lists as empty.
  const classified: Array<{ name: string; isGroup: boolean }> = [];
  for (const name of visible) {
    const isGroup = !isSheetFile(name) && (await isDirectory(filesystem, join(absolutePath, name)));
    if (isGroup || isSheetFile(name)) {
      classified.push({ name, isGroup });
    }
  }

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
        absolutePath: childAbsolute,
        displayName: groupDisplayName(name, structure[childRelative]),
        children: await scanChildren(projectPath, childRelative, filesystem, structure, readTitles),
      });
      continue;
    }

    children.push({
      kind: 'sheet',
      name,
      relativePath: childRelative,
      absolutePath: childAbsolute,
      displayName: await sheetDisplayName(filesystem, childAbsolute, name, readTitles),
    });
  }

  return children;
}

/** A directory may contain a dot in its name; only hidden ones are skipped. */
function isVisibleDirectoryName(name: string): boolean {
  return !name.startsWith('.');
}

async function isDirectory(filesystem: ProjectFilesystem, absolutePath: string): Promise<boolean> {
  try {
    await filesystem.readSheet(absolutePath);
    return false;
  } catch {
    return true;
  }
}

async function sheetDisplayName(
  filesystem: ProjectFilesystem,
  absolutePath: string,
  fileName: string,
  readTitles: boolean,
): Promise<string> {
  const fallback = fileName.replace(/\.md$/i, '');
  if (!readTitles) {
    return fallback;
  }

  try {
    const text = await filesystem.readSheet(absolutePath);
    const title = parseSheet(text).sheet.metadata.title?.trim();
    return title === undefined || title === '' ? fallback : title;
  } catch {
    return fallback;
  }
}

/** Depth-first walk over every entry of a library. */
export function* walkLibrary(entry: LibraryEntry): Generator<LibraryEntry> {
  yield entry;
  if (entry.kind === 'group') {
    for (const child of entry.children) {
      yield* walkLibrary(child);
    }
  }
}

/** Every sheet in the library, in display order. */
export function sheetsOf(entry: LibraryEntry): readonly SheetEntry[] {
  return [...walkLibrary(entry)].filter((item): item is SheetEntry => item.kind === 'sheet');
}
