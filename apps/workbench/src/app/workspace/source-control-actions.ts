/**
 * What the author can do from the source control panel that needs a question
 * first, or a second window. SPEC.md §12.
 *
 * A flow, not a component: it decides what is asked and what happens on the
 * answer, and it knows the one rule the panel adds to git — that switching
 * branches over unsaved work stops to ask. The shell renders the overlay this
 * puts up. Kept free of Angular so that every flow runs in a unit test against
 * the fake bridge.
 */
import type { GitFileStatus } from '@opera-incerta/core';
import type { OverlayHost } from '../shell/overlay.js';
import type { SourceControlStore } from './source-control-store.js';
import type { WorkspaceStore } from './workspace-store.js';

export class SourceControlActions {
  readonly #store: WorkspaceStore;
  readonly #sourceControl: SourceControlStore;
  readonly #overlay: OverlayHost;

  constructor(store: WorkspaceStore, sourceControl: SourceControlStore, overlay: OverlayHost) {
    this.#store = store;
    this.#sourceControl = sourceControl;
    this.#overlay = overlay;
  }

  /**
   * Creating a repository, and the question that may follow. SPEC.md §12.
   *
   * Asked only when the author has no global identity: with one, git already
   * knows who they are and there is nothing to ask. Declining leaves the
   * repository as it is; the panel keeps offering the question.
   */
  async createRepository(): Promise<void> {
    await this.#sourceControl.createRepository();
    if (this.#sourceControl.failure() !== null) {
      return;
    }
    if (this.#sourceControl.identity()?.global === null) {
      this.askForIdentity();
    }
  }

