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

export type { EditorAdapter, EditorChangeListener, EditorDocument } from './editor-adapter.js';
export { runEditorAdapterContract } from './editor-adapter-contract.js';
export type { ContractCase } from './editor-adapter-contract.js';

export { delimiterRanges, inlineSpans } from './inline.js';
export type { InlineKind, InlineSpan } from './inline.js';

export { displayModel } from './display-model.js';
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
