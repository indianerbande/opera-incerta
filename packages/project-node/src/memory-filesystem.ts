/**
 * The in-memory implementation of the project port.
 *
 * A tree of files and directories held in two maps, with the same rules the
 * Node implementation has — a write needs its parent directory, a move takes
 * a subtree along, a missing record is the documented fallback — so that a
 * test can build a project in three lines and the session can be exercised
 * without a temporary directory. Paths are absolute and `/`-separated, as
 * the callers pass them.
 *
 * It is held to the same contract suite as the Node implementation
 * (`test/filesystem-contract.test.ts`): a double that behaves differently
 * from the real thing tests nothing.
 */
import {
  CodedError,
  isUsableStylesheetName,
  readCategories,
  readRecentSheets,
  readStructureRecord,
  stylesheetFileName,
  stylesheetNameOf,
  type PageCategory,
  type ProjectRecord,
  type StructureRecord,
} from '@opera-incerta/core';
import {
  PROJECT_DIRECTORIES,
  PROJECT_DIRECTORY,
  PROJECT_FILES,
  type DirectoryEntry,
  type FolderInspection,
  type ProjectFilesystem,
} from './ports.js';
import { ProjectError, type ProjectEnvironment } from './node-filesystem.js';

const SEQUENTIAL_ENVIRONMENT = (): ProjectEnvironment => {
  let counter = 0;
  return {
    newId: () => `memory-${(counter += 1)}`,
    now: () => '2026-01-01T00:00:00.000Z',
  };
};

export function createMemoryFilesystem(
  environment: ProjectEnvironment = SEQUENTIAL_ENVIRONMENT(),
): MemoryProjectFilesystem {
  return new MemoryProjectFilesystem(environment);
}

