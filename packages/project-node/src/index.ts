export {
  PROJECT_DIRECTORY,
  PROJECT_FILES,
  SHEET_EXTENSION,
} from './ports.js';
export type {
  Disposable,
  FolderInspection,
  LibraryWatcher,
  ProjectFilesystem,
  WatchDirectoryOptions,
} from './ports.js';

export { createLibraryWatcher } from './node-watcher.js';

export {
  ProjectError,
  canonicalPath,
  categoriesFilePath,
  createProjectFilesystem,
  isGroupDirectory,
  isInside,
  isProjectDirectory,
  isSheetFile,
  projectFilePath,
  structureFilePath,
} from './node-filesystem.js';
export type { ProjectEnvironment } from './node-filesystem.js';

export { absolutePathOf, scanLibrary } from './library.js';
export type { Library, ScanOptions } from './library.js';
