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
  /** The recently edited sheets of SPEC.md §9.4. */
  recent: 'recent.json',
} as const;

/**
 * Directories inside {@link PROJECT_DIRECTORY}.
 *
 * `styles` holds the author's own export stylesheets (SPEC.md §15.2): a set
 * made for this book belongs to the book, and travels with it.
 */
export const PROJECT_DIRECTORIES = {
  styles: 'styles',
} as const;

/** Sheets are plain Markdown files. SPEC.md §6.1. */
export const SHEET_EXTENSION = '.md';

/** What inspecting a chosen directory found. SPEC.md §8.6. */
export type FolderInspection =
  | { readonly kind: 'valid-project' }
  | { readonly kind: 'no-project' }
  | { readonly kind: 'single-subproject'; readonly relativePath: string }
  | { readonly kind: 'multiple-subprojects'; readonly relativePaths: readonly string[] };

/** One entry of a directory, with what kind of thing it is. */
export interface DirectoryEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory' | 'other';
}

/**
 * The port through which every filesystem access of the application goes.
 *
 * Two implementations: the Node one over the real disk, and an in-memory one
 * for tests that want a tree without a temporary directory. One contract
 * suite runs against both (`test/filesystem-contract.test.ts`), which is what
 * keeps the port honest — an operation the session needs that the port does
 * not offer is how the session came to import `node:fs` past it.
 */
export interface ProjectFilesystem {
  inspectFolder(absolutePath: string): Promise<FolderInspection>;
  readProject(absolutePath: string): Promise<ProjectRecord>;
  createProject(absolutePath: string, displayName: string): Promise<ProjectRecord>;
  readCategories(projectPath: string): Promise<readonly PageCategory[]>;
  writeCategories(projectPath: string, categories: readonly PageCategory[]): Promise<void>;
  readStructure(projectPath: string): Promise<StructureRecord>;
  writeStructure(projectPath: string, structure: StructureRecord): Promise<void>;
  /**
   * The recently edited sheets, as project-relative paths (SPEC.md §9.4).
   *
   * A convenience and never a source of truth: an unreadable or conflicted
   * file reads as an empty list rather than failing the project.
   */
  readRecentSheets(projectPath: string): Promise<readonly string[]>;
  writeRecentSheets(projectPath: string, paths: readonly string[]): Promise<void>;
  /**
   * The author's own export stylesheets, by name, sorted (SPEC.md §15.2).
   *
   * A project with no such directory has none — that is the ordinary case,
   * not a failure — and a file the naming rule cannot read is left out rather
   * than offered.
   */
  listStylesheets(projectPath: string): Promise<readonly string[]>;
  /** The CSS of one, or null when the project does not have it. */
  readStylesheet(projectPath: string, name: string): Promise<string | null>;
  /** Writes one, creating the directory. Overwrites deliberately. */
  writeStylesheet(projectPath: string, name: string, css: string): Promise<void>;
  readSheet(absolutePath: string): Promise<string>;
  writeSheet(absolutePath: string, text: string): Promise<void>;
  /** Entry names, sorted. Hidden entries included. Nothing for a missing directory. */
  listDirectory(absolutePath: string): Promise<readonly string[]>;
  /** Entries with their kind, sorted by name, so a caller never has to probe. */
  listEntries(absolutePath: string): Promise<readonly DirectoryEntry[]>;
  isDirectory(absolutePath: string): Promise<boolean>;
  /** Creates a directory and every missing parent. */
  createDirectory(absolutePath: string): Promise<void>;
  /** Moves a file or a directory, subtree and all. */
  moveEntry(fromAbsolutePath: string, toAbsolutePath: string): Promise<void>;
}

/**
 * Watches a project for external changes. A change notification is never
 * evidence of a change on its own: the consumer compares actual content
 * against its loaded baseline (SPEC.md §10.6, CONVENTIONS.md C-F2).
 */
export interface LibraryWatcher {
  /**
   * Reports changes under a directory. `recursive` is what source control
   * needs for the repository root (§12); the selected group needs only its own
   * level.
   */
  watchDirectory(
    absolutePath: string,
    onChange: () => void,
    options?: WatchDirectoryOptions,
  ): Disposable;

  /**
   * Reports changes to one file. Implemented over its directory, because a
   * watch on a file does not survive the file being replaced by a rename —
   * which is how this application saves (§10.6).
   */
  watchFile(absolutePath: string, onChange: () => void): Disposable;
}

export interface WatchDirectoryOptions {
  readonly recursive?: boolean;
}

/** Minimal disposal handle, so the port does not depend on a framework type. */
export interface Disposable {
  dispose(): void;
}
