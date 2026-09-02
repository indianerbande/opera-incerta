/**
 * The single versioned bridge exposed to the sandboxed renderer.
 * SPEC.md §5.3.
 *
 * Only channels declared in the contract may appear here, and the renderer
 * receives functions rather than the IPC object itself, so it cannot reach a
 * channel this file does not name.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_GLOBAL, CHANNELS } from '@opera-incerta/desktop-contract';

const bridge = {
  contractVersion: () => ipcRenderer.invoke(CHANNELS.contractVersion),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  reopenProject: () => ipcRenderer.invoke(CHANNELS.reopenProject),
  closeProject: () => ipcRenderer.invoke(CHANNELS.closeProject),
  readSheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.readSheet, request),
  writeSheet: (request: unknown) => ipcRenderer.invoke(CHANNELS.writeSheet, request),
} as const;

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
