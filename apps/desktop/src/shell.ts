/**
 * The Electron shell: windows, menus, the bridge handlers, the watchers.
 * SPEC.md §5.3, §8.5.
 *
 * This process owns every privileged capability: filesystem, watching, Git,
 * native dialogs, and menus. It never owns document semantics — those live in
 * the portable core.
 *
 * `startShell` is the one entry point. The production entry (`main.ts`) calls
 * it with no options; the smoke entry (`smoke/main.ts`) calls it with the
 * few substitutions a test needs — a fixture instead of the directory
 * chooser, a directory instead of the desktop trash — and gets back a handle
 * to the windows. Nothing in this file knows that a smoke exists.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} from 'electron';
import {
  CHANNELS,
  CONTRACT_VERSION,
  isDocumentHandle,
  isGitCommitRequest,
  isGitIdentity,
  isGitBranchRequest,
  isGitPathsRequest,
  isGitPublishRequest,
  isGitTextRequest,
  isGitResolveRequest,
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
import {
  isSafeRemoteUrl,
  isValidBranchName,
  projectDirectoryName,
  readPreferences,
} from '@opera-incerta/core';
import { createGitService } from '@opera-incerta/git-node';
import {
  canonicalPath,
  createLibraryWatcher,
  createProjectFilesystem,
} from '@opera-incerta/project-node';
import { installApplicationMenu } from './application-menu.js';
import { failureResult } from './bridge-failure.js';
import {
  ProjectSession,
  ProjectSessionError,
  containedPath,
  type TrashItem,
} from './project-session.js';
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
 * What an entry point may substitute. Every field is optional; the production
 * entry passes nothing and gets the native behaviour.
 */
export interface ShellOptions {
  /**
   * Instead of the native directory chooser when the author opens a project.
   * Returns the directory, or null for "cancelled".
   */
  readonly chooseProjectToOpen?: () => Promise<string | null>;
  /**
   * Instead of the native chooser for where a new project should live.
   * Returns the parent directory, or null for "cancelled".
   */
  readonly chooseProjectParent?: () => Promise<string | null>;
  /** Instead of the desktop trash. SPEC.md §6.7. */
  readonly trashItem?: TrashItem;
  /**
   * Instead of Electron's user-data directory, for installation-local state
   * (the recent list, the preference record). Set before anything reads it.
   */
  readonly userDataPath?: string;
  /** Called once, when the launcher window has been shown for the first time. */
  readonly onLauncherShown?: (launcher: BrowserWindow) => void;
}

/** What `startShell` hands back: enough to observe the shell from outside. */
export interface Shell {
  /** The workbench window, or null while none is open. */
  projectWindow(): BrowserWindow | null;
  /** The launcher window, or null while none is open. */
  welcomeWindow(): BrowserWindow | null;
  /**
   * How many times the repository watch has reported since start. A test
   * reads it to prove that watching a repository does not make it report
   * forever (`CONVENTIONS.md` C-F4).
   */
  repositoryReports(): number;
  /**
   * Ends the process with an exit code, without the close handlers taking
   * the shutdown for an ordinary project close and building a fresh launcher.
   */
  exit(code: number): void;
}

/** The preference record, inside the user-data directory. SPEC.md §13. */
export const PREFERENCES_FILE = 'preferences.json';

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
 * Starts the shell. Called exactly once, at module load of an entry point,
 * before Electron is ready: the renderer scheme must be registered before
 * then.
 */
