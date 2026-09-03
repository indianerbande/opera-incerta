/**
 * Electron main process. SPEC.md §5.3, §8.5.
 *
 * This process owns every privileged capability: filesystem, watching, Git,
 * native dialogs, and menus. It never owns document semantics — those live in
 * the portable core.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  Menu,
  app,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} from 'electron';
import {
  BRIDGE_GLOBAL,
  CHANNELS,
  CONTRACT_VERSION,
  isDocumentHandle,
  isGitCommitRequest,
  isGitPathsRequest,
  isCreateProjectRequest,
  isLibraryEditRequest,
  isBooleanRequest,
  isLibraryPathRequest,
  isLibraryPlaceRequest,
  isWatchTargetsRequest,
  isRecentProjectRequest,
  isWriteSheetRequest,
  type BridgeResult,
  type ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
import { projectDirectoryName, readPreferences } from '@opera-incerta/core';
import { createGitService } from '@opera-incerta/git-node';
import {
  canonicalPath,
  createLibraryWatcher,
  createProjectFilesystem,
  isInside,
} from '@opera-incerta/project-node';
import { MENU_ACCELERATORS, installApplicationMenu, menuItemId } from './application-menu.js';
import { ProjectSession, ProjectSessionError } from './project-session.js';
import { ProjectWatch } from './project-watch.js';
import { RecentProjectsFile } from './recent-projects-file.js';
import {
  RENDERER_ENTRY_URL,
  RENDERER_SCHEME,
  resolveRendererAsset,
} from './renderer-protocol.js';

// Electron loads the main process as CommonJS, and the build bundles this file
// to `dist/main.cjs`. `import.meta.url` is empty in that output format, so the
// directory comes from `__dirname` instead.
const currentDirectory = __dirname;

/**
 * Root of the built renderer. The Angular application builder writes browser
 * assets into a `browser/` subdirectory of its configured output path. Nothing
 * outside this directory is reachable through the renderer protocol.
 */
const RENDERER_ROOT = join(currentDirectory, '..', '..', '..', 'build', 'workbench', 'browser');

/**
 * Smoke mode launches the shell, verifies that the renderer loaded and can
 * reach the bridge, reports the result, and quits. TESTING.md §2.7.
 */
const SMOKE_RUN = process.env['OPERA_INCERTA_SMOKE'] === '1';

/**
 * A copy of the smoke fixture, opened instead of showing the native chooser.
 *
 * A copy, because the smoke writes to it and a fixture the tests modify stops
 * proving what it says. This is the only place the shell behaves differently
 * under the smoke, and it does so only for the directory chooser.
 */
const smokeProjectPath = SMOKE_RUN ? prepareSmokeProject() : null;

/**
 * Where a deleted entry goes. SPEC.md §6.7.
 *
 * In the application, the desktop trash — the one place the author already
 * knows how to restore from. Under the smoke, a directory of its own: running
 * the real trash would leave a little rubbish behind on every run, and the
 * property worth proving is the same either way — the entry is **moved**, not
 * destroyed.
 */
const smokeTrashPath = SMOKE_RUN ? mkdtempSync(join(tmpdir(), 'opera-incerta-trash-')) : null;

async function trashItem(absolutePath: string): Promise<void> {
  if (smokeTrashPath !== null) {
    await rename(absolutePath, join(smokeTrashPath, basename(absolutePath)));
    return;
  }
  await shell.trashItem(absolutePath);
}

if (SMOKE_RUN) {
  // The recent-projects list is installation-local state; a test run must not
  // write into the author's.
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-userdata-')));
}

/** Where the smoke's "new project" lands, instead of a native chooser. */
const smokeCreateParent = SMOKE_RUN
  ? mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-new-'))
  : null;

function prepareSmokeProject(): string {
  const source = join(currentDirectory, '..', '..', '..', 'examples', 'smoke-project');
  const destination = join(mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-')), 'smoke-project');
  cpSync(source, destination, { recursive: true });

  // A real repository, so source control has something true to report. It is
  // left without a commit on purpose: that is the state a freshly created
  // project is in, and the one where unstaging cannot resolve against HEAD
  // (SPEC.md §12). Identity and signing are set locally, so the check never
  // depends on — or trips over — how the machine is configured.
  runGit(destination, ['init', '-b', 'main']);
  runGit(destination, ['config', 'user.email', 'smoke@opera-incerta.invalid']);
  runGit(destination, ['config', 'user.name', 'Opera Incerta Smoke']);
  runGit(destination, ['config', 'commit.gpgsign', 'false']);
  return destination;
}

/** Runs git in the smoke project and returns its output. */
function runGit(projectPath: string, argv: readonly string[]): string {
  return execFileSync('git', [...argv], { cwd: projectPath, encoding: 'utf8' });
}

/** Project window geometry. SPEC.md §8.2. */
const WINDOW = {
  width: 1600,
  height: 1000,
  minWidth: 1400,
  minHeight: 820,
} as const;

/** The launcher is compact and not resizable into a workspace. SPEC.md §8.5. */
const WELCOME_WINDOW = { width: 720, height: 460 } as const;

/**
 * The two windows of SPEC.md §8.5, and the flag that keeps them from fighting
 * during shutdown.
 *
 * Quitting closes the project window, and without this flag that close would
 * re-open the welcome window mid-shutdown — after which closing *that* would
 * quit a second time. The flag is set before any window begins closing, which
 * is the only ordering that works.
 */
let welcomeWindow: BrowserWindow | null = null;
let projectWindow: BrowserWindow | null = null;
let isTerminating = false;
let smokeStarted = false;

const windowRoles = new WeakMap<BrowserWindow, 'welcome' | 'project'>();

function secureWebPreferences() {
  return {
    preload: join(currentDirectory, 'preload.cjs'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
  } as const;
}

function harden(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
}

/** The launcher: recent projects, open, and new. SPEC.md §8.6. */
function createWelcomeWindow(): BrowserWindow {
  if (welcomeWindow !== null && !welcomeWindow.isDestroyed()) {
    welcomeWindow.focus();
    return welcomeWindow;
  }

  const window = new BrowserWindow({
    width: WELCOME_WINDOW.width,
    height: WELCOME_WINDOW.height,
    resizable: false,
    show: false,
    title: 'Welcome to Opera Incerta',
    webPreferences: secureWebPreferences(),
  });
  welcomeWindow = window;
  windowRoles.set(window, 'welcome');

  void window.loadURL(RENDERER_ENTRY_URL);
  window.once('ready-to-show', () => {
    window.show();
    if (SMOKE_RUN && !smokeStarted) {
      smokeStarted = true;
      void runSmokeCheck(window);
    }
  });
  harden(window);

  window.on('closed', () => {
    welcomeWindow = null;
    // Closing the launcher with nothing open ends the session. During a quit
    // the flag says so, and while a project window exists the launcher was
    // dismissed by presentProject rather than by the author.
    if (!isTerminating && projectWindow === null) {
      app.quit();
    }
  });

  return window;
}

function createProjectWindow(): BrowserWindow {
  if (projectWindow !== null && !projectWindow.isDestroyed()) {
    projectWindow.focus();
    return projectWindow;
  }

  const window = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    minWidth: WINDOW.minWidth,
    minHeight: WINDOW.minHeight,
    show: false,
    webPreferences: secureWebPreferences(),
  });
  projectWindow = window;
  windowRoles.set(window, 'project');

  void window.loadURL(RENDERER_ENTRY_URL);
  window.once('ready-to-show', () => window.show());

  window.on('closed', () => {
    projectWindow = null;
    if (isTerminating) {
      return;
    }
    // Every way of closing a project — the red button, the shortcut, a menu
    // command — arrives here, so the reset and the launcher happen once and in
    // one place (SPEC.md §8.5).
    session.close();
    createWelcomeWindow();
    refreshMenu();
  });

  harden(window);
  return window;
}

/**
 * Rebuilds the menu for the current state.
 *
 * Called whenever a project opens or closes, because "Close Project" and
 * "Save" are only possible with one open, and a menu that offers a command
 * which would do nothing teaches the author to distrust it.
 */
function refreshMenu(): void {
  installApplicationMenu({
    projectWindow: () =>
      projectWindow !== null && !projectWindow.isDestroyed() ? projectWindow : null,
    run: (command) => {
      switch (command) {
        case 'project/new':
          void runMenuOpen(CHANNELS.createProject);
          return;
        case 'project/open':
          void runMenuOpen(CHANNELS.openProject);
          return;
        case 'project/close':
          // Through the window's own close, so it is the same path as the red
          // button and the shortcut (SPEC.md §8.5).
          projectWindow?.close();
          return;
        default:
          return;
      }
    },
  });
}

/**
 * Runs an open-or-create from the menu.
 *
 * The launcher is where opening lives, so the menu drives the same handler the
 * launcher's buttons do rather than a second implementation.
 */
async function runMenuOpen(channel: string): Promise<void> {
  const window = welcomeWindow ?? createWelcomeWindow();
  window.webContents.send(CHANNELS.menuCommand, channel === CHANNELS.createProject
    ? 'project/new'
    : 'project/open');
}

/**
 * The one path from "a project is open" to "the workbench is showing".
 *
 * Every way of opening — the launcher's buttons, a recent entry, a menu
 * command — ends here, so the transition cannot differ between them.
 */
function presentProject(): void {
  createProjectWindow();
  if (welcomeWindow !== null && !welcomeWindow.isDestroyed()) {
    welcomeWindow.close();
  }
  refreshMenu();
}

ipcMain.handle(CHANNELS.contractVersion, () => CONTRACT_VERSION);

const session = new ProjectSession(undefined, trashItem);
const recentProjects = new RecentProjectsFile(app.getPath('userData'));

ipcMain.handle(CHANNELS.windowRole, (event) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  return sender === null ? 'welcome' : (windowRoles.get(sender) ?? 'welcome');
});

/**
 * Wraps a privileged handler.
 *
 * Two things happen for every request, and both are the point of the bridge:
 * the sender is checked against the windows this process created, so IPC from
 * anywhere else is refused; and a failure becomes a reported result rather
 * than an exception crossing the boundary, because an unhandled rejection in
 * the renderer tells the author nothing (SPEC.md §16).
 */
function privileged<TRequest, TValue>(
  channel: string,
  validate: (request: unknown) => request is TRequest,
  handle: (request: TRequest) => Promise<TValue>,
): void {
  ipcMain.handle(channel, async (event, request: unknown): Promise<BridgeResult<TValue>> => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender === null) {
      return { ok: false, code: 'bridge/untrusted-sender', message: 'unknown sender' };
    }
    if (!validate(request)) {
      return { ok: false, code: 'bridge/invalid-request', message: `invalid request on ${channel}` };
    }

    try {
      return { ok: true, value: await handle(request) };
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'bridge/failed';
      return { ok: false, code, message: error instanceof Error ? error.message : String(error) };
    }
  });
}

const acceptsNothing = (request: unknown): request is null =>
  request === undefined || request === null;

/**
 * Opens a project directory and shows the workbench.
 *
 * Recording it in the recent list and presenting the window happen here rather
 * than in each caller, so no way of opening can forget either.
 */
async function openProjectAt(projectPath: string): Promise<ProjectSnapshot> {
  const snapshot = await session.open(projectPath);
  recentProjects.remember({ path: projectPath, displayName: snapshot.displayName });
  presentProject();
  return snapshot;
}

privileged(CHANNELS.openProject, acceptsNothing, async () => {
  if (smokeProjectPath !== null) {
    return openProjectAt(smokeProjectPath);
  }

  const chosen = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Open project',
  });
  const directory = chosen.canceled ? undefined : chosen.filePaths[0];
  return directory === undefined ? null : await openProjectAt(directory);
});

privileged(CHANNELS.openRecentProject, isRecentProjectRequest, async (request) =>
  openProjectAt(request.path),
);

/** The parent directory for a new project. SPEC.md §8.6. */
privileged(CHANNELS.chooseProjectLocation, acceptsNothing, async () => {
  if (smokeCreateParent !== null) {
    return { path: smokeCreateParent, shortPath: smokeCreateParent };
  }

  const chosen = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Where should the project live?',
    buttonLabel: 'Choose',
  });
  const path = chosen.canceled ? undefined : chosen.filePaths[0];
  return path === undefined ? null : { path, shortPath: abbreviatePath(path) };
});

/**
 * Creates a project: a display name the author chose, in a slugged directory
 * of its own. SPEC.md §6.1, §8.6.
 *
 * The collision suffix is applied here, against what is actually in the parent
 * directory — the renderer can preview the slug but cannot know what is there.
 */
privileged(CHANNELS.createProject, isCreateProjectRequest, async (request) => {
  const displayName = request.displayName.trim();
  const directoryName = projectDirectoryName(displayName, await readdir(request.parentPath));
  const projectPath = join(request.parentPath, directoryName);

  await mkdir(projectPath, { recursive: true });
  await createProjectFilesystem().createProject(projectPath, displayName);
  return openProjectAt(projectPath);
});

privileged(CHANNELS.currentProject, acceptsNothing, async () => session.reopen());

/**
 * The recent list, each entry checked against the disk.
 *
 * A project that has been moved or deleted stays in the list and is marked
 * unavailable, so the author can remove it deliberately rather than finding it
 * silently gone (SPEC.md §8.6).
 */
privileged(CHANNELS.recentProjects, acceptsNothing, async () => {
  const filesystem = createProjectFilesystem();
  const entries = [];
  for (const project of recentProjects.read()) {
    const inspection = await filesystem.inspectFolder(project.path);
    entries.push({
      path: project.path,
      shortPath: abbreviatePath(project.path),
      displayName: project.displayName,
      available: inspection.kind === 'valid-project',
    });
  }
  return entries;
});

privileged(CHANNELS.forgetRecentProject, isRecentProjectRequest, async (request) => {
  recentProjects.forget(request.path);
  return null;
});

/**
 * The preference record. SPEC.md §13.
 *
 * The main process only stores and returns the document; validating it is the
 * core's job, and both sides do it — the renderer because it must not trust a
 * file, and the writer because a malformed record should never be written.
 */
