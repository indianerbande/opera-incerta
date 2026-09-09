/**
 * The launcher's state: the recent list, the project being created, and what
 * failed. SPEC.md §8.6.
 *
 * The welcome component used to drive the bridge itself, with a private copy
 * of the run-and-report pattern the workbench stores have. This is that
 * pattern in one place, and it runs in a unit test against the fake bridge.
 */
import { signal } from '@angular/core';
import {
  isProjectOpenOutcome,
  type ChosenLocation,
  type OperaIncertaBridge,
  type ProjectOpenQuestion,
  type RecentProjectEntry,
} from '@opera-incerta/desktop-contract';
import { toBridgeFailure, unwrap, unwrapAs } from './bridge.js';

export class LauncherStore {
  readonly #bridge: OperaIncertaBridge | null;

  readonly #recent = signal<readonly RecentProjectEntry[]>([]);
  readonly #failure = signal<string | null>(null);
  readonly #creating = signal(false);
  readonly #location = signal<ChosenLocation | null>(null);
  readonly #createFailure = signal<string | null>(null);
  readonly #question = signal<ProjectOpenQuestion | null>(null);

  constructor(bridge: OperaIncertaBridge | null) {
    this.#bridge = bridge;
  }

  readonly recent = this.#recent.asReadonly();
  /** What the last open or forget reported, as a code. */
  readonly failure = this.#failure.asReadonly();
  /** Whether the new-project dialog is up. */
  readonly creating = this.#creating.asReadonly();
  /** Where the new project would go, once chosen. */
  readonly location = this.#location.asReadonly();
  /** What creating reported, as a code; shown inside the dialog. */
  readonly createFailure = this.#createFailure.asReadonly();
  /** What opening a folder wants to know, when it is not a project. */
  readonly question = this.#question.asReadonly();

  /**
   * The File menu's Open and New reach the launcher, which is where opening
   * lives — the menu drives the same actions as its buttons rather than a
   * second implementation (SPEC.md §8.5).
   */
  listenForMenuCommands(): () => void {
    return (
      this.#bridge?.onMenuCommand((command) => {
        if (command === 'project/open') {
          void this.open();
        } else if (command === 'project/new') {
          this.startCreating();
        }
      }) ?? ((): void => undefined)
    );
  }

  async refresh(): Promise<void> {
    await this.#run(async (bridge) => {
      this.#recent.set(unwrap(await bridge.recentProjects()));
    });
  }

  /**
   * Opens a folder the author chooses. SPEC.md §8.6.
   *
   * A folder that is not a project is not a failure. The main process says
   * what it found, and each answer other than "opened" is a question put to
   * the author: adopt this folder, open the project inside it, or name the one
   * that was meant.
   */
  async open(): Promise<void> {
    this.#question.set(null);
    await this.#run(async (bridge) => {
      const outcome = unwrapAs(await bridge.openProject(), isProjectOpenOutcome, 'open-outcome');
      if (outcome.kind !== 'opened' && outcome.kind !== 'cancelled') {
        this.#question.set(outcome);
      }
    });
  }

  /**
   * Answers the question with yes: adopt the folder, or open the subproject.
   *
   * A list of several projects has no yes — it asks the author to open the
   * one they mean — so it is only ever dismissed.
   */
  async answerQuestion(): Promise<void> {
    const question = this.#question();
    if (question === null || question.kind === 'multiple-subprojects') {
      return;
    }
    // Down before the answer: on success the workbench replaces this window,
    // and on failure the reason belongs in the launcher, not under a dialog.
    this.#question.set(null);
    await this.#run(async (bridge) => {
      unwrap(
        question.kind === 'no-project'
          ? await bridge.adoptProject({ path: question.path })
          : await bridge.openProjectPath({ path: question.path }),
      );
    });
  }

  dismissQuestion(): void {
    this.#question.set(null);
  }

  /** Opens the dialog. Creating happens when the author confirms it. */
  startCreating(): void {
    this.#createFailure.set(null);
    this.#creating.set(true);
  }

  closeDialog(): void {
    this.#creating.set(false);
    this.#location.set(null);
    this.#createFailure.set(null);
  }

  /** Asks where the project should live. A cancelled chooser changes nothing. */
  async chooseLocation(): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.#createFailure.set('bridge/absent');
      return;
    }
    try {
      const chosen = unwrap(await bridge.chooseProjectLocation());
      if (chosen !== null) {
        this.#location.set(chosen);
      }
    } catch (error: unknown) {
      this.#createFailure.set(toBridgeFailure(error).code);
    }
  }

  /**
   * Creates the project in the chosen location. On failure the dialog stays
   * open with the reason, so the author keeps what they typed.
   */
  async createProject(displayName: string): Promise<void> {
    const bridge = this.#bridge;
    const parent = this.#location();
    if (bridge === null || parent === null) {
      this.#createFailure.set(bridge === null ? 'bridge/absent' : 'project/no-location');
      return;
    }
    try {
      unwrap(await bridge.createProject({ parentPath: parent.path, displayName }));
      this.closeDialog();
    } catch (error: unknown) {
      this.#createFailure.set(toBridgeFailure(error).code);
    }
  }

  /**
   * Opening an entry whose directory is gone reports it and offers removal
   * rather than failing hard (SPEC.md §8.6).
   */
  async openRecent(project: RecentProjectEntry): Promise<void> {
    if (!project.available) {
      this.#failure.set('project/not-found');
      return;
    }
    await this.#run(async (bridge) => {
      unwrap(await bridge.openProjectPath({ path: project.path }));
    });
  }

  async forget(project: RecentProjectEntry): Promise<void> {
    await this.#run(async (bridge) => {
      unwrap(await bridge.forgetRecentProject({ path: project.path }));
      this.#recent.set(unwrap(await bridge.recentProjects()));
    });
  }

  async #run(operation: (bridge: OperaIncertaBridge) => Promise<void>): Promise<void> {
    const bridge = this.#bridge;
    if (bridge === null) {
      this.#failure.set('bridge/absent');
      return;
    }
    try {
      await operation(bridge);
      this.#failure.set(null);
    } catch (error: unknown) {
      this.#failure.set(toBridgeFailure(error).code);
    }
  }
}
