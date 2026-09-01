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
import type { EditorAdapter, EditorDocument, HeadingLevel } from '@opera-incerta/core';
import { createCodeMirrorEditorAdapter } from './codemirror-editor-adapter.js';

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
  template: `<div class="editor-host" #host></div>`,
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

  /** Emitted after every change, with the text as it would be written. */
  readonly textChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly adapter = signal<EditorAdapter | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const adapter = createCodeMirrorEditorAdapter(this.host().nativeElement);
      adapter.onChange((text) => this.textChange.emit(text));
      adapter.open(this.document());
      this.adapter.set(adapter);

      destroyRef.onDestroy(() => adapter.destroy());
    });

    effect(() => {
      const document_ = this.document();
      this.adapter()?.open(document_);
    });
  }

  /** Outline navigation and diagnostics jump through here. */
  revealLine(line: number): void {
    this.adapter()?.revealLine(line);
  }

  /** The gutter menu of SPEC.md §10.2. */
  setHeadingLevel(line: number, level: HeadingLevel | null): void {
    this.adapter()?.setHeadingLevel(line, level);
  }
}
