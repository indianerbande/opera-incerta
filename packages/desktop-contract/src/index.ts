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
 * depend on it, and its guards are unit-tested without Electron. It depends on
 * the portable core for the types it transports — the library tree, the
 * categories, the git status — so that neither side casts what the other
 * sent.
 */
import type {
  GitBranch,
  GitFileStatus,
  GitIdentity,
  GitRemote,
  GitTracking,
  GroupEntry,
  PageCategory,
} from '@opera-incerta/core';
// The export module's own vocabulary, transported as it stands: the contract
// names the types it carries with the packages' own (SPEC.md §16), so that
// neither side casts and a format added there is a compile error here.
import { isExportFormatId, type ExportFormatId } from '@opera-incerta/export';
import { isUsableStylesheetName as usableStylesheetName } from '@opera-incerta/core';

export type { GitBranch, GitIdentity, GitRemote, GitTracking } from '@opera-incerta/core';
export type { ExportFormatId } from '@opera-incerta/export';

/**
 * The guards below are built from a few combinators, so that every request
 * type is validated the same way and a new one is a shape, not a hand-written
 * function that may forget a field.
 */
export type Guard<T> = (value: unknown) => value is T;

const isString: Guard<string> = (value): value is string => typeof value === 'string';
const isNonBlank: Guard<string> = (value): value is string =>
  typeof value === 'string' && value.trim() !== '';
const isNotEmpty: Guard<string> = (value): value is string =>
  typeof value === 'string' && value !== '';
const isBoolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
const isNumber: Guard<number> = (value): value is number => typeof value === 'number';
const isRecord: Guard<Record<string, unknown>> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}

function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}

function arrayOf<T>(guard: Guard<T>): Guard<readonly T[]> {
  return (value): value is readonly T[] => Array.isArray(value) && value.every(guard);
}

function literal<T extends string>(expected: T): Guard<T> {
  return (value): value is T => value === expected;
}

/**
 * A usable stylesheet name (SPEC.md §15.2), as a guard.
 *
 * The rule lives in the core; this wraps it so the shape combinators can use
 * it like every other field guard, and so a name that a path would read as
 * structure is refused **at the boundary** rather than deeper in.
 */
const isStylesheetName: Guard<string> = (value): value is string =>
  typeof value === 'string' && usableStylesheetName(value);

/** An object with every listed field passing its guard. Extra fields are ignored. */
function shape<T extends object>(fields: { readonly [K in keyof T]-?: Guard<T[K]> }): Guard<T> {
  return (value): value is T => {
    if (!isRecord(value)) {
      return false;
    }
    for (const key of Object.keys(fields) as Array<keyof T & string>) {
      if (!fields[key](value[key])) {
        return false;
      }
    }
    return true;
  };
}


/**
 * Contract version. A breaking change increments it and both sides check it.
 *
 * 3: opening reports what it found instead of only succeeding or failing
 * ({@link ProjectOpenOutcome}), and the channel that opens a project by path
 * is named for what it does rather than for the recent list it came from.
 */
