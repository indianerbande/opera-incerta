import { computed, signal, type WritableSignal } from '@angular/core';
import {
  COLUMN_BOUNDS,
  COLUMN_IDEAL_WIDTH,
  DEFAULT_PREFERENCES,
  clampColumnWidth,
  readPreferences,
  type BooleanPreferenceKey,
  clampEditorFontSize,
  type ColumnWidths,
  type EditorFontFamily,
  type EditorTypography,
  type InterfaceLanguage,
  type NavigatorView,
  type PreviewDensity,
  type SecondarySidebarView,
  type WorkbenchPreferences,
} from '@opera-incerta/core';
import type { OperaIncertaBridge } from '@opera-incerta/desktop-contract';
import type { ActivityItem } from './activity-bar.component.js';

export type { NavigatorView, SecondarySidebarView };

/** The entries of the two bars, by the key of their name (SPEC.md §14). */
export const NAVIGATOR_ITEMS: readonly ActivityItem<NavigatorView>[] = [
  { id: 'explorer', icon: 'icon-explorer', labelKey: 'view.explorer' },
  { id: 'sourceControl', icon: 'icon-source-control', labelKey: 'view.sourceControl' },
];

export const SECONDARY_ITEMS: readonly ActivityItem<SecondarySidebarView>[] = [
  { id: 'inspector', icon: 'icon-inspector', labelKey: 'view.inspector' },
  { id: 'outline', icon: 'icon-outline', labelKey: 'view.outline' },
  { id: 'ai', icon: 'icon-ai', labelKey: 'view.ai' },
  { id: 'snapshots', icon: 'icon-snapshots', labelKey: 'view.snapshots' },
];

export type ResizableColumn = keyof ColumnWidths;

/**
 * What the workbench looks like: which view each region shows, whether the
 * sidebar is open, and how wide each column is. SPEC.md §8.1, §8.2, §8.4.
 *
 * Three properties the specification demands of a column width, and how each
 * is met here:
 *
 * - **Stable** — the width belongs to this state, never to a layout container,
 *   so switching the view inside a region cannot move it
 *   (`CONVENTIONS.md` C-U1).
 * - **Draggable** — a divider reports pixels, and the setter applies them.
 * - **Persisted** — the setter clamps and stores immediately, and a stored
 *   value is clamped again on read.
 */
export class LayoutState {
  readonly #bridge: OperaIncertaBridge | null;

  readonly #navigatorView = signal<NavigatorView>(DEFAULT_PREFERENCES.navigatorView);
  readonly #secondaryView = signal<SecondarySidebarView>(DEFAULT_PREFERENCES.secondaryView);
  readonly #secondaryVisible = signal(DEFAULT_PREFERENCES.secondaryVisible);
  readonly #columnWidths = signal<ColumnWidths>(DEFAULT_PREFERENCES.columnWidths);
  readonly #sheetListDensity = signal<PreviewDensity>(DEFAULT_PREFERENCES.sheetListDensity);
  readonly #showBlankLines = signal(DEFAULT_PREFERENCES.showBlankLines);
  readonly #showDeeperOutline = signal(DEFAULT_PREFERENCES.showDeeperOutline);
  readonly #showFrontMatter = signal(DEFAULT_PREFERENCES.showFrontMatter);
  readonly #frontMatterWritable = signal(DEFAULT_PREFERENCES.frontMatterWritable);
  readonly #showOwnedFrontMatter = signal(DEFAULT_PREFERENCES.showOwnedFrontMatter);
  readonly #interfaceLanguage = signal<InterfaceLanguage>(DEFAULT_PREFERENCES.interfaceLanguage);
  readonly #editorFontFamily = signal<EditorFontFamily>(DEFAULT_PREFERENCES.editorFontFamily);
  readonly #editorFontSize = signal(DEFAULT_PREFERENCES.editorFontSize);
  readonly #editorWordWrap = signal(DEFAULT_PREFERENCES.editorWordWrap);

  constructor(bridge: OperaIncertaBridge | null = null) {
    this.#bridge = bridge;
  }

