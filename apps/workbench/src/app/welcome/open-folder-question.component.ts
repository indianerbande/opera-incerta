import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  viewChild,
  inject,
} from '@angular/core';
import type { ProjectOpenQuestion } from '@opera-incerta/desktop-contract';
import { DialogComponent } from '../shell/dialog.component.js';
import { Localization } from '../localization/localization.js';

/**
 * What to do with a folder that is not a project. specification.md §8.6.
 *
 * The three answers the inspection can give are three questions, and one
 * dialog asks all of them: the folder can become a project, the project the
 * author meant lies one level down, or several do and only the author knows
 * which. The first two have a yes; the third has none — it names what it
 * found and asks the author to open the intended one directly, because
 * guessing for them is how the wrong manuscript gets opened.
 *
 * Unlike the confirmation of §6.7 this is not a destructive question, so
 * Return is not taken away from it: the affirmative button holds the focus and
 * answers.
 */
@Component({
  selector: 'wi-open-folder-question',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog [label]="title()" width="min(420px, calc(100vw - 48px))" (dismiss)="cancel.emit()">
      <h2>{{ title() }}</h2>
      <p class="body">{{ body() }}</p>
      <p class="where" [title]="question().shortPath">{{ question().shortPath }}</p>

      @if (names(); as list) {
        <ul class="projects">
          @for (name of list; track name) {
            <li>{{ name }}</li>
          }
        </ul>
      }

      <div class="actions">
        <button type="button" class="cancel" #cancelButton (click)="cancel.emit()">
          {{ dismissLabel() }}
        </button>
        @if (confirmLabel(); as label) {
          <button type="button" class="confirm primary" #confirmButton (click)="confirm.emit()">
            {{ label }}
          </button>
        }
      </div>
    </wi-dialog>
  `,
  styles: `
    p {
      margin: 0;
    }
    .where {
      overflow: hidden;
      color: var(--wi-muted);
      font-size: 11px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    ul.projects {
      overflow-y: auto;
      margin: 0;
      padding-left: 18px;
      max-height: 160px;
    }
  `,
})
export class OpenFolderQuestionComponent {
  protected readonly i18n = inject(Localization);
  readonly question = input.required<ProjectOpenQuestion>();

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  protected readonly title = computed(() => {
    switch (this.question().kind) {
      case 'no-project':
        return this.i18n.t('openFolder.adoptTitle');
      case 'single-subproject':
        return this.i18n.t('openFolder.subprojectTitle');
      case 'multiple-subprojects':
        return this.i18n.t('openFolder.severalTitle');
    }
  });

  protected readonly body = computed(() => {
    const question = this.question();
    switch (question.kind) {
      case 'no-project':
        return this.i18n.t('openFolder.adoptBody', { folder: question.folderName });
      case 'single-subproject':
        return this.i18n.t('openFolder.subprojectBody', { name: question.name });
      case 'multiple-subprojects':
        return this.i18n.t('openFolder.severalBody');
    }
  });

  /** The names to list, for the one question that answers itself with them. */
  protected readonly names = computed(() => {
    const question = this.question();
    return question.kind === 'multiple-subprojects' ? question.names : null;
  });

  /** Null where there is nothing to say yes to. */
  protected readonly confirmLabel = computed(() => {
    switch (this.question().kind) {
      case 'no-project':
        return this.i18n.t('openFolder.adopt');
      case 'single-subproject':
        return this.i18n.t('common.open');
      case 'multiple-subprojects':
        return null;
    }
  });

  /** Cancel where there is a yes, close where the dialog only tells. */
  protected readonly dismissLabel = computed(() =>
    this.confirmLabel() === null ? this.i18n.t('common.close') : this.i18n.t('common.cancel'),
  );

  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    afterNextRender(() => {
      (this.confirmButton() ?? this.cancelButton())?.nativeElement.focus();
    });
  }
}