export const CONTRACT_VERSION = 3;

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
  adoptProject: 'opera-incerta:project/adopt',
  chooseProjectLocation: 'opera-incerta:project/choose-location',
  openProjectPath: 'opera-incerta:project/open-path',
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
  gitFetch: 'opera-incerta:git/fetch',
  gitPull: 'opera-incerta:git/pull',
  gitMerge: 'opera-incerta:git/merge',
  gitAbortMerge: 'opera-incerta:git/abort-merge',
  gitInit: 'opera-incerta:git/init',
  gitIdentity: 'opera-incerta:git/identity',
  gitSetIdentity: 'opera-incerta:git/set-identity',
  gitResolve: 'opera-incerta:git/resolve',
  gitPublish: 'opera-incerta:git/publish',
  gitBranches: 'opera-incerta:git/branches',
  gitCreateBranch: 'opera-incerta:git/create-branch',
  gitSwitchBranch: 'opera-incerta:git/switch-branch',
  gitDeleteBranch: 'opera-incerta:git/delete-branch',
  gitAmend: 'opera-incerta:git/amend',
  gitLastMessage: 'opera-incerta:git/last-message',
  gitReadIgnore: 'opera-incerta:git/read-ignore',
  gitWriteIgnore: 'opera-incerta:git/write-ignore',
  gitDiscard: 'opera-incerta:git/discard',
  gitDiff: 'opera-incerta:git/diff',
  gitVersions: 'opera-incerta:git/versions',
  menuCommand: 'opera-incerta:menu/command',
  searchLibrary: 'opera-incerta:library/search',
  exportDocument: 'opera-incerta:export/document',
  listStylesheets: 'opera-incerta:export/stylesheets',
  readStylesheet: 'opera-incerta:export/read-stylesheet',
  writeStylesheet: 'opera-incerta:export/write-stylesheet',
  createSheet: 'opera-incerta:sheet/create',
  createGroup: 'opera-incerta:group/create',
  renameSheet: 'opera-incerta:sheet/rename',
  renameGroup: 'opera-incerta:group/rename',
  placeEntry: 'opera-incerta:library/place',
  writeCategories: 'opera-incerta:categories/write',
  watchTargets: 'opera-incerta:watch/targets',
  externalChange: 'opera-incerta:watch/changed',
  watchRepository: 'opera-incerta:watch/repository',
  repositoryChange: 'opera-incerta:watch/repository-changed',
  deleteEntry: 'opera-incerta:library/delete',
  readPreferences: 'opera-incerta:preferences/read',
  writePreferences: 'opera-incerta:preferences/write',
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

/** Runtime guard for a handle arriving from the renderer. */
export const isDocumentHandle: Guard<DocumentHandle> = shape<DocumentHandle>({
  kind: literal('opera-incerta/document'),
  id: (value): value is string => typeof value === 'string' && HANDLE_ID.test(value),
});

/** A page category, field by field. The core validates the colour on read. */
const isPageCategory: Guard<PageCategory> = shape<PageCategory>({
  id: isString,
  name: isString,
  color: isString,
});

/** A group entry, by the shape the renderer relies on. The core owns the rest. */
const isGroupEntry: Guard<GroupEntry> = (value): value is GroupEntry =>
  isRecord(value) &&
  value['kind'] === 'group' &&
  typeof value['relativePath'] === 'string' &&
  Array.isArray(value['children']);

/**
 * Runtime guard for a project snapshot leaving the main process. Used by the
 * renderer, which trusts nothing it did not validate either.
 */
export const isProjectSnapshot: Guard<ProjectSnapshot> = shape<ProjectSnapshot>({
  id: isString,
  displayName: isString,
  library: isGroupEntry,
  handles: shape<Readonly<Record<string, string>>>({}),
  categories: arrayOf(isPageCategory),
  recentSheets: arrayOf(isString),
});

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
  readonly library: GroupEntry;
  /** Relative sheet path to handle id. */
  readonly handles: Readonly<Record<string, string>>;
  /**
   * The project's page categories. SPEC.md §6.6.
   *
   * Part of the snapshot rather than a channel of their own: they are read
   * with the project and change with it, and a second source would be a second
   * chance to disagree.
   */
  readonly categories: readonly PageCategory[];
  /**
   * The sheets that were saved most recently, newest first, as
   * project-relative paths. SPEC.md §9.4.
   */
  readonly recentSheets: readonly string[];
}

/**
 * What choosing a folder to open led to. SPEC.md §8.6.
 *
 * Opening is not "it worked or it failed": a folder the author points at may
 * be a project, may be about to become one, or may be the folder *above* the
 * project they meant. The main process classifies it and says so; deciding
 * what to do about each answer is the launcher's, because each answer is a
 * question to the author rather than an error.
 *
 * Every path here was handed out by the main process after the author chose
 * the folder in the native chooser. The renderer sends one back to say which
 * answer it is acting on; it never composes one.
 */
