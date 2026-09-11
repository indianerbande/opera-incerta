/**
 * The Node.js implementation of the project ports. SPEC.md §6, §7, §8.6.
 *
 * Every filesystem access of the application passes through here. The rules it
 * applies — ordering, display names, slugs — live in `@opera-incerta/core`;
 * this module only performs the input and output.
 */
import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  CodedError,
  type PageCategory,
  type ProjectRecord,
  type StructureRecord,
  readCategories,
  readRecentSheets,
  readStructureRecord,
} from '@opera-incerta/core';
import {
  PROJECT_DIRECTORY,
  PROJECT_FILES,
  SHEET_EXTENSION,
  type DirectoryEntry,
  type FolderInspection,
  type ProjectFilesystem,
} from './ports.js';

/**
 * Sources of non-determinism, injected so that tests are deterministic and the
 * randomness stays explicit (CONVENTIONS.md C-A9).
 */
export interface ProjectEnvironment {
  readonly newId: () => string;
  readonly now: () => string;
}

const REAL_ENVIRONMENT: ProjectEnvironment = {
  newId: () => randomUUID(),
  now: () => new Date().toISOString(),
};

export function createProjectFilesystem(
  environment: ProjectEnvironment = REAL_ENVIRONMENT,
): ProjectFilesystem {
  return new NodeProjectFilesystem(environment);
}

class NodeProjectFilesystem implements ProjectFilesystem {
  readonly #environment: ProjectEnvironment;

  constructor(environment: ProjectEnvironment) {
    this.#environment = environment;
  }