const preferencesPath = join(app.getPath('userData'), 'preferences.json');

privileged(CHANNELS.readPreferences, acceptsNothing, async () => {
  try {
    return JSON.parse(readFileSync(preferencesPath, 'utf8')) as unknown;
  } catch {
    // No record yet, or an unreadable one: the renderer applies its defaults.
    return null;
  }
});

privileged(
  CHANNELS.writePreferences,
  (request): request is Record<string, unknown> =>
    typeof request === 'object' && request !== null,
  async (request) => {
    const record = readPreferences(request);
    mkdirSync(dirname(preferencesPath), { recursive: true });
    writeFileSync(preferencesPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return null;
  },
);

/** `~` for the home directory, as every file dialog shows it. */
function abbreviatePath(absolutePath: string): string {
  const home = app.getPath('home');
  return absolutePath.startsWith(home) ? `~${absolutePath.slice(home.length)}` : absolutePath;
}

privileged(CHANNELS.reopenProject, acceptsNothing, async () => session.reopen());

privileged(CHANNELS.closeProject, acceptsNothing, async () => {
  session.close();
  return null;
});

privileged(
  CHANNELS.readSheet,
  (request): request is { handle: { id: string } } =>
    typeof request === 'object' &&
    request !== null &&
    isDocumentHandle((request as { handle?: unknown }).handle),
  async (request) => session.readSheet(request.handle.id),
);

privileged(CHANNELS.writeSheet, isWriteSheetRequest, async (request) => {
  await session.writeSheet(request.handle.id, request.text);
  return null;
});

/**
 * Library edits all end the same way: re-read the project, so the renderer
 * receives one refreshed truth rather than patching its own copy.
 */
async function libraryEdit(
  operation: () => Promise<string | null>,
): Promise<{ snapshot: ProjectSnapshot; revealPath: string | null }> {
  const revealPath = await operation();
  const snapshot = await session.reopen();
  if (snapshot === null) {
    throw new ProjectSessionError('project/none-open');
  }
  return { snapshot, revealPath };
}

privileged(CHANNELS.createSheet, isLibraryEditRequest, async (request) =>
  libraryEdit(async () => session.createSheet(request.path, request.name)),
);

privileged(CHANNELS.createGroup, isLibraryEditRequest, async (request) =>
  libraryEdit(async () => session.createGroup(request.path, request.name)),
);

privileged(CHANNELS.renameSheet, isLibraryEditRequest, async (request) =>
  libraryEdit(async () => {
    await session.renameSheet(request.path, request.name);
    return null;
  }),
);

privileged(CHANNELS.renameGroup, isLibraryEditRequest, async (request) =>
  libraryEdit(async () => {
    await session.renameGroup(request.path, request.name);
    return null;
  }),
);

privileged(CHANNELS.placeEntry, isLibraryPlaceRequest, async (request) =>
  // Where it ended up is what the interface reveals: a collision may have
  // given the arrival a different name (SPEC.md §6.8).
  libraryEdit(async () => session.placeEntry(request.path, request.into, request.before)),
);

privileged(CHANNELS.writeCategories, Array.isArray, async (categories) => {
  await session.writeCategories(categories);
  const snapshot = await session.reopen();
  if (snapshot === null) {
    throw new ProjectSessionError('project/none-open');
  }
  return snapshot;
});

privileged(CHANNELS.deleteEntry, isLibraryPathRequest, async (request) =>
  libraryEdit(async () => {
    await session.deleteEntry(request.path);
    return null;
  }),
);

/**
 * What the renderer asked to have watched. SPEC.md §10.6.
 *
 * The notification carries nothing: it says "look again", and looking is where
 * the comparison against the loaded baseline happens. A payload would invite
 * acting on the message instead of on the file.
 */
/**
 * How many times the repository watch has reported. Read by the smoke, which
 * checks that watching a repository does not make it report forever: `git
 * status` writes inside `.git`, and without the filter of §12 each refresh
 * would trigger the next (`CONVENTIONS.md` C-F4).
 */
let repositoryReports = 0;

const projectWatch = new ProjectWatch(createLibraryWatcher(), {
  onLibraryChange: () => notifyRenderer(CHANNELS.externalChange),
  onRepositoryChange: () => {
    repositoryReports += 1;
    notifyRenderer(CHANNELS.repositoryChange);
  },
});

function notifyRenderer(channel: string): void {
  if (projectWindow !== null && !projectWindow.isDestroyed()) {
    projectWindow.webContents.send(channel);
  }
}

privileged(CHANNELS.watchTargets, isWatchTargetsRequest, async (request) => {
  projectWatch.set(session.openPath, request);
  return null;
});

const git = createGitService();

privileged(CHANNELS.gitFetch, acceptsNothing, async () => {
  await git.fetch(await repositoryRoot());
  return null;
});

privileged(CHANNELS.gitPull, acceptsNothing, async () => {
  await git.pull(await repositoryRoot());
  return null;
});

privileged(CHANNELS.gitVersions, isLibraryPathRequest, async (request) => {
  const root = await repositoryRoot();
  const absolute = join(root, request.path);
  if (!(await isInside(root, absolute))) {
    throw new ProjectSessionError('entry/outside-project');
  }

  return {
    committed: await git.showAtHead(root, request.path),
    // A file the working tree no longer has is a normal answer: that is what a
    // deletion looks like.
    current: await readFile(absolute, 'utf8').catch(() => null),
  };
});

privileged(CHANNELS.gitDiff, isLibraryPathRequest, async (request) => {
  const root = await repositoryRoot();
  // Whether it is tracked is read from git, not assumed from the path: an
  // untracked file has nothing to compare against and is shown as all added.
  const tracked = (await git.status(root)).some(
    (entry) => entry.path === request.path && !entry.groups.includes('untracked'),
  );
  return git.diff(root, request.path, tracked);
});

privileged(CHANNELS.gitDiscard, isGitPathsRequest, async (request) => {
  if (session.openPath === null) {
    throw new ProjectSessionError('project/none-open');
  }
  // Both canonical before they are compared: on macOS the session knows a
  // project under `/var/...` while git reports the same directory as
  // `/private/var/...`, and the relative path between the two forms points out
  // of the project entirely.
  const projectPath = await canonicalPath(session.openPath);
  const root = await canonicalPath(await repositoryRoot());
  const wanted = new Set(request.paths);

  // What each path *is* is read here, from git, rather than taken from the
  // renderer: discarding is destructive, and the renderer's picture of the
  // working tree may be a second old.
  const tracked: string[] = [];
  const toTrash: string[] = [];
  for (const entry of await git.status(root)) {
    if (wanted.has(entry.path)) {
      (entry.groups.includes('untracked') ? toTrash : tracked).push(entry.path);
    }
  }

  if (tracked.length > 0) {
    if (await git.hasCommit(root)) {
      await git.restore(root, tracked);
    } else {
      // Nothing to go back to: in a repository without a commit the file's
      // whole existence is the change (SPEC.md §12).
      await git.unstage(root, tracked);
      toTrash.push(...tracked);
    }
  }

  // Never removed, always moved: the same rule as deleting a sheet (§6.7).
  for (const path of toTrash) {
    await trashItem(join(root, path));
  }

  return [...new Set([...tracked, ...toTrash])]
    .map((path) => relative(projectPath, join(root, path)))
    .filter((path) => path !== '' && !path.startsWith('..'));
});


privileged(CHANNELS.watchRepository, isBooleanRequest, async (visible) => {
  // Only while the panel is on screen, and only where there is a repository
  // at all (SPEC.md §12). The root is resolved fresh each time, so a project
  // change re-establishes the watch on the right one.
  const projectPath = session.openPath;
  const root = visible && projectPath !== null ? await git.repositoryRoot(projectPath) : null;
  projectWatch.setRepository(root);
  return null;
});


/**
 * The repository root of the open project.
 *
 * Porcelain paths are relative to this root, not to the project directory, and
 * can point outside the project — so every Git command runs against it
 * (SPEC.md §12).
 */
async function repositoryRoot(): Promise<string> {
  const projectPath = session.openPath;
  if (projectPath === null) {
    throw new ProjectSessionError('project/none-open');
  }
  const root = await git.repositoryRoot(projectPath);
  if (root === null) {
    throw new ProjectSessionError('git/no-repository');
  }
  return root;
}

privileged(CHANNELS.gitStatus, acceptsNothing, async () => {
  const projectPath = session.openPath;
  if (projectPath === null) {
    throw new ProjectSessionError('project/none-open');
  }
  const root = await git.repositoryRoot(projectPath);
  // A project outside a repository is a normal state, not a failure.
  if (root === null) {
    return { root: null, entries: [], tracking: null };
  }
  return {
    root,
    entries: await git.status(root),
    // Read with the status, so the panel never shows one from a moment ago
    // beside the other.
    tracking: await git.tracking(root),
  };
});

privileged(CHANNELS.gitStage, isGitPathsRequest, async (request) => {
  await git.stage(await repositoryRoot(), request.paths);
  return null;
});

privileged(CHANNELS.gitUnstage, isGitPathsRequest, async (request) => {
  await git.unstage(await repositoryRoot(), request.paths);
  return null;
});

privileged(CHANNELS.gitCommit, isGitCommitRequest, async (request) => {
  await git.commit(await repositoryRoot(), request.message);
  return null;
});

privileged(CHANNELS.gitPush, acceptsNothing, async () => {
  await git.push(await repositoryRoot());
  return null;
});

/**
 * The renderer scheme must be privileged before the application is ready, so
 * that the page it serves is a secure context with a normal origin rather than
 * an opaque one.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

/**
 * Set before any window begins closing, so the close handlers know a quit is
 * under way and stay passive. SPEC.md §8.5.
 */
app.on('before-quit', () => {
  isTerminating = true;
});

void app.whenReady().then(() => {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const asset = resolveRendererAsset(RENDERER_ROOT, request.url);
    if (asset === null) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(asset).toString());
  });

  // The launcher is the start window; the workbench appears when a project
  // does (SPEC.md §8.5).
  refreshMenu();
  createWelcomeWindow();

  // macOS keeps the application active without windows and brings the
  // launcher back on activation; Windows and Linux quit.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWelcomeWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Ends the smoke with an exit code.
 *
 * `app.exit` emits no `before-quit`, so without the flag the project window's
 * close handler would take the shutdown for an ordinary project close and
 * build a fresh launcher — a new window on the way out, and a process that
 * never ends.
 */
function endSmoke(code: number): void {
  isTerminating = true;
  app.exit(code);
}

/**
 * Checks page categories end to end: defined in the manager, assigned in the
 * inspector, shown as a badge with the computed text colour. SPEC.md §6.6.
 */
