/**
 * The single versioned bridge between the Electron main process and the
 * sandboxed renderer. SPEC.md §5.3.
 *
 * The renderer never receives filesystem paths as authority: it addresses
 * documents through opaque handles that the main process issues, resolves, and
 * validates. Every field of every request is validated at runtime in the main
 * process — a compile-time type is not validation (CONVENTIONS.md C-S2).
 *
 * This package is portable on purpose: main process, preload, and renderer all
 * depend on it, and its guards are unit-tested without Electron.
 */

/** Contract version. A breaking change increments it and both sides check it. */
export const CONTRACT_VERSION = 1;

/** The global the preload script exposes on the renderer's `window`. */
export const BRIDGE_GLOBAL = 'operaIncerta';

/**
 * Every channel the preload surface may reach. The main process rejects any
 * channel outside this inventory, and the desktop production check asserts
 * that the preload exposes no others.
 */
export const CHANNELS = {
  contractVersion: 'opera-incerta:contract-version',
  windowRole: 'opera-incerta:window/role',
  openProject: 'opera-incerta:project/open',
  createProject: 'opera-incerta:project/create',
  openRecentProject: 'opera-incerta:project/open-recent',
  currentProject: 'opera-incerta:project/current',
  recentProjects: 'opera-incerta:project/recent',
  forgetRecentProject: 'opera-incerta:project/forget-recent',
  reopenProject: 'opera-incerta:project/reopen',
  closeProject: 'opera-incerta:project/close',
  readSheet: 'opera-incerta:sheet/read',
  writeSheet: 'opera-incerta:sheet/write',
  gitStatus: 'opera-incerta:git/status',
  gitStage: 'opera-incerta:git/stage',
  gitUnstage: 'opera-incerta:git/unstage',
  gitCommit: 'opera-incerta:git/commit',
  gitPush: 'opera-incerta:git/push',
  menuCommand: 'opera-incerta:menu/command',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

const CHANNEL_VALUES: ReadonlySet<string> = new Set(Object.values(CHANNELS));

/** True when `value` is a channel this contract declares. */
export function isChannelName(value: unknown): value is ChannelName {
  return typeof value === 'string' && CHANNEL_VALUES.has(value);
}

/**
 * An opaque reference to a document the main process holds. It carries no
 * filesystem path: the renderer cannot construct one, and forging a handle
 * fails the main process's registry lookup.
 */
export interface DocumentHandle {
  readonly kind: 'opera-incerta/document';
  readonly id: string;
}

/** Maximum accepted document size, in bytes. Enforced in the main process. */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const HANDLE_ID = /^[0-9a-f]{32}$/;

/**
 * Runtime guard for a project snapshot leaving the main process. Used by the
 * renderer, which trusts nothing it did not validate either.
 */
export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ProjectSnapshot>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.library === 'object' &&
    candidate.library !== null &&
    typeof candidate.handles === 'object' &&
    candidate.handles !== null
  );
}

/** Runtime guard for a handle arriving from the renderer. */
export function isDocumentHandle(value: unknown): value is DocumentHandle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<DocumentHandle>;
  return (
    candidate.kind === 'opera-incerta/document' &&
    typeof candidate.id === 'string' &&
    HANDLE_ID.test(candidate.id)
  );
}

/**
 * A project as the renderer sees it.
 *
 * The library carries relative paths for display; the handles map each sheet's
 * relative path to the opaque handle that addresses it. The renderer never
 * turns a path into authority — it looks the handle up (SPEC.md §5.3).
 */
export interface ProjectSnapshot {
  /** The project's stable id, from `project.json`. */
  readonly id: string;
  readonly displayName: string;
  /** The library tree, rooted at the project directory. */
  readonly library: unknown;
  /** Relative sheet path to handle id. */
  readonly handles: Readonly<Record<string, string>>;
}

/**
 * A command the native menu issued. SPEC.md §8.5.
 *
 * The menu owns its accelerators: once a menu item claims `Cmd+S`, the key
 * never reaches the page, so the renderer must hear about it through this
 * channel rather than through a key handler of its own.
 */
export const MENU_COMMANDS = [
  'project/new',
  'project/open',
  'project/close',
  'sheet/save',
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value);
}

/**
 * Which window the renderer is running in. SPEC.md §8.5.
 *
 * The welcome window is the launcher; the project window is the workbench.
 * They share one bundle and ask which they are rather than being told by a
 * query string the page could rewrite.
 */
export type WindowRole = 'welcome' | 'project';

/** One entry of the recent-projects list. SPEC.md §8.6. */
export interface RecentProjectEntry {
  readonly path: string;
  /** Abbreviated for display; the full path stays with the main process. */
  readonly shortPath: string;
  readonly displayName: string;
  /** False when the directory is gone or is no longer a project. */
  readonly available: boolean;
}

