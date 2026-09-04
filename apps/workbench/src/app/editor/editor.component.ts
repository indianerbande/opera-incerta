import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  DEFAULT_EDITOR_TYPOGRAPHY,
  type EditorAdapter,
  type EditorCursor,
  type EditorDocument,
  type EditorTypography,
  type HeadingLevel,
  type HeadingMarkerActivation,
} from '@opera-incerta/core';
import { createCodeMirrorEditorAdapter, type TypographyAware } from './codemirror-editor-adapter.js';
import { HeadingMenuComponent } from './heading-menu.component.js';

/**
 * Hosts the editor adapter. SPEC.md §10.
 *
 * The component owns the element and the lifecycle, nothing else: it holds no
 * document state, applies no Markdown rule, and would work unchanged against
 * any adapter that satisfies the contract.
 */
@Component({
  selector: 'wi-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeadingMenuComponent],
  template: `
    <div class="editor-host" #host></div>
    @if (menu(); as activation) {
      <wi-heading-menu
        [activation]="activation"
        (select)="applyLevel($event)"
        (dismiss)="menu.set(null)"
      />
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .editor-host {
      height: 100%;
    }
  `,
})
export class EditorComponent {
  /** The document to show. Switching keeps each document's own history. */
  readonly document = input.required<EditorDocument>();
  /**
   * Documents that are gone, by id, accumulated. Each is forgotten once; the
   * adapter keeps no history for a sheet that was deleted or moved.
   */
  readonly retired = input<readonly string[]>([]);
  /** Font, base size, wrapping — the author's, from the settings. SPEC.md §13. */
  readonly typography = input<EditorTypography>(DEFAULT_EDITOR_TYPOGRAPHY);

  /** Emitted after every change, with the text as it would be written. */
  readonly textChange = output<string>();
  /** Where the cursor is, after every move. SPEC.md §10.5. */
  readonly cursorChange = output<EditorCursor>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly adapter = signal<(EditorAdapter & TypographyAware) | null>(null);

  /** The open gutter menu, or null. */
  protected readonly menu = signal<HeadingMarkerActivation | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const adapter = createCodeMirrorEditorAdapter(this.host().nativeElement, this.typography());
      adapter.onChange((text) => this.textChange.emit(text));
      adapter.onCursorChange((cursor) => this.cursorChange.emit(cursor));
      adapter.onHeadingMarkerActivate((activation) => this.menu.set(activation));
      adapter.open(this.document());
      this.adapter.set(adapter);

      destroyRef.onDestroy(() => adapter.destroy());
    });

    effect(() => {
      const typography = this.typography();
      this.adapter()?.setTypography(typography);
    });

    effect(() => {
      const document_ = this.document();
      const adapter = this.adapter();
      if (adapter === null) {
        return;
      }
      // The same document with other text means its content was replaced from
      // outside — the author took the version on disk (SPEC.md §10.6).
      // Re-opening it would throw away the undo history of a document that
      // never stopped being the same one.
      if (adapter.openDocumentId() === document_.id) {
        if (adapter.text() !== document_.text) {
          adapter.replace(document_.text);
        }
        return;
      }
      adapter.open(document_);
    });

    effect(() => {
      const adapter = this.adapter();
      const retired = this.retired();
      if (adapter === null) {
        return;
      }
      for (const id of retired) {
        if (!this.#forgotten.has(id)) {
          this.#forgotten.add(id);
          adapter.forget(id);
        }
      }
    });
  }

  readonly #forgotten = new Set<string>();

  /** Outline navigation and diagnostics jump through here. */
  revealLine(line: number): void {
    this.adapter()?.revealLine(line);
  }

  /** The gutter menu of SPEC.md §10.2. */
  setHeadingLevel(line: number, level: HeadingLevel | null): void {
    this.adapter()?.setHeadingLevel(line, level);
  }

  /** A choice from the gutter menu. */
  protected applyLevel(level: HeadingLevel | null): void {
    const activation = this.menu();
    this.menu.set(null);
    if (activation !== null) {
      this.setHeadingLevel(activation.line, level);
    }
  }
}