export type ProjectOpenOutcome =
  /** A project, and it is now open. */
  | { readonly kind: 'opened'; readonly snapshot: ProjectSnapshot }
  /** The chooser was dismissed. Nothing happened, and nothing is reported. */
  | { readonly kind: 'cancelled' }
  /** No project in it and none below it: it can become one. */
  | {
      readonly kind: 'no-project';
      readonly path: string;
      readonly shortPath: string;
      /** The folder's own name, which adoption takes as the display name. */
      readonly folderName: string;
    }
  /** Not a project, but exactly one directly inside it. */
  | {
      readonly kind: 'single-subproject';
      /** The subproject, not the folder that was chosen. */
      readonly path: string;
      readonly shortPath: string;
      readonly name: string;
    }
  /** Not a project, and several inside it: the author says which. */
  | {
      readonly kind: 'multiple-subprojects';
      readonly shortPath: string;
      readonly names: readonly string[];
    };

/** The outcomes that are a question to the author rather than a result. */
export type ProjectOpenQuestion = Exclude<
  ProjectOpenOutcome,
  { kind: 'opened' } | { kind: 'cancelled' }
>;

/** Runtime guard for what opening reports. */
export const isProjectOpenOutcome: Guard<ProjectOpenOutcome> = (
  value,
): value is ProjectOpenOutcome => {
  if (!isRecord(value)) {
    return false;
  }
  switch (value['kind']) {
    case 'opened':
      return isProjectSnapshot(value['snapshot']);
    case 'cancelled':
      return true;
    case 'no-project':
      return isNotEmpty(value['path']) && isString(value['shortPath']) && isNotEmpty(value['folderName']);
    case 'single-subproject':
      return isNotEmpty(value['path']) && isString(value['shortPath']) && isNotEmpty(value['name']);
    case 'multiple-subprojects':
      return isString(value['shortPath']) && arrayOf(isNotEmpty)(value['names']);
    default:
      return false;
  }
};

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
  'editor/find',
  'go/back',
  'go/forward',
  'export/markdown',
  'export/pdf',
  'settings/open',
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

/**
 * Creating a project: a display name and the directory to put it in.
 * SPEC.md §6.1, §8.6.
 *
 * The display name is what the author writes; the directory name is a slug
 * derived from it, and never changes afterwards.
 */
export interface CreateProjectRequest {
  readonly parentPath: string;
  readonly displayName: string;
}

export const isCreateProjectRequest: Guard<CreateProjectRequest> = shape<CreateProjectRequest>({
  parentPath: isNotEmpty,
  displayName: isNonBlank,
});

/**
 * The one rule for every path a request carries. SPEC.md §5.3.
 *
 * A path from the renderer is relative to the project or repository root and
 * names something inside it. Anything that looks like a way out — an absolute
 * path, a drive letter, a `..` segment, a percent-encoded spelling of either,
 * a NUL byte — is refused here, before a handler joins it to a root. The
 * handler checks containment again after resolution; this is the first line,
 * and it is one function so that no request type can forget it. `.` is
 * accepted, because the root is a place a request can legitimately name;
 * whether a particular request may name it is that request's decision.
 */
export function isRelativeEntryPath(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') {
    return false;
  }
  if (value === '.') {
    return true;
  }
  if (value.includes('\0') || /%(2e|2f|5c|00)/i.test(value)) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  // One trailing separator is how git names an untracked directory
  // (`?? part-1/`), and staging it is an ordinary request.
  return value
    .replace(/\/$/, '')
    .split(/[/\\]/)
    .every((segment) => segment !== '' && segment !== '..');
}

/**
 * Creating or renaming a library entry. SPEC.md §6.4, §6.5.
 *
 * `path` is relative to the project root: for a creation it is the group that
 * receives the new entry, for a rename it is the entry itself.
 */
export interface LibraryEditRequest {
  readonly path: string;
  readonly name: string;
}

export const isLibraryEditRequest: Guard<LibraryEditRequest> = shape<LibraryEditRequest>({
  path: isRelativeEntryPath,
  name: isNonBlank,
});

/**
 * What the main process should watch on the interface's behalf.
 * SPEC.md §10.6.
 *
 * The interface names the targets because only it knows what the author is
 * looking at. `null` means "nothing of that kind is open".
 */
export interface WatchTargetsRequest {
  readonly group: string | null;
  readonly sheet: string | null;
}

/** A plain boolean payload, for a channel that carries nothing else. */
export const isBooleanRequest: Guard<boolean> = isBoolean;

export const isWatchTargetsRequest: Guard<WatchTargetsRequest> = shape<WatchTargetsRequest>({
  group: nullable(isRelativeEntryPath),
  sheet: nullable(isRelativeEntryPath),
});