/** A request naming a recent project by its path. */
export interface RecentProjectRequest {
  readonly path: string;
}

export function isRecentProjectRequest(value: unknown): value is RecentProjectRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<RecentProjectRequest>;
  return typeof candidate.path === 'string' && candidate.path !== '';
}

/** A request that carries only a handle. */
export interface DocumentRequest {
  readonly handle: DocumentHandle;
}

/** A write request. The main process enforces {@link MAX_DOCUMENT_BYTES}. */
export interface WriteSheetRequest extends DocumentRequest {
  readonly text: string;
}

/** Runtime guard for {@link WriteSheetRequest}. */
export function isWriteSheetRequest(value: unknown): value is WriteSheetRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<WriteSheetRequest>;
  return (
    isDocumentHandle(candidate.handle) &&
    typeof candidate.text === 'string' &&
    utf8ByteLength(candidate.text) <= MAX_DOCUMENT_BYTES
  );
}

/**
 * UTF-8 byte length, computed without `TextEncoder` or Node.js `Buffer`.
 *
 * The size limit is part of the contract, so it must be checkable on both
 * sides of the bridge. Reaching for a host global here would give this package
 * a DOM or Node.js dependency and break the portability invariant
 * (SPEC.md §5.2), which is why the arithmetic is spelled out.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

/** A failed privileged request, reported rather than thrown across the bridge. */
export interface BridgeFailure {
  readonly ok: false;
  /** Stable diagnostic code. SPEC.md §16. */
  readonly code: string;
  readonly message: string;
}

/** A successful privileged request. */
export interface BridgeSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

export type BridgeResult<TValue> = BridgeSuccess<TValue> | BridgeFailure;

/**
 * What source control reports. `root` is null when the project is not inside a
 * repository, which is a normal state rather than a failure (SPEC.md §12).
 */
export interface GitReport {
  readonly root: string | null;
  readonly entries: readonly unknown[];
}

/** A request naming paths, relative to the repository root. */
export interface GitPathsRequest {
  readonly paths: readonly string[];
}

export function isGitPathsRequest(value: unknown): value is GitPathsRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<GitPathsRequest>;
  return (
    Array.isArray(candidate.paths) &&
    candidate.paths.every((path) => typeof path === 'string' && path !== '')
  );
}

/** A commit request. An empty message is refused before Git ever sees it. */
export interface GitCommitRequest {
  readonly message: string;
}

export function isGitCommitRequest(value: unknown): value is GitCommitRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<GitCommitRequest>;
  return typeof candidate.message === 'string' && candidate.message.trim() !== '';
}

/**
 * The complete surface the preload exposes on `window[BRIDGE_GLOBAL]`.
 *
 * Declared here so that the main process, the preload, and the renderer agree
 * on one shape, and so the renderer can be typed against the bridge without
 * importing Electron.
 */
export interface OperaIncertaBridge {
  contractVersion(): Promise<number>;
  /** Which window this renderer is. */
  windowRole(): Promise<WindowRole>;
  /** The project already open, for a project window that has just loaded. */
  currentProject(): Promise<BridgeResult<ProjectSnapshot | null>>;
  recentProjects(): Promise<BridgeResult<readonly RecentProjectEntry[]>>;
  /** Opens a project from the recent list, by path. */
  openRecentProject(request: RecentProjectRequest): Promise<BridgeResult<ProjectSnapshot | null>>;
  /** Removes an entry from the recent list without touching the directory. */
  forgetRecentProject(request: RecentProjectRequest): Promise<BridgeResult<null>>;
  /** Asks for a name and a location, then creates and opens the project. */
  createProject(): Promise<BridgeResult<ProjectSnapshot | null>>;
  /** Opens the native directory chooser. Resolves to null when cancelled. */
  openProject(): Promise<BridgeResult<ProjectSnapshot | null>>;
  /** Re-reads the open project from disk, after an external change. */
  reopenProject(): Promise<BridgeResult<ProjectSnapshot | null>>;
  closeProject(): Promise<BridgeResult<null>>;
  readSheet(request: DocumentRequest): Promise<BridgeResult<string>>;
  writeSheet(request: WriteSheetRequest): Promise<BridgeResult<null>>;
  gitStatus(): Promise<BridgeResult<GitReport>>;
  gitStage(request: GitPathsRequest): Promise<BridgeResult<null>>;
  gitUnstage(request: GitPathsRequest): Promise<BridgeResult<null>>;
  gitCommit(request: GitCommitRequest): Promise<BridgeResult<null>>;
  gitPush(): Promise<BridgeResult<null>>;
  /**
   * Listens for native menu commands; the returned function stops listening.
   *
   * The listener receives the command only — never an event object, which
   * would hand the page a way back into the IPC layer.
   */
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
}
