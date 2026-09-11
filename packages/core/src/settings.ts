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
import { ACCENT_PALETTES, type AccentPalette, type ColorScheme } from './appearance.js';
import {
  EDITOR_FONT_SIZE_BOUNDS,
  type EditorFontFamily,
} from './editor-typography.js';
import {
  DEFAULT_PREFERENCES,
  type InterfaceLanguage,
  type WorkbenchPreferences,
} from './preferences.js';
import type { PreviewDensity } from './preview.js';

export type SettingsCategoryId =
  | 'appearance'
  | 'editor'
  | 'sheetList'
  | 'outline'
  | 'frontMatter'
  | 'pageCategories'
  | 'sourceControl';

export type SettingScope = 'installation' | 'project' | 'repository';

/**
 * A category names the keys of its words, never the words: the core is
 * text-free (SPEC.md §14.3), and the dialog translates.
 */
export interface SettingsCategory {
  readonly id: SettingsCategoryId;
  readonly labelKey: string;
  /** One sentence under the heading, saying what the category is about. */
  readonly descriptionKey: string;
  readonly scope: SettingScope;
}

/**
 * In the order the dialog lists them. The categories of the specification's
 * table that have no setting yet — appearance, editor, markup, privacy —
 * arrive with the features that give them one (§13, §14, §15).
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'appearance',
    labelKey: 'settings.category.appearance.label',
    descriptionKey: 'settings.category.appearance.description',
    scope: 'installation',
  },
  {
    id: 'editor',
    labelKey: 'settings.category.editor.label',
    descriptionKey: 'settings.category.editor.description',
    scope: 'installation',
  },
  {
    id: 'sheetList',
    labelKey: 'settings.category.sheetList.label',
    descriptionKey: 'settings.category.sheetList.description',
    scope: 'installation',
  },
  {
    id: 'outline',
    labelKey: 'settings.category.outline.label',
    descriptionKey: 'settings.category.outline.description',
    scope: 'installation',
  },
  {
    id: 'frontMatter',
    labelKey: 'settings.category.frontMatter.label',
    descriptionKey: 'settings.category.frontMatter.description',
    scope: 'installation',
  },
  {
    id: 'pageCategories',
    labelKey: 'settings.category.pageCategories.label',
    descriptionKey: 'settings.category.pageCategories.description',
    scope: 'project',
  },
  {
    id: 'sourceControl',
    labelKey: 'settings.category.sourceControl.label',
    descriptionKey: 'settings.category.sourceControl.description',
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
  readonly labelKey: string;
  readonly hintKey: string | null;
}

export interface SwitchSetting extends SettingBase {
  readonly kind: 'switch';
  readonly key: BooleanPreferenceKey;
  readonly defaultValue: boolean;
}

export interface DensitySetting extends SettingBase {
  readonly kind: 'density';
  readonly key: 'sheetListDensity';
  readonly options: readonly { readonly value: PreviewDensity; readonly labelKey: string }[];
  readonly defaultValue: PreviewDensity;
}

export interface LanguageSetting extends SettingBase {
  readonly kind: 'language';
  readonly key: 'interfaceLanguage';
  readonly options: readonly { readonly value: InterfaceLanguage; readonly labelKey: string }[];
  readonly defaultValue: InterfaceLanguage;
}

/** Light, dark, or what the system says. SPEC.md §8.8. */
export interface ColorSchemeSetting extends SettingBase {
  readonly kind: 'colorScheme';
  readonly key: 'colorScheme';
  readonly options: readonly { readonly value: ColorScheme; readonly labelKey: string }[];
  readonly defaultValue: ColorScheme;
}

/**
 * The accent palettes. Rendered as swatches rather than as a list of words:
 * the choice is the colour, and the name is what a screen reader says.
 */
export interface AccentPaletteSetting extends SettingBase {
  readonly kind: 'accentPalette';
  readonly key: 'accentPalette';
  readonly options: readonly { readonly value: AccentPalette; readonly labelKey: string }[];
  readonly defaultValue: AccentPalette;
}

export interface FontFamilySetting extends SettingBase {
  readonly kind: 'fontFamily';
  readonly key: 'editorFontFamily';
  readonly options: readonly { readonly value: EditorFontFamily; readonly labelKey: string }[];
  readonly defaultValue: EditorFontFamily;
}