  /** The name and e-mail address commits are by. SPEC.md §12. */
  askForIdentity(): void {
    this.#overlay.set({
      kind: 'identity',
      initial: this.#sourceControl.identity()?.local ?? null,
      action: (identity) => void this.#sourceControl.setIdentity(identity),
    });
  }

  /**
   * Confirms throwing a change away. SPEC.md §12.
   *
   * The warning says what actually happens, and the two cases differ: a
   * tracked file goes back to its last committed state, while an untracked one
   * has no earlier state to go back to and goes to the trash instead.
   */
  askToDiscard(entry: GitFileStatus): void {
    const untracked = entry.groups.includes('untracked');
    this.#overlay.set({
      kind: 'confirmation',
      title: `Discard the changes to “${entry.path}”?`,
      warning: untracked
        ? 'This file is not in the repository yet, so there is nothing to go back to: ' +
          'it goes to the trash.'
        : 'The file goes back to its last committed state, and unsaved changes to it in ' +
          'the editor go with it.',
      hint: untracked
        ? 'It goes to the desktop trash, where it can be restored.'
        : 'The committed version stays in the repository’s history either way.',
      confirmLabel: 'Discard',
      action: () => void this.discard(entry),
    });
  }

  async discard(entry: GitFileStatus): Promise<void> {
    const affected = await this.#sourceControl.discard([entry.path]);
    // Whatever the editor still held for those sheets would otherwise put the
    // discarded change back on the next save.
    this.#store.forgetEdits(affected);
  }

  /** Shows what changed in one file, both readings fetched at once. SPEC.md §12. */
  async showDiff(entry: GitFileStatus): Promise<void> {
    const [text, versions] = await Promise.all([
      this.#sourceControl.diff(entry.path),
      this.#sourceControl.versions(entry.path),
    ]);
    if (text !== null) {
      this.#overlay.set({ kind: 'diff', path: entry.path, text, versions });
    }
  }

  /**
   * Merging is confirmed, because it is the one Git operation here that can
   * leave the manuscript in a state the author has to sort out.
   */
  askToMerge(): void {
    this.#overlay.set({
      kind: 'confirmation',
      title: 'Merge the changes from the remote?',
      warning: 'Where both sides changed the same passage, you decide which version stays.',
      hint: 'A merge can be abandoned afterwards, putting everything back as it was.',
      confirmLabel: 'Merge',
      action: () => void this.#sourceControl.merge(),
    });
  }

  /** Opens the resolver on a conflicted file. SPEC.md §12. */
  async openResolver(entry: GitFileStatus): Promise<void> {
    const versions = await this.#sourceControl.versions(entry.path);
    if (versions?.current != null) {
      this.#overlay.set({ kind: 'resolver', path: entry.path, text: versions.current });
    }
  }

  async applyResolution(path: string, text: string): Promise<void> {
    this.#overlay.set(null);
    await this.#sourceControl.resolve(path, text);
  }

  /**
   * Publishing a branch for the first time. SPEC.md §12.
   *
   * With a remote already recorded the address is known and only needs
   * confirming — this is the moment the manuscript first leaves the machine.
   * Without one, the address is asked for.
   */
  askToPublish(): void {
    const remote = this.#sourceControl.remote();
    if (remote === null) {
      this.#overlay.set({
        kind: 'prompt',
        title: 'Publish this branch',
        initial: '',
        placeholder: 'https://example.com/book.git',
        hint: 'The address of an empty repository. It is recorded as “origin”.',
        confirmLabel: 'Publish',
        action: (value) => void this.#sourceControl.publish(value),
      });
      return;
    }

    this.#overlay.set({
      kind: 'confirmation',
      title: `Publish “${this.#sourceControl.branch() ?? ''}” to ${remote.name}?`,
      warning: `Everything committed on this branch is sent to ${remote.url}.`,
      hint: 'From then on, Commit and push goes there without asking again.',
      confirmLabel: 'Publish',
      action: () => void this.#sourceControl.publish(),
    });
  }

  /** The branch list. SPEC.md §12. */
  async openBranches(): Promise<void> {
    this.#overlay.set({ kind: 'branches', branches: await this.#sourceControl.branches() });
  }

  /**
   * Switching replaces files in the working tree wholesale.
   *
   * It is refused while the editor holds unsaved work: git knows nothing about
   * a buffer, and an author whose text sat under a file that has just become a
   * different file has no way to make sense of what happened. Saving or
   * discarding first is one click, and then the question does not arise.
   */
  async switchBranch(name: string): Promise<void> {
    if (this.#store.dirty()) {
      this.#overlay.set({
        kind: 'confirmation',
        title: 'Save or discard first',
        warning: `“${this.#store.openTitle() ?? ''}” has changes that are not saved.`,
        hint: 'Switching branches replaces files on disk, and unsaved work has nowhere to go.',
        confirmLabel: 'Save and switch',
        action: () => void this.saveAndSwitch(name),
      });
      return;
    }
    this.#overlay.set(null);
    await this.#sourceControl.switchBranch(name);
  }

  async saveAndSwitch(name: string): Promise<void> {
    await this.#store.save();
    this.#overlay.set(null);
    await this.#sourceControl.switchBranch(name);
  }

  askForBranchName(): void {
    this.#overlay.set({
      kind: 'prompt',
      title: 'New branch',
      initial: '',
      placeholder: 'draft/chapter-3',
      hint: 'It starts at the current commit, and is switched to at once.',
      confirmLabel: 'Create',
      action: (value) => void this.#sourceControl.createBranch(value),
    });
  }

  askToDeleteBranch(name: string): void {
    this.#overlay.set({
      kind: 'confirmation',
      title: `Delete the branch “${name}”?`,
      warning: 'Only a branch whose work is already merged can be deleted; git refuses the rest.',
      hint: 'The commits stay in the repository either way.',
      confirmLabel: 'Delete',
      action: () => void this.#sourceControl.deleteBranch(name),
    });
  }

  /**
   * Replacing the last commit. SPEC.md §12.
   *
   * The message field is filled with the wording the commit already has, so
   * that amending to add a forgotten file does not cost the author their
   * message. The question then quotes that wording rather than pointing at the
   * field, which is behind the dialog and cannot be typed into while it is
   * open: to change it, cancel, edit the field, and ask again.
   */
  async askToAmend(): Promise<void> {
    if (this.#sourceControl.message().trim() === '') {
      const previous = await this.#sourceControl.lastMessage();
      if (previous !== null) {
        this.#sourceControl.setMessage(previous);
      }
    }

    const message = this.#sourceControl.message().trim();
    this.#overlay.set({
      kind: 'confirmation',
      title: 'Replace the last commit?',
      warning: `It is rewritten with whatever is staged, and its message becomes “${message}”.`,
      hint:
        'Offered only while it has not been pushed; afterwards it could only be replaced by force.',
      confirmLabel: 'Amend',
      action: () => void this.#sourceControl.amend(),
    });
  }

  /** The `.gitignore`, as text. SPEC.md §12. */
  async openIgnore(): Promise<void> {
    const text = await this.#sourceControl.readIgnore();
    if (text !== null) {
      this.#overlay.set({ kind: 'ignore', text });
    }
  }

  async saveIgnore(text: string): Promise<void> {
    this.#overlay.set(null);
    await this.#sourceControl.writeIgnore(text);
  }
}
