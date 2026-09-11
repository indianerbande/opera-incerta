/**
 * The main process's view of the open project. specification.md §5.3, §6.
 *
 * It owns the two things the renderer must never hold: absolute paths, and the
 * authority to reach them. The renderer receives opaque handles; resolving one
 * happens here, and a handle that is not in the registry resolves to nothing —
 * a forged handle therefore fails a lookup rather than reaching a file.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  MAX_DOCUMENT_BYTES,
  SEARCH_RESULT_LIMIT,
  type LibrarySearchResult,
  type ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
import {
  CodedError,
  type GroupEntry,
  arrivalName,
  lineMatches,
  moveChild,
  parseSheet,
  projectDirectoryName,
  readCategories,
  reorderChild,
  resolveChildOrder,
  serializeSheet,
  sheetFileName,
  sheetsOf,
  withChildOrder,
  withDisplayName,
  withRecentSheet,
  withoutChild,
} from '@opera-incerta/core';
import {
  type ProjectFilesystem,
  absolutePathOf,
  createProjectFilesystem,
  isInside,
  scanLibrary,
  visibleChildren,
} from '@opera-incerta/project-node';
import {
  DEFAULT_STYLESHEET,
  builtInStylesheet,
  documentParts,
  documentPieces,
  isBuiltInStylesheetId,
  type DocumentPart,
} from '@opera-incerta/export';

/** The manuscript as one document, ready for either format. specification.md §15.2. */
export interface AssembledDocument {
  /** The project's display name, which titles the page. */
  readonly title: string;
  readonly parts: readonly DocumentPart[];
}

/** A refusal by the session, with a stable code and no words of its own. */
export class ProjectSessionError extends CodedError {
  constructor(code: string) {
    super(code, code);
    this.name = 'ProjectSessionError';
  }
}

/**
 * Resolves a relative path against a root, and refuses one that ends up
 * outside it. specification.md §5.3.
 *
 * The second line of defense: the contract has already refused a path that
 * *looks* like traversal, and this catches one that *is* — a symlink inside
 * the project pointing out of it, a root that resolves differently from how
 * it was named. One function for every caller (conventions.md C-U7): the
 * handler that skipped this check was the one that could read any file.
 */
