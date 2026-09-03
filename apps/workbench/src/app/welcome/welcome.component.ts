import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import type {
  ChosenLocation,
  OperaIncertaBridge,
  RecentProjectEntry,
} from '@opera-incerta/desktop-contract';
import { resolveBridge, toBridgeFailure, unwrap } from '../workspace/bridge.js';
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
        <button type="button" (click)="open()">Open project…</button>
        <button type="button" (click)="create()">New project…</button>
      </div>

      @if (recent().length > 0) {
        <section class="recent">
          <h2>Recent projects</h2>
          <ul>
            @for (project of recent(); track project.path) {
              <li class="entry" [class.unavailable]="!project.available">
                <button type="button" class="open-entry" [title]="project.path" (click)="openRecent(project)">
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
                  (click)="forget(project)"
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

      @if (failure(); as code) {
        <p class="failure" role="alert">{{ message(code) }}</p>
      }
    </div>

    @if (creating()) {
      <wi-new-project-dialog
        [location]="location()"
        [failure]="createFailure()"
        (chooseLocation)="chooseLocation()"
        (create)="createProject($event.displayName)"
        (cancel)="closeDialog()"
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
  readonly #bridge: OperaIncertaBridge | null = resolveBridge();

  protected readonly recent = signal<readonly RecentProjectEntry[]>([]);
  protected readonly failure = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly location = signal<ChosenLocation | null>(null);
  protected readonly createFailure = signal<string | null>(null);

  constructor() {
    void this.refresh();

    // The File menu's Open and New reach the launcher, which is where opening
    // lives — the menu drives the same actions as its buttons rather than a
    // second implementation (SPEC.md §8.5).
    const stopListening = this.#bridge?.onMenuCommand((command) => {
      if (command === 'project/open') {
        void this.open();
      } else if (command === 'project/new') {
        this.create();
      }
    });
    inject(DestroyRef).onDestroy(() => stopListening?.());
  }

  protected async refresh(): Promise<void> {
    await this.#run(async (bridge) => {
      this.recent.set(unwrap(await bridge.recentProjects()));
    });
  }

  protected async open(): Promise<void> {
    await this.#run(async (bridge) => {
      unwrap(await bridge.openProject());
    });
  }

  /** Opens the dialog. Creating happens when the author confirms it. */
  protected create(): void {
    this.createFailure.set(null);
    this.creating.set(true);
  }

  protected closeDialog(): void {
    this.creating.set(false);
    this.location.set(null);
    this.createFailure.set(null);
  }

  protected async chooseLocation(): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.createFailure.set('bridge/absent');
      return;
    }
    try {
      const chosen = unwrap(await bridge.chooseProjectLocation());
      if (chosen !== null) {
        this.location.set(chosen);
      }
    } catch (error: unknown) {
      this.createFailure.set(toBridgeFailure(error).code);
    }
  }

  protected async createProject(displayName: string): Promise<void> {
    const bridge = this.#bridge;
    const parent = this.location();
    if (bridge === null || parent === null) {
      this.createFailure.set('bridge/absent');
      return;
    }

    try {
      unwrap(await bridge.createProject({ parentPath: parent.path, displayName }));
      this.closeDialog();
    } catch (error: unknown) {
      // The dialog stays open with the failure, so the author keeps what they
      // typed instead of starting over.
      this.createFailure.set(toBridgeFailure(error).code);
    }
  }

  /**
   * Opening an entry whose directory is gone reports it and offers removal
   * rather than failing hard (SPEC.md §8.6).
   */
  protected async openRecent(project: RecentProjectEntry): Promise<void> {
    if (!project.available) {
      this.failure.set('project/not-found');
      return;
    }
    await this.#run(async (bridge) => {
      unwrap(await bridge.openRecentProject({ path: project.path }));
    });
  }

  protected async forget(project: RecentProjectEntry): Promise<void> {
    await this.#run(async (bridge) => {
      unwrap(await bridge.forgetRecentProject({ path: project.path }));
      this.recent.set(unwrap(await bridge.recentProjects()));
    });
  }

  protected message(code: string): string {
    return code === 'project/not-found'
      ? 'That project is no longer there. Remove it from the list, or restore the folder.'
      : `Could not open the project (${code}).`;
  }

  async #run(operation: (bridge: OperaIncertaBridge) => Promise<void>): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.failure.set('bridge/absent');
      return;
    }
    try {
      await operation(bridge);
      this.failure.set(null);
    } catch (error: unknown) {
      this.failure.set(toBridgeFailure(error).code);
    }
  }
}
