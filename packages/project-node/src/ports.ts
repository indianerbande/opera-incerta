/**
 * Project and library adapter ports. SPEC.md §5.2, §6, §7.
 *
 * This package owns every filesystem access; the portable core owns the rules
 * and the record types. The ports are declared separately from their
 * implementation so that consumers can be tested against a double
 * (CONVENTIONS.md C-A3, C-A16).
 */
import type { PageCategory, ProjectRecord, StructureRecord } from '@opera-incerta/core';

/** The hidden directory that marks a directory as a Opera Incerta project. */
export const PROJECT_DIRECTORY = '.opera-incerta';

/** Files inside {@link PROJECT_DIRECTORY}. SPEC.md §7.1. */
export const PROJECT_FILES = {
  project: 'project.json',
  categories: 'categories.json',
  structure: 'structure.json',
} as const;

/** Sheets are plain Markdown files. SPEC.md §6.1. */
export const SHEET_EXTENSION = '.md';

/** What inspecting a chosen directory found. SPEC.md §8.6. */
export type FolderInspection =
  | { readonly kind: 'valid-project' }
  | { readonly kind: 'no-project' }
  | { readonly kind: 'single-subproject'; readonly relativePath: string }
  | { readonly kind: 'multiple-subprojects'; readonly relativePaths: readonly string[] };

/**
 * The port the desktop application implements over the real filesystem.
 * Keeping it an interface allows tests to run against an in-memory double and
 * keeps the boundary replaceable (CONVENTIONS.md C-A3).
 */
export interface ProjectFilesystem {
  inspectFolder(absolutePath: string): Promise<FolderInspection>;
  readProject(absolutePath: string): Promise<ProjectRecord>;
  createProject(absolutePath: string, displayName: string): Promise<ProjectRecord>;
  readCategories(projectPath: string): Promise<readonly PageCategory[]>;
  writeCategories(projectPath: string, categories: readonly PageCategory[]): Promise<void>;
  readStructure(projectPath: string): Promise<StructureRecord>;
  writeStructure(projectPath: string, structure: StructureRecord): Promise<void>;
  readSheet(absolutePath: string): Promise<string>;
  writeSheet(absolutePath: string, text: string): Promise<void>;
  listDirectory(absolutePath: string): Promise<readonly string[]>;
}

/**
 * Watches a project for external changes. A change notification is never
 * evidence of a change on its own: the consumer compares actual content
 * against its loaded baseline (SPEC.md §10.6, CONVENTIONS.md C-F2).
 */
export interface LibraryWatcher {
  watchDirectory(absolutePath: string, onChange: () => void): Disposable;
  watchFile(absolutePath: string, onChange: () => void): Disposable;
}

/** Minimal disposal handle, so the port does not depend on a framework type. */
export interface Disposable {
  dispose(): void;
}