export function startShell(options: ShellOptions = {}): Shell {
  if (options.userDataPath !== undefined) {
    app.setPath('userData', options.userDataPath);
  }

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
  let launcherShown = false;

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
      if (!launcherShown) {
        launcherShown = true;
        options.onLauncherShown?.(window);
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

  const trashItem: TrashItem = options.trashItem ?? ((path) => shell.trashItem(path));
  // One filesystem for the shell and the session: every access to the disk
  // goes through the port, and the two cannot disagree about what is there.
  const projectFiles = createProjectFilesystem();
  const session = new ProjectSession(projectFiles, trashItem);
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
        return {
          ok: false,
          code: 'bridge/invalid-request',
          message: `invalid request on ${channel}`,
        };
      }

      try {
        return { ok: true, value: await handle(request) };
      } catch (error: unknown) {
        return failureResult(error, channel);
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

  const chooseProjectToOpen =
    options.chooseProjectToOpen ??
    (async (): Promise<string | null> => {
      const chosen = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Open project',
      });
      return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
    });

  privileged(CHANNELS.openProject, acceptsNothing, async () => {
    const directory = await chooseProjectToOpen();
    return directory === null ? null : await openProjectAt(directory);
  });

  privileged(CHANNELS.openRecentProject, isRecentProjectRequest, async (request) =>
    openProjectAt(request.path),
  );

  const chooseProjectParent =
    options.chooseProjectParent ??
    (async (): Promise<string | null> => {
      const chosen = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Where should the project live?',
        buttonLabel: 'Choose',
      });
      return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
    });

  /** The parent directory for a new project. SPEC.md §8.6. */
  privileged(CHANNELS.chooseProjectLocation, acceptsNothing, async () => {
    const path = await chooseProjectParent();
    return path === null ? null : { path, shortPath: abbreviatePath(path) };
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
    const directoryName = projectDirectoryName(
      displayName,
      await projectFiles.listDirectory(request.parentPath),
    );
    const projectPath = join(request.parentPath, directoryName);

    await projectFiles.createDirectory(projectPath);
    await projectFiles.createProject(projectPath, displayName);
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
    const entries = [];
    for (const project of recentProjects.read()) {
      const inspection = await projectFiles.inspectFolder(project.path);
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
  const preferencesPath = join(app.getPath('userData'), PREFERENCES_FILE);

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
   * How many times the repository watch has reported. Exposed on the shell
   * handle for a test that checks that watching a repository does not make it
   * report forever: `git status` writes inside `.git`, and without the filter
   * of §12 each refresh would trigger the next (`CONVENTIONS.md` C-F4).
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
    const projectPath = session.openPath;
    if (projectPath !== null) {
      // Notification only, but a watch is still a read of a place the renderer
      // named, and it gets the same containment check as every other one.
      for (const target of [request.group, request.sheet]) {
        if (target !== null) {
          await containedPath(projectPath, target, 'entry/outside-project');
        }
      }
    }
    projectWatch.set(projectPath, request);
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

  privileged(CHANNELS.gitMerge, acceptsNothing, async () => {
    await git.merge(await repositoryRoot());
    return null;
  });

  privileged(CHANNELS.gitAbortMerge, acceptsNothing, async () => {
    await git.abortMerge(await repositoryRoot());
    return null;
  });

  /**
   * A repository for a project that has none. SPEC.md §12.
   *
   * In the project root, never a parent: the manuscript is what gets a
   * history. Refused where one already exists, because `git init` in an
   * existing repository reinitialises it, and that is not what the button
   * says. Nothing is staged or committed here; the status the renderer reads
   * afterwards shows every file as untracked, which is the honest state.
   */
  privileged(CHANNELS.gitInit, acceptsNothing, async () => {
    const projectPath = session.openPath;
    if (projectPath === null) {
      throw new ProjectSessionError('project/none-open');
    }
    if ((await git.repositoryRoot(projectPath)) !== null) {
      throw new ProjectSessionError('git/already-a-repository');
    }
    await git.init(projectPath);
    return null;
  });

  /**
   * The identity at both scopes. SPEC.md §12. Read for the project directory
   * so that the global half is known before there is a repository at all.
   */
  privileged(CHANNELS.gitIdentity, acceptsNothing, async () => {
    const projectPath = session.openPath;
    if (projectPath === null) {
      throw new ProjectSessionError('project/none-open');
    }
    const root = await git.repositoryRoot(projectPath);
    return {
      global: await git.identity(projectPath, 'global'),
      local: root === null ? null : await git.identity(root, 'local'),
    };
  });

  privileged(CHANNELS.gitSetIdentity, isGitIdentity, async (identity) => {
    await git.setIdentity(await repositoryRoot(), identity);
    return null;
  });

  privileged(CHANNELS.gitBranches, acceptsNothing, async () =>
    git.branches(await repositoryRoot()),
  );

  privileged(CHANNELS.gitLastMessage, acceptsNothing, async () =>
    git.lastCommitMessage(await repositoryRoot()),
  );

  privileged(CHANNELS.gitAmend, isGitTextRequest, async (request) => {
    const root = await repositoryRoot();
    // Refused for a commit that is already on the upstream: amending rewrites
    // history, and republishing it would need force, which this application
    // does not offer (SPEC.md §12).
    const tracking = await git.tracking(root);
    if (tracking !== null && tracking.ahead === 0) {
      throw new ProjectSessionError('git/already-pushed');
    }
    if (await git.isMerging(root)) {
      throw new ProjectSessionError('git/merging');
    }
    await git.amend(root, request.text.trim() === '' ? null : request.text);
    return null;
  });

  privileged(CHANNELS.gitReadIgnore, acceptsNothing, async () => {
    const root = await repositoryRoot();
    return readFile(join(root, '.gitignore'), 'utf8').catch(() => '');
  });

  privileged(CHANNELS.gitWriteIgnore, isGitTextRequest, async (request) => {
    const root = await repositoryRoot();
    await projectFiles.writeSheet(join(root, '.gitignore'), request.text);
    return null;
  });

  privileged(CHANNELS.gitCreateBranch, isGitBranchRequest, async (request) => {
    // Checked before git sees it: a name beginning with `-` would be read as an
    // option, and `git switch --create` accepts no separator (SPEC.md §12).
    if (!isValidBranchName(request.name)) {
      throw new ProjectSessionError('git/invalid-branch-name');
    }
    await git.createBranch(await repositoryRoot(), request.name.trim());
    return null;
  });

  privileged(CHANNELS.gitSwitchBranch, isGitBranchRequest, async (request) => {
    await git.switchBranch(await repositoryRoot(), request.name);
    return null;
  });

  privileged(CHANNELS.gitDeleteBranch, isGitBranchRequest, async (request) => {
    await git.deleteBranch(await repositoryRoot(), request.name);
    return null;
  });

  privileged(CHANNELS.gitPublish, isGitPublishRequest, async (request) => {
    const root = await repositoryRoot();
    const branch = await git.currentBranch(root);
    if (branch === null) {
      throw new ProjectSessionError('git/no-branch');
    }

    if (request.url !== undefined) {
      // Checked here, where it can still be refused, rather than handed to git:
      // some of git's transports run commands (SPEC.md §12).
      if (!isSafeRemoteUrl(request.url)) {
        throw new ProjectSessionError('git/unsafe-remote');
      }
      await git.addRemote(root, 'origin', request.url.trim());
    }

    const remote = await git.defaultRemote(root);
    if (remote === null) {
      throw new ProjectSessionError('git/no-remote');
    }
    await git.publish(root, remote.name, branch);
    return null;
  });

  /**
   * A file the renderer named, resolved against the repository root and checked
   * to be inside it. SPEC.md §5.3.
   *
   * Every handler that turns a repository-relative path into a filesystem path
   * goes through here, so none can skip the check. The one that did was the
   * one that could read any file: `git diff --no-index` takes any path at all.
   */
  async function repositoryFile(relativePath: string): Promise<{ root: string; absolute: string }> {
    const root = await repositoryRoot();
    const absolute = await containedPath(root, relativePath, 'entry/outside-repository');
    return { root, absolute };
  }

  privileged(CHANNELS.gitResolve, isGitResolveRequest, async (request) => {
    const { root, absolute } = await repositoryFile(request.path);
    // The same atomic write every sheet gets: an interrupted resolution must not
    // leave half a manuscript behind.
    await projectFiles.writeSheet(absolute, request.text);
    await git.stage(root, [request.path]);
    return null;
  });

  privileged(CHANNELS.gitVersions, isLibraryPathRequest, async (request) => {
    const { root, absolute } = await repositoryFile(request.path);
    return {
      committed: await git.showAtHead(root, request.path),
      // A file the working tree no longer has is a normal answer: that is what a
      // deletion looks like.
      current: await readFile(absolute, 'utf8').catch(() => null),
    };
  });

  privileged(CHANNELS.gitDiff, isLibraryPathRequest, async (request) => {
    const { root } = await repositoryFile(request.path);
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
      return {
      root: null,
      entries: [],
      tracking: null,
      merging: false,
      hasCommit: false,
      branch: null,
      remote: null,
    };
    }
    return {
      root,
      entries: await git.status(root),
      // Read with the status, so the panel never shows one from a moment ago
      // beside the other.
      tracking: await git.tracking(root),
      merging: await git.isMerging(root),
      branch: await git.currentBranch(root),
      hasCommit: await git.hasCommit(root),
      remote: await git.defaultRemote(root),
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

  return {
    projectWindow: () =>
      projectWindow !== null && !projectWindow.isDestroyed() ? projectWindow : null,
    welcomeWindow: () =>
      welcomeWindow !== null && !welcomeWindow.isDestroyed() ? welcomeWindow : null,
    repositoryReports: () => repositoryReports,
    exit: (code) => {
      // `app.exit` emits no `before-quit`, so the flag is set here.
      isTerminating = true;
      app.exit(code);
    },
  };
}
