import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * The draggable boundary between two columns. SPEC.md §8.2.
 *
 * Between two panels **the divider is the air**: the 8 px gap of §8.2 is both
 * the separation one sees and the thing one grabs, so it draws no line of its
 * own — it shows a short grip under the pointer and takes the accent while it
 * is dragged. Inside the editor, where the front matter blocks are sized by
 * height, there is no gap to be: that orientation keeps its 6 px strip and its
 * hairline.
 *
 * The column's width lives in the layout state, and this only reports how far
 * the pointer moved — which is what keeps a view switch from ever moving a
 * column (`CONVENTIONS.md` C-U1).
 *
 * `side` says which column the divider belongs to. The secondary sidebar's
 * divider sits to its **left**, so dragging right must make it *narrower*;
 * without this the drag runs backwards.
 *
 * `orientation` turns it on its side for the front matter blocks (§10.4),
 * which are sized by height. The mechanics are the same; only the axis and the
 * cursor change.
 */
@Component({
  selector: 'wi-resize-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dragging]': 'dragging()',
    '[class.horizontal]': "orientation() === 'horizontal'",
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'end($event)',
    '(pointercancel)': 'end($event)',
    '(dblclick)': 'reset.emit()',
    role: 'separator',
    '[attr.aria-orientation]': 'orientation()',
  },
  template: '<span class="line"></span>',
  styles: `
    :host {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--wi-space-3);
      cursor: col-resize;
      touch-action: none;
      user-select: none;
      z-index: 1;
    }
    :host(.horizontal) {
      align-items: center;
      width: auto;
      height: 6px;
      margin-block: -3px;
      cursor: row-resize;
    }
    /* A short grip rather than a full line: the gap is the separation. */
    .line {
      width: 2px;
      height: 28px;
      border-radius: var(--wi-radius-pill);
      background: transparent;
    }
    :host(.horizontal) .line {
      width: 100%;
      height: 1px;
      border-radius: 0;
      background: var(--wi-separator);
    }
    :host(:hover) .line {
      background: var(--wi-line-strong);
    }
    :host(.dragging) .line {
      background: var(--wi-accent);
    }
  `,
})
export class ResizeDividerComponent {
  /** Which side of the divider the column being sized is on. */
  readonly side = input<'leading' | 'trailing'>('leading');

  /** Which axis it sizes: columns by width, blocks by height. */
  readonly orientation = input<'vertical' | 'horizontal'>('vertical');

  /** Pixels the column should grow by; negative to shrink. */
  readonly resize = output<number>();

  /** Double-click restores the ideal width. */
  readonly reset = output<void>();

  protected readonly dragging = signal(false);
  #last = 0;

  protected start(event: PointerEvent): void {
    // Capture keeps the drag alive when the pointer leaves the 6 px strip. A
    // synthetic pointer may not be capturable, and that must not stop the
    // drag: the move handler works without it.
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      // Nothing to do; dragging continues through the host's own events.
    }
    this.#last = this.#axis(event);
    this.dragging.set(true);
    event.preventDefault();
  }

  protected move(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const position = this.#axis(event);
    const movement = position - this.#last;
    this.#last = position;
    // A trailing column grows when the pointer moves left.
    this.resize.emit(this.side() === 'leading' ? movement : -movement);
  }

  #axis(event: PointerEvent): number {
    return this.orientation() === 'horizontal' ? event.clientY : event.clientX;
  }

  protected end(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    this.dragging.set(false);
    try {
      (event.target as Element).releasePointerCapture(event.pointerId);
    } catch {
      // It was never captured.
    }
  }
}
