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
  contractVersion: (): Promise<number> => ipcRenderer.invoke(CHANNELS.contractVersion),
} as const;

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