export interface NumberSetting extends SettingBase {
  readonly kind: 'number';
  readonly key: 'editorFontSize';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export type Setting =
  | SwitchSetting
  | DensitySetting
  | LanguageSetting
  | ColorSchemeSetting
  | AccentPaletteSetting
  | FontFamilySetting
  | NumberSetting;

export const SETTINGS: readonly Setting[] = [
  {
    kind: 'language',
    id: 'appearance.language',
    category: 'appearance',
    labelKey: 'settings.appearance.language',
    hintKey: 'settings.appearance.languageHint',
    key: 'interfaceLanguage',
    options: [
      { value: 'system', labelKey: 'settings.language.system' },
      { value: 'en', labelKey: 'settings.language.en' },
      { value: 'de', labelKey: 'settings.language.de' },
    ],
    defaultValue: DEFAULT_PREFERENCES.interfaceLanguage,
  },
  {
    kind: 'colorScheme',
    id: 'appearance.colorScheme',
    category: 'appearance',
    labelKey: 'settings.appearance.colorScheme',
    hintKey: 'settings.appearance.colorSchemeHint',
    key: 'colorScheme',
    options: [
      { value: 'system', labelKey: 'settings.colorScheme.system' },
      { value: 'light', labelKey: 'settings.colorScheme.light' },
      { value: 'dark', labelKey: 'settings.colorScheme.dark' },
    ],
    defaultValue: DEFAULT_PREFERENCES.colorScheme,
  },
  {
    kind: 'accentPalette',
    id: 'appearance.accentPalette',
    category: 'appearance',
    labelKey: 'settings.appearance.accentPalette',
    hintKey: 'settings.appearance.accentPaletteHint',
    key: 'accentPalette',
    options: ACCENT_PALETTES.map((value) => ({
      value,
      labelKey: `settings.palette.${value}`,
    })),
    defaultValue: DEFAULT_PREFERENCES.accentPalette,
  },
  {
    kind: 'fontFamily',
    id: 'editor.fontFamily',
    category: 'editor',
    labelKey: 'settings.editor.fontFamily',
    hintKey: 'settings.editor.fontFamilyHint',
    key: 'editorFontFamily',
    options: [
      { value: 'serif', labelKey: 'settings.editor.font.serif' },
      { value: 'sans', labelKey: 'settings.editor.font.sans' },
      { value: 'mono', labelKey: 'settings.editor.font.mono' },
    ],
    defaultValue: DEFAULT_PREFERENCES.editorFontFamily,
  },
  {
    kind: 'number',
    id: 'editor.fontSize',
    category: 'editor',
    labelKey: 'settings.editor.fontSize',
    hintKey: 'settings.editor.fontSizeHint',
    key: 'editorFontSize',
    min: EDITOR_FONT_SIZE_BOUNDS.min,
    max: EDITOR_FONT_SIZE_BOUNDS.max,
    step: 1,
    defaultValue: DEFAULT_PREFERENCES.editorFontSize,
  },
  {
    kind: 'switch',
    id: 'editor.wordWrap',
    category: 'editor',
    labelKey: 'settings.editor.wordWrap',
    hintKey: 'settings.editor.wordWrapHint',
    key: 'editorWordWrap',
    defaultValue: DEFAULT_PREFERENCES.editorWordWrap,
  },
  {
    kind: 'switch',
    id: 'editor.lineNumbers',
    category: 'editor',
    labelKey: 'settings.editor.lineNumbers',
    hintKey: 'settings.editor.lineNumbersHint',
    key: 'editorLineNumbers',
    defaultValue: DEFAULT_PREFERENCES.editorLineNumbers,
  },
  {
    kind: 'density',
    id: 'sheetList.density',
    category: 'sheetList',
    labelKey: 'settings.sheetList.density',
    hintKey: 'settings.sheetList.densityHint',
    key: 'sheetListDensity',
    options: [
      { value: 'compact', labelKey: 'settings.sheetList.density.compact' },
      { value: 'standard', labelKey: 'settings.sheetList.density.standard' },
      { value: 'large', labelKey: 'settings.sheetList.density.large' },
    ],
    defaultValue: DEFAULT_PREFERENCES.sheetListDensity,
  },
  {
    kind: 'switch',
    id: 'sheetList.showBlankLines',
    category: 'sheetList',
    labelKey: 'settings.sheetList.blankLines',
    hintKey: 'settings.sheetList.blankLinesHint',
    key: 'showBlankLines',
    defaultValue: DEFAULT_PREFERENCES.showBlankLines,
  },
  {
    kind: 'switch',
    id: 'outline.showDeeperLevels',
    category: 'outline',
    labelKey: 'settings.outline.deeper',
    hintKey: null,
    key: 'showDeeperOutline',
    defaultValue: DEFAULT_PREFERENCES.showDeeperOutline,
  },
  {
    kind: 'switch',
    id: 'frontMatter.show',
    category: 'frontMatter',
    labelKey: 'settings.frontMatter.show',
    hintKey: null,
    key: 'showFrontMatter',
    defaultValue: DEFAULT_PREFERENCES.showFrontMatter,
  },
  {
    kind: 'switch',
    id: 'frontMatter.writable',
    category: 'frontMatter',
    labelKey: 'settings.frontMatter.writable',
    hintKey: 'settings.frontMatter.writableHint',
    key: 'frontMatterWritable',
    defaultValue: DEFAULT_PREFERENCES.frontMatterWritable,
  },
  {
    kind: 'switch',
    id: 'frontMatter.showOwned',
    category: 'frontMatter',
    labelKey: 'settings.frontMatter.showOwned',
    hintKey: null,
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
  // The zoom of SPEC.md §10.9 is set where it is used — a slider in the
  // status bar — and remembered like a width, not listed in the dialog.
  'editorZoom',
  // Likewise the export stylesheet of SPEC.md §15.2: it is chosen in the
  // export dialog, at the moment of use, and remembered afterwards. Listing
  // it in the settings would put the choice in two places, and the settings
  // copy could name a stylesheet the open project does not have.
  'exportStylesheet',
];