/**
 * One entry, named for an operation that needs nothing else. SPEC.md §6.7.
 */
export interface LibraryPathRequest {
  readonly path: string;
}

/** A path inside the project that is not the project itself. */
const isEntryBelowRoot: Guard<string> = (value): value is string =>
  isRelativeEntryPath(value) && value !== '.';

// The project root is a path, and deleting it is not an operation.
export const isLibraryPathRequest: Guard<LibraryPathRequest> = shape<LibraryPathRequest>({
  path: isEntryBelowRoot,
});

/** The two versions of a file that a comparison needs. SPEC.md §12. */
export interface GitVersions {
  readonly committed: string | null;
  readonly current: string | null;
}

/**
 * Putting one entry in a place. SPEC.md §6.4, §6.8.
 *
 * One request for what used to be two operations, because they are one:
 * reordering is placing inside the group an entry is already in, and moving is
 * placing it in another. Splitting them meant a drag into another group could
 * not say *where*, and doing both in two calls would let a failure leave half
 * of it done.
 *
 * `into` is the group that ends up holding it — the project root is `"."`.
 * `before` is the sibling it lands in front of, by file or directory **name**,
 * or `null` for last. A name rather than an index, because an index would mean
 * something different the moment the group changed underneath.
 */
export interface LibraryPlaceRequest {
  readonly path: string;
  readonly into: string;
  readonly before: string | null;
}

export const isLibraryPlaceRequest: Guard<LibraryPlaceRequest> = shape<LibraryPlaceRequest>({
  path: isEntryBelowRoot,
  into: isRelativeEntryPath,
  // `undefined` must not pass as "last": a typo would move the entry to the
  // bottom of its group.
  before: nullable(isNotEmpty),
});

/**
 * What a library edit produced: the refreshed project, and the entry the
 * interface should reveal — what was created, or where something ended up
 * after a move. Either way the interface must not have to guess the path,
 * because a collision may have changed the name on arrival.
 */
export interface LibraryEditResult {
  readonly snapshot: ProjectSnapshot;
  readonly revealPath: string | null;
}

/** Runtime guard for what a library edit sends back. */
export const isLibraryEditResult: Guard<LibraryEditResult> = shape<LibraryEditResult>({
  snapshot: isProjectSnapshot,
  revealPath: nullable(isString),
});

/**
 * The most matches a library search sends back. SPEC.md §9.3.
 *
 * A search that answers with four thousand rows is not an answer; the view
 * says that there were more, and the author narrows the query.
 */
export const SEARCH_RESULT_LIMIT = 200;

/** A search over the project's text. SPEC.md §9.3. */
export interface LibrarySearchRequest {
  readonly query: string;
}

export const isLibrarySearchRequest: Guard<LibrarySearchRequest> = shape<LibrarySearchRequest>({
  query: isNonBlank,
});

