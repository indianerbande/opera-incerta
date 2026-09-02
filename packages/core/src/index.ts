export {
  FRONT_MATTER_NAMESPACE,
  parseSheet,
  serializeSheet,
} from './front-matter.js';
export type {
  LineEnding,
  ParsedSheet,
  Sheet,
  SheetDiagnostic,
  SheetDiagnosticCode,
  SheetMetadata,
} from './front-matter.js';

export type {
  EditorAdapter,
  EditorChangeListener,
  EditorDocument,
  HeadingMarkerActivation,
  HeadingMarkerListener,
} from './editor-adapter.js';
export { runEditorAdapterContract } from './editor-adapter-contract.js';
export type { ContractCase } from './editor-adapter-contract.js';

export { applyDotCommand, dotCommandAt } from './dot-command.js';
export type { DotCommand } from './dot-command.js';

export { delimiterRanges, inlineSpans } from './inline.js';
export type { InlineKind, InlineSpan } from './inline.js';

export { displayModel, headingPrefixRange, visibleLineStart } from './display-model.js';

export {
  ancestorPaths,
  findGroup,
  findSheet,
  groupsOf,
  sheetsInGroup,
  sheetsOf,
  subgroupsOf,
  walkLibrary,
} from './library.js';
export type { GroupEntry, LibraryEntry, PreviewLine, SheetEntry } from './library.js';
export type { DisplayModel, HeadingSpan, HiddenRange } from './display-model.js';

export {
  markdownToDisplay,
  displayToMarkdown,
  withHeadingLevel,
  outlineOf,
  visibleOutline,
} from './heading.js';
export type { DisplayLine, HeadingLevel, OutlineEntry } from './heading.js';

export { READING_WORDS_PER_MINUTE, textStatistics } from './statistics.js';
export type { TextStatistics } from './statistics.js';

export {
  compareNames,
  groupDisplayName,
  moveChild,
  readStructureRecord,
  resolveChildOrder,
  withChildOrder,
  withDisplayName,
} from './structure.js';
export type { ProjectRecord, StructureEntry, StructureRecord } from './structure.js';

export {
  RECENT_PROJECTS_LIMIT,
  readRecentProjects,
  withRecentProject,
  withoutRecentProject,
} from './recent-projects.js';
export type { RecentProject } from './recent-projects.js';

export {
  DEFAULT_PREVIEW_DENSITY,
  PREVIEW_BASE_FONT_SIZE,
  PREVIEW_DENSITIES,
  PREVIEW_STEP_RATIO,
  previewFontSize,
  previewLineCount,
  previewLines,
} from './preview.js';
export type { PreviewDensity, PreviewDensitySpec } from './preview.js';

export {
  FRONT_MATTER_MAX_VISIBLE_LINES,
  cappedBlockHeight,
  effectiveBlockHeight,
} from './block-height.js';

export { ExclusiveTask, RefreshCoordinator } from './refresh.js';

export {
  canCommit,
  isFullyStaged,
  parseGitStatus,
  selectAllState,
  touchesWorkingTree,
} from './git-status.js';
export type { GitFileGroup, GitFileStatus, SelectAllState } from './git-status.js';

export {
  SLUG_MAX_LENGTH,
  SHEET_SLUG_FALLBACK,
  slugify,
  withCollisionSuffix,
  sheetFileName,
  projectDirectoryName,
} from './slug.js';

export {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  PREFERENCES_VERSION,
  readPreferences,
} from './preferences.js';
export type {
  ColumnWidths,
  NavigatorView,
  SecondarySidebarView,
  WorkbenchPreferences,
} from './preferences.js';

export {
  COLUMN_BOUNDS,
  COLUMN_IDEAL_WIDTH,
  clampColumnWidth,
} from './layout.js';
export type { ColumnBounds } from './layout.js';

export {
  parseHexColor,
  relativeLuminance,
  textColorFor,
  categoryTextColor,
} from './category.js';
export type { RgbColor, BadgeTextColor } from './category.js';
