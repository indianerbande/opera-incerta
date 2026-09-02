import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { slugify } from '@opera-incerta/core';
import type { ChosenLocation } from '@opera-incerta/desktop-contract';

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
  host: { '(document:keydown.escape)': 'cancel.emit()' },
  template: `
    <div class="backdrop" (mousedown)="cancel.emit()"></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="New project">
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
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.25);
    }
    .dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(420px, calc(100vw - 48px));
      padding: 16px 18px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 8px;
      background: Canvas;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
      transform: translate(-50%, -50%);
    }
    h2 {
      margin: 0;
      font-size: 15px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
    }
    input {
      padding: 4px 6px;
      border: 1px solid rgba(128, 128, 128, 0.45);
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
      color: rgba(128, 128, 128, 0.95);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .preview {
      margin: 0;
      color: rgba(128, 128, 128, 0.95);
      font-size: 11px;
    }
    code {
      font-family: ui-monospace, monospace;
    }
    .failure {
      margin: 0;
      color: rgba(150, 60, 60, 0.95);
      font-size: 12px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    button {
      padding: 4px 10px;
      border: 1px solid rgba(128, 128, 128, 0.45);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: default;
    }
    button:disabled {
      opacity: 0.5;
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