/** One match: which sheet, which line, and the line itself. */
export interface LibrarySearchHit {
  /** The sheet's path inside the project, for opening it. */
  readonly path: string;
  /** What the library calls it — the title, or the file name. */
  readonly displayName: string;
  /** One-based, counted in the body the editor shows (§10.4). */
  readonly line: number;
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

export interface LibrarySearchResult {
  readonly hits: readonly LibrarySearchHit[];
  /** True when {@link SEARCH_RESULT_LIMIT} cut the list short. */
  readonly capped: boolean;
}

const isLibrarySearchHit: Guard<LibrarySearchHit> = shape<LibrarySearchHit>({
  path: isNotEmpty,
  displayName: isString,
  line: isNumber,
  text: isString,
  from: isNumber,
  to: isNumber,
});

/** Runtime guard for what a search sends back. */
export const isLibrarySearchResult: Guard<LibrarySearchResult> = shape<LibrarySearchResult>({
  hits: arrayOf(isLibrarySearchHit),
  capped: isBoolean,
});

/**
 * An export of the manuscript. SPEC.md §15.2.
 *
 * `from` names a sheet to begin at — the "from here" of the sheet's own
 * context menu — or is null for the whole document. The renderer names a
 * sheet by its path inside the project, as every other library request does;
 * it never names the file that is written, which the author chooses in the
 * system's own dialog.
 */
export interface ExportRequest {
  readonly format: ExportFormatId;
  readonly from: string | null;
  /**
   * Which stylesheet sets the PDF (SPEC.md §15.2): a supplied id, or the name
   * of one in the project. A name that resolves to nothing falls back to the
   * default rather than failing — it is never a reason not to export.
   *
   * Markdown carries no stylesheet and ignores this.
   */
  readonly stylesheet: string | null;
}

export const isExportRequest: Guard<ExportRequest> = (value): value is ExportRequest => {
  if (!isRecord(value)) {
    return false;
  }
  const from = value['from'];
  const stylesheet = value['stylesheet'];
  return (
    isExportFormatId(value['format']) &&
    (from === null || isNotEmpty(from)) &&
    (stylesheet === null || isNotEmpty(stylesheet))
  );
};

/** Naming one of the author's own stylesheets. SPEC.md §15.2. */
export interface StylesheetRequest {
  readonly name: string;
}

export const isStylesheetRequest: Guard<StylesheetRequest> = shape<StylesheetRequest>({
  name: isStylesheetName,
});

/** Writing one. The name is checked again in the main process. */
export interface WriteStylesheetRequest {
  readonly name: string;
  readonly css: string;
}

export const isWriteStylesheetRequest: Guard<WriteStylesheetRequest> =
  shape<WriteStylesheetRequest>({
    name: isStylesheetName,
    css: isString,
  });

/**
 * What an export reports back.
 *
 * `empty` is its own answer rather than a failure: asking to export a part of
 * the manuscript that holds no text is not a fault, and writing a file with
 * nothing in it would be the worse reply.
 */
export type ExportOutcome =
  | { readonly kind: 'written'; readonly shortPath: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'empty' };

export const isExportOutcome: Guard<ExportOutcome> = (value): value is ExportOutcome => {
  if (!isRecord(value)) {
    return false;
  }
  switch (value['kind']) {
    case 'written':
      return isNotEmpty(value['shortPath']);
    case 'cancelled':
    case 'empty':
      return true;
    default:
      return false;
  }
};

/** A chosen location, with a short form for display. */
export interface ChosenLocation {
  readonly path: string;
  readonly shortPath: string;
}

/**
 * A request naming a project directory by its absolute path.
 *
 * The path is always one the main process handed out — a recent entry, or a
 * folder the author just chose — and the handler checks what is actually there
 * before it acts, because a name is not a permission (SPEC.md §5.3).
 */
export interface ProjectPathRequest {
  readonly path: string;
}

export const isProjectPathRequest: Guard<ProjectPathRequest> = shape<ProjectPathRequest>({
  path: isNotEmpty,
});

/** A request that carries only a handle. */
export interface DocumentRequest {
  readonly handle: DocumentHandle;
}

/** A write request. The main process enforces {@link MAX_DOCUMENT_BYTES}. */
export interface WriteSheetRequest extends DocumentRequest {
  readonly text: string;
}

/** Runtime guard for a request that carries only a handle. */
export const isDocumentRequest: Guard<DocumentRequest> = shape<DocumentRequest>({
  handle: isDocumentHandle,
});

/** Runtime guard for {@link WriteSheetRequest}. */
export const isWriteSheetRequest: Guard<WriteSheetRequest> = shape<WriteSheetRequest>({
  handle: isDocumentHandle,
  text: (value): value is string =>
    typeof value === 'string' && utf8ByteLength(value) <= MAX_DOCUMENT_BYTES,
});

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
  readonly entries: readonly GitFileStatus[];
  /**
   * What the branch tracks and how far apart the two are, or `null` when it
   * tracks nothing. SPEC.md §12.
   */
  readonly tracking: GitTracking | null;
  /** Whether a merge is under way and unfinished. SPEC.md §12. */
  readonly merging: boolean;
  /** Whether the branch has a commit at all. */
  readonly hasCommit: boolean;
  /** The checked-out branch, or null on a detached head. */
  readonly branch: string | null;
  /** Where a first publish would go, or null when no remote is recorded. */
  readonly remote: GitRemote | null;
}