async function checkPageCategories(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null) {
    throw new Error('no smoke project');
  }

  await clickText(window, 'wi-inspector button', 'Manage');
  await waitForSelector(window, 'wi-category-manager');
  await clickText(window, 'wi-category-manager button', 'Add');
  await new Promise((resolve) => setTimeout(resolve, 200));

  // A dark colour, so the computed text colour has to be white.
  const named = (await window.webContents.executeJavaScript(
    `(() => {
       const row = document.querySelector('wi-category-manager li');
       const name = row?.querySelector('input.name');
       const colour = row?.querySelector('input[type="color"]');
       if (name === null || name === undefined || colour === null || colour === undefined) {
         return false;
       }
       name.value = 'Review';
       name.dispatchEvent(new Event('input', { bubbles: true }));
       colour.value = '#102040';
       colour.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!named) {
    throw new Error('the category manager offered no row to fill in');
  }
  await clickText(window, 'wi-category-manager button', 'Save');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const defined = JSON.parse(
    readFileSync(join(smokeProjectPath, '.opera-incerta', 'categories.json'), 'utf8'),
  ) as Array<{ id: string; name: string; color: string }>;
  if (defined.length !== 1 || defined[0]?.name !== 'Review' || defined[0]?.color !== '#102040') {
    throw new Error(`the category was not written: ${JSON.stringify(defined)}`);
  }

  // Assigned in the inspector, which is where the owned fields are edited.
  const assigned = (await window.webContents.executeJavaScript(
    `(() => {
       const select = document.querySelector('wi-inspector select');
       const option = [...(select?.options ?? [])].find((each) => each.textContent.trim() === 'Review');
       if (select === null || option === undefined) { return false; }
       select.value = option.value;
       select.dispatchEvent(new Event('change', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!assigned) {
    throw new Error('the inspector offers no category to assign');
  }
  await new Promise((resolve) => setTimeout(resolve, 300));

  const badge = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector('wi-sheet-list .badge');
       if (element === null) { return null; }
       const style = getComputedStyle(element);
       return { text: element.textContent.trim(), color: style.color, background: style.backgroundColor };
     })()`,
  )) as { text: string; color: string; background: string } | null;
  if (badge === null || badge.text !== 'Review') {
    throw new Error(`the sheet list shows no badge: ${JSON.stringify(badge)}`);
  }
  // Computed, never stored: a dark background must carry white text.
  if (badge.color !== 'rgb(255, 255, 255)') {
    throw new Error(`the badge text colour was not computed: ${badge.color}`);
  }

  const image = await window.webContents.capturePage();
  const evidencePath = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-category.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 600));
  const sheet = readFileSync(join(smokeProjectPath, 'part-1', 'scene.md'), 'utf8');
  if (!sheet.includes(`category: ${String(defined[0]?.id)}`)) {
    throw new Error('the assignment did not reach the file');
  }

  console.log(
    'smoke ok: a category was defined, assigned, written to the sheet, and shown as a badge ' +
      'whose text colour is computed from its background',
  );
}

/**
 * Checks the front matter area: two blocks, three switches, and read-only that
 * is a different control rather than a disabled one. SPEC.md §10.4.
 */
async function checkFrontMatterArea(window: BrowserWindow): Promise<void> {
  const blocksNow = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('wi-front-matter-block').length",
  )) as number;
  if (blocksNow !== 0) {
    throw new Error('the front matter area is showing before it was asked for');
  }

  await toggleSwitch(window, 'Variables');
  const shown = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-front-matter-block')].map((block) => ({
       label: block.querySelector('pre, textarea')?.getAttribute('aria-label') ?? null,
       control: block.querySelector('textarea') !== null ? 'textarea' : 'pre',
       text: (block.querySelector('pre, textarea')?.textContent ??
              block.querySelector('textarea')?.value ?? '').trim(),
       // What the author can actually see, against what there is to see. A
       // scrollbar along the bottom takes its space out of the first.
       visible: Math.round(block.querySelector('.block')?.clientHeight ?? 0),
       needed: Math.round(block.querySelector('.measure')?.getBoundingClientRect().height ?? 0),
     }))`,
  )) as Array<{
    label: string | null;
    control: string;
    text: string;
    visible: number;
    needed: number;
  }>;

  if (shown.length !== 2) {
    throw new Error(`expected a foreign and an own block, found ${JSON.stringify(shown)}`);
  }
  const [foreign, owned] = shown as [(typeof shown)[0], (typeof shown)[0]];
  if (!foreign.text.includes('layout: post') || !foreign.text.includes('author: Someone Else')) {
    throw new Error(`the foreign block does not show the foreign keys: ${foreign.text}`);
  }
  if (!owned.text.includes('opera-incerta:') || !owned.text.includes('title: A Scene in Part One')) {
    throw new Error(`the own block does not show what the file carries: ${owned.text}`);
  }
  // "Show everything, up to ten lines" (SPEC.md §10.4). Both blocks are well
  // under the cap, so all of them must be visible — the defect the visual
  // check found was a block one line short, its last line under a scrollbar.
  for (const block of shown) {
    if (block.needed <= 0 || block.visible + 1 < block.needed) {
      throw new Error(`a block shows ${block.visible}px of ${block.needed}px: ${block.text}`);
    }
  }
  // Read-only is a different control, never a disabled one (SPEC.md §10.4).
  if (foreign.control !== 'pre' || owned.control !== 'pre') {
    throw new Error(`read-only is not a pre: ${JSON.stringify(shown.map((b) => b.control))}`);
  }

  await toggleSwitch(window, 'Writable');
  const writable = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-front-matter-block')].map((block) =>
       block.querySelector('textarea') !== null ? 'textarea' : 'pre')`,
  )) as readonly string[];
  if (writable[0] !== 'textarea' || writable[1] !== 'pre') {
    throw new Error(`only the foreign block becomes writable: ${JSON.stringify(writable)}`);
  }
  const disabled = (await window.webContents.executeJavaScript(
    "document.querySelector('wi-front-matter-block textarea')?.disabled === true",
  )) as boolean;
  if (disabled) {
    throw new Error('the writable block is disabled, which is not what writable means');
  }

  await toggleSwitch(window, 'System');
  const withoutOwned = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('wi-front-matter-block').length",
  )) as number;
  if (withoutOwned !== 1) {
    throw new Error(`turning off "System" left ${withoutOwned} blocks`);
  }

  const image = await window.webContents.capturePage();
  const evidencePath = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-front-matter.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  // Back to where it started, so the checks after this one see what they expect.
  await toggleSwitch(window, 'System');
  await toggleSwitch(window, 'Writable');
  await toggleSwitch(window, 'Variables');

  console.log(
    'smoke ok: the front matter area shows the foreign and the own block, read-only as a ' +
      'selectable control rather than a disabled one, and only the foreign one turns writable',
  );
}

/** Clicks one of the editor header's switches by its label. */
async function toggleSwitch(window: BrowserWindow, label: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const found = [...document.querySelectorAll('.switch')]
         .find((element) => element.textContent.trim() === ${JSON.stringify(label)});
       const box = found?.querySelector('input');
       if (box === null || box === undefined) { return false; }
       box.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no switch labelled ${label}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/**
 * Checks that the library views show the project the launcher opened, and
 * selects a sheet. SPEC.md §9.
 */
async function selectSmokeSheet(window: BrowserWindow): Promise<void> {
  await waitForSelector(window, 'wi-sheet-list .row');

  const library = (await window.webContents.executeJavaScript(
    `(() => {
       const nodes = [...document.querySelectorAll('wi-explorer-node .name')]
         .map((element) => element.textContent.trim());
       const sheets = [...document.querySelectorAll('wi-sheet-list .title')]
         .map((element) => element.textContent.trim());
       const failure = document.querySelector('[role="alert"]');
       return { nodes, sheets, failure: failure === null ? null : failure.textContent };
     })()`,
  )) as { nodes: string[]; sheets: string[]; failure: string | null };

  if (library.failure !== null) {
    throw new Error(`opening the project failed: ${library.failure}`);
  }
  if (!library.nodes.includes('Smoke Project')) {
    throw new Error(`the tree does not show the project: ${JSON.stringify(library.nodes)}`);
  }
  if (!library.nodes.includes('Part One')) {
    throw new Error(`the tree does not show the recorded group name: ${JSON.stringify(library.nodes)}`);
  }
  if (!library.sheets.includes('Opening')) {
    throw new Error(`the sheet list does not show the sheet: ${JSON.stringify(library.sheets)}`);
  }

  // Select the sheet, which is what puts a document in the editor.
  const selected = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-sheet-list .row')]
         .find((candidate) => candidate.textContent.includes('Opening'));
       if (row === undefined) { return false; }
       row.click();
       return true;
     })()`,
  )) as boolean;
  if (!selected) {
    throw new Error('could not select the sheet');
  }
  await new Promise((resolve) => setTimeout(resolve, 400));

  console.log('smoke ok: project opened, tree and sheet list populated, sheet selected');
}

/** Types a string into the focused element as real key events. */
async function typeText(window: BrowserWindow, text: string): Promise<void> {
  for (const character of text) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: character });
    window.webContents.sendInputEvent({ type: 'char', keyCode: character });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: character });
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}

/**
 * Exercises the two gestures that change a heading level: the dot command and
 * the gutter menu. SPEC.md §10.2.
 *
 * Driven through real input events rather than through the adapter's own API,
 * because what is in doubt is precisely the path from a keystroke or a click to
 * the document.
 */
async function checkHeadingGestures(window: BrowserWindow): Promise<void> {
  // Put the cursor at the start of the last line, which is empty.
  const placed = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const last = lines[lines.length - 1];
       if (last === undefined) { return null; }
       const rect = last.getBoundingClientRect();
       return { x: Math.round(rect.left + 4), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (placed === null) {
    throw new Error('could not locate the last editor line');
  }

  window.webContents.sendInputEvent({ type: 'mouseDown', x: placed.x, y: placed.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: placed.x, y: placed.y, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 120));

  // Start a fresh line at the very end, the way an author would before
  // writing. The fixture's last line closes a fenced block, where a dot
  // command deliberately does nothing.
  await pressKey(window, 'End', ['cmd']);
  await pressKey(window, 'Return');
  await typeText(window, '.h3 Typed heading');

  const afterTyping = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const typed = lines.find((line) => line.textContent.includes('Typed heading'));
       if (typed === undefined) { return null; }
       return {
         text: typed.textContent,
         isHeading: typed.classList.contains('cm-heading-3'),
       };
     })()`,
  )) as { text: string; isHeading: boolean } | null;

  if (afterTyping === null) {
    throw new Error('the typed line did not appear');
  }
  if (!afterTyping.isHeading) {
    throw new Error(`the dot command did not apply: ${JSON.stringify(afterTyping)}`);
  }
  if (afterTyping.text.includes('.h3')) {
    throw new Error(`the dot command text is still visible: ${JSON.stringify(afterTyping.text)}`);
  }

  // Now the gutter menu on that same line's marker.
  const marker = (await window.webContents.executeJavaScript(
    `(() => {
       const markers = [...document.querySelectorAll('.cm-heading-marker')]
         .filter((element) => element.textContent === 'H3' && element.dataset.line !== '0');
       const target = markers[markers.length - 1];
       if (target === undefined) { return null; }
       const rect = target.getBoundingClientRect();
       return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (marker === null) {
    throw new Error('no H3 gutter marker to activate');
  }

  window.webContents.sendInputEvent({ type: 'mouseDown', x: marker.x, y: marker.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: marker.x, y: marker.y, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const menu = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector('wi-heading-menu [role="menu"]');
       if (element === null) { return null; }
       const items = [...element.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')];
       const checked = items.filter((item) => item.getAttribute('aria-checked') === 'true');
       const target = items.find((item) => item.textContent.includes('Heading 5'));
       const rect = target === undefined ? null : target.getBoundingClientRect();
       return {
         items: items.length,
         checkedLabel: checked.length === 1 ? checked[0].textContent.trim() : null,
         target: rect === null
           ? null
           : { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
       };
     })()`,
  )) as { items: number; checkedLabel: string | null; target: { x: number; y: number } | null } | null;

  if (menu === null) {
    throw new Error('the gutter menu did not open');
  }
  if (menu.items !== 7) {
    throw new Error(`expected six levels plus "no heading", found ${menu.items}`);
  }
  if (menu.checkedLabel !== '✓ Heading 3') {
    throw new Error(`the active level is not marked: ${JSON.stringify(menu.checkedLabel)}`);
  }
  if (menu.target === null) {
    throw new Error('no "Heading 5" entry in the menu');
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: menu.target.x,
    y: menu.target.y,
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: menu.target.x,
    y: menu.target.y,
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const afterMenu = (await window.webContents.executeJavaScript(
    `(() => {
       const line = [...document.querySelectorAll('.cm-line')]
         .find((candidate) => candidate.textContent.includes('Typed heading'));
       return line === undefined
         ? null
         : {
             level5: line.classList.contains('cm-heading-5'),
             menuOpen: document.querySelector('wi-heading-menu [role="menu"]') !== null,
           };
     })()`,
  )) as { level5: boolean; menuOpen: boolean } | null;

  if (afterMenu === null || !afterMenu.level5) {
    throw new Error(`choosing Heading 5 did not change the line: ${JSON.stringify(afterMenu)}`);
  }
  if (afterMenu.menuOpen) {
    throw new Error('the menu stayed open after a choice');
  }

  console.log('smoke ok: dot command applied, gutter menu opened and changed the level');
  await checkHeadingCursorRules(window);
}

/**
 * Triggers a menu item by its command, and checks it is offered at all.
 *
 * A disabled item does nothing when clicked, which would look exactly like a
 * broken command — so the enabled state is asserted rather than assumed.
 */
function clickMenuItem(command: keyof typeof MENU_ACCELERATORS): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(menuItemId(command));
  if (item === undefined || item === null) {
    throw new Error(`no menu item for ${command}`);
  }
  if (!item.enabled) {
    throw new Error(`the menu item for ${command} is disabled`);
  }
  item.click();
}

/** Presses one key, optionally with modifiers. */
async function pressKey(
  window: BrowserWindow,
  keyCode: string,
  modifiers: readonly string[] = [],
): Promise<void> {
  window.webContents.sendInputEvent({
    type: 'keyDown',
    keyCode,
    modifiers: [...modifiers] as never,
  });
  window.webContents.sendInputEvent({
    type: 'keyUp',
    keyCode,
    modifiers: [...modifiers] as never,
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
}

/** Text of the line containing `needle`, and whether it is a heading. */
async function lineState(
  window: BrowserWindow,
  needle: string,
): Promise<{ text: string; heading: boolean; count: number } | null> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const found = lines.filter((line) => line.textContent.includes(${JSON.stringify(needle)}));
       const line = found[0];
       return line === undefined
         ? null
         : {
             text: line.textContent,
             heading: line.className.includes('cm-heading'),
             count: found.length,
           };
     })()`,
  )) as { text: string; heading: boolean; count: number } | null;
}

/**
 * The cursor rules around hidden heading syntax. SPEC.md §10.2.
 *
 * Everything here is driven through real keys and the real clipboard, because
 * what is in question is the behavior a hand at the keyboard produces.
 */
async function checkHeadingCursorRules(window: BrowserWindow): Promise<void> {
  const lineStartKey = process.platform === 'darwin' ? 'Left' : 'Home';
  const lineStartModifiers = process.platform === 'darwin' ? ['cmd'] : [];
  const lineEndKey = process.platform === 'darwin' ? 'Right' : 'End';

  // Put the cursor inside the heading the earlier gestures produced.
  const target = (await window.webContents.executeJavaScript(
    `(() => {
       const line = [...document.querySelectorAll('.cm-line')]
         .find((candidate) => candidate.textContent.includes('Typed heading'));
       if (line === undefined) { return null; }
       const rect = line.getBoundingClientRect();
       return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (target === null) {
    throw new Error('the typed heading is gone');
  }

  window.webContents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 120));

  // Home, then select to the end, then copy: the clipboard must hold Markdown,
  // which also proves the cursor landed on the first *visible* character.
  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, lineEndKey, [...lineStartModifiers, 'shift']);
  clipboard.clear();
  window.webContents.copy();
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Electron 44's clipboard mirrors the asynchronous W3C API.
  const copied = await clipboard.readText();
  if (copied !== '##### Typed heading') {
    throw new Error(`the clipboard should hold Markdown, held ${JSON.stringify(copied)}`);
  }

  // Backspace at the visible start removes the level, keeping the text.
  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, 'Backspace');

  const afterFirst = await lineState(window, 'Typed heading');
  if (afterFirst === null) {
    throw new Error('the line vanished on the first backspace');
  }
  if (afterFirst.heading) {
    throw new Error('the first backspace did not remove the heading level');
  }
  if (afterFirst.text !== 'Typed heading') {
    throw new Error(`the text changed unexpectedly: ${JSON.stringify(afterFirst.text)}`);
  }

  // A second backspace merges with the line above, as in any editor. The line
  // above is empty, so the text is unchanged by the merge — the line count is
  // what says it happened.
  const linesBefore = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('.cm-line').length",
  )) as number;

  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, 'Backspace');

  const afterSecond = await lineState(window, 'Typed heading');
  if (afterSecond === null) {
    throw new Error('the line vanished on the second backspace');
  }
  const linesAfter = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('.cm-line').length",
  )) as number;
  if (linesAfter !== linesBefore - 1) {
    throw new Error(
      `the second backspace did not merge: ${linesBefore} lines before, ${linesAfter} after`,
    );
  }

  console.log(
    'smoke ok: heading syntax is atomic — clipboard kept Markdown, ' +
      'backspace removed the level and then merged',
  );

  await checkCutTakesPrefix(window, lineStartKey, lineStartModifiers, lineEndKey);
}

/**
 * Cutting a heading must take its prefix with it, or the text arrives
 * elsewhere as a heading while an empty `## ` stays behind. SPEC.md §10.2.
 */
async function checkCutTakesPrefix(
  window: BrowserWindow,
  lineStartKey: string,
  lineStartModifiers: readonly string[],
  lineEndKey: string,
): Promise<void> {
  // A fresh heading at the end of the document.
  await pressKey(window, lineEndKey, ['cmd']);
  await pressKey(window, 'Return');
  await typeText(window, '.h2 Cut me');

  const created = await lineState(window, 'Cut me');
  if (created === null || !created.heading) {
    throw new Error(`could not create a heading to cut: ${JSON.stringify(created)}`);
  }

  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, lineEndKey, [...lineStartModifiers, 'shift']);
  clipboard.clear();
  window.webContents.cut();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const cutText = await clipboard.readText();
  if (cutText !== '## Cut me') {
    throw new Error(`cut should place Markdown on the clipboard, placed ${JSON.stringify(cutText)}`);
  }

  const remainder = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const last = lines[lines.length - 1];
       return last === undefined
         ? null
         : { text: last.textContent, heading: last.className.includes('cm-heading') };
     })()`,
  )) as { text: string; heading: boolean } | null;

  if (remainder === null) {
    throw new Error('the document lost its last line');
  }
  if (remainder.heading || remainder.text !== '') {
    throw new Error(`cut left something behind: ${JSON.stringify(remainder)}`);
  }

  console.log('smoke ok: cut took the heading prefix with it, leaving an empty line');
  await checkDocumentFlow(window);
}

/**
 * The document round trip: edit, save, and find the change on disk.
 * SPEC.md §6, §10.6.
 *
 * The file is read here in the main process rather than through the bridge,
 * so what is checked is the manuscript itself and not the application's belief
 * about it.
 */
async function checkDocumentFlow(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null) {
    throw new Error('no smoke project');
  }

  const marker = `Written by the smoke at line ${Date.now() % 100000}`;
  await typeText(window, marker);

  const dirty = (await window.webContents.executeJavaScript(
    `(() => {
       const title = [...document.querySelectorAll('wi-panel-header .title')]
         .map((element) => element.textContent.trim())
         .find((text) => text.startsWith('Opening'));
       const saveButton = [...document.querySelectorAll('button')]
         .some((button) => button.textContent.trim() === 'Save');
       return { title: title ?? null, saveButton };
     })()`,
  )) as { title: string | null; saveButton: boolean };

  if (dirty.title === null || !dirty.title.endsWith('•')) {
    throw new Error(`the dirty marker is missing: ${JSON.stringify(dirty.title)}`);
  }
  if (!dirty.saveButton) {
    throw new Error('no save action while the document is dirty');
  }

  // Saving goes through the File menu, which owns Cmd+S. A synthetic key
  // event reaches the page directly and bypasses the accelerator, so the menu
  // item itself is triggered — which is also the path an author takes.
  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 500));

  const onDisk = readFileSync(join(smokeProjectPath, 'opening.md'), 'utf8');
  if (!onDisk.includes(marker)) {
    throw new Error('the saved file does not contain the edit');
  }
  if (!onDisk.startsWith('---\nopera-incerta:\n  title: Opening\n---\n')) {
    throw new Error(`saving damaged the front matter: ${JSON.stringify(onDisk.slice(0, 80))}`);
  }

  const clean = (await window.webContents.executeJavaScript(
    `(() => {
       const title = [...document.querySelectorAll('wi-panel-header .title')]
         .map((element) => element.textContent.trim())
         .find((text) => text.startsWith('Opening'));
       const saveButton = [...document.querySelectorAll('button')]
         .some((button) => button.textContent.trim() === 'Save');
       return { title: title ?? null, saveButton };
     })()`,
  )) as { title: string | null; saveButton: boolean };

  if (clean.title !== 'Opening') {
    throw new Error(`the dirty marker survived the save: ${JSON.stringify(clean.title)}`);
  }
  if (clean.saveButton) {
    throw new Error('the save action is still offered after saving');
  }

  console.log('smoke ok: edited, saved through the File menu, and the change is on disk');
  await checkSheetSwitch(window);
}

/** Switching groups and sheets. SPEC.md §9. */
async function checkSheetSwitch(window: BrowserWindow): Promise<void> {
  const switched = (await window.webContents.executeJavaScript(
    `(() => {
       const group = [...document.querySelectorAll('wi-explorer-node .name')]
         .find((element) => element.textContent.trim() === 'Part One');
       if (group === undefined) { return 'no group'; }
       group.click();
       return 'ok';
     })()`,
  )) as string;
  if (switched !== 'ok') {
    throw new Error(`could not select the nested group: ${switched}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));

  const listed = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as string[];
  if (listed.length !== 1 || listed[0] !== 'A Scene in Part One') {
    throw new Error(`the sheet list did not follow the group: ${JSON.stringify(listed)}`);
  }

  const opened = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-sheet-list .row')][0];
       if (row === undefined) { return 'no row'; }
       row.click();
       return 'ok';
     })()`,
  )) as string;
  if (opened !== 'ok') {
    throw new Error('could not open the nested sheet');
  }
  await new Promise((resolve) => setTimeout(resolve, 350));

  const editor = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')].map((line) => line.textContent);
       const title = [...document.querySelectorAll('wi-panel-header .title')]
         .map((element) => element.textContent.trim())
         .find((text) => text.startsWith('A Scene'));
       return { lines, title: title ?? null };
     })()`,
  )) as { lines: string[]; title: string | null };

  if (editor.title !== 'A Scene in Part One') {
    throw new Error(`the editor header did not follow: ${JSON.stringify(editor.title)}`);
  }
  if (!editor.lines.some((line) => line.includes('The Second Bell'))) {
    throw new Error(`the editor did not load the other sheet: ${JSON.stringify(editor.lines)}`);
  }
  // Front matter belongs to its own area, not to the writing surface
  // (SPEC.md §10.4) — and keeping it out is what protects it from being
  // edited into something the codec can no longer read.
  if (editor.lines.some((line) => line.includes('opera-incerta:'))) {
    throw new Error('front matter is showing inside the editor');
  }
  if (editor.lines.some((line) => line.includes('Written by the smoke'))) {
    throw new Error('the previous document is still in the editor');
  }

  console.log('smoke ok: switching group and sheet loaded the other document');
  await checkPanes(window);
}

