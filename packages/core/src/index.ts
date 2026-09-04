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

export {
  FRONT_MATTER_MAX_LINES,
  frontMatterHeight,
  ownedFrontMatterLines,
} from './front-matter-view.js';

export type {
  EditorAdapter,
  EditorChangeListener,
  EditorDocument,
  HeadingMarkerActivation,
  HeadingMarkerListener,
} from './editor-adapter.js';
export { applyDotCommand, dotCommandAt } from './dot-command.js';
export type { DotCommand } from './dot-command.js';

export { delimiterRanges, inlineSpans } from './inline.js';
export type { InlineKind, InlineSpan } from './inline.js';

export { displayModel, headingPrefixRange, visibleLineStart } from './display-model.js';

export {
  ancestorPaths,
  withShownSheet,
  findGroup,
  findSheet,
  groupsOf,
  sheetsInGroup,
  sheetsOf,
  subgroupsOf,
  walkLibrary,
} from './library.js';
export type { GroupEntry, LibraryEntry, PreviewLine, SheetEntry, ShownSheet } from './library.js';
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
  reorderChild,
  withChildOrder,
  withoutChild,
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
export { LAYOUT_PREFERENCE_KEYS, SETTINGS, SETTINGS_CATEGORIES, settingsOf } from './settings.js';
export {
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_TYPOGRAPHY,
  DEFAULT_EDITOR_WORD_WRAP,
  EDITOR_FONT_FAMILIES,
  EDITOR_FONT_SIZE_BOUNDS,
  EDITOR_FONT_STACKS,
  HEADING_SCALE,
  clampEditorFontSize,
  headingFontSize,
  isEditorFontFamily,
} from './editor-typography.js';
export type { EditorFontFamily, EditorTypography } from './editor-typography.js';
export type {
  BooleanPreferenceKey,
  DensitySetting,
  FontFamilySetting,
  LanguageSetting,
  NumberSetting,
  Setting,
  SettingScope,
  SettingsCategory,
  SettingsCategoryId,
  SwitchSetting,
} from './settings.js';

export { ExclusiveTask, RefreshCoordinator, WATCH_DEBOUNCE_MS } from './refresh.js';
export type { ExclusiveOutcome } from './refresh.js';

export { diffLineKind, readDiff } from './diff.js';
export type { DiffLine, DiffLineKind } from './diff.js';

export { MAX_PROSE_EDITS, diffProse, tokenizeProse } from './prose-diff.js';

export {
  countConflicts,
  hasConflictMarkers,
  parseConflicts,
  resolveConflicts,
} from './conflict.js';
export type {
  ConflictChoice,
  ConflictPart,
  ConflictRegion,
  SettledText,
} from './conflict.js';
export type { ProseSegment, ProseSegmentKind } from './prose-diff.js';

export {
  canCommit,
  isConflicted,
  isFullyStaged,
  isSafeRemoteUrl,
  isValidBranchName,
  parseGitStatus,
  parseTrackingHeader,
  selectAllState,
  touchesWorkingTree,
  withIgnoredPath,
} from './git-status.js';
export type {
  GitFileGroup,
  GitFileStatus,
  GitBranch,
  GitIdentity,
  GitRemote,
  GitTracking,
  SelectAllState,
} from './git-status.js';

export {
  SLUG_MAX_LENGTH,
  SHEET_SLUG_FALLBACK,
  slugify,
  withCollisionSuffix,
  arrivalName,
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
  InterfaceLanguage,
  WorkbenchPreferences,
} from './preferences.js';

export {
  COLUMN_BOUNDS,
  COLUMN_IDEAL_WIDTH,
  clampColumnWidth,
} from './layout.js';
export type { ColumnBounds } from './layout.js';

export {
  MAX_CATEGORIES,
  categoryTextColor,
  findCategory,
  parseHexColor,
  readCategories,
  relativeLuminance,
  textColorFor,
} from './category.js';
export type { BadgeTextColor, PageCategory, RgbColor } from './category.js';

export { CodedError } from './coded-error.js';
export { classifyGitFailure } from './git-failure.js';
export type { GitFailureCode } from './git-failure.js';
