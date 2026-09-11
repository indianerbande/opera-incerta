/**
 * Writing the manuscript out. SPEC.md §15.2.
 *
 * The assembly and both renderings are pure and live in
 * `@opera-incerta/export`. What is here is the part that cannot be: choosing
 * a file, writing bytes, and asking Chromium to set a page.
 *
 * **The PDF is set by the application itself**, out of the same HTML the
 * module produced. That is the decision of 2026-09-11, which replaced LaTeX:
 * the appearance is to be governed by a stylesheet later, and this export is
 * not a print file. It costs no external dependency at all.
 */
import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog, type BaseWindow } from 'electron';
import {
  assembleMarkdown,
  documentHtml,
  exportFormat,
  type ExportFormatId,
} from '@opera-incerta/export';
import type { ExportOutcome } from '@opera-incerta/desktop-contract';
import type { AssembledDocument } from './project-session.js';

/**
 * How long the setting window is given before it is abandoned.
 *
 * A page with no script and no network cannot wait on anything, so this is
 * not a timeout in the ordinary sense — it is the guarantee that a hidden
 * window is never left behind, whatever goes wrong inside Chromium.
 */
const SET_TIMEOUT_MS = 30_000;

/**
 * A file name that no filesystem will object to, from the project's name.
 *
 * A display name is free text and may hold anything; this is where it becomes
 * a file name. What goes is the set Windows refuses plus the control
 * characters, and a name left with nothing falls back rather than being
 * offered as a bare extension.
 *
 * The `-` stands **last** on purpose: anywhere else in a character class it
 * would be a range instead of a character.
 */
export function exportFileName(title: string, extension: string): string {
  const base = title
    .replace(/[\u0000-\u001f<>:"/\\|?*-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return `${base === '' ? 'manuscript' : base}.${extension}`;
}

/**
 * Sets the document as a PDF, in a window nobody sees.
 *
 * The window is deliberately bare: no preload, sandboxed, no Node, no web
 * security relaxations. It loads a `data:` URL because the document is
 * self-contained — nothing is fetched, so nothing needs a protocol or an
 * origin — and because handing it to the renderer's own scheme would mean
 * serving author text from the application's origin (SPEC.md §5.3).
 *
 * Page numbers come from the printer's footer rather than from the
 * stylesheet: Chromium sets `@page` margins but not the margin boxes that
 * would hold a counter.
 */
export async function setPdf(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  try {
    const url = `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
    await withTimeout(window.webContents.loadURL(url), 'export/set-failed');
    return await withTimeout(
      window.webContents.printToPDF({
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font-size:8pt;color:#666;text-align:center;">' +
          '<span class="pageNumber"></span></div>',
        // In inches. The page margins come from here rather than from the
        // stylesheet's `@page`, because `printToPDF`'s own option wins over
        // it — and the bottom one leaves room for the footer above.
        margins: { top: 0.7, bottom: 0.8, left: 0.8, right: 0.8 },
      }),
      'export/set-failed',
    );
  } finally {
    // Whatever happened, no hidden window survives this call.
    window.destroy();
  }
}

async function withTimeout<T>(work: Promise<T>, code: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(code)), SET_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export interface ExportDependencies {
  /** Asks the author where the file goes. Replaced in the smoke. */
  readonly chooseDestination: (
    parent: BaseWindow | null,
    defaultName: string,
    extension: string,
    filterName: string,
  ) => Promise<string | null>;
  readonly setPdf: (html: string) => Promise<Buffer>;
  readonly shortPathOf: (path: string) => string;
}

/**
 * One export, from the assembled document to a file on disk.
 *
 * Nothing is written before the author has named a destination, and an
 * assembly with no text in it reports `empty` rather than writing a file that
 * says nothing (SPEC.md §15.2).
 */
export async function runExport(
  document: AssembledDocument,
  format: ExportFormatId,
  parent: BaseWindow | null,
  filterName: string,
  dependencies: ExportDependencies,
): Promise<ExportOutcome> {
  if (document.parts.length === 0) {
    return { kind: 'empty' };
  }

  const { extension } = exportFormat(format);
  const chosen = await dependencies.chooseDestination(
    parent,
    exportFileName(document.title, extension),
    extension,
    filterName,
  );
  if (chosen === null) {
    return { kind: 'cancelled' };
  }

  if (format === 'markdown') {
    await writeFile(chosen, assembleMarkdown(document.parts), 'utf8');
  } else {
    const pdf = await dependencies.setPdf(
      documentHtml({ title: document.title, parts: document.parts }),
    );
    await writeFile(chosen, pdf);
  }

  return { kind: 'written', shortPath: dependencies.shortPathOf(chosen) };
}

/** The system's own save dialog, which is where a destination comes from. */
export async function chooseDestination(
  parent: BaseWindow | null,
  defaultName: string,
  extension: string,
  filterName: string,
): Promise<string | null> {
  const options = {
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions: [extension] }],
  };
  const result =
    parent === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(parent, options);
  return result.canceled || result.filePath === '' ? null : result.filePath;
}
