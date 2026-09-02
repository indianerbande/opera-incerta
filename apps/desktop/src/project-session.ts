/**
 * The main process's view of the open project. SPEC.md §5.3, §6.
 *
 * It owns the two things the renderer must never hold: absolute paths, and the
 * authority to reach them. The renderer receives opaque handles; resolving one
 * happens here, and a handle that is not in the registry resolves to nothing —
 * a forged handle therefore fails a lookup rather than reaching a file.
 */
import { randomUUID } from 'node:crypto';
import { MAX_DOCUMENT_BYTES, type ProjectSnapshot } from '@opera-incerta/desktop-contract';
import { sheetsOf, type GroupEntry } from '@opera-incerta/core';
import {
  absolutePathOf,
  createProjectFilesystem,
  isInside,
  scanLibrary,
  type ProjectFilesystem,
} from '@opera-incerta/project-node';

export class ProjectSessionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ProjectSessionError';
    this.code = code;
  }
}

interface OpenProject {
  readonly path: string;
  readonly id: string;
  readonly displayName: string;
  /** Handle id to the sheet's path relative to the project root. */
  readonly handles: Map<string, string>;
}

/**
 * One open project at a time, matching the window model of SPEC.md §8.5.
 */
export class ProjectSession {
  readonly #filesystem: ProjectFilesystem;
  #open: OpenProject | null = null;

  constructor(filesystem: ProjectFilesystem = createProjectFilesystem()) {
    this.#filesystem = filesystem;
  }

  get openPath(): string | null {
    return this.#open?.path ?? null;
  }

  /**
   * Opens a project directory and returns what the renderer needs.
   *
   * Handles are minted fresh on every open, so a handle from a previous
   * project cannot address a file in this one.
   */
  async open(projectPath: string): Promise<ProjectSnapshot> {
    const inspection = await this.#filesystem.inspectFolder(projectPath);
    if (inspection.kind !== 'valid-project') {
      throw new ProjectSessionError(`project/${inspection.kind}`);
    }

    const record = await this.#filesystem.readProject(projectPath);
    const structure = await this.#filesystem.readStructure(projectPath);
    const library = (await scanLibrary(projectPath, record.displayName, this.#filesystem, structure))
      .root;

    const handles = new Map<string, string>();
    const exposed: Record<string, string> = {};
    for (const sheet of sheetsOf(library)) {
      const id = randomUUID().replaceAll('-', '');
      handles.set(id, sheet.relativePath);
      exposed[sheet.relativePath] = id;
    }

    this.#open = { path: projectPath, id: record.id, displayName: record.displayName, handles };
    return { id: record.id, displayName: record.displayName, library, handles: exposed };
  }

  /** Re-reads the open project, keeping handles for sheets that still exist. */
  async reopen(): Promise<ProjectSnapshot | null> {
    const current = this.#open;
    return current === null ? null : this.open(current.path);
  }

  close(): void {
    this.#open = null;
  }

  /**
   * Resolves a handle to an absolute path.
   *
   * Two independent checks: the handle must be in this project's registry, and
   * the resolved path must still be inside the project directory. The second
   * would catch a registry poisoned by a future bug, which is the point of
   * having it as well.
   */
  async resolve(handleId: string): Promise<string> {
    const current = this.#open;
    if (current === null) {
      throw new ProjectSessionError('project/none-open');
    }

    const relativePath = current.handles.get(handleId);
    if (relativePath === undefined) {
      throw new ProjectSessionError('handle/unknown');
    }

    const absolute = absolutePathOf(current.path, relativePath);
    if (!(await isInside(current.path, absolute))) {
      throw new ProjectSessionError('handle/outside-project');
    }
    return absolute;
  }

  async readSheet(handleId: string): Promise<string> {
    const absolute = await this.resolve(handleId);
    const text = await this.#filesystem.readSheet(absolute);
    if (byteLength(text) > MAX_DOCUMENT_BYTES) {
      throw new ProjectSessionError('document/too-large');
    }
    return text;
  }

  async writeSheet(handleId: string, text: string): Promise<void> {
    if (byteLength(text) > MAX_DOCUMENT_BYTES) {
      throw new ProjectSessionError('document/too-large');
    }
    const absolute = await this.resolve(handleId);
    await this.#filesystem.writeSheet(absolute, text);
  }
}

/** The library root of a snapshot, typed for the caller. */
export function libraryOf(snapshot: ProjectSnapshot): GroupEntry {
  return snapshot.library as GroupEntry;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}