  // Read-only outside, like the stores: every change goes through a method
  // that also stores it, so a preference cannot be changed without being kept.
  readonly navigatorView = this.#navigatorView.asReadonly();
  readonly secondaryView = this.#secondaryView.asReadonly();
  readonly secondaryVisible = this.#secondaryVisible.asReadonly();
  readonly columnWidths = this.#columnWidths.asReadonly();
  readonly sheetListDensity = this.#sheetListDensity.asReadonly();
  readonly showBlankLines = this.#showBlankLines.asReadonly();
  readonly showDeeperOutline = this.#showDeeperOutline.asReadonly();
  /** The three switches of the front matter area. SPEC.md §10.4. */
  readonly showFrontMatter = this.#showFrontMatter.asReadonly();
  readonly frontMatterWritable = this.#frontMatterWritable.asReadonly();
  readonly showOwnedFrontMatter = this.#showOwnedFrontMatter.asReadonly();
  /** The stored language choice; the localization service resolves it. SPEC.md §14. */
  readonly interfaceLanguage = this.#interfaceLanguage.asReadonly();
  readonly editorFontFamily = this.#editorFontFamily.asReadonly();
  readonly editorFontSize = this.#editorFontSize.asReadonly();
  readonly editorWordWrap = this.#editorWordWrap.asReadonly();
  /** The three editor settings as the editor takes them. SPEC.md §13. */
  readonly editorTypography = computed<EditorTypography>(() => ({
    fontFamily: this.#editorFontFamily(),
    fontSize: this.#editorFontSize(),
    wordWrap: this.#editorWordWrap(),
  }));

  /** The active entry of the trailing bar, or null while the sidebar is collapsed. */
  readonly activeSecondaryId = computed<SecondarySidebarView | null>(() =>
    this.#secondaryVisible() ? this.#secondaryView() : null,
  );

