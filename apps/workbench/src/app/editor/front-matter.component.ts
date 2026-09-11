import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { frontMatterHeight } from '@opera-incerta/core';
import { ResizeDividerComponent } from '../shell/resize-divider.component.js';

/**
 * One block of the front matter area. specification.md §10.4.
 *
 * **Read-only is a different control, never a disabled one.** A disabled field
 * greys the text out and refuses selection, so it cannot be copied; suppressing
 * pointer events blocks the mouse but not the keyboard, and anyone already
 * focused keeps typing (`conventions.md` C-U6). Read-only here means readable
 * and selectable, only not changeable — which is what a `<pre>` is.
 *
 * The height is **measured**, never derived from a font metric: the layout
 * engine applies its own line spacing, and the cap is applied proportionally to
 * what was actually rendered. Dragging the divider can only enlarge.
 */
@Component({
  selector: 'wi-front-matter-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResizeDividerComponent],
  template: `
    <div #block class="block" [class.owned]="owned()" [style.height.px]="height()">
      @if (writable()) {
        <textarea
          [value]="text()"
          [attr.aria-label]="label()"
          spellcheck="false"
          (input)="onInput($event)"
        ></textarea>
      } @else {
        <pre tabindex="0" [attr.aria-label]="label()">{{ text() }}</pre>
      }
      <!-- Measured instead of the visible control: a text area reports the
           height of its box, not of its text, and the two switch places
           whenever "writable" does. -->
      <pre #measure class="measure" aria-hidden="true">{{ text() }}</pre>
    </div>
    <wi-resize-divider orientation="horizontal" (resize)="enlarge($event)" (reset)="dragged.set(0)" />
  `,
  styles: `
    :host {
      display: block;
      flex: none;
    }
    .block {
      position: relative;
      overflow: auto;
      border-inline-start: 3px solid var(--wi-success);
      background: color-mix(in srgb, var(--wi-success) 8%, transparent);
    }
    .block.owned {
      border-inline-start-color: var(--wi-danger);
      background: color-mix(in srgb, var(--wi-danger) 8%, transparent);
    }
    pre,
    textarea {
      display: block;
      width: 100%;
      margin: 0;
      padding: 4px 8px;
      border: 0;
      background: none;
      color: inherit;
      font: 12px var(--wi-mono);
      line-height: 1.45;
      white-space: pre;
      resize: none;
    }
    pre {
      /* Readable and selectable, only not changeable. */
      user-select: text;
    }
    textarea {
      height: 100%;
      overflow: hidden;
    }
    .measure {
      position: absolute;
      inset-inline: 0;
      top: 0;
      visibility: hidden;
      pointer-events: none;
    }
  `,
})
export class FrontMatterBlockComponent {
  readonly lines = input.required<readonly string[]>();
  readonly owned = input(false);
  readonly writable = input(false);
  readonly label = input.required<string>();

  readonly linesChange = output<readonly string[]>();

  protected readonly text = computed(() => this.lines().join('\n'));
  protected readonly dragged = signal(0);

  /**
   * The height the text actually rendered at — what the layout engine
   * produced, which is the only number the cap may be applied to. A guessed
   * constant and a font metric have both been tried, and both failed.
   */
  protected readonly measured = signal(0);
  private readonly measure = viewChild<ElementRef<HTMLElement>>('measure');
  private readonly block = viewChild<ElementRef<HTMLElement>>('block');

  /**
   * What a horizontal scrollbar takes away, measured rather than assumed.
   *
   * Front matter lines are not wrapped, so a long value puts a scrollbar along
   * the bottom — and without this it eats the last line of a block that was
   * supposed to show everything. On a platform with overlay scrollbars it is
   * simply zero.
   */
  private readonly gutter = signal(0);

  protected readonly height = computed(
    () =>
      Math.round(
        frontMatterHeight(
          { contentHeight: this.measured(), lineCount: this.lines().length },
          this.dragged(),
        ),
      ) + this.gutter(),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    let observer: ResizeObserver | null = null;

    effect(() => {
      const element = this.measure()?.nativeElement;
      if (element === undefined) {
        return;
      }
      // Depend on the text, so a changed sheet is measured again even where
      // the rendered height happens to stay the same.
      this.text();
      this.#remeasure(element);

      if (observer === null) {
        // Fonts arrive late and columns are dragged; a measurement taken once
        // is a measurement that will be wrong later.
        observer = new ResizeObserver(() => {
          this.#remeasure(element);
        });
        observer.observe(element);
        const box = this.block()?.nativeElement;
        if (box !== undefined) {
          observer.observe(box);
        }
        destroyRef.onDestroy(() => observer?.disconnect());
      }
    });
  }

  #remeasure(element: HTMLElement): void {
    this.measured.set(element.getBoundingClientRect().height);
    const box = this.block()?.nativeElement;
    if (box !== undefined) {
      // Settles after one pass: the scrollbar's thickness does not depend on
      // the height it is being added to.
      this.gutter.set(Math.max(0, box.offsetHeight - box.clientHeight));
    }
  }

  /** Dragging only ever makes the block taller (specification.md §10.4). */
  protected enlarge(pixels: number): void {
    this.dragged.set(Math.max(0, this.height() + pixels));
  }

  protected onInput(event: Event): void {
    this.linesChange.emit((event.target as HTMLTextAreaElement).value.split('\n'));
  }
}
