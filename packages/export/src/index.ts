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

export { DEFAULT_STYLESHEET } from './stylesheet.js';

export { EXPORT_FORMATS, exportFormat, isExportFormatId } from './formats.js';
export type { ExportFormat, ExportFormatId } from './formats.js';