function normalize(path: string): string {
  const collapsed = path.replace(/\/+/gu, '/').replace(/\/\.(?=\/|$)/gu, '');
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function joinPath(directory: string, name: string): string {
  return directory === '/' ? `/${name}` : `${directory}/${name}`;
}

export class MemoryProjectFilesystem implements ProjectFilesystem {
  readonly #environment: ProjectEnvironment;
  readonly #files = new Map<string, string>();
  readonly #directories = new Set<string>(['/']);

  constructor(environment: ProjectEnvironment) {
    this.#environment = environment;
  }

  /** Puts a file in place, creating its directories — for building fixtures. */
  seed(absolutePath: string, text: string): this {
    const path = normalize(absolutePath);
    this.#ensureDirectory(parentOf(path));
    this.#files.set(path, text);
    return this;
  }

  async inspectFolder(absolutePath: string): Promise<FolderInspection> {
    const path = normalize(absolutePath);
    if (this.#isProject(path)) {
      return { kind: 'valid-project' };
    }
    const subprojects = (await this.listEntries(path))
      .filter((entry) => entry.kind === 'directory' && this.#isProject(joinPath(path, entry.name)))
      .map((entry) => entry.name);
    if (subprojects.length === 0) {
      return { kind: 'no-project' };
    }
    if (subprojects.length === 1) {
      return { kind: 'single-subproject', relativePath: subprojects[0] as string };
    }
    return { kind: 'multiple-subprojects', relativePaths: subprojects };
  }

  async readProject(absolutePath: string): Promise<ProjectRecord> {
    const path = this.#recordPath(normalize(absolutePath), PROJECT_FILES.project);
    const raw = this.#files.get(path);
    if (raw === undefined) {
      throw new ProjectError('project/no-project', path);
    }
    const parsed = parseLeniently(raw) as {
      id?: unknown;
      displayName?: unknown;
      created?: unknown;
    } | null;
    if (
      parsed === null ||
      typeof parsed.id !== 'string' ||
      parsed.id === '' ||
      typeof parsed.displayName !== 'string' ||
      typeof parsed.created !== 'string'
    ) {
      throw new ProjectError('project/malformed-record', path);
    }
    return { id: parsed.id, displayName: parsed.displayName, created: parsed.created };
  }

  async createProject(absolutePath: string, displayName: string): Promise<ProjectRecord> {
    const path = normalize(absolutePath);
    if (this.#isProject(path)) {
      throw new ProjectError('project/already-exists', path);
    }
    const record: ProjectRecord = {
      id: this.#environment.newId(),
      displayName,
      created: this.#environment.now(),
    };
    this.#ensureDirectory(joinPath(path, PROJECT_DIRECTORY));
    this.#files.set(
      this.#recordPath(path, PROJECT_FILES.project),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }

  async readCategories(projectPath: string): Promise<readonly PageCategory[]> {
    const raw = this.#files.get(this.#recordPath(normalize(projectPath), PROJECT_FILES.categories));
    return raw === undefined ? [] : readCategories(parseLeniently(raw));
  }

  async writeCategories(projectPath: string, categories: readonly PageCategory[]): Promise<void> {
    const path = normalize(projectPath);
    this.#ensureDirectory(joinPath(path, PROJECT_DIRECTORY));
    this.#files.set(
      this.#recordPath(path, PROJECT_FILES.categories),
      `${JSON.stringify(categories, null, 2)}\n`,
    );
  }

  async readRecentSheets(projectPath: string): Promise<readonly string[]> {
    const raw = this.#files.get(this.#recordPath(normalize(projectPath), PROJECT_FILES.recent));
    if (raw === undefined) {
      return [];
    }
    try {
      return readRecentSheets(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async writeRecentSheets(projectPath: string, paths: readonly string[]): Promise<void> {
    const path = normalize(projectPath);
    this.#ensureDirectory(joinPath(path, PROJECT_DIRECTORY));
    this.#files.set(
      this.#recordPath(path, PROJECT_FILES.recent),
      `${JSON.stringify(paths, null, 2)}\n`,
    );
  }

  /** The author's own export stylesheets. specification.md §15.2. */
  async listStylesheets(projectPath: string): Promise<readonly string[]> {
    const directory = this.#stylesPath(normalize(projectPath));
    const names: string[] = [];
    for (const path of this.#files.keys()) {
      if (parentOf(path) !== directory) {
        continue;
      }
      const name = stylesheetNameOf(path.slice(directory.length + 1));
      if (name !== null) {
        names.push(name);
      }
    }
    return names.sort((left, right) => left.localeCompare(right));
  }

  async readStylesheet(projectPath: string, name: string): Promise<string | null> {
    if (!isUsableStylesheetName(name)) {
      return null;
    }
    const path = joinPath(this.#stylesPath(normalize(projectPath)), stylesheetFileName(name));
    return this.#files.get(path) ?? null;
  }

  async writeStylesheet(projectPath: string, name: string, css: string): Promise<void> {
    if (!isUsableStylesheetName(name)) {
      throw new CodedError('stylesheet/name', 'stylesheet/name');
    }
    const directory = this.#stylesPath(normalize(projectPath));
    this.#ensureDirectory(directory);
    this.#files.set(joinPath(directory, stylesheetFileName(name)), css);
  }

  #stylesPath(projectPath: string): string {
    return joinPath(joinPath(projectPath, PROJECT_DIRECTORY), PROJECT_DIRECTORIES.styles);
  }

  async readStructure(projectPath: string): Promise<StructureRecord> {
    const raw = this.#files.get(this.#recordPath(normalize(projectPath), PROJECT_FILES.structure));
    return raw === undefined ? {} : readStructureRecord(parseLeniently(raw));
  }

  async writeStructure(projectPath: string, structure: StructureRecord): Promise<void> {
    const path = normalize(projectPath);
    this.#ensureDirectory(joinPath(path, PROJECT_DIRECTORY));
    this.#files.set(
      this.#recordPath(path, PROJECT_FILES.structure),
      `${JSON.stringify(structure, null, 2)}\n`,
    );
  }

  async readSheet(absolutePath: string): Promise<string> {
    const text = this.#files.get(normalize(absolutePath));
    if (text === undefined) {
      throw new ProjectError('file/missing', absolutePath);
    }
    return text;
  }

  async writeSheet(absolutePath: string, text: string): Promise<void> {
    const path = normalize(absolutePath);
    if (!this.#directories.has(parentOf(path))) {
      throw new ProjectError('directory/missing', parentOf(path));
    }
    this.#files.set(path, text);
  }

  async listDirectory(absolutePath: string): Promise<readonly string[]> {
    return (await this.listEntries(absolutePath)).map((entry) => entry.name);
  }

  async listEntries(absolutePath: string): Promise<readonly DirectoryEntry[]> {
    const path = normalize(absolutePath);
    if (!this.#directories.has(path)) {
      return [];
    }
    const names = new Map<string, DirectoryEntry['kind']>();
    for (const directory of this.#directories) {
      if (directory !== path && parentOf(directory) === path) {
        names.set(nameOf(directory), 'directory');
      }
    }
    for (const file of this.#files.keys()) {
      if (parentOf(file) === path) {
        names.set(nameOf(file), 'file');
      }
    }
    return [...names.entries()]
      .map(([name, kind]) => ({ name, kind }))
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  }

  async isDirectory(absolutePath: string): Promise<boolean> {
    return this.#directories.has(normalize(absolutePath));
  }

  async createDirectory(absolutePath: string): Promise<void> {
    this.#ensureDirectory(normalize(absolutePath));
  }

  async moveEntry(fromAbsolutePath: string, toAbsolutePath: string): Promise<void> {
    const from = normalize(fromAbsolutePath);
    const to = normalize(toAbsolutePath);
    if (!this.#directories.has(parentOf(to))) {
      throw new ProjectError('directory/missing', parentOf(to));
    }
    const file = this.#files.get(from);
    if (file !== undefined) {
      this.#files.delete(from);
      this.#files.set(to, file);
      return;
    }
    if (!this.#directories.has(from)) {
      throw new ProjectError('file/missing', from);
    }
    const prefix = `${from}/`;
    for (const directory of [...this.#directories]) {
      if (directory === from || directory.startsWith(prefix)) {
        this.#directories.delete(directory);
        this.#directories.add(`${to}${directory.slice(from.length)}`);
      }
    }
    for (const [path, text] of [...this.#files]) {
      if (path.startsWith(prefix)) {
        this.#files.delete(path);
        this.#files.set(`${to}${path.slice(from.length)}`, text);
      }
    }
  }

  #isProject(path: string): boolean {
    return this.#files.has(this.#recordPath(path, PROJECT_FILES.project));
  }

  #recordPath(projectPath: string, file: string): string {
    return joinPath(joinPath(projectPath, PROJECT_DIRECTORY), file);
  }

  #ensureDirectory(path: string): void {
    let current = path;
    while (!this.#directories.has(current)) {
      this.#directories.add(current);
      current = parentOf(current);
    }
  }
}

function parseLeniently(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