/** Text to write, for the one file the interface edits directly. SPEC.md §12. */
export interface GitTextRequest {
  readonly text: string;
}

export const isGitTextRequest: Guard<GitTextRequest> = shape<GitTextRequest>({ text: isString });

/** A request naming one branch. */
export interface GitBranchRequest {
  readonly name: string;
}

export const isGitBranchRequest: Guard<GitBranchRequest> = shape<GitBranchRequest>({
  name: isNonBlank,
});

const isGitFileStatus: Guard<GitFileStatus> = shape<GitFileStatus>({
  path: isString,
  indexStatus: isString,
  worktreeStatus: isString,
  previousPath: optional(isString),
  groups: arrayOf(isString) as Guard<GitFileStatus['groups']>,
});

const isGitTracking: Guard<GitTracking> = shape<GitTracking>({
  upstream: isString,
  behind: isNumber,
  ahead: isNumber,
});

const isGitRemote: Guard<GitRemote> = shape<GitRemote>({ name: isString, url: isString });

export const isGitIdentity: Guard<GitIdentity> = shape<GitIdentity>({
  name: isString,
  email: isString,
});

/**
 * The identity at both scopes. SPEC.md §12.
 *
 * `global` decides whether the question is asked when a repository is
 * created; `local` is what this repository has, and null for both means the
 * first commit would fail — the state the panel offers a way out of.
 */
export interface GitIdentityReport {
  readonly global: GitIdentity | null;
  readonly local: GitIdentity | null;
}

export const isGitIdentityReport: Guard<GitIdentityReport> = shape<GitIdentityReport>({
  global: nullable(isGitIdentity),
  local: nullable(isGitIdentity),
});

/** Runtime guard for what the status channel sends back. */
export const isGitReport: Guard<GitReport> = shape<GitReport>({
  root: nullable(isString),
  entries: arrayOf(isGitFileStatus),
  tracking: nullable(isGitTracking),
  merging: isBoolean,
  hasCommit: isBoolean,
  branch: nullable(isString),
  remote: nullable(isGitRemote),
});

/**
 * Publishing a branch for the first time. SPEC.md §12.
 *
 * `url` records a remote before pushing, and is left out when one is already
 * recorded. The address is checked against the accepted shapes in the core
 * before it reaches git: some of git's transports run commands.
 */
export interface GitPublishRequest {
  readonly url?: string;
}

export const isGitPublishRequest: Guard<GitPublishRequest> = shape<GitPublishRequest>({
  url: optional(isString),
});

/**
 * A file resolved by hand, and the text to put in its place. SPEC.md §12.
 *
 * The choice is made in the interface and the text is assembled there, from
 * the same pure rule that read the markers; this only writes it and stages it.
 */
export interface GitResolveRequest {
  readonly path: string;
  readonly text: string;
}

export const isGitResolveRequest: Guard<GitResolveRequest> = shape<GitResolveRequest>({
  path: isRelativeEntryPath,
  text: isString,
});

/** A request naming paths, relative to the repository root. */
export interface GitPathsRequest {
  readonly paths: readonly string[];
}

export const isGitPathsRequest: Guard<GitPathsRequest> = shape<GitPathsRequest>({
  paths: arrayOf(isRelativeEntryPath),
});

/** A commit request. An empty message is refused before Git ever sees it. */
export interface GitCommitRequest {
  readonly message: string;
}

