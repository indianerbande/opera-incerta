/**
 * Electron main process. SPEC.md §5.3, §8.5.
 *
 * This process owns every privileged capability: filesystem, watching, Git,
 * native dialogs, and menus. It never owns document semantics — those live in
 * the portable core.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, Menu, app, clipboard, dialog, ipcMain, net, protocol } from 'electron';
import {
  BRIDGE_GLOBAL,
  CHANNELS,
  CONTRACT_VERSION,
  isDocumentHandle,
  isGitCommitRequest,
  isGitPathsRequest,
  isRecentProjectRequest,
  isWriteSheetRequest,
  type BridgeResult,
  type ProjectSnapshot,
} from '@opera-incerta/desktop-contract';
import { projectDirectoryName } from '@opera-incerta/core';
import { createGitService } from '@opera-incerta/git-node';
import { createProjectFilesystem } from '@opera-incerta/project-node';
import { MENU_ACCELERATORS, installApplicationMenu, menuItemId } from './application-menu.js';
import { ProjectSession, ProjectSessionError } from './project-session.js';
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

if (SMOKE_RUN) {
  // The recent-projects list is installation-local state; a test run must not
  // write into the author's.
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-userdata-')));
}

function prepareSmokeProject(): string {
  const source = join(currentDirectory, '..', '..', '..', 'examples', 'smoke-project');
  const destination = join(mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-')), 'smoke-project');
  cpSync(source, destination, { recursive: true });
  return destination;
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

const session = new ProjectSession();
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

/**
 * Creates a project: a name, a parent directory, a slugged directory of its
 * own. SPEC.md §6.1, §8.6.
 */
privileged(CHANNELS.createProject, acceptsNothing, async () => {
  const chosen = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Where should the project live?',
    buttonLabel: 'Create here',
  });
  const parent = chosen.canceled ? undefined : chosen.filePaths[0];
  if (parent === undefined) {
    return null;
  }

  const displayName = basename(parent);
  const directoryName = projectDirectoryName(displayName, await readdir(parent));
  const projectPath = join(parent, directoryName);

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

const git = createGitService();

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
  return root === null ? { root: null, entries: [] } : { root, entries: await git.status(root) };
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
  // The smoke project is a copy in a temporary directory, so it is not inside
  // a repository — which the panel must state rather than fail on.
  if (sourceControl.hasChangeList || !sourceControl.text.includes('not inside a Git repository')) {
    throw new Error(`unexpected source control state: ${JSON.stringify(sourceControl)}`);
  }

  console.log('smoke ok: inspector, outline, sidebar collapse, and source control all work');
  checkMenuState();
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
           regions: workbench.children.length,
           headers: document.querySelectorAll('wi-panel-header').length,
         };
       })()`,
    )) as { regions: number; headers: number } | null;
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
    app.exit(0);
  } catch (error: unknown) {
    console.error('smoke failed:', error);
    app.exit(1);
  }
}
