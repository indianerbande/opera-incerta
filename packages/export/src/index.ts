/**
 * Export as a module. SPEC.md §15.1, §15.2.
 *
 * Portable: the assembly and both renderings are pure functions. Writing the
 * file and setting the PDF belong to the main process, which is the only side
 * that may touch a disk or a printer.
 */
export {
  assembleMarkdown,
  documentParts,
  documentPieces,
  shiftHeadings,
} from './document.js';
export type { DocumentPart, DocumentPiece } from './document.js';

export { documentHtml, escapeHtml } from './html.js';
export type { DocumentHtmlOptions } from './html.js';

export {
  BUILT_IN_STYLESHEETS,
  DEFAULT_STYLESHEET,
  DEFAULT_STYLESHEET_ID,
  builtInStylesheet,
  isBuiltInStylesheetId,
} from './stylesheet.js';
export type { BuiltInStylesheetId } from './stylesheet.js';

// The naming rules live in the core, because the file store needs them too
// (SPEC.md §15.2); they are re-exported so this module's surface is whole.
export {
  STYLESHEET_NAME_LIMIT,
  isUsableStylesheetName,
  stylesheetFileName,
  stylesheetNameOf,
} from '@opera-incerta/core';

export { EXPORT_FORMATS, exportFormat, isExportFormatId } from './formats.js';
export type { ExportFormat, ExportFormatId } from './formats.js';