export async function containedPath(
  root: string,
  relativePath: string,
  code: string,
): Promise<string> {
  const absolute = absolutePathOf(root, relativePath);
  if (!(await isInside(root, absolute))) {
    throw new ProjectSessionError(code);
  }
  return absolute;
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
 * One open project at a time, matching the window model of specification.md §8.5.
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
   * Handles are minted per project: a handle from a previous project cannot
   * address a file in this one. A **re-read of the same project** keeps the
   * handle of every sheet that is still there, so a save in flight during a
   * library edit still names the file it started with.
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

    const kept = new Map<string, string>();
    if (this.#open?.path === projectPath) {
      for (const [id, relativePath] of this.#open.handles) {
        kept.set(relativePath, id);
      }
    }
    const handles = new Map<string, string>();
    const exposed: Record<string, string> = {};
    for (const sheet of sheetsOf(library)) {
      const id = kept.get(sheet.relativePath) ?? randomUUID().replaceAll('-', '');
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
      recentSheets: await this.#filesystem.readRecentSheets(projectPath),
    };
  }

  /**
   * Searches the text of every sheet in the open project. specification.md §9.3.
   *
   * The **body** only: front matter is metadata, and the line numbers a result
   * points at are the ones the editor shows, which start after it (§10.4).
   * The library is walked in its own order, so the list reads in the order the
   * manuscript does; a sheet that cannot be read is skipped rather than
   * failing the search — one unreadable file must not hide every match in the
   * project.
   */
  async searchLibrary(query: string): Promise<LibrarySearchResult> {
    const current = this.#requireOpen();
    const record = await this.#filesystem.readProject(current.path);
    const structure = await this.#filesystem.readStructure(current.path);
    const { root } = await scanLibrary(current.path, record.displayName, this.#filesystem, structure);

    // One past the cap, so "there were more" is knowledge rather than a guess
    // at exactly the limit.
    const ceiling = SEARCH_RESULT_LIMIT + 1;
    const hits: Array<LibrarySearchResult['hits'][number]> = [];

    for (const sheet of sheetsOf(root)) {
      if (hits.length >= ceiling) {
        break;
      }
      let body: string;
      try {
        const text = await this.#filesystem.readSheet(join(current.path, sheet.relativePath));
        body = parseSheet(text).sheet.body;
      } catch {
        // A sheet that cannot be read is skipped: one unreadable file must not
        // hide every match in the project.
        continue;
      }
      for (const match of lineMatches(body, query, ceiling - hits.length)) {
        hits.push({
          path: sheet.relativePath,
          displayName: sheet.displayName,
          line: match.line,
          text: match.text,
          from: match.from,
          to: match.to,
        });
      }
    }

    return {
      hits: hits.slice(0, SEARCH_RESULT_LIMIT),
      capped: hits.length > SEARCH_RESULT_LIMIT,
    };
  }

  /**
   * The manuscript assembled into one document. specification.md §15.2.
   *
   * The bodies are read here — the export module is pure and never touches a
   * disk — and each one comes from the codec, which is what keeps front
   * matter out by construction rather than by stripping it afterwards
   * (§15.1). A sheet that cannot be read is left out rather than aborting the
   * export, as the library scan already treats one (§16).
   */
  async assembleDocument(from: string | null): Promise<AssembledDocument> {
    const current = this.#requireOpen();
    const record = await this.#filesystem.readProject(current.path);
    const structure = await this.#filesystem.readStructure(current.path);
    const { root } = await scanLibrary(current.path, record.displayName, this.#filesystem, structure);

    const pieces = documentPieces(root, from);
    const bodies = new Map<string, string>();
    for (const piece of pieces) {
      if (piece.kind !== 'sheet') {
        continue;
      }
      try {
        const text = await this.#filesystem.readSheet(join(current.path, piece.relativePath));
        bodies.set(piece.relativePath, parseSheet(text).sheet.body);
      } catch {
        continue;
      }
    }

    return { title: record.displayName, parts: documentParts(pieces, bodies) };
  }

  /** The author's own export stylesheets, by name. specification.md §15.2. */
  async listStylesheets(): Promise<readonly string[]> {
    return this.#filesystem.listStylesheets(this.#requireOpen().path);
  }

  async readStylesheet(name: string): Promise<string | null> {
    return this.#filesystem.readStylesheet(this.#requireOpen().path, name);
  }

  /** Writes one and hands back the list it belongs to, already refreshed. */
  async writeStylesheet(name: string, css: string): Promise<readonly string[]> {
    const current = this.#requireOpen();
    await this.#filesystem.writeStylesheet(current.path, name, css);
    return this.#filesystem.listStylesheets(current.path);
  }

  /**
   * The CSS a chosen stylesheet resolves to. specification.md §15.2.
   *
   * A supplied id first, then the project's own, then the default. A name
   * that resolves to nothing — the project changed, the file was deleted —
   * **falls back rather than failing**: it is never a reason not to export.
   */
  async resolveStylesheet(name: string | null): Promise<string> {
    if (name === null) {
      return DEFAULT_STYLESHEET;
    }
    if (isBuiltInStylesheetId(name)) {
      return builtInStylesheet(name);
    }
    return (await this.readStylesheet(name)) ?? DEFAULT_STYLESHEET;
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

    return containedPath(current.path, relativePath, 'handle/outside-project');
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
   * Creates a sheet in a group. specification.md §6.5.
   *
   * The file name is a slug of the title with a collision suffix, and it is
   * permanent from here on: a later rename changes the front matter title and
   * never the file (§6.4). The body starts empty.
   */
  async createSheet(groupPath: string, title: string): Promise<string> {
    const projectPath = this.#requireOpen().path;
    const directory = await containedPath(projectPath, groupPath, 'group/outside-project');

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
    const parent = await containedPath(projectPath, parentPath, 'group/outside-project');

    const existing = await this.#filesystem.listDirectory(parent);
    const directoryName = projectDirectoryName(displayName, existing);
    const relativePath = parentPath === '.' ? directoryName : `${parentPath}/${directoryName}`;

    await this.#filesystem.createDirectory(join(parent, directoryName));
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
   * Renames a sheet by changing its front matter title. specification.md §6.4.
   *
   * The file name never changes: it is the stable technical identifier that
   * `structure.json` orders by, so renaming would break an order the author
   * arranged. The codec reassembles the file, so foreign front matter survives
   * a rename that had nothing to do with it.
   */
  async renameSheet(relativePath: string, title: string): Promise<void> {
    const projectPath = this.#requireOpen().path;
    const absolute = await containedPath(projectPath, relativePath, 'sheet/outside-project');

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
   * Renames a group by recording a display name. specification.md §6.4.
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
  /** Replaces the project's page categories. specification.md §6.6. */
  async writeCategories(value: unknown): Promise<void> {
    const projectPath = this.#requireOpen().path;
    // Read through the core's tolerant reader before writing: whatever the
    // renderer sends is checked against the record's shape here, where the
    // filesystem is.
    await this.#filesystem.writeCategories(projectPath, readCategories(value));
  }

  /**
   * Puts one entry in a place: a group, and a position within it.
   * specification.md §6.4, §6.8.
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

    const source = await containedPath(projectPath, relativePath, 'entry/outside-project');
    const target = await containedPath(projectPath, groupPath, 'entry/outside-project');
    // A group cannot be put inside itself, and the check has to cover every
    // depth: a directory moved into its own child would take the child along
    // and both would be unreachable.
    if (groupPath === relativePath || groupPath.startsWith(`${relativePath}/`)) {
      throw new ProjectSessionError('group/into-itself');
    }
    if (!(await this.#filesystem.isDirectory(target))) {
      throw new ProjectSessionError('group/unknown');
    }

    const segments = relativePath.split('/');
    const name = segments[segments.length - 1] ?? '';
    const fromGroup = segments.length === 1 ? '.' : segments.slice(0, -1).join('/');

    let arrival = name;
    if (fromGroup !== groupPath) {
      arrival = arrivalName(name, await this.#filesystem.listDirectory(target));
      await this.#filesystem.moveEntry(source, join(target, arrival));

      // The record follows the file at once, so that the scan below reads a
      // project whose two halves agree.
      const moved = await this.#filesystem.readStructure(projectPath);
      await this.#filesystem.writeStructure(
        projectPath,
        moveChild(moved, { path: fromGroup, name }, { path: groupPath, name: arrival }),
      );
    }

    // The order comes from the directory rather than from the caller: the
    // renderer says *what* to place and *where*, never what a group contains.
    // One listing of the target, resolved by the same rule the scan applies —
    // a full re-read of the project here was the second of two per drag.
    const structureNow = await this.#filesystem.readStructure(projectPath);
    const resolved = resolveChildOrder(
      visibleChildren(await this.#filesystem.listEntries(target)),
      structureNow[groupPath],
    );
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
   * specification.md §6.7.
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

    const absolute = await containedPath(projectPath, relativePath, 'entry/outside-project');

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
      // freeze an order the author never asked for (specification.md §6.4).
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
    const current = this.#requireOpen();
    const relativePath = current.handles.get(handleId);
    const absolute = await this.resolve(handleId);
    await this.#filesystem.writeSheet(absolute, text);

    // A save is the event the "recently edited" list records (specification.md §9.4) —
    // a keystroke is not. The list is a convenience: a write that fails takes
    // the convenience with it and nothing else.
    if (relativePath !== undefined) {
      try {
        const recent = withRecentSheet(
          await this.#filesystem.readRecentSheets(current.path),
          relativePath,
        );
        await this.#filesystem.writeRecentSheets(current.path, recent);
      } catch {
        // The manuscript is saved; the list is not worth an error.
      }
    }
  }

  /** The list as it stands, for a renderer that has just saved. */
  async recentSheets(): Promise<readonly string[]> {
    return this.#filesystem.readRecentSheets(this.#requireOpen().path);
  }
}

/** The library root of a snapshot, typed for the caller. */
export function libraryOf(snapshot: ProjectSnapshot): GroupEntry {
  return snapshot.library;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}