export const isGitCommitRequest: Guard<GitCommitRequest> = shape<GitCommitRequest>({
  message: isNonBlank,
});

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
  /**
   * Opens the project at a path: a recent entry, or the subproject that
   * opening a folder offered.
   */
  openProjectPath(request: ProjectPathRequest): Promise<BridgeResult<ProjectSnapshot | null>>;
  /** Removes an entry from the recent list without touching the directory. */
  forgetRecentProject(request: ProjectPathRequest): Promise<BridgeResult<null>>;
  /** Opens the directory chooser for a project's parent. Null when cancelled. */
  chooseProjectLocation(): Promise<BridgeResult<ChosenLocation | null>>;
  /** Creates the project and opens it. */
  createProject(request: CreateProjectRequest): Promise<BridgeResult<ProjectSnapshot>>;
  /**
   * Makes an existing folder a project and opens it. SPEC.md §8.6.
   *
   * Answers the `no-project` outcome of {@link openProject}: the folder keeps
   * its files, and gets the record directory it lacked. The display name is
   * the folder's own name, decided in the main process, so the renderer cannot
   * name a project something the folder is not called.
   */
  adoptProject(request: ProjectPathRequest): Promise<BridgeResult<ProjectSnapshot>>;
  /**
   * Opens the native directory chooser and reports what the chosen folder
   * turned out to be. SPEC.md §8.6.
   */
  openProject(): Promise<BridgeResult<ProjectOpenOutcome>>;
  /**
   * Searches the text of every sheet in the open project. SPEC.md §9.3.
   *
   * The reading happens here, in the main process, like every other
   * filesystem access: the renderer receives matches, never a path it could
   * act on by itself.
   */
  searchLibrary(request: LibrarySearchRequest): Promise<BridgeResult<LibrarySearchResult>>;
  /**
   * Writes the manuscript out in one format. SPEC.md §15.2.
   *
   * Assembling, setting and writing all happen in the main process: the
   * renderer asks for a format and, at most, a sheet to begin at, and learns
   * only where the file went — in a form fit to read, never one to act on.
   */
  exportDocument(request: ExportRequest): Promise<BridgeResult<ExportOutcome>>;
  /**
   * The author's own export stylesheets, by name (SPEC.md §15.2).
   *
   * The supplied four are not here: the renderer has them from the module
   * itself, and sending them over the bridge would be sending the
   * application its own constants.
   */
  listStylesheets(): Promise<BridgeResult<readonly string[]>>;
  readStylesheet(request: StylesheetRequest): Promise<BridgeResult<string | null>>;
  writeStylesheet(request: WriteStylesheetRequest): Promise<BridgeResult<readonly string[]>>;
  /** Re-reads the open project from disk, after an external change. */
  reopenProject(): Promise<BridgeResult<ProjectSnapshot | null>>;
  closeProject(): Promise<BridgeResult<null>>;
  readSheet(request: DocumentRequest): Promise<BridgeResult<string>>;
  writeSheet(request: WriteSheetRequest): Promise<BridgeResult<null>>;
  gitStatus(): Promise<BridgeResult<GitReport>>;
  gitStage(request: GitPathsRequest): Promise<BridgeResult<null>>;
  gitUnstage(request: GitPathsRequest): Promise<BridgeResult<null>>;
  /**
   * Throws changes away. Destructive, and therefore confirmed before it is
   * called (SPEC.md §12).
   *
   * Returns the affected paths **relative to the project**, so the interface
   * can forget what it was still holding for them. Git reports paths relative
   * to the repository root, which is not the same place.
   */
  gitDiscard(request: GitPathsRequest): Promise<BridgeResult<readonly string[]>>;
  /**
   * Git's own diff for one path, as text. Shown unchanged: it is tool output
   * (SPEC.md §12, §14.2).
   */
  gitDiff(request: LibraryPathRequest): Promise<BridgeResult<string>>;
  /**
   * The two versions of one path — as committed and as it is now — for the
   * word-level comparison of prose (SPEC.md §12). Either may be `null`: a new
   * file has no committed version, a deleted one has no current content.
   */
  gitVersions(request: LibraryPathRequest): Promise<BridgeResult<GitVersions>>;
  gitCommit(request: GitCommitRequest): Promise<BridgeResult<null>>;
  gitPush(): Promise<BridgeResult<null>>;
  /** Brings the remote's refs up to date. Touches no file. SPEC.md §12. */
  gitFetch(): Promise<BridgeResult<null>>;
  /** Fast-forward only: a merge that could conflict is not offered. */
  gitPull(): Promise<BridgeResult<null>>;
  /**
   * Merges the upstream in. May leave conflicts, which is why it is asked for
   * explicitly and never happens on its own. SPEC.md §12.
   */
  gitMerge(): Promise<BridgeResult<null>>;
  /** Puts everything back as it was before the merge began. */
  gitAbortMerge(): Promise<BridgeResult<null>>;
  /**
   * Creates a repository in the open project, with `main` as its initial
   * branch. Refused where the project is already inside one. SPEC.md §12.
   */
  gitInit(): Promise<BridgeResult<null>>;
  /** Who commits would be by, at both scopes. SPEC.md §12. */
  gitIdentity(): Promise<BridgeResult<GitIdentityReport>>;
  /** Records the identity in this repository only. SPEC.md §12. */
  gitSetIdentity(identity: GitIdentity): Promise<BridgeResult<null>>;
  /** Writes a resolved file and stages it. */
  gitResolve(request: GitResolveRequest): Promise<BridgeResult<null>>;
  /**
   * Pushes the branch for the first time and sets it to track where it went.
   * SPEC.md §12.
   */
  gitPublish(request: GitPublishRequest): Promise<BridgeResult<null>>;
  /** Every local branch, and which one is checked out. SPEC.md §12. */
  gitBranches(): Promise<BridgeResult<readonly GitBranch[]>>;
  /**
   * Replaces the last commit, keeping its message when none is given.
   * Offered only for a commit that has not been pushed. SPEC.md §12.
   */
  gitAmend(request: GitTextRequest): Promise<BridgeResult<null>>;
  /** The last commit's message, for filling the field before amending. */
  gitLastMessage(): Promise<BridgeResult<string | null>>;
  /** The repository's `.gitignore`, or an empty string when it has none. */
  gitReadIgnore(): Promise<BridgeResult<string>>;
  gitWriteIgnore(request: GitTextRequest): Promise<BridgeResult<null>>;
  /** Creates a branch at the current commit and switches to it. */
  gitCreateBranch(request: GitBranchRequest): Promise<BridgeResult<null>>;
  /** Switches to an existing branch. */
  gitSwitchBranch(request: GitBranchRequest): Promise<BridgeResult<null>>;
  /** Deletes a branch, the safe way. */
  gitDeleteBranch(request: GitBranchRequest): Promise<BridgeResult<null>>;
  /**
   * Listens for native menu commands; the returned function stops listening.
   *
   * The listener receives the command only — never an event object, which
   * would hand the page a way back into the IPC layer.
   */
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  /** Creates a sheet in a group, and returns the refreshed project. */
  createSheet(request: LibraryEditRequest): Promise<BridgeResult<LibraryEditResult>>;
  /** Creates a subgroup. */
  createGroup(request: LibraryEditRequest): Promise<BridgeResult<LibraryEditResult>>;
  /** Renames a sheet by its front matter title; the file name never changes. */
  renameSheet(request: LibraryEditRequest): Promise<BridgeResult<LibraryEditResult>>;
  /** Renames a group by its display name; the directory never changes. */
  renameGroup(request: LibraryEditRequest): Promise<BridgeResult<LibraryEditResult>>;
  /** Puts an entry in a place: a group, and a position within it. */
  placeEntry(request: LibraryPlaceRequest): Promise<BridgeResult<LibraryEditResult>>;
  /** Replaces the project's page categories, and returns the refreshed project. */
  writeCategories(categories: readonly PageCategory[]): Promise<BridgeResult<ProjectSnapshot>>;
  /** Moves an entry to the desktop trash, from where the author can restore it. */
  deleteEntry(request: LibraryPathRequest): Promise<BridgeResult<LibraryEditResult>>;
  /**
   * Says what to watch. Replaces whatever was being watched before.
   * SPEC.md §10.6.
   */
  watchTargets(request: WatchTargetsRequest): Promise<BridgeResult<null>>;
  /**
   * Something changed under a watched target. A notification is never evidence
   * on its own: the listener re-reads and compares before it acts (§10.6).
   */
  onExternalChange(listener: () => void): () => void;
  /**
   * Watches the repository while source control is on screen, and stops when
   * it is not. SPEC.md §12.
   */
  watchRepository(visible: boolean): Promise<BridgeResult<null>>;
  /** Something changed in the working tree. A separate concern, so a separate
   * channel: this one ends in a status refresh, not in re-reading the project. */
  onRepositoryChange(listener: () => void): () => void;
  /** The installation-local preference record. SPEC.md §13. */
  readPreferences(): Promise<BridgeResult<unknown>>;
  /** Stores it. A preference never touches a document. */
  writePreferences(record: unknown): Promise<BridgeResult<null>>;
}