/** The remaining panes and the activity bars. SPEC.md §8.4, §11, §12. */
async function checkPanes(window: BrowserWindow): Promise<void> {
  await checkFrontMatterArea(window);
  await checkPageCategories(window);

  // The inspector shows the metadata of the open sheet and its progress.
  const inspector = (await window.webContents.executeJavaScript(
    `(() => {
       const fields = [...document.querySelectorAll('wi-inspector label')].map((label) => ({
         name: (label.firstChild?.textContent ?? '').trim(),
         value: label.querySelector('input, textarea')?.value ?? null,
       }));
       const progress = document.querySelector('wi-inspector .progress')?.textContent ?? '';
       return { fields, progress };
     })()`,
  )) as { fields: Array<{ name: string; value: string | null }>; progress: string };

  const topic = inspector.fields.find((field) => field.name === 'Topic');
  if (topic?.value !== 'harbour') {
    throw new Error(`the inspector does not show the topic: ${JSON.stringify(inspector.fields)}`);
  }
  if (!/\d+ words/.test(inspector.progress)) {
    throw new Error(`the inspector shows no progress: ${JSON.stringify(inspector.progress)}`);
  }

  // Editing a field marks the sheet dirty, exactly as editing the body does.
  const dirtied = (await window.webContents.executeJavaScript(
    `(() => {
       const label = [...document.querySelectorAll('wi-inspector label')]
         .find((candidate) => candidate.textContent.trim().startsWith('Status'));
       const input = label?.querySelector('input');
       if (input === undefined || input === null) { return 'no field'; }
       input.value = 'review';
       input.dispatchEvent(new Event('change', { bubbles: true }));
       return 'ok';
     })()`,
  )) as string;
  if (dirtied !== 'ok') {
    throw new Error(`could not edit a metadata field: ${dirtied}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));

  const marker = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith('A Scene')) ?? null`,
  )) as string | null;
  if (marker === null || !marker.endsWith('•')) {
    throw new Error(`editing metadata did not mark the sheet dirty: ${JSON.stringify(marker)}`);
  }

  // The outline lists the headings of the open sheet.
  await activateSidebar(window, 'Outline');
  const outline = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-outline .entry')].map((entry) => entry.textContent.trim())`,
  )) as string[];
  if (!outline.some((entry) => entry.includes('The Second Bell'))) {
    throw new Error(`the outline is missing its heading: ${JSON.stringify(outline)}`);
  }

  // Activating the visible view again collapses the sidebar (SPEC.md §8.4).
  await activateSidebar(window, 'Outline');
  const collapsed = (await window.webContents.executeJavaScript(
    "document.querySelector('.secondary-sidebar') === null",
  )) as boolean;
  if (!collapsed) {
    throw new Error('activating the visible view did not collapse the sidebar');
  }
  await activateSidebar(window, 'Inspector');

  // Source control reads the repository the project sits in.
  const switched = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-activity-bar button')]
         .find((candidate) => candidate.getAttribute('aria-label') === 'Source control');
       if (button === undefined) { return 'no button'; }
       button.click();
       return 'ok';
     })()`,
  )) as string;
  if (switched !== 'ok') {
    throw new Error(`could not switch the navigator: ${switched}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  const sourceControl = (await window.webContents.executeJavaScript(
    `(() => {
       const panel = document.querySelector('wi-source-control');
       if (panel === null) { return null; }
       return {
         text: panel.textContent.trim().slice(0, 80),
         hasChangeList: panel.querySelector('.changes') !== null,
       };
     })()`,
  )) as { text: string; hasChangeList: boolean } | null;

  if (sourceControl === null) {
    throw new Error('the source control panel did not render');
  }
  if (!sourceControl.hasChangeList) {
    throw new Error(`the source control panel lists no changes: ${JSON.stringify(sourceControl)}`);
  }

  console.log('smoke ok: inspector, outline, sidebar collapse, and source control all work');
  await checkCommitting(window);
  checkMenuState();
  await checkColumnDragging(window);
}

/**
 * Checks the commit model of `SPEC.md` §12 against a real repository: stage
 * everything in one batch, unstage one file where there is no `HEAD` to
 * resolve against, commit, and surface a failing push without losing the
 * commit.
 */
async function checkCommitting(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null) {
    throw new Error('no smoke project');
  }

  const before = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('wi-source-control .change').length",
  )) as number;
  if (before < 2) {
    throw new Error(`a fresh repository should list its files, found ${String(before)}`);
  }

  // Everything at once, through the tri-state header — one batch, one guard.
  await clickSourceControl(window, '.changes-header input');
  const staged = runGit(smokeProjectPath, ['diff', '--cached', '--name-only']).trim().split('\n');
  if (staged.length < 2) {
    throw new Error(`staging all left ${JSON.stringify(staged)} in the index`);
  }

  // One back out again. Without a commit there is no HEAD to restore against,
  // which is exactly the case §12 calls out.
  const removed = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes('opening.md'));
       const box = row?.querySelector('input');
       if (box === null || box === undefined) { return null; }
       box.click();
       return row.textContent.trim();
     })()`,
  )) as string | null;
  if (removed === null) {
    throw new Error('no row for opening.md to unstage');
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (runGit(smokeProjectPath, ['diff', '--cached', '--name-only']).includes('opening.md')) {
    throw new Error('unstaging without a HEAD left the file in the index');
  }

  await fillCommitMessage(window, 'The first commit, from the smoke');
  await clickText(window, 'wi-source-control button', 'Commit');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const log = runGit(smokeProjectPath, ['log', '--oneline']).trim();
  if (!log.includes('The first commit, from the smoke')) {
    throw new Error(`nothing was committed: ${JSON.stringify(log)}`);
  }
  const committed = runGit(smokeProjectPath, ['show', '--name-only', '--format=', 'HEAD']);
  if (committed.includes('opening.md')) {
    throw new Error('the file that was unstaged went into the commit anyway');
  }

  // A push with no remote must surface the error and keep the commit.
  await clickSourceControl(window, '.changes-header input');
  await fillCommitMessage(window, 'The second commit, which cannot be pushed');
  await clickText(window, 'wi-source-control button', 'Commit and push');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const after = runGit(smokeProjectPath, ['log', '--oneline']).trim().split('\n');
  if (after.length !== 2) {
    throw new Error(`the commit did not stand through a failed push: ${JSON.stringify(after)}`);
  }
  const reported = (await window.webContents.executeJavaScript(
    "document.querySelector('wi-source-control .failure, .failure')?.textContent?.trim() ?? null",
  )) as string | null;
  if (reported === null || reported === '') {
    throw new Error('a failed push reported nothing');
  }
  // Git's own words, not our code for them: "no configured push destination"
  // tells the author what to do (SPEC.md §12).
  if (!reported.toLowerCase().includes('git') && !reported.toLowerCase().includes('remote')) {
    throw new Error(`a failed push reported a code rather than a reason: ${reported}`);
  }

  console.log(
    'smoke ok: staged in one batch, unstaged without a HEAD, committed, and a push with no ' +
      `remote kept the commit and said why (${reported.slice(0, 40)})`,
  );

  await checkLiveStatus(window);
}

/**
 * The live update of `SPEC.md` §12: while the panel is on screen, a change in
 * the working tree appears without anyone asking — and the panel does not then
 * keep refreshing itself.
 */
async function checkLiveStatus(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null) {
    throw new Error('no smoke project');
  }

  const countRows = async (): Promise<number> =>
    (await window.webContents.executeJavaScript(
      "document.querySelectorAll('wi-source-control .change').length",
    )) as number;

  const before = await countRows();
  // Not a sheet: git reports it, and the library does not, so this check
  // leaves the fixture exactly as it found it for the checks that follow.
  writeFileSync(join(smokeProjectPath, 'written-by-someone-else.txt'), 'Not a sheet.\n', 'utf8');

  await settleWatch(window, async () => (await countRows()) > before);
  const listed = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-source-control .change')].map((row) => row.textContent.trim())`,
  )) as readonly string[];
  if (!listed.some((row) => row.includes('written-by-someone-else.txt'))) {
    throw new Error(`the status did not notice a new file by itself: ${JSON.stringify(listed)}`);
  }

  // And now the part `CONVENTIONS.md` C-F4 exists for: `git status` writes
  // inside `.git` on every read, so without the filter each refresh would
  // trigger the next one, for as long as the panel stays open.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const quiet = repositoryReports;
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (repositoryReports !== quiet) {
    throw new Error(
      `the repository watch reported ${String(repositoryReports - quiet)} times with nobody ` +
        'touching anything: it is triggering itself',
    );
  }

  console.log(
    'smoke ok: a file written behind the application’s back appeared in source control by ' +
      'itself, and the watch then stayed quiet for three seconds',
  );

  await checkDiscarding(window);
}

