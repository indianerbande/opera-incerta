/**
 * The settings registry. SPEC.md §13.
 *
 * Every setting has a stable identifier, one owner, a bounded value type, a
 * default, and an explicit scope. This file is the registry: a category list
 * and, for each installation-local preference the dialog exposes, one entry
 * naming the key of the preference record it reads and writes. The dialog
 * renders the registry; it holds no list of its own, so a preference cannot
 * be added to the record without a decision about where it is shown — the
 * test beside this file enforces that.
 *
 * Two categories carry no preference: page categories are project data
 * (§6.6) and the commit identity is repository data (§12). They are listed
 * here because the dialog is where an author looks for them, and marked by
 * scope so nobody takes them for preferences.
 */
import { DEFAULT_PREFERENCES, type WorkbenchPreferences } from './preferences.js';
import type { PreviewDensity } from './preview.js';

export type SettingsCategoryId =
  | 'sheetList'
  | 'outline'
  | 'frontMatter'
  | 'pageCategories'
  | 'sourceControl';

export type SettingScope = 'installation' | 'project' | 'repository';

export interface SettingsCategory {
  readonly id: SettingsCategoryId;
  readonly label: string;
  /** One sentence under the heading, saying what the category is about. */
  readonly description: string;
  readonly scope: SettingScope;
}

/**
 * In the order the dialog lists them. The categories of the specification's
 * table that have no setting yet — appearance, editor, markup, privacy —
 * arrive with the features that give them one (§13, §14, §15).
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'sheetList',
    label: 'Sheet list',
    description: 'How the sheets of a group are previewed.',
    scope: 'installation',
  },
  {
    id: 'outline',
    label: 'Outline',
    description: 'Which headings the outline pane lists.',
    scope: 'installation',
  },
  {
    id: 'frontMatter',
    label: 'Front matter',
    description: 'The area above the text that shows a sheet’s metadata as written.',
    scope: 'installation',
  },
  {
    id: 'pageCategories',
    label: 'Page categories',
    description: 'The categories of this project. They live with the project, not with this installation.',
    scope: 'project',
  },
  {
    id: 'sourceControl',
    label: 'Source control',
    description: 'The name and e-mail address commits are by, recorded in this project’s repository.',
    scope: 'repository',
  },
];

/** The keys of the record that hold a switch. */
export type BooleanPreferenceKey = {
  [K in keyof WorkbenchPreferences]: WorkbenchPreferences[K] extends boolean ? K : never;
}[keyof WorkbenchPreferences];

interface SettingBase {
  /** Stable; a renamed label keeps its id (`CONVENTIONS.md` C-N3). */
  readonly id: string;
  readonly category: SettingsCategoryId;
  readonly label: string;
  readonly hint: string | null;
}

export interface SwitchSetting extends SettingBase {
  readonly kind: 'switch';
  readonly key: BooleanPreferenceKey;
  readonly defaultValue: boolean;
}

export interface DensitySetting extends SettingBase {
  readonly kind: 'density';
  readonly key: 'sheetListDensity';
  readonly options: readonly { readonly value: PreviewDensity; readonly label: string }[];
  readonly defaultValue: PreviewDensity;
}

export type Setting = SwitchSetting | DensitySetting;

export const SETTINGS: readonly Setting[] = [
  {
    kind: 'density',
    id: 'sheetList.density',
    category: 'sheetList',
    label: 'Preview size',
    hint: 'The compact step shows every sheet at the same height.',
    key: 'sheetListDensity',
    options: [
      { value: 'compact', label: 'Compact' },
      { value: 'standard', label: 'Standard' },
      { value: 'large', label: 'Large' },
    ],
    defaultValue: DEFAULT_PREFERENCES.sheetListDensity,
  },
  {
    kind: 'switch',
    id: 'sheetList.showBlankLines',
    category: 'sheetList',
    label: 'Show blank lines in previews',
    hint: 'Off, a preview skips empty lines so more of the text fits.',
    key: 'showBlankLines',
    defaultValue: DEFAULT_PREFERENCES.showBlankLines,
  },
  {
    kind: 'switch',
    id: 'outline.showDeeperLevels',
    category: 'outline',
    label: 'List headings below the second level',
    hint: null,
    key: 'showDeeperOutline',
    defaultValue: DEFAULT_PREFERENCES.showDeeperOutline,
  },
  {
    kind: 'switch',
    id: 'frontMatter.show',
    category: 'frontMatter',
    label: 'Show the front matter area',
    hint: null,
    key: 'showFrontMatter',
    defaultValue: DEFAULT_PREFERENCES.showFrontMatter,
  },
  {
    kind: 'switch',
    id: 'frontMatter.writable',
    category: 'frontMatter',
    label: 'Allow editing the foreign lines',
    hint: 'The lines this application owns are never editable there.',
    key: 'frontMatterWritable',
    defaultValue: DEFAULT_PREFERENCES.frontMatterWritable,
  },
  {
    kind: 'switch',
    id: 'frontMatter.showOwned',
    category: 'frontMatter',
    label: 'Show the lines this application owns',
    hint: null,
    key: 'showOwnedFrontMatter',
    defaultValue: DEFAULT_PREFERENCES.showOwnedFrontMatter,
  },
];

/** The settings of one category, in registry order. */
export function settingsOf(category: SettingsCategoryId): readonly Setting[] {
  return SETTINGS.filter((setting) => setting.category === category);
}

/**
 * The keys of the preference record that are layout, not settings: the
 * workbench remembers them as the author arranges it, and the dialog does
 * not list them. Everything else in the record MUST be registered above.
 */
export const LAYOUT_PREFERENCE_KEYS: readonly (keyof WorkbenchPreferences)[] = [
  'version',
  'columnWidths',
  'navigatorView',
  'secondaryView',
  'secondaryVisible',
];
