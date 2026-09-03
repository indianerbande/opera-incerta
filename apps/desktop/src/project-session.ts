/**
 * The main process's view of the open project. SPEC.md §5.3, §6.
 *
 * It owns the two things the renderer must never hold: absolute paths, and the
 * authority to reach them. The renderer receives opaque handles; resolving one
 * happens here, and a handle that is not in the registry resolves to nothing —
 * a forged handle therefore fails a lookup rather than reaching a file.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_DOCUMENT_BYTES, type ProjectSnapshot } from '@opera-incerta/desktop-contract';
import {
  parseSheet,
  projectDirectoryName,
  serializeSheet,
  sheetFileName,
  arrivalName,
  findGroup,
  moveChild,
  readCategories,
  reorderChild,
  sheetsOf,
  withChildOrder,
  withDisplayName,
  withoutChild,
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
 * Moves a path to the desktop trash.
 *
 * Injected rather than imported, because the only implementation that really
 * reaches the trash is Electron's, and this class must stay testable without
 * an Electron process. A session
 * that was never given one refuses to delete instead of falling back to
 * something irreversible.
 */
export type TrashItem = (absolutePath: string) => Promise<void>;

/**
 * One open project at a time, matching the window model of SPEC.md §8.5.
 */
export class ProjectSession {
  readonly #filesystem: ProjectFilesystem;
  readonly #trashItem: TrashItem | null;
  #open: OpenProject | null = null;

  constructor(
    filesystem: ProjectFilesystem = createProjectFilesystem(),
    trashItem: TrashItem | null = null,
  ) {
    this.#filesystem = filesystem;
    this.#trashItem = trashItem;
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
    return {
      id: record.id,
      displayName: record.displayName,
      library,
      handles: exposed,
      categories: await this.#filesystem.readCategories(projectPath),
    };
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
  /** Replaces the project's page categories. SPEC.md §6.6. */
  async writeCategories(value: unknown): Promise<void> {
    const projectPath = this.#requireOpen().path;
    // Read through the core's tolerant reader before writing: whatever the
    // renderer sends is checked against the record's shape here, where the
    // filesystem is.
    await this.#filesystem.writeCategories(projectPath, readCategories(value));
  }

  /**
   * Puts one entry in a place: a group, and a position within it.
   * SPEC.md §6.4, §6.8.
   *
   * One operation, because it is one thing. Reordering is placing an entry in
   * the group it is already in; moving is placing it in another. As two calls
   * a failure between them would leave an entry moved but unplaced, and as two
   * operations a drag into another group could not say *where* at all.
   *
   * Returns where it ended up, which is not always where the caller would have
   * guessed: a name already taken in the destination gives the arrival a
   * suffix rather than overwriting what is there.
   *
   * The file first, the record second, as everywhere else.
   */
  async placeEntry(
    relativePath: string,
    groupPath: string,
    before: string | null,
  ): Promise<string> {
    const projectPath = this.#requireOpen().path;
    if (relativePath === '.' || relativePath === '') {
      throw new ProjectSessionError('project/root');
    }

    const source = absolutePathOf(projectPath, relativePath);
    const target = absolutePathOf(projectPath, groupPath);
    if (!(await isInside(projectPath, source)) || !(await isInside(projectPath, target))) {
      throw new ProjectSessionError('entry/outside-project');
    }
    // A group cannot be put inside itself, and the check has to cover every
    // depth: a directory moved into its own child would take the child along
    // and both would be unreachable.
    if (groupPath === relativePath || groupPath.startsWith(`${relativePath}/`)) {
      throw new ProjectSessionError('group/into-itself');
    }
    if (!(await stat(target).catch(() => null))?.isDirectory()) {
      throw new ProjectSessionError('group/unknown');
    }

    const segments = relativePath.split('/');
    const name = segments[segments.length - 1] ?? '';
    const fromGroup = segments.length === 1 ? '.' : segments.slice(0, -1).join('/');

    let arrival = name;
    if (fromGroup !== groupPath) {
      arrival = arrivalName(name, await this.#filesystem.listDirectory(target));
      await rename(source, join(target, arrival));

      // The record follows the file at once, so that the scan below reads a
      // project whose two halves agree.
      const moved = await this.#filesystem.readStructure(projectPath);
      await this.#filesystem.writeStructure(
        projectPath,
        moveChild(moved, { path: fromGroup, name }, { path: groupPath, name: arrival }),
      );
    }

    // The order comes from a fresh scan rather than from the caller: the
    // renderer says *what* to place and *where*, never what a group contains.
    const snapshot = await this.reopen();
    const group = snapshot === null ? null : findGroup(snapshot.library as GroupEntry, groupPath);
    if (group === null) {
      throw new ProjectSessionError('group/unknown');
    }
    const resolved = group.children.map((child) => child.name);
    if (!resolved.includes(arrival)) {
      throw new ProjectSessionError('entry/unknown');
    }

    // The whole resolved order is recorded, because a partial one would leave
    // the rest to be appended alphabetically — scrambling the arrangement just
    // made. This is also the moment a group without a recorded order gets one,
    // which is exactly what §6.4 says it is for.
    const structure = await this.#filesystem.readStructure(projectPath);
    await this.#filesystem.writeStructure(
      projectPath,
      withChildOrder(structure, groupPath, reorderChild(resolved, arrival, before)),
    );

    return groupPath === '.' ? arrival : `${groupPath}/${arrival}`;
  }

  /**
   * Moves one entry to the trash and forgets it in `structure.json`.
   * SPEC.md §6.7.
   *
   * The trash first, the record second: if the move fails there is nothing to
   * forget, and the author's arrangement is left exactly as it was. The
   * reverse order would leave a group whose recorded order has a hole in it
   * and whose file is still on disk.
   *
   * A group takes its contents with it, which is what a trash is for — the
   * whole directory is recoverable in one piece.
   */
  async deleteEntry(relativePath: string): Promise<void> {
    const projectPath = this.#requireOpen().path;
    if (relativePath === '.' || relativePath === '') {
      throw new ProjectSessionError('project/root');
    }
    if (this.#trashItem === null) {
      throw new ProjectSessionError('trash/unavailable');
    }

    const absolute = absolutePathOf(projectPath, relativePath);
    if (!(await isInside(projectPath, absolute))) {
      throw new ProjectSessionError('entry/outside-project');
    }

    const segments = relativePath.split('/');
    const name = segments[segments.length - 1] ?? '';
    const groupPath = segments.length === 1 ? '.' : segments.slice(0, -1).join('/');

    await this.#trashItem(absolute);

    const structure = await this.#filesystem.readStructure(projectPath);
    await this.#filesystem.writeStructure(projectPath, withoutChild(structure, groupPath, name));
  }

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