  /** The key of the secondary sidebar's title: the name of its active entry. */
  readonly secondaryTitleKey = computed(
    () => SECONDARY_ITEMS.find((item) => item.id === this.#secondaryView())?.labelKey ?? 'view.inspector',
  );

  /** Applies the stored record, or the defaults when there is none. */
  async load(): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      return;
    }
    try {
      const result = await bridge.readPreferences();
      this.apply(readPreferences(result.ok ? result.value : null));
    } catch {
      // A preference that cannot be read is a lost convenience, not a reason
      // to stop: the defaults are already in place.
    }
  }

  apply(preferences: WorkbenchPreferences): void {
    this.#navigatorView.set(preferences.navigatorView);
    this.#secondaryView.set(preferences.secondaryView);
    this.#secondaryVisible.set(preferences.secondaryVisible);
    this.#columnWidths.set(preferences.columnWidths);
    this.#sheetListDensity.set(preferences.sheetListDensity);
    this.#showBlankLines.set(preferences.showBlankLines);
    this.#showDeeperOutline.set(preferences.showDeeperOutline);
    this.#showFrontMatter.set(preferences.showFrontMatter);
    this.#frontMatterWritable.set(preferences.frontMatterWritable);
    this.#showOwnedFrontMatter.set(preferences.showOwnedFrontMatter);
    this.#interfaceLanguage.set(preferences.interfaceLanguage);
    this.#editorFontFamily.set(preferences.editorFontFamily);
    this.#editorFontSize.set(preferences.editorFontSize);
    this.#editorWordWrap.set(preferences.editorWordWrap);
  }

  /** The record as it currently stands. */
  snapshot(): WorkbenchPreferences {
    return {
      version: DEFAULT_PREFERENCES.version,
      interfaceLanguage: this.#interfaceLanguage(),
      editorFontFamily: this.#editorFontFamily(),
      editorFontSize: this.#editorFontSize(),
      editorWordWrap: this.#editorWordWrap(),
      columnWidths: this.#columnWidths(),
      navigatorView: this.#navigatorView(),
      secondaryView: this.#secondaryView(),
      secondaryVisible: this.#secondaryVisible(),
      sheetListDensity: this.#sheetListDensity(),
      showBlankLines: this.#showBlankLines(),
      showDeeperOutline: this.#showDeeperOutline(),
      showFrontMatter: this.#showFrontMatter(),
      frontMatterWritable: this.#frontMatterWritable(),
      showOwnedFrontMatter: this.#showOwnedFrontMatter(),
    };
  }

  showNavigator(view: NavigatorView): void {
    this.#navigatorView.set(view);
    this.#store();
  }

  /**
   * Activating the already visible view collapses the sidebar; anything else
   * opens it on that view.
   */
  showSecondary(view: SecondarySidebarView): void {
    if (this.#secondaryVisible() && this.#secondaryView() === view) {
      this.#secondaryVisible.set(false);
    } else {
      this.#secondaryView.set(view);
      this.#secondaryVisible.set(true);
    }
    this.#store();
  }

  /** Widens or narrows a column, clamped to its bounds. */
  resizeColumn(column: ResizableColumn, delta: number): void {
    const current = this.#columnWidths();
    const next = clampColumnWidth(current[column] + delta, COLUMN_BOUNDS[column]);
    if (next === current[column]) {
      return;
    }
    this.#columnWidths.set({ ...current, [column]: next });
    this.#store();
  }

  /** Double-clicking a divider restores that column's ideal width. */
  resetColumn(column: ResizableColumn): void {
    this.#columnWidths.set({ ...this.#columnWidths(), [column]: COLUMN_IDEAL_WIDTH[column] });
    this.#store();
  }

  setEditorFontFamily(family: EditorFontFamily): void {
    this.#editorFontFamily.set(family);
    this.#store();
  }

  /** Clamped, like a width: the field can say 3, the editor never shows it. */
  setEditorFontSize(size: number): void {
    this.#editorFontSize.set(clampEditorFontSize(size));
    this.#store();
  }

  setLanguage(language: InterfaceLanguage): void {
    this.#interfaceLanguage.set(language);
    this.#store();
  }

  setDensity(density: PreviewDensity): void {
    this.#sheetListDensity.set(density);
    this.#store();
  }

  toggleFrontMatter(): void {
    this.#showFrontMatter.set(!this.#showFrontMatter());
    this.#store();
  }

  toggleFrontMatterWritable(): void {
    this.#frontMatterWritable.set(!this.#frontMatterWritable());
    this.#store();
  }

  toggleOwnedFrontMatter(): void {
    this.#showOwnedFrontMatter.set(!this.#showOwnedFrontMatter());
    this.#store();
  }

  toggleBlankLines(): void {
    this.#showBlankLines.set(!this.#showBlankLines());
    this.#store();
  }

  toggleDeeperOutline(): void {
    this.#showDeeperOutline.set(!this.#showDeeperOutline());
    this.#store();
  }

  /** The current value of a switch, by the key the settings registry names. */
  switchValue(key: BooleanPreferenceKey): boolean {
    return this.#switches()[key]();
  }

  /** Sets a switch by key — the settings dialog's way in. SPEC.md §13. */
  setSwitch(key: BooleanPreferenceKey, value: boolean): void {
    this.#switches()[key].set(value);
    this.#store();
  }

  /** Reset restores the complete default record, layout included. SPEC.md §13. */
  resetPreferences(): void {
    this.apply(DEFAULT_PREFERENCES);
    this.#store();
  }

  #switches(): Record<BooleanPreferenceKey, WritableSignal<boolean>> {
    return {
      secondaryVisible: this.#secondaryVisible,
      editorWordWrap: this.#editorWordWrap,
      showBlankLines: this.#showBlankLines,
      showDeeperOutline: this.#showDeeperOutline,
      showFrontMatter: this.#showFrontMatter,
      frontMatterWritable: this.#frontMatterWritable,
      showOwnedFrontMatter: this.#showOwnedFrontMatter,
    };
  }

  /** Stores immediately; a dropped preference is not worth a prompt. */
  #store(): void {
    void this.#bridge?.writePreferences(this.snapshot()).catch(() => undefined);
  }
}