/**
 * Throwing a change away, confirmed first. SPEC.md §12.
 *
 * Both kinds, because they end differently: a tracked file goes back to its
 * last committed state, and an untracked one has no state to go back to and
 * goes to the trash.
 */
async function checkDiscarding(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null || smokeTrashPath === null) {
    throw new Error('no smoke project');
  }

  // An untracked file has nothing to go back to. Cancelling first, because a
  // confirmation that is not asked is not a confirmation.
  const untracked = join(smokeProjectPath, 'written-by-someone-else.txt');
  if (!existsSync(untracked)) {
    throw new Error('the untracked file the live check wrote is gone');
  }

  // A file with nothing behind it is shown as entirely added.
  await openDiff(window, 'written-by-someone-else.txt');
  const asAdded = await diffLines(window);
  if (!asAdded.some((line) => line.kind === 'added' && line.text.includes('Not a sheet.'))) {
    throw new Error(`an untracked file is not shown as added: ${JSON.stringify(asAdded)}`);
  }
  if (asAdded.some((line) => line.kind === 'removed')) {
    throw new Error('an untracked file cannot have removed lines');
  }
  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));

  await openDiscard(window, 'written-by-someone-else.txt');
  const warning = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-confirm-prompt .warning')?.textContent.trim() ?? null`,
  )) as string | null;
  if (warning === null || !warning.includes('trash')) {
    throw new Error(`the confirmation does not say where it goes: ${String(warning)}`);
  }

  // A frame, so the picture has the dialog in it: the element is in the DOM
  // before the compositor has drawn it.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await window.webContents.capturePage();
  const evidencePath = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-discard.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!existsSync(untracked)) {
    throw new Error('cancelling the confirmation discarded the file anyway');
  }

  await openDiscard(window, 'written-by-someone-else.txt');
  await clickText(window, 'wi-confirm-prompt button', 'Discard');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (existsSync(untracked)) {
    throw new Error('the untracked file is still in the project');
  }
  if (!existsSync(join(smokeTrashPath, 'written-by-someone-else.txt'))) {
    throw new Error('the untracked file was removed instead of moved to the trash');
  }

  // The tracked case, on the sheet the editor holds — which is the one that
  // matters, because the editor is still holding a version of it.
  const sheet = join(smokeProjectPath, 'part-1', 'scene.md');
  const committed = runGit(smokeProjectPath, ['show', 'HEAD:part-1/scene.md']);

  // Save what the inspector changed earlier, so there is something to discard.
  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (readFileSync(sheet, 'utf8') === committed) {
    throw new Error('nothing was saved, so there is nothing to discard');
  }
  await settleWatch(window, async () => rowFor(window, 'scene.md'));

  // What changed against the last commit. A sheet opens word by word — the
  // whole point: Git would report the entire line twice.
  await openDiff(window, 'scene.md');
  const wordwise = (await window.webContents.executeJavaScript(
    `(() => {
       const prose = document.querySelector('wi-diff-view .prose');
       if (prose === null) { return null; }
       return {
         mode: document.querySelector('wi-diff-view .mode.active')?.textContent.trim() ?? null,
         added: [...prose.querySelectorAll('.word.added')].map((e) => e.textContent),
         removed: [...prose.querySelectorAll('.word.removed')].map((e) => e.textContent),
         text: prose.textContent,
       };
     })()`,
  )) as { mode: string | null; added: string[]; removed: string[]; text: string } | null;

  if (wordwise === null || wordwise.mode !== 'Words') {
    throw new Error(`a sheet did not open word by word: ${JSON.stringify(wordwise)}`);
  }
  // The inserted run is the words plus the whitespace that follows them: the
  // whitespace *before* them was already there, in front of the next line.
  if (wordwise.added.join('').trim() !== 'status: review') {
    throw new Error(`the word view marks more than what changed: ${JSON.stringify(wordwise.added)}`);
  }
  if (wordwise.removed.length !== 0) {
    throw new Error(`nothing was removed, yet: ${JSON.stringify(wordwise.removed)}`);
  }
  // Nothing invented and nothing lost: what it shows is the file itself.
  if (!wordwise.text.includes('## The Second Bell')) {
    throw new Error('the word view does not show the text it is comparing');
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const proseImage = await window.webContents.capturePage();
  const proseEvidence = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-prose-diff.png');
  writeFileSync(proseEvidence, proseImage.toPNG());
  console.log(`smoke evidence: ${proseEvidence}`);

  // Git's own reading is still one click away.
  await clickText(window, 'wi-diff-view .mode', 'Lines');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const changed = await diffLines(window);
  if (!changed.some((line) => line.kind === 'added' && line.text.includes('status: review'))) {
    throw new Error(`the diff does not show what was saved: ${JSON.stringify(changed)}`);
  }
  // The header is a header: `--- a/…` and `+++ b/…` start like a change and
  // are not one.
  const header = changed.slice(0, 4).every((line) => line.kind === 'meta');
  if (!header || !changed.some((line) => line.kind === 'hunk')) {
    throw new Error(`the diff is not read as a diff: ${JSON.stringify(changed.slice(0, 6))}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const diffImage = await window.webContents.capturePage();
  const diffEvidence = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-diff.png');
  writeFileSync(diffEvidence, diffImage.toPNG());
  console.log(`smoke evidence: ${diffEvidence}`);

  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (await isVisible(window, 'wi-diff-view')) {
    throw new Error('Escape left the diff open');
  }

  // And type something on top, unsaved.
  await placeCursorInEditor(window);
  await typeText(window, 'Typed, and about to be discarded.');
  await new Promise((resolve) => setTimeout(resolve, 300));

  await openDiscard(window, 'scene.md');
  await clickText(window, 'wi-confirm-prompt button', 'Discard');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (readFileSync(sheet, 'utf8') !== committed) {
    throw new Error('the file did not go back to its committed state');
  }
  if (await editorContains(window, 'Typed, and about to be discarded.')) {
    throw new Error('the editor still holds what was discarded, and would write it back');
  }
  // No conflict prompt: the author has just decided this, and being asked
  // about it afterwards would be asking them to decide it twice.
  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('discarding raised a prompt about the change it had just discarded');
  }
  const marker = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .some((element) => element.textContent.trim().endsWith('•'))`,
  )) as boolean;
  if (marker) {
    throw new Error('the sheet is still marked unsaved after its change was discarded');
  }

  console.log(
    'smoke ok: discarding put a tracked file back to its committed state and took the editor’s ' +
      'unsaved version with it, sent an untracked one to the trash, and cancelling kept both',
  );

  await checkFetchAndPull(window);
}

/**
 * Fetching and pulling against a real remote, with a second working copy
 * standing in for the other machine. SPEC.md §12.
 */
async function checkFetchAndPull(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null) {
    throw new Error('no smoke project');
  }

  // The remote is set up here rather than in the fixture, because an earlier
  // check needs a push to *fail* for want of one.
  const remote = join(mkdtempSync(join(tmpdir(), 'opera-incerta-remote-')), 'origin.git');
  runGit(smokeProjectPath, ['init', '--bare', '--initial-branch=main', remote]);
  runGit(smokeProjectPath, ['remote', 'add', 'origin', remote]);
  runGit(smokeProjectPath, ['push', '-u', 'origin', 'main']);

  const elsewhere = join(mkdtempSync(join(tmpdir(), 'opera-incerta-elsewhere-')), 'clone');
  runGit(smokeProjectPath, ['clone', remote, elsewhere]);
  for (const setting of [
    ['user.email', 'other@opera-incerta.invalid'],
    ['user.name', 'The Other Machine'],
    ['commit.gpgsign', 'false'],
  ]) {
    runGit(elsewhere, ['config', ...setting]);
  }
  // Not a sheet, so the library — and every check after this one — sees the
  // fixture exactly as it was.
  writeFileSync(join(elsewhere, 'from-the-other-machine.txt'), 'Written elsewhere.\n', 'utf8');
  runGit(elsewhere, ['add', 'from-the-other-machine.txt']);
  runGit(elsewhere, ['commit', '-m', 'from the other machine']);
  runGit(elsewhere, ['push']);

  // The upstream is new, so the panel has to be told to look again. Git's own
  // writes inside `.git` are filtered out of the watch, on purpose (§12).
  const refreshed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-panel-header button')]
         .find((candidate) => candidate.getAttribute('title') === 'Refresh');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!refreshed) {
    throw new Error('no refresh button in the source control header');
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  await settleWatch(window, async () => (await trackingLine(window)) !== null);
  const before = await trackingLine(window);
  if (before === null || !before.includes('origin/main') || !before.includes('up to date')) {
    throw new Error(`the panel does not show the upstream: ${String(before)}`);
  }

  await clickText(window, 'wi-source-control .tracking button', 'Fetch');
  await settleWatch(window, async () => ((await trackingLine(window)) ?? '').includes('↓1'));
  const fetched = await trackingLine(window);
  if (fetched === null || !fetched.includes('↓1')) {
    throw new Error(`fetching did not report being behind: ${String(fetched)}`);
  }
  // Fetching changes what is known, and no file in the working tree.
  if (existsSync(join(smokeProjectPath, 'from-the-other-machine.txt'))) {
    throw new Error('fetching brought a file into the working tree');
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const pullImage = await window.webContents.capturePage();
  const pullEvidence = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-pull.png');
  writeFileSync(pullEvidence, pullImage.toPNG());
  console.log(`smoke evidence: ${pullEvidence}`);

  await clickText(window, 'wi-source-control .tracking button', 'Pull');
  await settleWatch(window, async () =>
    existsSync(join(smokeProjectPath, 'from-the-other-machine.txt')),
  );

  if (!existsSync(join(smokeProjectPath, 'from-the-other-machine.txt'))) {
    throw new Error('pulling did not bring the commit in');
  }
  await settleWatch(window, async () => ((await trackingLine(window)) ?? '').includes('up to date'));
  const after = await trackingLine(window);
  if (after === null || !after.includes('up to date')) {
    throw new Error(`the panel is still behind after pulling: ${String(after)}`);
  }

  console.log(
    'smoke ok: fetching reported one commit behind without touching a file, and pulling brought ' +
      'it in by fast-forward',
  );
}

/** What the panel says about the upstream, or null when it says nothing. */
async function trackingLine(window: BrowserWindow): Promise<string | null> {
  return (await window.webContents.executeJavaScript(
    `document.querySelector('wi-source-control .tracking')?.textContent.replace(/\\s+/gu, ' ').trim() ?? null`,
  )) as string | null;
}

/** Whether the change list has a row for a file. */
async function rowFor(window: BrowserWindow, name: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-source-control .change')]
       .some((row) => row.textContent.includes(${JSON.stringify(name)}))`,
  )) as boolean;
}

/** Opens the diff for one row. */
async function openDiff(window: BrowserWindow, name: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(name)}));
       const button = row?.querySelector('button.show-diff');
       if (button === null || button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no diff control for ${name}`);
  }
  // Either reading, or the note that there is nothing to read.
  await waitForSelector(window, 'wi-diff-view pre, wi-diff-view .prose, wi-diff-view .hint');
}

/** The diff as the author sees it: each line with the kind it was given. */
async function diffLines(
  window: BrowserWindow,
): Promise<Array<{ text: string; kind: string }>> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-diff-view .line')].map((element) => ({
       text: element.textContent,
       kind: element.classList.contains('added')
         ? 'added'
         : element.classList.contains('removed')
           ? 'removed'
           : element.classList.contains('hunk')
             ? 'hunk'
             : element.classList.contains('meta')
               ? 'meta'
               : 'context',
     }))`,
  )) as Array<{ text: string; kind: string }>;
}

/** Opens the discard confirmation for one row. */
async function openDiscard(window: BrowserWindow, name: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(name)}));
       const button = row?.querySelector('button.discard');
       if (button === null || button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no discard control for ${name}`);
  }
  await waitForSelector(window, 'wi-confirm-prompt button');
}

