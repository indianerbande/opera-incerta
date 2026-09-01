/**
 * The Node.js implementation of the project ports. SPEC.md §6, §7, §8.6.
 *
 * Every filesystem access of the application passes through here. The rules it
 * applies — ordering, display names, slugs — live in `@opera-incerta/core`;
 * this module only performs the input and output.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  readStructureRecord,
  type ProjectRecord,
  type StructureRecord,
} from '@opera-incerta/core';
import {
  PROJECT_DIRECTORY,
  PROJECT_FILES,
  SHEET_EXTENSION,
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
   * Reads `structure.json`. A missing or malformed file yields an empty
   * record, so the library falls back to directory names and alphabetical
   * order rather than failing to open (SPEC.md §6.4, §16).
   */
  async readStructure(projectPath: string): Promise<StructureRecord> {
    try {
      const raw = await readFile(structureFilePath(projectPath), 'utf8');
      return readStructureRecord(JSON.parse(raw) as unknown);
    } catch {
      return {};
    }
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
    const temporary = `${absolutePath}.${this.#environment.newId()}.tmp`;
    try {
      await writeFile(temporary, text, 'utf8');
      await rename(temporary, absolutePath);
    } catch (error: unknown) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /** Directory entries, sorted by name. Hidden entries are included. */
  async listDirectory(absolutePath: string): Promise<readonly string[]> {
    const entries = await safeReaddir(absolutePath);
    return entries.map((entry) => entry.name).sort();
  }
}

/** A failure with a stable code and no display text (SPEC.md §14.3, §16). */
export class ProjectError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string) {
    super(code);
    this.name = 'ProjectError';
    this.code = code;
    this.path = path;
  }
}

export function projectFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.project);
}

export function structureFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.structure);
}

export function categoriesFilePath(projectPath: string): string {
  return join(projectPath, PROJECT_DIRECTORY, PROJECT_FILES.categories);
}

/** A directory is a project exactly when it holds the marker file. */
export async function isProjectDirectory(absolutePath: string): Promise<boolean> {
  try {
    await readFile(projectFilePath(absolutePath), 'utf8');
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
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
