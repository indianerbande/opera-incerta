/**
 * The single versioned bridge exposed to the sandboxed renderer.
 * SPEC.md §5.3.
 *
 * Only channels declared in the contract may appear here, and the renderer
 * receives functions rather than the IPC object itself, so it cannot reach a
 * channel this file does not name.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_GLOBAL, CHANNELS, isMenuCommand } from '@opera-incerta/desktop-contract';

const bridge = {
  contractVersion: () => ipcRenderer.invoke(CHANNELS.contractVersion),
  windowRole: () => ipcRenderer.invoke(CHANNELS.windowRole),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  createProject: (request: unknown) => ipcRenderer.invoke(CHANNELS.createProject, request),
  chooseProjectLocation: () => ipcRenderer.invoke(CHANNELS.chooseProjectLocation),
  openRecentProject: (request: unknown) =>
    ipcRenderer.invoke(CHANNELS.openRecentProject, request),
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
  gitDiscard: (request: unknown) => ipcRenderer.invoke(CHANNELS.gitDiscard, request),

  /**
   * The one inbound channel.
   *
   * The event object never crosses: the renderer receives a validated command
   * string, so the page cannot reach the IPC layer through what it is handed.
   */
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

  onMenuCommand: (listener: (command: string) => void) => {
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
} as const;

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
