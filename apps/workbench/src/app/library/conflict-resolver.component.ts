import { ChangeDetectionStrategy, Component, computed, input, output, signal, inject } from '@angular/core';
import {
  countConflicts,
  diffProse,
  parseConflicts,
  resolveConflicts,
  type ConflictChoice,
  type ConflictRegion,
} from '@opera-incerta/core';
import { DialogComponent } from '../shell/dialog.component.js';
import { Localization } from '../localization/localization.js';

/**
 * Deciding a merge, one conflict at a time. SPEC.md §12.
 *
 * **Per region, never per file.** Git has already merged everything the two
 * sides did not both touch; choosing one version of the whole file would throw
 * that away and leave the author worse off than Git left them.
 *
 * **The markers never reach the editor.** They are read here, both versions
 * are shown as text, and the file is written back with the chosen text and no
 * marker in it. An author who typed around markers would save a file that is
 * neither version.
 *
 * Each region also shows the difference between the two versions word by word,
 * because two paragraphs of prose that differ in four words are otherwise
 * indistinguishable at a glance.
 */
@Component({
  selector: 'wi-conflict-resolver',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog
      [label]="i18n.t('resolver.label', { path: path() })"
      width="min(880px, calc(100vw - 64px))"
      maxHeight="min(76vh, 700px)"
      (dismiss)="close.emit()"
    >
      <header>
        <h2>{{ path() }}</h2>
        <span class="count">{{ i18n.t('resolver.decided', { decided: decided(), total: total() }) }}</span>
        <button type="button" (click)="close.emit()">{{ i18n.t('common.cancel') }}</button>
        <button type="button" class="apply" [disabled]="decided() !== total()" (click)="apply()">
          {{ i18n.t('resolver.apply') }}
        </button>
      </header>

      <div class="regions">
        @for (region of regions(); track $index) {
          <section class="region" [class.decided]="choiceAt($index) !== null">
            <div class="side" [class.chosen]="choiceAt($index) === 'ours'">
              <label>
                <input
                  type="radio"
                  [name]="'region-' + $index"
                  [checked]="choiceAt($index) === 'ours'"
                  (change)="choose($index, 'ours')"
                />
                {{ i18n.t('resolver.keepMine') }}
                <span class="label">{{ shorten(region.oursLabel) }}</span>
              </label>
              <p class="text">@for (part of mine($index); track $index) {<span
                  [class.only-here]="part.kind === 'removed'"
                >{{ part.text }}</span>}</p>
            </div>

            <div class="side" [class.chosen]="choiceAt($index) === 'theirs'">
              <label>
                <input
                  type="radio"
                  [name]="'region-' + $index"
                  [checked]="choiceAt($index) === 'theirs'"
                  (change)="choose($index, 'theirs')"
                />
                {{ i18n.t('resolver.takeTheirs') }}
                <span class="label">{{ incoming() ?? shorten(region.theirsLabel) }}</span>
              </label>
              <p class="text">@for (part of theirs($index); track $index) {<span
                  [class.only-there]="part.kind === 'added'"
                >{{ part.text }}</span>}</p>
            </div>
          </section>
        }
      </div>
    </wi-dialog>
  `,
  styles: `
    h2 {
      overflow: hidden;
      font-size: 13px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .count {
      flex: none;
      color: var(--wi-muted);
    }
    .regions {
      overflow: auto;
      flex: 1 1 auto;
      border-top: 1px solid var(--wi-separator);
    }
    .region {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
      padding: 10px 0;
      border-bottom: 1px solid var(--wi-row-selected);
    }
    .side {
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: var(--wi-radius-panel);
    }
    .side.chosen {
      border-color: var(--wi-line-strong);
      background: var(--wi-row-hover);
    }
    label {
      display: flex;
      gap: 4px;
      align-items: center;
      font-weight: 600;
    }
    .label {
      overflow: hidden;
      font-weight: 400;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--wi-muted);
    }
    .text {
      margin: 6px 0 0;
      font: 13px/1.5 Georgia, 'Times New Roman', serif;
      white-space: pre-wrap;
      user-select: text;
    }
    .only-here {
      background: color-mix(in srgb, var(--wi-danger) 14%, transparent);
    }
    .only-there {
      background: color-mix(in srgb, var(--wi-success) 18%, transparent);
    }
  `,
})
export class ConflictResolverComponent {
  protected readonly i18n = inject(Localization);
  readonly path = input.required<string>();
  /** The file as the merge left it, markers and all. */
  readonly text = input.required<string>();
  /**
   * Where the incoming version came from, when that is known.
   *
   * Git labels the other side of a pulled merge with a commit hash, which
   * tells an author nothing; `origin/main` tells them where it came from.
   */
  readonly incoming = input<string | null>(null);

  /** The file to write, with every conflict decided and no marker in it. */
  readonly resolved = output<string>();
  readonly close = output<void>();

  protected readonly parts = computed(() => parseConflicts(this.text()));
  protected readonly regions = computed(() =>
    this.parts().filter((part): part is ConflictRegion => part.kind === 'conflict'),
  );
  protected readonly total = computed(() => countConflicts(this.parts()));

  private readonly choices = signal<ReadonlyArray<ConflictChoice | null>>([]);
  protected readonly decided = computed(
    () => this.choices().filter((choice) => choice !== null).length,
  );

  /**
   * The two versions, differing word by word.
   *
   * Computed once per region and read from both sides, so the same comparison
   * decides what is highlighted on the left and on the right.
   */
  private readonly comparison = computed(() =>
    this.regions().map((region) => diffProse(region.ours, region.theirs)),
  );

  /** A bare commit hash, cut to the length people actually read. */
  protected shorten(label: string): string {
    return /^[0-9a-f]{40}$/u.test(label) ? label.slice(0, 7) : label;
  }

  protected choiceAt(index: number): ConflictChoice | null {
    return this.choices()[index] ?? null;
  }

  protected mine(index: number): ReadonlyArray<{ kind: string; text: string }> {
    return (this.comparison()[index] ?? []).filter((segment) => segment.kind !== 'added');
  }

  protected theirs(index: number): ReadonlyArray<{ kind: string; text: string }> {
    return (this.comparison()[index] ?? []).filter((segment) => segment.kind !== 'removed');
  }

  protected choose(index: number, choice: ConflictChoice): void {
    const next = [...this.choices()];
    while (next.length < this.total()) {
      next.push(null);
    }
    next[index] = choice;
    this.choices.set(next);
  }

  protected apply(): void {
    this.resolved.emit(
      resolveConflicts(
        this.parts(),
        this.choices().map((choice) => choice ?? 'ours'),
      ),
    );
  }
}
