/**
 * The single versioned bridge exposed to the sandboxed renderer.
 * specification.md §5.3.
 *
 * Only channels declared in the contract may appear here, and the renderer
 * receives functions rather than the IPC object itself, so it cannot reach a
 * channel this file does not name.
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  BRIDGE_GLOBAL,
  CHANNELS,
  isMenuCommand,
  type MenuCommand,
  type OperaIncertaBridge,
} from '@opera-incerta/desktop-contract';

// `satisfies`: a method added to the contract and forgotten here fails to
// compile, rather than failing in the renderer as "not a function".
const bridge = {
  contractVersion: () => ipcRenderer.invoke(CHANNELS.contractVersion),
  windowRole: () => ipcRenderer.invoke(CHANNELS.windowRole),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  createProject: (request: unknown) => ipcRenderer.invoke(CHANNELS.createProject, request),
  adoptProject: (request: unknown) => ipcRenderer.invoke(CHANNELS.adoptProject, request),
  chooseProjectLocation: () => ipcRenderer.invoke(CHANNELS.chooseProjectLocation),
  openProjectPath: (request: unknown) => ipcRenderer.invoke(CHANNELS.openProjectPath, request),
  forgetRecentProject: (request: unknown) =>
    ipcRenderer.invoke(CHANNELS.forgetRecentProject, request),
  currentProject: () => ipcRenderer.invoke(CHANNELS.currentProject),
  recentProjects: () => ipcRenderer.invoke(CHANNELS.recentProjects),
  reopenProject: () => ipcRenderer.invoke(CHANNELS.reopenProject),
  closeProject: () => ipcRenderer.invoke(CHANNELS.closeProject),
  readSheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.readSheet, request),
  writeSheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.writeSheet, request),
  gitStatus: () => ipcRenderer.invoke(CHANNELS.gitStatus),
  gitStage: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitStage, request),
  gitUnstage: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitUnstage, request),
  gitCommit: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitCommit, request),
  gitPush: () => ipcRenderer.invoke(CHANNELS.gitPush),
  gitFetch: () => ipcRenderer.invoke(CHANNELS.gitFetch),
  gitPull: () => ipcRenderer.invoke(CHANNELS.gitPull),
  gitMerge: () => ipcRenderer.invoke(CHANNELS.gitMerge),
  gitAbortMerge: () => ipcRenderer.invoke(CHANNELS.gitAbortMerge),
  gitInit: () => ipcRenderer.invoke(CHANNELS.gitInit),
  gitIdentity: () => ipcRenderer.invoke(CHANNELS.gitIdentity),
  gitSetIdentity: (identity) => ipcRenderer.invoke(CHANNELS.gitSetIdentity, identity),
  gitResolve: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitResolve, request),
  gitPublish: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitPublish, request),
  gitBranches: () => ipcRenderer.invoke(CHANNELS.gitBranches),
  gitAmend: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitAmend, request),
  gitLastMessage: () => ipcRenderer.invoke(CHANNELS.gitLastMessage),
  gitReadIgnore: () => ipcRenderer.invoke(CHANNELS.gitReadIgnore),
  gitWriteIgnore: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitWriteIgnore, request),
  gitCreateBranch: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitCreateBranch, request),
  gitSwitchBranch: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitSwitchBranch, request),
  gitDeleteBranch: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitDeleteBranch, request),
  gitDiscard: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitDiscard, request),
  gitDiff: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitDiff, request),
  gitVersions: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitVersions, request),

  searchLibrary: (request: unknown) => ipcRenderer.invoke(CHANNELS.searchLibrary, request),
  exportDocument: (request: unknown) => ipcRenderer.invoke(CHANNELS.exportDocument, request),
  listStylesheets: () => ipcRenderer.invoke(CHANNELS.listStylesheets),
  readStylesheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.readStylesheet, request),
  writeStylesheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.writeStylesheet, request),
  createSheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.createSheet, request),
  createGroup: (request: unknown) => ipcRenderer.invoke(CHANNELS.createGroup, request),
  renameSheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.renameSheet, request),
  renameGroup: (request: unknown) => ipcRenderer.invoke(CHANNELS.renameGroup, request),
  placeEntry: (request: unknown) => ipcRenderer.invoke(CHANNELS.placeEntry, request),
  writeCategories: (categories: unknown) =>
    ipcRenderer.invoke(CHANNELS.writeCategories, categories),
  deleteEntry: (request: unknown) => ipcRenderer.invoke(CHANNELS.deleteEntry, request),
  watchTargets: (request: unknown) => ipcRenderer.invoke(CHANNELS.watchTargets, request),
  watchRepository: (visible: unknown) => ipcRenderer.invoke(CHANNELS.watchRepository, visible),
  readPreferences: () => ipcRenderer.invoke(CHANNELS.readPreferences),
  writePreferences: (record: unknown) => ipcRenderer.invoke(CHANNELS.writePreferences, record),

  onExternalChange: (listener: () => void) => {
    const forward = (): void => {
      listener();
    };
    ipcRenderer.on(CHANNELS.externalChange, forward);
    return () => {
      ipcRenderer.removeListener(CHANNELS.externalChange, forward);
    };
  },

  onRepositoryChange: (listener: () => void) => {
    const forward = (): void => {
      listener();
    };
    ipcRenderer.on(CHANNELS.repositoryChange, forward);
    return () => {
      ipcRenderer.removeListener(CHANNELS.repositoryChange, forward);
    };
  },

  /**
   * The inbound channels. The event object never crosses: the renderer
   * receives a validated command, so the page cannot reach the IPC layer
   * through what it is handed.
   */
  onMenuCommand: (listener: (command: MenuCommand) => void) => {
    const forward = (_event: unknown, command: unknown): void => {
      if (isMenuCommand(command)) {
        listener(command);
      }
    };
    ipcRenderer.on(CHANNELS.menuCommand, forward);
    return () => {
      ipcRenderer.removeListener(CHANNELS.menuCommand, forward);
    };
  },
} satisfies OperaIncertaBridge;

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