  /**
   * Classifies a directory the user chose. SPEC.md §8.6.
   *
   * Only the immediate children are examined: a project nested three levels
   * down is not something the user pointed at.
   */
  async inspectFolder(absolutePath: string): Promise<FolderInspection> {
    if (await isProjectDirectory(absolutePath)) {
      return { kind: 'valid-project' };
    }

    const entries = await safeReaddir(absolutePath);
    const subprojects: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && (await isProjectDirectory(join(absolutePath, entry.name)))) {
        subprojects.push(entry.name);
      }
    }
    subprojects.sort();

    if (subprojects.length === 0) {
      return { kind: 'no-project' };
    }
    if (subprojects.length === 1) {
      return { kind: 'single-subproject', relativePath: subprojects[0] as string };
    }
    return { kind: 'multiple-subprojects', relativePaths: subprojects };
  }

  async readProject(absolutePath: string): Promise<ProjectRecord> {
    const raw = await readFile(projectFilePath(absolutePath), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const record = readProjectRecord(parsed);
    if (record === null) {
      throw new ProjectError('project/malformed-record', absolutePath);
    }
    return record;
  }

  /**
   * Creates the marker directory and `project.json` for a directory that has
   * none. Used both for a new project and for adopting an existing folder;
   * an existing record is never overwritten.
   */
  async createProject(absolutePath: string, displayName: string): Promise<ProjectRecord> {
    if (await isProjectDirectory(absolutePath)) {
      throw new ProjectError('project/already-exists', absolutePath);
    }

    const record: ProjectRecord = {
      id: this.#environment.newId(),
      displayName,
      created: this.#environment.now(),
    };

    await mkdir(join(absolutePath, PROJECT_DIRECTORY), { recursive: true });
    await writeJson(projectFilePath(absolutePath), record);
    return record;
  }

  /**
   * Reads `categories.json`. A missing file means no categories, and a
   * malformed one the documented fallback (SPEC.md §6.6, §16); anything else
   * is a failure, because the next edit would write the fallback over the
   * author's file.
   */
  async readCategories(projectPath: string): Promise<readonly PageCategory[]> {
    const raw = await readOptional(categoriesFilePath(projectPath), 'categories/unreadable');
    return raw === null ? [] : readCategories(parseLeniently(raw));
  }

  async writeCategories(projectPath: string, categories: readonly PageCategory[]): Promise<void> {
    await mkdir(join(projectPath, PROJECT_DIRECTORY), { recursive: true });
    await writeJson(categoriesFilePath(projectPath), categories);
  }

  /**
   * Reads `structure.json`. A missing or malformed file yields an empty
   * record, so the library falls back to directory names and alphabetical
   * order rather than failing to open (SPEC.md §6.4, §16). A file that exists
   * and cannot be read — a permission, a device error, a directory in its
   * place — is a failure, not an empty record: every edit re-reads and
   * rewrites this file, and an empty record written back would replace the
   * author's arrangement with nothing.
   */
  /**
   * The recently edited sheets. SPEC.md §9.4.
   *
   * Anything unreadable — a truncated write, a merge that left conflict
   * markers — is an empty list. The file is a convenience, and a convenience
   * may never keep a project from opening.
   */
  async readRecentSheets(projectPath: string): Promise<readonly string[]> {
    try {
      const raw = await readFile(recentFilePath(projectPath), 'utf8');
      return readRecentSheets(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async writeRecentSheets(projectPath: string, paths: readonly string[]): Promise<void> {
    await mkdir(join(projectPath, PROJECT_DIRECTORY), { recursive: true });
    await writeJson(recentFilePath(projectPath), paths);
  }

  async readStructure(projectPath: string): Promise<StructureRecord> {
    const raw = await readOptional(structureFilePath(projectPath), 'structure/unreadable');
    return raw === null ? {} : readStructureRecord(parseLeniently(raw));
  }

  async writeStructure(projectPath: string, structure: StructureRecord): Promise<void> {
    await mkdir(join(projectPath, PROJECT_DIRECTORY), { recursive: true });
    await writeJson(structureFilePath(projectPath), structure);
  }

  async readSheet(absolutePath: string): Promise<string> {
    return readFile(absolutePath, 'utf8');
  }

  /**
   * Writes a sheet.
   *
   * The write is atomic: content goes to a temporary file in the same
   * directory and is renamed into place, so an interrupted save cannot leave a
   * half-written manuscript behind. A rename within one directory is atomic on
   * every supported platform.
   */
  async writeSheet(absolutePath: string, text: string): Promise<void> {
    await writeAtomically(absolutePath, text, this.#environment.newId());
  }

  /** Directory entries, sorted by name. Hidden entries are included. */
  async listDirectory(absolutePath: string): Promise<readonly string[]> {
    return (await this.listEntries(absolutePath)).map((entry) => entry.name);
  }

  async listEntries(absolutePath: string): Promise<readonly DirectoryEntry[]> {
    const entries = await safeReaddir(absolutePath);
    return entries
      .map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      }) as DirectoryEntry)
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  }

  async isDirectory(absolutePath: string): Promise<boolean> {
    try {
      return (await stat(absolutePath)).isDirectory();
    } catch {
      return false;
    }
  }

  async createDirectory(absolutePath: string): Promise<void> {
    await mkdir(absolutePath, { recursive: true });
  }

  async moveEntry(fromAbsolutePath: string, toAbsolutePath: string): Promise<void> {
    await rename(fromAbsolutePath, toAbsolutePath);
  }
}

/**
 * The content of a file that may be absent, or null when it is. Any other
 * failure to read is a `ProjectError` with the given code — a file that is
 * there and cannot be read must not look like a file that is not there.
 */
async function readOptional(absolutePath: string, code: string): Promise<string | null> {
  try {
    return await readFile(absolutePath, 'utf8');
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw new ProjectError(code, absolutePath);
  }
}

/** JSON, or `null` for text that is not JSON — the readers' documented fallback. */
function parseLeniently(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Writes a file atomically: content goes to a temporary file in the same
 * directory and is renamed into place, so an interrupted write cannot leave
 * half a file behind. A rename within one directory is atomic on every
 * supported platform. Sheets and the project's own records alike — the
 * records used to be written directly, and were the less protected for it.
 */
async function writeAtomically(absolutePath: string, text: string, token: string): Promise<void> {
  const temporary = `${absolutePath}.${token}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, absolutePath);
  } catch (error: unknown) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * A failure with a stable code and no display text (SPEC.md §14.3, §16).
 * The path is for the log, never for the message: it would cross the bridge.
 */
export class ProjectError extends CodedError {
  readonly path: string;

  constructor(code: string, path: string) {
    super(code);
    this.name = 'ProjectError';
    this.path = path;
  }
}

export function projectFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.project);
}

export function structureFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.structure);
}

/** Where the recently edited sheets are kept. SPEC.md §9.4. */
export function recentFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.recent);
}

export function categoriesFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.categories);
}

/** A directory is a project exactly when it holds the marker file. */
export async function isProjectDirectory(absolutePath: string): Promise<boolean> {
  try {
    await access(projectFilePath(absolutePath));
    return true;
  } catch {
    return false;
  }
}

/** True when `candidate` is inside `root`, comparing canonical paths. */
export async function isInside(root: string, candidate: string): Promise<boolean> {
  const canonicalRoot = await canonicalPath(root);
  const canonicalCandidate = await canonicalPath(candidate);
  if (canonicalRoot === canonicalCandidate) {
    return true;
  }
  const step = relative(canonicalRoot, canonicalCandidate);
  return step !== '' && !step.startsWith('..') && !step.startsWith(sep) && !isAbsoluteLike(step);
}

/**
 * Resolves symlinks and firmlinks before comparing paths.
 *
 * On macOS `/var` is a firmlink to `/private/var`, so a temporary directory
 * and a directory scan disagree about the same location unless both are
 * canonicalized (CONVENTIONS.md C-F1). A path that does not exist yet is
 * resolved as far as its nearest existing parent.
 */
export async function canonicalPath(absolutePath: string): Promise<string> {
  try {
    return await realpath(absolutePath);
  } catch {
    const parent = dirname(absolutePath);
    if (parent === absolutePath) {
      return resolve(absolutePath);
    }
    return join(await canonicalPath(parent), absolutePath.slice(parent.length + 1));
  }
}

function isAbsoluteLike(step: string): boolean {
  return /^[A-Za-z]:/.test(step);
}

/** True for a file the library shows as a sheet. */
export function isSheetFile(name: string): boolean {
  return name.toLowerCase().endsWith(SHEET_EXTENSION) && !name.startsWith('.');
}

/** True for a directory the library shows as a group. */
export function isGroupDirectory(name: string): boolean {
  return !name.startsWith('.');
}

async function safeReaddir(absolutePath: string) {
  try {
    return await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function writeJson(absolutePath: string, value: unknown): Promise<void> {
  await writeAtomically(absolutePath, `${JSON.stringify(value, null, 2)}\n`, randomUUID());
}

function readProjectRecord(value: unknown): ProjectRecord | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as { id?: unknown; displayName?: unknown; created?: unknown };
  if (
    typeof candidate.id !== 'string' ||
    candidate.id === '' ||
    typeof candidate.displayName !== 'string' ||
    typeof candidate.created !== 'string'
  ) {
    return null;
  }
  return { id: candidate.id, displayName: candidate.displayName, created: candidate.created };
}