/** Clicks one control inside the source control panel. */
async function clickSourceControl(window: BrowserWindow, selector: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector('wi-source-control ' + ${JSON.stringify(selector)});
       if (element === null) { return false; }
       element.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`nothing to click at ${selector}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
}

async function fillCommitMessage(window: BrowserWindow, message: string): Promise<void> {
  const filled = (await window.webContents.executeJavaScript(
    `(() => {
       const field = document.querySelector('wi-source-control textarea.message');
       if (field === null) { return false; }
       field.value = ${JSON.stringify(message)};
       field.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!filled) {
    throw new Error('no commit message field');
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/**
 * Dragging a column divider. SPEC.md §8.2.
 *
 * Through real pointer events, and then read back from the preference file —
 * so what is checked is that the width was stored, not that a signal changed.
 */
async function checkColumnDragging(window: BrowserWindow): Promise<void> {
  const before = (await window.webContents.executeJavaScript(
    `(() => {
       const navigator = document.querySelector('.navigator');
       const divider = document.querySelector('wi-resize-divider');
       if (navigator === null || divider === null) { return null; }
       const bounds = divider.getBoundingClientRect();
       return {
         width: navigator.getBoundingClientRect().width,
         x: Math.round(bounds.left + bounds.width / 2),
         y: Math.round(bounds.top + 200),
       };
     })()`,
  )) as { width: number; x: number; y: number } | null;
  if (before === null) {
    throw new Error('no divider beside the navigator');
  }

  // Press, move right in steps, release — as a hand does.
  window.webContents.sendInputEvent({ type: 'mouseDown', x: before.x, y: before.y, clickCount: 1 });
  for (let offset = 10; offset <= 40; offset += 10) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: before.x + offset, y: before.y });
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: before.x + 40,
    y: before.y,
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 400));

  const after = (await window.webContents.executeJavaScript(
    "document.querySelector('.navigator')?.getBoundingClientRect().width ?? null",
  )) as number | null;
  if (after === null) {
    throw new Error('the navigator disappeared while dragging');
  }
  if (Math.round(after) <= Math.round(before.width)) {
    throw new Error(`dragging right did not widen the column: ${before.width} to ${after}`);
  }

  // Switching a view must not move it (CONVENTIONS.md C-U1).
  await activateSidebar(window, 'Outline');
  await activateSidebar(window, 'Inspector');
  const afterSwitch = (await window.webContents.executeJavaScript(
    "document.querySelector('.navigator')?.getBoundingClientRect().width ?? null",
  )) as number | null;
  if (Math.round(afterSwitch ?? 0) !== Math.round(after)) {
    throw new Error(`switching views moved the column: ${after} to ${String(afterSwitch)}`);
  }

  // And the width reached the preference file.
  //
  // Compared against the *applied* width rather than the measured one: the
  // divider overlaps its neighbours by a few pixels, so what the column
  // occupies on screen is not the number the layout state set.
  const applied = (await window.webContents.executeJavaScript(
    `Number.parseFloat(document.querySelector('.navigator')?.style.width ?? '0')`,
  )) as number;
  const stored = JSON.parse(readFileSync(preferencesPath, 'utf8')) as {
    columnWidths: { navigator: number };
  };
  if (stored.columnWidths.navigator !== applied) {
    throw new Error(`stored ${stored.columnWidths.navigator}, applied ${applied}`);
  }

  console.log(
    `smoke ok: dragged the navigator from ${Math.round(before.width)}px to ${applied}px, ` +
      'unchanged by a view switch and stored in the preference file',
  );
  await checkLibraryEdits(window);
}

/**
 * Creating and renaming from the context menus. SPEC.md §6.4, §6.5.
 *
 * The rule under test is the one that makes the library survive: renaming
 * changes a title, never a file name.
 */
async function checkLibraryEdits(window: BrowserWindow): Promise<void> {
  if (smokeProjectPath === null) {
    throw new Error('no smoke project');
  }

  // Back to the explorer: the previous check left the navigator on source
  // control, and the tree is where a group is right-clicked.
  const backToExplorer = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-activity-bar button')]
         .find((candidate) => candidate.getAttribute('aria-label') === 'Explorer');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!backToExplorer) {
    throw new Error('no Explorer entry in the activity bar');
  }
  await waitForSelector(window, 'wi-explorer-node .name');

  // Right-click the root group and create a sheet.
  await rightClick(window, 'wi-explorer-node .name');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Sheet');
  await waitForSelector(window, 'wi-text-prompt input');

  await fillPrompt(window, 'A Brand New Scene');
  await new Promise((resolve) => setTimeout(resolve, 600));

  const created = readFileSync(join(smokeProjectPath, 'a-brand-new-scene.md'), 'utf8');
  if (!created.includes('title: A Brand New Scene')) {
    throw new Error(`the new sheet lacks its title: ${JSON.stringify(created)}`);
  }
  if (!created.endsWith('---\n')) {
    throw new Error(`the new sheet should start empty: ${JSON.stringify(created)}`);
  }

  const openedTitle = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith('A Brand New Scene')) ?? null`,
  )) as string | null;
  if (openedTitle === null) {
    throw new Error('the created sheet did not open in the editor');
  }

  // Rename a sheet that is *not* open, so the file itself is rewritten.
  await rightClickRowContaining(window, 'Opening');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'Rename');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Renamed In Place');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const files = readdirSync(smokeProjectPath).filter((name) => name.endsWith('.md')).sort();
  // The rule that makes the library survive: the title changed, the file name
  // did not (SPEC.md §6.4).
  if (!files.includes('opening.md') || !files.includes('a-brand-new-scene.md')) {
    throw new Error(`renaming moved a file: ${JSON.stringify(files)}`);
  }
  const opening = readFileSync(join(smokeProjectPath, 'opening.md'), 'utf8');
  if (!opening.includes('title: Renamed In Place')) {
    throw new Error('the file does not carry the new title');
  }

  // Renaming the *open* sheet goes through its editing state instead, because
  // writing the file would discard what is unsaved in the editor.
  await rightClickRowContaining(window, 'A Brand New Scene');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'Rename');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Renamed While Open');
  await new Promise((resolve) => setTimeout(resolve, 500));

  const onDisk = readFileSync(join(smokeProjectPath, 'a-brand-new-scene.md'), 'utf8');
  if (onDisk.includes('Renamed While Open')) {
    throw new Error('renaming the open sheet wrote the file behind the editor');
  }

  const dirtyTitle = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith('Renamed While Open')) ?? null`,
  )) as string | null;
  if (dirtyTitle === null || !dirtyTitle.endsWith('•')) {
    throw new Error(`the open sheet was not renamed into its editing state: ${String(dirtyTitle)}`);
  }

  // A group: the directory takes the slug, the display name goes to
  // structure.json, and the new group is what the columns show (SPEC.md §6.4).
  await rightClickNodeContaining(window, 'Smoke Project');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Group');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Part Two');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const groupPath = join(smokeProjectPath, 'part-two');
  if (!statSync(groupPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('the group directory was not created under its slug');
  }
  if (displayNameOf(smokeProjectPath, 'part-two') !== 'Part Two') {
    throw new Error('structure.json did not record the display name');
  }

  const afterGroup = (await window.webContents.executeJavaScript(
    `(() => {
       const selected = document.querySelector('wi-explorer-node .row.selected .name');
       return {
         selected: selected === null ? null : selected.textContent.trim(),
         sheets: document.querySelectorAll('wi-sheet-list .row').length,
         title: document.querySelector('wi-panel-header .title')?.textContent.trim() ?? null,
       };
     })()`,
  )) as { selected: string | null; sheets: number; title: string | null };
  if (afterGroup.selected !== 'Part Two') {
    throw new Error(`the new group is not the selected one: ${String(afterGroup.selected)}`);
  }
  if (afterGroup.sheets !== 0) {
    throw new Error(`the new group should hold no sheets, the list shows ${afterGroup.sheets}`);
  }

  // Renaming a group touches structure.json alone — the directory keeps its
  // name, which is what keeps `order` and every path valid.
  await rightClickNodeContaining(window, 'Part Two');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'Rename');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'The Second Part');
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (!statSync(groupPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('renaming a group moved its directory');
  }
  if (displayNameOf(smokeProjectPath, 'part-two') !== 'The Second Part') {
    throw new Error('the group rename did not reach structure.json');
  }

  console.log(
    'smoke ok: created a sheet, renamed a closed one on disk and the open one into its edits, ' +
      'and created and renamed a group — no file or directory name changed',
  );

  await checkReordering(window, smokeProjectPath);
}

/**
 * Checks that a sheet and a group can be dragged into a new order, and that
 * the order lands in `structure.json`. SPEC.md §6.4.
 */
async function checkReordering(window: BrowserWindow, projectPath: string): Promise<void> {
  // Back to the root group, whose sheet list holds two sheets.
  await clickText(window, 'wi-explorer-node .name', 'Smoke Project');
  await new Promise((resolve) => setTimeout(resolve, 300));

  const first = await rowPoint(window, 'wi-sheet-list li', 'Renamed In Place');
  const second = await rowPoint(window, 'wi-sheet-list li', 'Renamed While Open');
  // Past the middle of the row below, which is where the insertion line moves.
  // Into the lower band of the row below, which means "after that row".
  await dragTo(
    window,
    first,
    { x: first.x, y: second.y + Math.round(second.height * 0.4) },
    'smoke-drag.png',
  );

  const sheetOrder = orderOf(projectPath, '.');
  if (sheetOrder.indexOf('a-brand-new-scene.md') > sheetOrder.indexOf('opening.md')) {
    throw new Error(`the sheet did not move: ${JSON.stringify(sheetOrder)}`);
  }

  const shown = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (shown[0] !== 'Renamed While Open' || shown[1] !== 'Renamed In Place') {
    throw new Error(`the list still shows the old order: ${JSON.stringify(shown)}`);
  }

  // Dragging a sheet must not also open it: the author was moving it.
  const headers = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!headers.some((title) => title.startsWith('Renamed While Open'))) {
    throw new Error(`the editor lost its sheet while dragging: ${JSON.stringify(headers)}`);
  }
  if (headers.some((title) => title.startsWith('Renamed In Place'))) {
    throw new Error('dragging a sheet opened it');
  }

  // The same gesture in the tree, where a group moves among its siblings.
  const second_ = await rowPoint(window, 'wi-explorer-node .row', 'The Second Part');
  const partOne = await rowPoint(window, 'wi-explorer-node .row', 'Part One');
  // Into the upper band of Part One, which means "before that row".
  await dragTo(window, second_, { x: second_.x, y: partOne.y - Math.round(partOne.height * 0.4) });

  const groupOrder = orderOf(projectPath, '.');
  if (groupOrder.indexOf('part-two') > groupOrder.indexOf('part-1')) {
    throw new Error(`the group did not move: ${JSON.stringify(groupOrder)}`);
  }

  const tree = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-explorer-node .name')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (tree[1] !== 'The Second Part' || tree[2] !== 'Part One') {
    throw new Error(`the tree still shows the old order: ${JSON.stringify(tree)}`);
  }

  console.log(
    'smoke ok: dragged a sheet and a group into a new order, recorded in structure.json, ' +
      'and dragging opened nothing',
  );

  await checkDeletion(window, projectPath);
}

/**
 * Checks that an entry goes to the trash, that it is really *moved* there, and
 * that neither Escape nor Return takes anything away. SPEC.md §6.7.
 */
async function checkDeletion(window: BrowserWindow, projectPath: string): Promise<void> {
  if (smokeTrashPath === null) {
    throw new Error('the smoke has no trash to delete into');
  }

  // Return must not delete — and the dialog must actually be gone afterwards.
  // Without that second half, a dialog that ignores Return passes this check.
  for (const key of ['Return', 'Escape']) {
    await openDeleteDialog(window, 'wi-sheet-list .row', 'Renamed In Place', 'Delete Sheet');

    const focused = (await window.webContents.executeJavaScript(
      "(document.activeElement || {}).textContent?.trim() ?? null",
    )) as string | null;
    if (focused !== 'Cancel') {
      throw new Error(`the confirmation put the keyboard on ${String(focused)}, not on Cancel`);
    }

    await pressKey(window, key);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stillOpen = (await window.webContents.executeJavaScript(
      "document.querySelector('wi-confirm-prompt') !== null",
    )) as boolean;
    if (stillOpen) {
      throw new Error(`${key} left the confirmation open`);
    }
    if (!existsSync(join(projectPath, 'opening.md'))) {
      throw new Error(`${key} in the confirmation deleted the sheet`);
    }
  }

  // Aimed at, it deletes.
  await openDeleteDialog(window, 'wi-sheet-list .row', 'Renamed In Place', 'Delete Sheet');
  await clickText(window, 'wi-confirm-prompt button', 'Delete');
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (existsSync(join(projectPath, 'opening.md'))) {
    throw new Error('the sheet is still in the project');
  }
  // Moved, not destroyed — the whole point of a trash.
  const trashed = readFileSync(join(smokeTrashPath, 'opening.md'), 'utf8');
  if (!trashed.includes('title: Renamed In Place')) {
    throw new Error('what reached the trash is not the sheet that was deleted');
  }
  if (orderOf(projectPath, '.').includes('opening.md')) {
    throw new Error('structure.json still names the deleted sheet');
  }

  // The author is left somewhere, not nowhere.
  const remaining = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (remaining.length !== 1 || remaining[0] !== 'Renamed While Open') {
    throw new Error(`the list is wrong after deleting: ${JSON.stringify(remaining)}`);
  }

  // A group takes its contents along, in one piece.
  await openDeleteDialog(window, 'wi-explorer-node .row', 'Part One', 'Delete Group');
  const warning = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-confirm-prompt .warning')?.textContent.trim() ?? null`,
  )) as string | null;
  if (warning === null || !warning.includes('1 sheet')) {
    throw new Error(`the confirmation does not say what goes along: ${String(warning)}`);
  }

  const image = await window.webContents.capturePage();
  const evidencePath = join(currentDirectory, '..', '..', '..', 'build', 'desktop', 'smoke-delete.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  await clickText(window, 'wi-confirm-prompt button', 'Delete');
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (existsSync(join(projectPath, 'part-1'))) {
    throw new Error('the group is still in the project');
  }
  if (!existsSync(join(smokeTrashPath, 'part-1', 'scene.md'))) {
    throw new Error('the group did not reach the trash with its sheet inside');
  }

  console.log(
    'smoke ok: a sheet and a group moved to the trash with their contents, the record forgot ' +
      'them, and neither Return nor Escape deleted anything',
  );

  await checkMovingBetweenGroups(window, projectPath);
}

/**
 * Checks that an entry can be dragged into another group — the sheet list into
 * the tree, and the tree into itself. SPEC.md §6.8.
 */
