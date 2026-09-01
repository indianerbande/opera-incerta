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

    // The editor is the part most likely to render as an empty box, so the
    // smoke asks for evidence that it laid out: a heading line taller than
    // body text, a gutter marker beside it, and no visible `#` prefix.
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
    app.exit(0);
  } catch (error: unknown) {
    console.error('smoke failed:', error);
    app.exit(1);
  }
}
