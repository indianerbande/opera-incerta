/**
 * Electron main process. SPEC.md §5.3, §8.5.
 *
 * This process owns every privileged capability: filesystem, watching, Git,
 * native dialogs, and menus. It never owns document semantics — those live in
 * the portable core.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, ipcMain, net, protocol } from 'electron';
import { BRIDGE_GLOBAL, CHANNELS, CONTRACT_VERSION } from '@opera-incerta/desktop-contract';
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

/** Project window geometry. SPEC.md §8.2. */
const WINDOW = {
  width: 1600,
  height: 1000,
  minWidth: 1400,
  minHeight: 820,
} as const;

function createProjectWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    minWidth: WINDOW.minWidth,
    minHeight: WINDOW.minHeight,
    show: false,
    webPreferences: {
      preload: join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  void window.loadURL(RENDERER_ENTRY_URL);
  window.once('ready-to-show', () => {
    window.show();
    if (SMOKE_RUN) {
      void runSmokeCheck(window);
    }
  });

  // Deny external navigation, new windows, permissions, and webviews.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });

  return window;
}

ipcMain.handle(CHANNELS.contractVersion, () => CONTRACT_VERSION);

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

void app.whenReady().then(() => {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const asset = resolveRendererAsset(RENDERER_ROOT, request.url);
    if (asset === null) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(asset).toString());
  });

  createProjectWindow();

  // macOS keeps the application active without windows and recreates one on
  // activation; Windows and Linux quit. SPEC.md §8.5, CONVENTIONS.md C-P4.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createProjectWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Verifies the two things a shell smoke test can prove without a user: the
 * renderer rendered, and the versioned bridge answers through IPC.
 */
async function runSmokeCheck(window: BrowserWindow): Promise<void> {
  try {
    const heading: unknown = await window.webContents.executeJavaScript(
      "document.querySelector('wi-root h1')?.textContent ?? null",
    );
    const bridgeVersion: unknown = await window.webContents.executeJavaScript(
      `typeof window.${BRIDGE_GLOBAL} === 'object'` +
        ` ? window.${BRIDGE_GLOBAL}.contractVersion()` +
        ' : null',
    );

    if (heading !== 'Opera Incerta') {
      throw new Error(`renderer did not render; heading was ${JSON.stringify(heading)}`);
    }
    if (bridgeVersion !== CONTRACT_VERSION) {
      throw new Error(`bridge answered ${JSON.stringify(bridgeVersion)}`);
    }

    const image = await window.webContents.capturePage();
    const evidenceDirectory = join(currentDirectory, '..', '..', '..', 'build', 'desktop');
    mkdirSync(evidenceDirectory, { recursive: true });
    const evidencePath = join(evidenceDirectory, 'smoke.png');
    writeFileSync(evidencePath, image.toPNG());

    console.log(`smoke ok: renderer rendered, bridge contract v${CONTRACT_VERSION}`);
    console.log(`smoke evidence: ${evidencePath}`);
    app.exit(0);
  } catch (error: unknown) {
    console.error('smoke failed:', error);
    app.exit(1);
  }
}
