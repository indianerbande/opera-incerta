import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  BUILT_IN_STYLESHEETS,
  builtInStylesheet,
  isBuiltInStylesheetId,
  isUsableStylesheetName,
  type BuiltInStylesheetId,
} from '@opera-incerta/export';
import { DialogComponent } from '../shell/dialog.component.js';
import { Localization } from '../localization/localization.js';

/** What the dialog is doing: choosing, naming a copy, or editing one. */
type Mode = 'choosing' | 'duplicating' | 'editing';

/**
 * Choosing the stylesheet a PDF is set with. SPEC.md §15.2.
 *
 * All three things are here — the list, the duplication, the editing — rather
 * than in the settings, because the choice belongs to the moment of use: an
 * author who wants a different set this once should not have to go looking
 * for a preference.
 *
 * The three modes are the dialog's own state rather than three overlays. The
 * shell allows one overlay at a time (§8.7), and rightly: a prompt that
 * replaced this dialog would lose what the author had chosen in it.
 */
@Component({
  selector: 'wi-export-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog [label]="i18n.t('export.dialogTitle')" width="min(440px, calc(100vw - 48px))" (dismiss)="close.emit()">
      <header>
        <h2>{{ i18n.t('export.dialogTitle') }}</h2>
      </header>

      @switch (mode()) {
        @case ('choosing') {
          <fieldset class="sheets">
            <legend>{{ i18n.t('export.stylesheet') }}</legend>
            @for (entry of entries(); track entry.name) {
              <label class="sheet" [class.own]="entry.own">
                <input
                  type="radio"
                  name="stylesheet"
                  [value]="entry.name"
                  [checked]="chosen() === entry.name"
                  (change)="chosen.set(entry.name)"
                />
                <span class="label">{{ entry.label }}</span>
                @if (entry.own) {
                  <span class="mark">{{ i18n.t('export.ownStylesheet') }}</span>
                }
              </label>
            }
          </fieldset>

          <p class="hint">{{ i18n.t('export.stylesheetHint') }}</p>
        }

        @case ('duplicating') {
          <label class="naming">
            <span>{{ i18n.t('export.duplicateAs') }}</span>
            <input
              type="text"
              class="name"
              [value]="draftName()"
              [attr.aria-label]="i18n.t('export.duplicateAs')"
              (input)="draftName.set(value($event))"
              (keydown.enter)="confirmDuplicate()"
            />
          </label>
          <p class="hint">{{ i18n.t('export.duplicateHint') }}</p>
        }

        @case ('editing') {
          <textarea
            class="css"
            [value]="draftCss()"
            [attr.aria-label]="i18n.t('export.editStylesheet')"
            spellcheck="false"
            (input)="draftCss.set(value($event))"
          ></textarea>
          <p class="hint">{{ i18n.t('export.editHint') }}</p>
        }
      }

      <footer>
        @switch (mode()) {
          @case ('choosing') {
            <button type="button" class="duplicate" (click)="startDuplicate()">
              {{ i18n.t('export.duplicate') }}
            </button>
            @if (chosenIsOwn()) {
              <button type="button" class="edit" (click)="startEdit()">
                {{ i18n.t('export.edit') }}
              </button>
            }
            <span class="spacer"></span>
            <button type="button" (click)="close.emit()">{{ i18n.t('common.cancel') }}</button>
            <button type="button" class="go" (click)="run.emit(chosen())">
              {{ i18n.t('export.run') }}
            </button>
          }
          @case ('duplicating') {
            <span class="spacer"></span>
            <button type="button" (click)="mode.set('choosing')">{{ i18n.t('common.cancel') }}</button>
            <button
              type="button"
              class="go"
              [disabled]="!nameIsUsable()"
              (click)="confirmDuplicate()"
            >
              {{ i18n.t('common.create') }}
            </button>
          }
          @case ('editing') {
            <span class="spacer"></span>
            <button type="button" (click)="mode.set('choosing')">{{ i18n.t('common.cancel') }}</button>
            <button type="button" class="go" (click)="confirmEdit()">
              {{ i18n.t('common.save') }}
            </button>
          }
        }
      </footer>
    </wi-dialog>
  `,
  styles: `
    .sheets {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      padding: 0 0 var(--wi-space-2);
      font-weight: 600;
    }
    .sheet {
      display: flex;
      gap: var(--wi-space-2);
      align-items: baseline;
      padding: var(--wi-space-1) var(--wi-space-2);
      border-radius: var(--wi-radius-control);
    }
    .sheet:hover {
      background: var(--wi-row-selected);
    }
    .mark {
      color: var(--wi-muted);
      font-size: 11px;
    }
    .naming {
      display: flex;
      flex-direction: column;
      gap: var(--wi-space-1);
    }
    .name {
      height: var(--wi-control-height);
      padding: 0 var(--wi-space-2);
      border: 1px solid var(--wi-line-strong);
      border-radius: var(--wi-radius-control);
      background: var(--wi-control-bg);
      color: inherit;
      font: inherit;
    }
    .css {
      height: 40vh;
      padding: 6px 8px;
      border: 1px solid var(--wi-border);
      border-radius: var(--wi-radius-control);
      background: none;
      color: inherit;
      font: 12px var(--wi-mono);
      resize: none;
      white-space: pre;
    }
    .hint {
      margin: var(--wi-space-2) 0 0;
      color: var(--wi-muted);
      font-size: 11px;
    }
    footer {
      display: flex;
      gap: var(--wi-space-2);
      align-items: center;
    }
    .spacer {
      flex: 1 1 auto;
    }
  `,
})
export class ExportDialogComponent {
  protected readonly i18n = inject(Localization);

  /** The author's own, by name. The supplied four come from the module. */
  readonly own = input.required<readonly string[]>();
  /** What was chosen last, remembered installation-locally (§13). */
  readonly initial = input.required<string>();

  /** Writes a stylesheet of the author's own, and reports the new list. */
  readonly save = output<{ name: string; css: string }>();
  /** Exports with the named stylesheet. */
  readonly run = output<string>();
  readonly close = output<void>();
  /** Asks for the CSS of one of the author's own, to edit or to copy. */
  readonly requestCss = output<string>();

  /** The CSS the shell fetched for the sheet being edited or duplicated. */
  readonly fetchedCss = input<string | null>(null);

  protected readonly mode = signal<Mode>('choosing');
  protected readonly draftName = signal('');
  protected readonly draftCss = signal('');

  /**
   * The chosen name, seeded from the preference.
   *
   * A remembered name the project no longer has is not offered, so the
   * selection falls back to the default — the same rule the export itself
   * follows (SPEC.md §15.2).
   */
  protected readonly chosen = linkedSignal(() => {
    const initial = this.initial();
    return this.#exists(initial) ? initial : 'manuscript';
  });

  protected readonly entries = computed(() => [
    ...BUILT_IN_STYLESHEETS.map((id) => ({ name: id as string, label: this.#label(id), own: false })),
    ...this.own().map((name) => ({ name, label: name, own: true })),
  ]);

  protected readonly chosenIsOwn = computed(() => this.own().includes(this.chosen()));

  protected readonly nameIsUsable = computed(() => {
    const name = this.draftName().trim();
    // A name that is already taken would silently replace a stylesheet the
    // author made, which is not what "duplicate" means.
    return isUsableStylesheetName(name) && !this.#exists(name);
  });

  protected startDuplicate(): void {
    const from = this.chosen();
    this.draftName.set(this.#freeName(from));
    if (isBuiltInStylesheetId(from)) {
      // A supplied sheet is here, in the renderer: no round trip for it.
      this.draftCss.set(builtInStylesheet(from));
    } else {
      this.draftCss.set('');
      this.requestCss.emit(from);
    }
    this.mode.set('duplicating');
  }

  protected startEdit(): void {
    this.draftCss.set('');
    this.requestCss.emit(this.chosen());
    this.mode.set('editing');
  }

  protected confirmDuplicate(): void {
    const name = this.draftName().trim();
    if (!this.nameIsUsable()) {
      return;
    }
    this.save.emit({ name, css: this.draftCss() === '' ? (this.fetchedCss() ?? '') : this.draftCss() });
    this.chosen.set(name);
    this.mode.set('choosing');
  }

  protected confirmEdit(): void {
    this.save.emit({ name: this.chosen(), css: this.draftCss() });
    this.mode.set('choosing');
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  #exists(name: string): boolean {
    return isBuiltInStylesheetId(name) || this.own().includes(name);
  }

  /** `Manuscript copy`, then `Manuscript copy 2`, … — never an existing one. */
  #freeName(from: string): string {
    const base = `${from} ${this.i18n.t('export.copySuffix')}`;
    if (!this.#exists(base)) {
      return base;
    }
    for (let index = 2; index < 100; index += 1) {
      const candidate = `${base} ${String(index)}`;
      if (!this.#exists(candidate)) {
        return candidate;
      }
    }
    return base;
  }

  /** Supplied sheets are named by the catalogue; the author's name themselves. */
  #label(id: BuiltInStylesheetId): string {
    switch (id) {
      case 'manuscript':
        return this.i18n.t('export.sheet.manuscript');
      case 'typescript':
        return this.i18n.t('export.sheet.typescript');
      case 'reading':
        return this.i18n.t('export.sheet.reading');
      case 'plain':
        return this.i18n.t('export.sheet.plain');
    }
  }
}
