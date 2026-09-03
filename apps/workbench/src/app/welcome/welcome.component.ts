import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { resolveBridge } from '../workspace/bridge.js';
import { LauncherStore } from '../workspace/launcher-store.js';
import { NewProjectDialogComponent } from './new-project-dialog.component.js';

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
  imports: [NewProjectDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="welcome">
      <header>
        <h1>Opera Incerta</h1>
        <p>Collect and write texts, and grow a book out of them.</p>
      </header>

      <div class="actions">
        <button type="button" (click)="launcher.open()">Open project…</button>
        <button type="button" (click)="launcher.startCreating()">New project…</button>
      </div>

      @if (launcher.recent().length > 0) {
        <section class="recent">
          <h2>Recent projects</h2>
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
                    <span class="missing">not found</span>
                  }
                </button>
                <button
                  type="button"
                  class="forget"
                  [attr.aria-label]="'Remove ' + project.displayName + ' from the list'"
                  title="Remove from list"
                  (click)="launcher.forget(project)"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        </section>
      } @else {
        <p class="hint">No projects opened yet.</p>
      }

      @if (launcher.failure(); as code) {
        <p class="failure" role="alert">{{ message(code) }}</p>
      }
    </div>

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
      font: 13px/1.5 system-ui, sans-serif;
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
      color: rgba(128, 128, 128, 0.95);
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .actions button {
      padding: 5px 12px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 5px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
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
      color: rgba(128, 128, 128, 0.95);
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
      border-radius: 5px;
    }
    .entry:hover {
      background: rgba(128, 128, 128, 0.12);
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
      color: rgba(128, 128, 128, 0.9);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .missing {
      flex: none;
      padding: 0 5px;
      border-radius: 4px;
      background: rgba(190, 90, 90, 0.18);
      color: rgba(150, 60, 60, 0.95);
      font-size: 11px;
    }
    .forget {
      flex: none;
      padding: 2px 8px;
      border: 0;
      background: none;
      color: rgba(128, 128, 128, 0.9);
      font: inherit;
      cursor: default;
    }
    .hint,
    .failure {
      margin: 0;
      color: rgba(128, 128, 128, 0.95);
    }
    .failure {
      color: rgba(150, 60, 60, 0.95);
    }
  `,
})
export class WelcomeComponent {
  protected readonly launcher = new LauncherStore(resolveBridge());

  constructor() {
    void this.launcher.refresh();
    const stopListening = this.launcher.listenForMenuCommands();
    inject(DestroyRef).onDestroy(() => stopListening());
  }

  /** The one message the launcher words itself; every other code is shown as it is. */
  protected message(code: string): string {
    return code === 'project/not-found'
      ? 'That project is no longer there. Remove it from the list, or restore the folder.'
      : `Could not open the project (${code}).`;
  }
}
