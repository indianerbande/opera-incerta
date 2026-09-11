/**
 * The registry of export formats. SPEC.md §15.1, §15.2.
 *
 * One list with a declared interface, which is what "modules register in one
 * registry" means while there is one module. It is deliberately not a plugin
 * loader: nothing here is built for formats that do not exist yet, and the
 * shape is small enough that DOCX and EPUB will fit it or change it honestly.
 *
 * What a format declares is only what it can know about itself: an id to ask
 * for and the extension its files carry. **What it is called is not here** —
 * the interface has two languages (§14.2), and a portable module that held
 * catalogue keys would know about a surface it can never see.
 */

export type ExportFormatId = 'markdown' | 'pdf';

export interface ExportFormat {
  readonly id: ExportFormatId;
  /** Without the dot, as `path.extname` does not write it either. */
  readonly extension: string;
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { id: 'markdown', extension: 'md' },
  { id: 'pdf', extension: 'pdf' },
];

export function isExportFormatId(value: unknown): value is ExportFormatId {
  return EXPORT_FORMATS.some((format) => format.id === value);
}

export function exportFormat(id: ExportFormatId): ExportFormat {
  const found = EXPORT_FORMATS.find((format) => format.id === id);
  if (found === undefined) {
    throw new Error(`no export format ${id}`);
  }
  return found;
}