async function checkMovingBetweenGroups(window: BrowserWindow, projectPath: string): Promise<void> {
  // A second group to move things into.
  await rightClickNodeContaining(window, 'Smoke Project');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Group');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Part Three');
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Creating one selects it, and its sheet list is empty; the sheet to be
  // moved is in the root.
  await clickText(window, 'wi-explorer-node .name', 'Smoke Project');
  await new Promise((resolve) => setTimeout(resolve, 300));

  // The open sheet, from the sheet list into a group in the tree.
  const sheet = await rowPoint(window, 'wi-sheet-list .row', 'Renamed While Open');
  const partThree = await rowPoint(window, 'wi-explorer-node .row', 'Part Three');
  await dragTo(window, sheet, { x: partThree.x, y: partThree.y }, 'smoke-move.png');

  if (existsSync(join(projectPath, 'a-brand-new-scene.md'))) {
    throw new Error('the sheet is still in the group it was dragged out of');
  }
  if (!existsSync(join(projectPath, 'part-three', 'a-brand-new-scene.md'))) {
    throw new Error('the sheet did not arrive in the group it was dropped on');
  }
  if (orderOf(projectPath, '.').includes('a-brand-new-scene.md')) {
    throw new Error('the record still holds the sheet in its old group');
  }
  // The editor holds the same document, at its new path.
  const headers = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!headers.some((title) => title.startsWith('Renamed While Open'))) {
    throw new Error(`moving the open sheet closed it: ${JSON.stringify(headers)}`);
  }

  // A group into another group, with everything in it.
  const source = await rowPoint(window, 'wi-explorer-node .row', 'Part Three');
  const target = await rowPoint(window, 'wi-explorer-node .row', 'The Second Part');
  await dragTo(window, source, { x: target.x, y: target.y });

  if (!existsSync(join(projectPath, 'part-two', 'part-three', 'a-brand-new-scene.md'))) {
    throw new Error('the group did not arrive with its sheet inside');
  }
  if (displayNameOf(projectPath, 'part-two/part-three') !== 'Part Three') {
    throw new Error('the moved group lost its display name: its entry was not carried along');
  }
  if (displayNameOf(projectPath, 'part-three') !== null) {
    throw new Error('the record still has an entry at the old path');
  }

  // Still the same document, two moves later.
  const afterwards = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!afterwards.some((title) => title.startsWith('Renamed While Open'))) {
    throw new Error(`moving the group around the open sheet closed it: ${JSON.stringify(afterwards)}`);
  }

  // A group placed *between* the children of another group: the travelling and
  // the position said in one drop (SPEC.md §6.8).
  await rightClickNodeContaining(window, 'Smoke Project');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Group');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Part Four');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const four = await rowPoint(window, 'wi-explorer-node .row', 'Part Four');
  const three = await rowPoint(window, 'wi-explorer-node .row', 'Part Three');
  await dragTo(window, four, { x: three.x, y: three.y - Math.round(three.height * 0.4) });

  if (!existsSync(join(projectPath, 'part-two', 'part-four'))) {
    throw new Error('the group did not travel into the other group');
  }
  const placed = orderOf(projectPath, 'part-two');
  if (placed[0] !== 'part-four' || placed[1] !== 'part-three') {
    throw new Error(`the group travelled but was not placed: ${JSON.stringify(placed)}`);
  }

  console.log(
    'smoke ok: dragged a sheet into a group, that group into another, and a third in front of ' +
      'it — one drop said both where and which place, and the open editor followed',
  );

  await checkExternalChange(window, projectPath);
}

/**
 * Checks the comparison rule of `SPEC.md` §10.6 where it can already be
 * reached: the explicit re-read.
 */
async function checkExternalChange(window: BrowserWindow, projectPath: string): Promise<void> {
  // The open sheet, after the two moves above.
  const sheetPath = join(projectPath, 'part-two', 'part-three', 'a-brand-new-scene.md');
  const original = readFileSync(sheetPath, 'utf8');

  await placeCursorInEditor(window);
  await typeText(window, 'Typed but never saved.');
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Someone else writes the file while the author has unsaved work in it.
  writeFileSync(sheetPath, `${original}\nWritten by someone else.\n`, 'utf8');
  await reloadFromDisk(window);

  if (!(await isVisible(window, 'wi-confirm-prompt'))) {
    throw new Error('a file that changed under unsaved work raised no prompt');
  }
  // Asked, not announced: the author's version is still there while it asks.
  if (!(await editorContains(window, 'Typed but never saved.'))) {
    throw new Error('the prompt appeared after the work was already gone');
  }

  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('Escape left the conflict prompt open');
  }
  if (!(await editorContains(window, 'Typed but never saved.'))) {
    throw new Error('keeping the author’s version lost it anyway');
  }
  if (readFileSync(sheetPath, 'utf8').includes('Typed but never saved.')) {
    throw new Error('keeping the author’s version wrote it to disk');
  }

  // With nothing unsaved, the same change is simply taken. Saving first is
  // what makes the buffer clean.
  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 600));
  writeFileSync(sheetPath, `${original}\nWritten again, with nothing unsaved.\n`, 'utf8');
  await reloadFromDisk(window);

  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('an unmodified buffer was asked about instead of reloaded');
  }
  if (!(await editorContains(window, 'Written again, with nothing unsaved.'))) {
    throw new Error('an unmodified buffer did not take the change from disk');
  }

  console.log(
    'smoke ok: a file changed under unsaved work asks before anything is lost, and is taken ' +
      'silently when nothing was typed',
  );

  await checkWatchedChange(window, projectPath, sheetPath);
}

/**
 * The same rule again, with nobody pressing anything: the watcher of
 * `SPEC.md` §10.6 is what notices. MVP criteria §17.13 and §17.14.
 */
async function checkWatchedChange(
  window: BrowserWindow,
  projectPath: string,
  sheetPath: string,
): Promise<void> {
  // Content, with nothing unsaved: the change simply arrives.
  writeFileSync(sheetPath, `${readFileSync(sheetPath, 'utf8')}\nNoticed without being asked.\n`, 'utf8');
  await settleWatch(window, () => editorContains(window, 'Noticed without being asked.'));
  if (!(await editorContains(window, 'Noticed without being asked.'))) {
    throw new Error('a change on disk never reached the editor by itself');
  }
  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('an unmodified buffer was asked about instead of reloaded');
  }

  // Content, with unsaved work: the prompt appears on its own.
  await placeCursorInEditor(window);
  await typeText(window, 'Typed while someone else was writing.');
  await new Promise((resolve) => setTimeout(resolve, 200));
  writeFileSync(sheetPath, `${readFileSync(sheetPath, 'utf8')}\nAnd again from outside.\n`, 'utf8');

  await settleWatch(window, async () => isVisible(window, 'wi-confirm-prompt'));
  if (!(await isVisible(window, 'wi-confirm-prompt'))) {
    throw new Error('a file changed under unsaved work raised no prompt of its own accord');
  }
  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!(await editorContains(window, 'Typed while someone else was writing.'))) {
    throw new Error('the work was gone by the time the prompt appeared');
  }

  // Structure: a sheet appearing in the group on screen. The root is empty by
  // now, so one row is the whole answer.
  await clickText(window, 'wi-explorer-node .name', 'Smoke Project');
  await new Promise((resolve) => setTimeout(resolve, 400));
  writeFileSync(
    join(projectPath, 'appeared.md'),
    '---\nopera-incerta:\n  title: Appeared By Itself\n---\nText\n',
    'utf8',
  );

  await settleWatch(window, async () => {
    const titles = (await window.webContents.executeJavaScript(
      `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
    )) as readonly string[];
    return titles.includes('Appeared By Itself');
  });
  const shown = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!shown.includes('Appeared By Itself')) {
    throw new Error(`a new sheet did not appear by itself: ${JSON.stringify(shown)}`);
  }

  console.log(
    'smoke ok: a change made behind the application’s back reached the editor, raised the ' +
      'prompt over unsaved work, and put a new sheet in the list — with nobody pressing refresh',
  );
}

/** Waits for the watcher to have done its work, or gives up. */
async function settleWatch(
  window: BrowserWindow,
  done: () => Promise<boolean>,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await done()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Clicks into the last editor line, where an author would carry on typing. */
async function placeCursorInEditor(window: BrowserWindow): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const last = lines[lines.length - 1];
       if (last === undefined) { return null; }
       const rect = last.getBoundingClientRect();
       return { x: Math.round(rect.left + 4), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error('the editor has no lines to click into');
  }
  window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, clickCount: 1 });
  await pressKey(window, 'End', ['cmd']);
}

/** Presses the navigator's reload button, as the author would. */
async function reloadFromDisk(window: BrowserWindow): Promise<void> {
  const pressed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-panel-header button')]
         .find((candidate) => candidate.getAttribute('title') === 'Reload from disk');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!pressed) {
    throw new Error('no reload button in the navigator');
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function isVisible(window: BrowserWindow, selector: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}) !== null`,
  )) as boolean;
}

async function editorContains(window: BrowserWindow, text: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('.cm-line')]
       .map((line) => line.textContent).join('\\n').includes(${JSON.stringify(text)})`,
  )) as boolean;
}

/** Opens the confirmation for one entry through its context menu. */
async function openDeleteDialog(
  window: BrowserWindow,
  selector: string,
  text: string,
  entry: string,
): Promise<void> {
  const point = await rowPoint(window, selector, text);
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', entry);
  await waitForSelector(window, 'wi-confirm-prompt button');
}

/** The recorded order of one group. */
function orderOf(projectPath: string, relativePath: string): readonly string[] {
  const structure = JSON.parse(
    readFileSync(join(projectPath, '.opera-incerta', 'structure.json'), 'utf8'),
  ) as Record<string, { order?: string[] } | undefined>;
  return structure[relativePath]?.order ?? [];
}

/** The middle of the element matching `selector` that carries `text`. */
async function rowPoint(
  window: BrowserWindow,
  selector: string,
  text: string,
): Promise<{ x: number; y: number; height: number }> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll(${JSON.stringify(selector)})]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(text)}));
       if (row === undefined) { return null; }
       const bounds = row.getBoundingClientRect();
       return {
         x: Math.round(bounds.left + bounds.width / 2),
         y: Math.round(bounds.top + bounds.height / 2),
         height: Math.round(bounds.height),
       };
     })()`,
  )) as { x: number; y: number; height: number } | null;
  if (point === null) {
    throw new Error(`no row containing ${text}`);
  }
  return point;
}

/**
 * Presses on a row, travels to a point in steps, and releases — as a hand does.
 * The path is followed in both directions, because a drag may cross from one
 * library column into the other.
 *
 * `evidence` names a screenshot taken while the pointer is still down, because
 * the insertion line and the destination highlight only exist during the drag,
 * and a check that never looks at them cannot say the author sees anything
 * (`TESTING.md` §1.9).
 */
async function dragTo(
  window: BrowserWindow,
  from: { x: number; y: number },
  to: { x: number; y: number },
  evidence?: string,
): Promise<void> {
  window.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, clickCount: 1 });

  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    const x = Math.round(from.x + ((to.x - from.x) * step) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * step) / steps);
    window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  if (evidence !== undefined) {
    const image = await window.webContents.capturePage();
    const directory = join(currentDirectory, '..', '..', '..', 'build', 'desktop');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, evidence);
    writeFileSync(path, image.toPNG());
    console.log(`smoke evidence: ${path}`);
  }

  window.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

/** The display name `structure.json` records for a group, if any. */
function displayNameOf(projectPath: string, relativePath: string): string | null {
  const structure = JSON.parse(
    readFileSync(join(projectPath, '.opera-incerta', 'structure.json'), 'utf8'),
  ) as Record<string, { displayName?: string } | undefined>;
  return structure[relativePath]?.displayName ?? null;
}

