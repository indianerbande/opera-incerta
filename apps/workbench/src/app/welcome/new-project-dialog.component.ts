import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { slugify } from '@opera-incerta/core';
import type { ChosenLocation } from '@opera-incerta/desktop-contract';
import { DialogComponent } from '../shell/dialog.component.js';

/**
 * Naming a new project and choosing where it goes. SPEC.md §6.1, §8.6.
 *
 * It shows the directory name it will create. The display name is what the
 * author writes and can change later; the directory name is a slug of it and
 * never changes again, so seeing it before the project exists is the
 * difference between a rule and a surprise.
 *
 * The preview cannot know about a collision — that is decided against the real
 * directory when the project is created — so it says so rather than promising
 * a name it might not get.
 */
@Component({
  selector: 'wi-new-project-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <wi-dialog label="New project" (dismiss)="cancel.emit()">
      <h2>New project</h2>

      <label>
        Name
        <input
          type="text"
          autofocus
          placeholder="The Harbour Novel"
          [value]="name()"
          (input)="name.set(value($event))"
          (keydown.enter)="submit()"
        />
      </label>

      <label>
        Location
        <div class="location">
          <span class="path" [title]="location()?.path ?? ''">
            {{ location()?.shortPath ?? 'No folder chosen' }}
          </span>
          <button type="button" (click)="chooseLocation.emit()">Choose…</button>
        </div>
      </label>

      @if (folderName(); as folder) {
        <p class="preview">
          Creates the folder <code>{{ folder }}</code>. The name above can change later;
          the folder name cannot.
        </p>
      }

      @if (failure(); as code) {
        <p class="failure" role="alert">Could not create the project ({{ code }}).</p>
      }

      <div class="actions">
        <button type="button" (click)="cancel.emit()">Cancel</button>
        <button type="button" [disabled]="!ready()" (click)="submit()">Create</button>
      </div>
    </wi-dialog>
  `,
  styles: `
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
    }
    input {
      padding: 4px 6px;
      border: 1px solid var(--wi-border);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }
    .location {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .path {
      overflow: hidden;
      flex: 1 1 auto;
      color: var(--wi-muted);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .preview {
      margin: 0;
      color: var(--wi-muted);
      font-size: 11px;
    }
    code {
      font-family: ui-monospace, monospace;
    }
    .failure {
      margin: 0;
      color: var(--wi-danger);
      font-size: 12px;
    }
  `,
})
export class NewProjectDialogComponent {
  readonly location = input<ChosenLocation | null>(null);
  readonly failure = input<string | null>(null);

  readonly chooseLocation = output<void>();
  readonly create = output<{ displayName: string }>();
  readonly cancel = output<void>();

  protected readonly name = signal('');

  /** The directory the project will get, or null when the name yields none. */
  protected readonly folderName = computed(() => {
    const slug = slugify(this.name());
    return slug === '' ? null : slug;
  });

  protected readonly ready = computed(
    () => this.name().trim() !== '' && this.location() !== null,
  );

  protected submit(): void {
    if (this.ready()) {
      this.create.emit({ displayName: this.name().trim() });
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
