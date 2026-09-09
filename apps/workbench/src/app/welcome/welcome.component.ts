import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { Localization, systemLanguageTag } from '../localization/localization.js';
import { startAppearance } from '../shell/appearance.js';
import { LayoutState } from '../shell/layout-state.js';
import { resolveBridge } from '../workspace/bridge.js';
import { LauncherStore } from '../workspace/launcher-store.js';
import { NewProjectDialogComponent } from './new-project-dialog.component.js';
import { OpenFolderQuestionComponent } from './open-folder-question.component.js';

/**
 * The launcher. SPEC.md §8.6.
 *
 * Shown whenever no project is open. A project that has moved or been deleted
 * stays in the list, marked unavailable, so the author removes it deliberately
 * rather than finding it silently gone.
 */
@Component({
  // The same root element as the workbench: index.html holds one, and exactly
  // one of the two components is ever bootstrapped into it (SPEC.md §8.5).
  selector: 'wi-root',
  imports: [NewProjectDialogComponent, OpenFolderQuestionComponent],
  providers: [{ provide: Localization, useFactory: () => inject(WelcomeComponent).i18n }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="welcome">
      <header>
        <h1>Opera Incerta</h1>
        <p>{{ i18n.t('welcome.tagline') }}</p>
      </header>

      <div class="actions">
        <button type="button" class="primary" (click)="launcher.open()">{{ i18n.t('welcome.open') }}</button>
        <button type="button" (click)="launcher.startCreating()">{{ i18n.t('welcome.new') }}</button>
      </div>

      @if (launcher.recent().length > 0) {
        <section class="recent">
          <h2>{{ i18n.t('welcome.recent') }}</h2>
          <ul>
            @for (project of launcher.recent(); track project.path) {
              <li class="entry" [class.unavailable]="!project.available">
                <button
                  type="button"
                  class="open-entry"
                  [title]="project.path"
                  (click)="launcher.openRecent(project)"
                >
                  <span class="name">{{ project.displayName }}</span>
                  <span class="path">{{ project.shortPath }}</span>
                  @if (!project.available) {
                    <span class="missing">{{ i18n.t('welcome.notFound') }}</span>
                  }
                </button>
                <button
                  type="button"
                  class="forget"
                  [attr.aria-label]="i18n.t('welcome.remove', { name: project.displayName })"
                  [title]="i18n.t('welcome.removeTitle')"
                  (click)="launcher.forget(project)"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        </section>
      } @else {
        <p class="hint">{{ i18n.t('welcome.empty') }}</p>
      }

      @if (launcher.failure(); as code) {
        <p class="failure" role="alert">{{ message(code) }}</p>
      }
    </div>

    @if (launcher.question(); as question) {
      <wi-open-folder-question
        [question]="question"
        (confirm)="launcher.answerQuestion()"
        (cancel)="launcher.dismissQuestion()"
      />
    }

    @if (launcher.creating()) {
      <wi-new-project-dialog
        [location]="launcher.location()"
        [failure]="launcher.createFailure()"
        (chooseLocation)="launcher.chooseLocation()"
        (create)="launcher.createProject($event.displayName)"
        (cancel)="launcher.closeDialog()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100vh;
      font: 13px/1.5 var(--wi-sans);
    }
    .welcome {
      display: flex;
      box-sizing: border-box;
      flex-direction: column;
      gap: 14px;
      height: 100%;
      padding: 20px 24px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
    }
    header p {
      margin: 2px 0 0;
      color: var(--wi-muted);
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .actions button {
      display: inline-flex;
      height: 30px;
      align-items: center;
      padding: 0 var(--wi-space-4);
      border: 1px solid var(--wi-line-strong);
      border-radius: var(--wi-radius-control);
      background: var(--wi-control-bg);
      color: var(--wi-control-ink);
      font: inherit;
      line-height: 1;
      cursor: default;
    }
    .actions button:hover {
      border-color: var(--wi-accent);
      background: var(--wi-accent-soft);
    }
    .actions button.primary {
      border-color: var(--wi-accent-strong);
      background: var(--wi-accent);
      color: var(--wi-accent-ink);
      font-weight: 600;
    }
    .actions button.primary:hover {
      background: var(--wi-accent-strong);
    }
    .recent {
      display: flex;
      overflow: hidden;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    h2 {
      margin: 0 0 4px;
      color: var(--wi-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    ul {
      overflow-y: auto;
      flex: 1 1 auto;
      margin: 0;
      padding: 0;
      min-height: 0;
      list-style: none;
    }
    .entry {
      display: flex;
      align-items: center;
      border-radius: var(--wi-radius-control);
    }
    .entry:hover {
      background: var(--wi-row-hover);
    }
    .open-entry {
      display: flex;
      overflow: hidden;
      flex: 1 1 auto;
      gap: 8px;
      align-items: baseline;
      padding: 5px 6px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: default;
    }
    .entry.unavailable .name,
    .entry.unavailable .path {
      opacity: 0.55;
    }
    .path {
      overflow: hidden;
      color: var(--wi-muted);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .missing {
      flex: none;
      padding: 0 5px;
      border-radius: var(--wi-radius-control);
      background: color-mix(in srgb, var(--wi-danger) 18%, transparent);
      color: var(--wi-danger);
      font-size: 11px;
    }
    .forget {
      flex: none;
      padding: 2px 8px;
      border: 0;
      background: none;
      color: var(--wi-muted);
      font: inherit;
      cursor: default;
    }
    .hint,
    .failure {
      margin: 0;
      color: var(--wi-muted);
    }
    .failure {
      color: var(--wi-danger);
    }
  `,
})
export class WelcomeComponent {
  readonly #bridge = resolveBridge();
  protected readonly launcher = new LauncherStore(this.#bridge);
  /** The launcher reads the same preference the workbench stores (SPEC.md §14). */
  readonly #layout = new LayoutState(this.#bridge);
  readonly i18n = new Localization(this.#layout.interfaceLanguage, systemLanguageTag());

  constructor() {
    void this.#layout.load();
    effect(() => {
      document.documentElement.lang = this.i18n.language();
    });
    // The launcher is the application too, and wears the same scheme (§8.8).
    const stopAppearance = startAppearance(
      document.documentElement,
      this.#layout.colorScheme,
      this.#layout.accentPalette,
    );
    void this.launcher.refresh();
    const stopListening = this.launcher.listenForMenuCommands();
    inject(DestroyRef).onDestroy(() => {
      stopListening();
      stopAppearance();
    });
  }

  /** The one message the launcher words itself; every other code is shown as it is. */
  protected message(code: string): string {
    return code === 'project/not-found'
      ? this.i18n.t('welcome.gone')
      : this.i18n.t('welcome.openFailed', { code });
  }
}