/** Right-clicks the explorer node whose name is the given text. */
async function rightClickNodeContaining(window: BrowserWindow, text: string): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const name = [...document.querySelectorAll('wi-explorer-node .name')]
         .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)});
       if (name === undefined) { return null; }
       const bounds = name.getBoundingClientRect();
       return { x: Math.round(bounds.left + 8), y: Math.round(bounds.top + bounds.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error(`no explorer node named ${text}`);
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/** Right-clicks the sheet-list row containing the given text. */
async function rightClickRowContaining(window: BrowserWindow, text: string): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-sheet-list .row')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(text)}));
       if (row === undefined) { return null; }
       const bounds = row.getBoundingClientRect();
       return { x: Math.round(bounds.left + 12), y: Math.round(bounds.top + 10) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error(`no sheet row containing ${text}`);
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/** Right-clicks the first element matching a selector. */
async function rightClick(window: BrowserWindow, selector: string): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector(${JSON.stringify(selector)});
       if (element === null) { return null; }
       const bounds = element.getBoundingClientRect();
       return { x: Math.round(bounds.left + 8), y: Math.round(bounds.top + bounds.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error(`nothing to right-click at ${selector}`);
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/** Clicks the first element matching a selector whose text contains `text`. */
async function clickText(window: BrowserWindow, selector: string, text: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(text)}));
       if (element === undefined) { return false; }
       element.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no ${selector} containing ${text}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/** Types into the open prompt and confirms it. */
async function fillPrompt(window: BrowserWindow, value: string): Promise<void> {
  const filled = (await window.webContents.executeJavaScript(
    `(() => {
       const input = document.querySelector('wi-text-prompt input');
       if (input === null) { return false; }
       input.value = ${JSON.stringify(value)};
       input.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!filled) {
    throw new Error('no prompt to fill');
  }
  await new Promise((resolve) => setTimeout(resolve, 150));

  const confirmed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-text-prompt button')]
         .find((candidate) => !candidate.disabled && candidate.textContent.trim() !== 'Cancel');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!confirmed) {
    throw new Error('the prompt would not confirm');
  }
}

/** The menu offers what is possible, and only that. SPEC.md §8.5. */
function checkMenuState(): void {
  const menu = Menu.getApplicationMenu();
  if (menu === null) {
    throw new Error('no application menu is installed');
  }

  for (const command of Object.keys(MENU_ACCELERATORS) as Array<keyof typeof MENU_ACCELERATORS>) {
    const item = menu.getMenuItemById(menuItemId(command));
    if (item === null || item === undefined) {
      throw new Error(`the menu is missing ${command}`);
    }
    if (item.accelerator !== MENU_ACCELERATORS[command]) {
      throw new Error(
        `${command} has accelerator ${String(item.accelerator)}, expected ${MENU_ACCELERATORS[command]}`,
      );
    }
    // With a project open, every command applies.
    if (!item.enabled) {
      throw new Error(`${command} is disabled while a project is open`);
    }
  }

  // The editing roles must survive a custom menu, or copy and paste stop
  // working inside the editor.
  const edit = menu.items.find((item) => item.label.replace('&', '') === 'Edit');
  // Electron reports roles lower-cased, whatever case the template used.
  const roles = (edit?.submenu?.items ?? []).map((item) => String(item.role).toLowerCase());
  for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectall']) {
    if (!roles.includes(role)) {
      throw new Error(`the Edit menu lost its ${role} role`);
    }
  }

  console.log('smoke ok: the menu offers every command with its shortcut, and keeps the edit roles');
}

/**
 * Closing the project returns to the launcher, with the project now in the
 * recent list. SPEC.md §8.5, §8.6.
 */
async function checkReturnToLauncher(_projectView: BrowserWindow): Promise<void> {
  // Through the File menu, so the specified path — menu, window close, reset,
  // launcher — is the one under test (SPEC.md §8.5).
  clickMenuItem('project/close');

  let launcher: BrowserWindow | null = null;
  for (let attempt = 0; attempt < 100 && launcher === null; attempt += 1) {
    const candidate = welcomeWindow;
    if (candidate !== null && !candidate.isDestroyed() && !candidate.webContents.isLoading()) {
      launcher = candidate;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (launcher === null) {
    throw new Error('closing the project did not bring the launcher back');
  }
  forwardConsole(launcher);

  await waitForSelector(launcher, '.welcome .entry');
  const recent = (await launcher.webContents.executeJavaScript(
    `[...document.querySelectorAll('.welcome .entry')].map((entry) => ({
       name: entry.querySelector('.name')?.textContent ?? null,
       unavailable: entry.classList.contains('unavailable'),
     }))`,
  )) as Array<{ name: string | null; unavailable: boolean }>;

  if (recent.length !== 1 || recent[0]?.name !== 'Smoke Project') {
    throw new Error(`the recent list is wrong after closing: ${JSON.stringify(recent)}`);
  }
  if (recent[0]?.unavailable === true) {
    throw new Error('the project it just closed is marked unavailable');
  }

  console.log('smoke ok: closing the project returned to the launcher, with it listed as recent');
  await checkCreateProject(launcher);
}

/**
 * Creating a project from the launcher. SPEC.md §6.1, §8.6.
 *
 * The display name is what the author writes; the directory is a slug of it.
 * The dialog shows that slug before the project exists, and this checks that
 * what it promised is what appeared on disk.
 */
async function checkCreateProject(launcher: BrowserWindow): Promise<void> {
  if (smokeCreateParent === null) {
    throw new Error('no location for the new project');
  }

  clickMenuItem('project/new');
  await waitForSelector(launcher, 'wi-new-project-dialog input');

  const typed = (await launcher.webContents.executeJavaScript(
    `(() => {
       const input = document.querySelector('wi-new-project-dialog input');
       if (input === null) { return 'no input'; }
       input.value = 'Die Nacht am Hafen';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       const choose = [...document.querySelectorAll('wi-new-project-dialog button')]
         .find((button) => button.textContent.includes('Choose'));
       if (choose === undefined) { return 'no choose button'; }
       choose.click();
       return 'ok';
     })()`,
  )) as string;
  if (typed !== 'ok') {
    throw new Error(`could not fill the dialog: ${typed}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 400));

  const preview = (await launcher.webContents.executeJavaScript(
    `(() => {
       const code = document.querySelector('wi-new-project-dialog code');
       const create = [...document.querySelectorAll('wi-new-project-dialog button')]
         .find((button) => button.textContent.trim() === 'Create');
       return {
         folder: code === null ? null : code.textContent,
         enabled: create === undefined ? null : !create.disabled,
       };
     })()`,
  )) as { folder: string | null; enabled: boolean | null };

  // Umlauts become ASCII, spaces become hyphens: the rule, shown before it
  // takes effect.
  if (preview.folder !== 'die-nacht-am-hafen') {
    throw new Error(`the dialog previewed ${JSON.stringify(preview.folder)}`);
  }
  if (preview.enabled !== true) {
    throw new Error('Create is not offered with a name and a location');
  }

  const created = (await launcher.webContents.executeJavaScript(
    `(() => {
       const create = [...document.querySelectorAll('wi-new-project-dialog button')]
         .find((button) => button.textContent.trim() === 'Create');
       if (create === undefined) { return false; }
       create.click();
       return true;
     })()`,
  )) as boolean;
  if (!created) {
    throw new Error('no Create button');
  }

  const window = await waitForProjectWindow();
  await waitForSelector(window, 'wi-root .workbench');

  const projectPath = join(smokeCreateParent, 'die-nacht-am-hafen');
  const record = JSON.parse(
    readFileSync(join(projectPath, '.opera-incerta', 'project.json'), 'utf8'),
  ) as { displayName: string; id: string; created: string };

  if (record.displayName !== 'Die Nacht am Hafen') {
    throw new Error(`the record kept ${JSON.stringify(record.displayName)}`);
  }
  if (typeof record.id !== 'string' || record.id === '') {
    throw new Error('the new project has no id');
  }

  const shownName = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())[0] ?? null`,
  )) as string | null;
  if (shownName !== 'Die Nacht am Hafen') {
    throw new Error(`the workbench shows ${JSON.stringify(shownName)}`);
  }

  console.log(
    'smoke ok: created a project — the display name kept its spaces, the folder took the slug',
  );
}

/** Clicks an entry of the trailing activity bar by its accessible name. */
async function activateSidebar(window: BrowserWindow, label: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-activity-bar button')]
         .find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no activity bar entry named ${label}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/** Renderer errors are otherwise invisible from here. */
function forwardConsole(window: BrowserWindow): void {
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') {
      console.error(`renderer ${details.level}: ${details.message}`);
    }
  });
}

/**
 * The launcher, and the transition to the workbench. SPEC.md §8.5, §8.6.
 *
 * Returns the project window, which every later check runs against.
 */
async function checkLauncherAndOpen(launcher: BrowserWindow): Promise<BrowserWindow> {
  // `ready-to-show` fires before the renderer has asked which window it is and
  // loaded the matching component, so the element is waited for rather than
  // assumed.
  await waitForSelector(launcher, '.welcome .actions button');

  const welcome = (await launcher.webContents.executeJavaScript(
    `(() => {
       const root = document.querySelector('wi-root .welcome');
       if (root === null) { return null; }
       return {
         heading: root.querySelector('h1')?.textContent ?? null,
         buttons: [...root.querySelectorAll('.actions button')].map((b) => b.textContent.trim()),
         entries: root.querySelectorAll('.entry').length,
         hint: root.querySelector('.hint')?.textContent ?? null,
       };
     })()`,
  )) as { heading: string | null; buttons: string[]; entries: number; hint: string | null } | null;

  if (welcome === null) {
    throw new Error('the launcher did not render');
  }
  if (welcome.heading !== 'Opera Incerta') {
    throw new Error(`unexpected launcher heading: ${JSON.stringify(welcome.heading)}`);
  }
  if (welcome.buttons.length !== 2) {
    throw new Error(`the launcher must offer open and new: ${JSON.stringify(welcome.buttons)}`);
  }
  // Fresh user data, so nothing has been opened yet.
  if (welcome.entries !== 0 || welcome.hint === null) {
    throw new Error(`expected an empty recent list: ${JSON.stringify(welcome)}`);
  }

  const clicked = (await launcher.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('.actions button')]
         .find((candidate) => candidate.textContent.includes('Open project'));
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error('no "Open project" button in the launcher');
  }

  const window = await waitForProjectWindow();
  await waitForSelector(window, 'wi-root .workbench');
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (welcomeWindow !== null && !welcomeWindow.isDestroyed()) {
    throw new Error('the launcher stayed open after the project appeared');
  }

  console.log('smoke ok: launcher opened a project and gave way to the workbench');
  return window;
}

/** Waits until a selector matches, or fails saying what was expected. */
async function waitForSelector(
  window: BrowserWindow,
  selector: string,
  attempts = 100,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const found = (await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    )) as boolean;
    if (found) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`nothing matched ${selector} after waiting`);
}

/** Waits for the project window to exist and finish loading. */
async function waitForProjectWindow(): Promise<BrowserWindow> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const window = projectWindow;
    if (window !== null && !window.isDestroyed() && !window.webContents.isLoading()) {
      return window;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the project window never appeared');
}

/**
 * Verifies the two things a shell smoke test can prove without a user: the
 * renderer rendered, and the versioned bridge answers through IPC.
 */
async function runSmokeCheck(launcher: BrowserWindow): Promise<void> {
  // A renderer-side error is otherwise invisible from here: the smoke would
  // report only "script failed to execute" and leave the cause to guesswork.
  forwardConsole(launcher);

  try {
    const window = await checkLauncherAndOpen(launcher);
    forwardConsole(window);

    const shell = (await window.webContents.executeJavaScript(
      `(() => {
         const workbench = document.querySelector('wi-root .workbench');
         if (workbench === null) { return null; }
         return {
           regions:
             workbench.querySelectorAll(':scope > section').length +
             workbench.querySelectorAll(':scope > wi-activity-bar').length,
           dividers: workbench.querySelectorAll(':scope > wi-resize-divider').length,
           headers: document.querySelectorAll('wi-panel-header').length,
         };
       })()`,
    )) as { regions: number; dividers: number; headers: number } | null;
    const bridgeVersion: unknown = await window.webContents.executeJavaScript(
      `typeof window.${BRIDGE_GLOBAL} === 'object'` +
        ` ? window.${BRIDGE_GLOBAL}.contractVersion()` +
        ' : null',
    );

    if (shell === null) {
      throw new Error('the workbench did not render');
    }
    // Six regions: two activity bars and four columns (SPEC.md §8.2).
    if (shell.regions !== 6) {
      throw new Error(`expected six regions, found ${shell.regions}`);
    }
    // One divider per resizable column: navigator, sheet list, sidebar.
    if (shell.dividers !== 3) {
      throw new Error(`expected three dividers, found ${shell.dividers}`);
    }
    if (shell.headers < 4) {
      throw new Error(`every panel needs a header, found ${shell.headers}`);
    }
    if (bridgeVersion !== CONTRACT_VERSION) {
      throw new Error(`bridge answered ${JSON.stringify(bridgeVersion)}`);
    }

    // The editor is the part most likely to render as an empty box, so the
    // smoke asks for evidence that it laid out: a heading line taller than
    // body text, a gutter marker beside it, and no visible `#` prefix.
    await selectSmokeSheet(window);

    const editor = (await window.webContents.executeJavaScript(
      `(() => {
         const lines = [...document.querySelectorAll('.cm-line')];
         const heading = lines.find((line) => line.classList.contains('cm-heading-1'));
         const body = lines.find((line) => !line.className.includes('cm-heading'));
         if (heading === undefined || body === undefined) { return null; }
         return {
           lines: lines.length,
           headingHeight: heading.getBoundingClientRect().height,
           bodyHeight: body.getBoundingClientRect().height,
           markers: [...document.querySelectorAll('.cm-heading-marker')]
             .filter((marker) => marker.dataset.line !== '0').length,
           fencedMarkers: [...document.querySelectorAll('.cm-line')]
             .filter((line) => line.textContent.startsWith('# A fenced block'))
             .map((line) => [...document.querySelectorAll('.cm-heading-marker')]
               .filter((marker) => marker.textContent === 'H1').length)
             .length,
           hidesPrefix: !heading.textContent.includes('#'),
           fencedLineVisible: [...document.querySelectorAll('.cm-line')]
             .some((line) => line.textContent.startsWith('# A fenced block')),
         };
       })()`,
    )) as {
      lines: number;
      headingHeight: number;
      bodyHeight: number;
      markers: number;
      hidesPrefix: boolean;
      fencedLineVisible: boolean;
    } | null;

    if (editor === null) {
      throw new Error('the editor did not render its lines');
    }
    if (!(editor.headingHeight > editor.bodyHeight)) {
      throw new Error(
        `heading not taller than body: ${editor.headingHeight} vs ${editor.bodyHeight}`,
      );
    }
    if (editor.markers === 0) {
      throw new Error('no heading markers in the gutter');
    }
    if (!editor.hidesPrefix) {
      throw new Error('the heading line still shows its Markdown prefix');
    }
    // Three headings in the placeholder document. A fourth would mean the `#`
    // inside the fenced block was labelled as one — the defect the visual
    // check found.
    if (editor.markers !== 3) {
      throw new Error(`expected 3 gutter markers, found ${editor.markers}`);
    }
    if (!editor.fencedLineVisible) {
      throw new Error('the fenced line is not shown verbatim');
    }

    await checkHeadingGestures(window);

    const image = await window.webContents.capturePage();
    const evidenceDirectory = join(currentDirectory, '..', '..', '..', 'build', 'desktop');
    mkdirSync(evidenceDirectory, { recursive: true });
    const evidencePath = join(evidenceDirectory, 'smoke.png');
    writeFileSync(evidencePath, image.toPNG());

    console.log(`smoke ok: renderer rendered, bridge contract v${CONTRACT_VERSION}`);
    console.log(
      `smoke ok: editor laid out ${editor.lines} lines, heading ${editor.headingHeight}px ` +
        `over body ${editor.bodyHeight}px, ${editor.markers} gutter markers`,
    );
    console.log(`smoke evidence: ${evidencePath}`);

    // Last, because it closes the window everything else needed.
    await checkReturnToLauncher(window);
    endSmoke(0);
  } catch (error: unknown) {
    console.error('smoke failed:', error);
    endSmoke(1);
  }
}
