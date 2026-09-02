/**
 * The main process's view of the open project. SPEC.md §5.3, §6.
 *
 * It owns the two things the renderer must never hold: absolute paths, and the
 * authority to reach them. The renderer receives opaque handles; resolving one
 * happens here, and a handle that is not in the registry resolves to nothing —
 * a forged handle therefore fails a lookup rather than reaching a file.
 */
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_DOCUMENT_BYTES, type ProjectSnapshot } from '@opera-incerta/desktop-contract';
import {
  parseSheet,
  projectDirectoryName,
  serializeSheet,
  sheetFileName,
  sheetsOf,
  withChildOrder,
  withDisplayName,
  type GroupEntry,
} from '@opera-incerta/core';
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

  /**
   * Creates a sheet in a group. SPEC.md §6.5.
   *
   * The file name is a slug of the title with a collision suffix, and it is
   * permanent from here on: a later rename changes the front matter title and
   * never the file (§6.4). The body starts empty.
   */
  async createSheet(groupPath: string, title: string): Promise<string> {
    const projectPath = this.#requireOpen().path;
    const directory = absolutePathOf(projectPath, groupPath);
    if (!(await isInside(projectPath, directory))) {
      throw new ProjectSessionError('group/outside-project');
    }

    const existing = await this.#filesystem.listDirectory(directory);
    const fileName = sheetFileName(title, existing);
    const relativePath = groupPath === '.' ? fileName : `${groupPath}/${fileName}`;

    await this.#filesystem.writeSheet(
      join(directory, fileName),
      serializeSheet({
        metadata: { title: title.trim() },
        unknownOwnedLines: [],
        foreignLines: [],
        body: '',
        lineEnding: '\n',
      }),
    );

    // Put it at the end of the group's recorded order, if that group has one.
    await this.#appendToOrder(projectPath, groupPath, fileName);
    return relativePath;
  }

  /** Creates a subgroup. Its directory name is a slug of the display name. */
  async createGroup(parentPath: string, displayName: string): Promise<string> {
    const projectPath = this.#requireOpen().path;
    const parent = absolutePathOf(projectPath, parentPath);
    if (!(await isInside(projectPath, parent))) {
      throw new ProjectSessionError('group/outside-project');
    }

    const existing = await this.#filesystem.listDirectory(parent);
    const directoryName = projectDirectoryName(displayName, existing);
    const relativePath = parentPath === '.' ? directoryName : `${parentPath}/${directoryName}`;

    await mkdir(join(parent, directoryName), { recursive: true });
    await this.#appendToOrder(projectPath, parentPath, directoryName);

    // Record the display name only when it differs from the directory name,
    // so `structure.json` stays free of entries that say nothing.
    if (displayName.trim() !== directoryName) {
      const structure = await this.#filesystem.readStructure(projectPath);
      await this.#filesystem.writeStructure(
        projectPath,
        withDisplayName(structure, relativePath, displayName),
      );
    }
    return relativePath;
  }

  /**
   * Renames a sheet by changing its front matter title. SPEC.md §6.4.
   *
   * The file name never changes: it is the stable technical identifier that
   * `structure.json` orders by, so renaming would break an order the author
   * arranged. The codec reassembles the file, so foreign front matter survives
   * a rename that had nothing to do with it.
   */
  async renameSheet(relativePath: string, title: string): Promise<void> {
    const projectPath = this.#requireOpen().path;
    const absolute = absolutePathOf(projectPath, relativePath);
    if (!(await isInside(projectPath, absolute))) {
      throw new ProjectSessionError('sheet/outside-project');
    }

    const parsed = parseSheet(await this.#filesystem.readSheet(absolute));
    if (!parsed.writable) {
      throw new ProjectSessionError(parsed.diagnostics[0]?.code ?? 'sheet/read-only');
    }

    await this.#filesystem.writeSheet(
      absolute,
      serializeSheet({
        ...parsed.sheet,
        metadata: { ...parsed.sheet.metadata, title: title.trim() },
      }),
    );
  }

  /**
   * Renames a group by recording a display name. SPEC.md §6.4.
   *
   * The directory keeps its name for the same reason a sheet keeps its file
   * name: it is what the recorded order refers to.
   */
  async renameGroup(relativePath: string, displayName: string): Promise<void> {
    const projectPath = this.#requireOpen().path;
    const structure = await this.#filesystem.readStructure(projectPath);
    await this.#filesystem.writeStructure(
      projectPath,
      withDisplayName(structure, relativePath, displayName),
    );
  }

  /** Appends a child to a group's recorded order, when it has one. */
  async #appendToOrder(projectPath: string, groupPath: string, name: string): Promise<void> {
    const structure = await this.#filesystem.readStructure(projectPath);
    const order = structure[groupPath]?.order;
    if (order === undefined) {
      // No recorded order means alphabetical, and adding one here would
      // freeze an order the author never asked for (SPEC.md §6.4).
      return;
    }
    await this.#filesystem.writeStructure(
      projectPath,
      withChildOrder(structure, groupPath, [...order, name]),
    );
  }

  #requireOpen(): OpenProject {
    const current = this.#open;
    if (current === null) {
      throw new ProjectSessionError('project/none-open');
    }
    return current;
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
