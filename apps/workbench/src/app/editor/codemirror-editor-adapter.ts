/**
 * The CodeMirror 6 implementation of the editor boundary. SPEC.md §5.4, §10.
 *
 * Everything this file decides is presentation. What counts as a heading,
 * which characters are delimiters, and what a level change does to a line are
 * all answered by `@opera-incerta/core`; this translates those answers into
 * CodeMirror decorations and transactions.
 *
 * The component was accepted after the spike in `spikes/editor-codemirror`,
 * whose measurements are recorded in `TESTING.md` §2.8.
 */
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo as cmRedo,
  undo as cmUndo,
} from '@codemirror/commands';
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension,
  type StateEffect,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  keymap,
  lineNumbers,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { parseBlocks } from '@opera-incerta/markdown';
import {
  applyDotCommand,
  displayModel,
  displayToMarkdown,
  headingPrefixRange,
  DEFAULT_EDITOR_TYPOGRAPHY,
  DEFAULT_EDITOR_ZOOM,
  EDITOR_FONT_STACKS,
  editorZoomFactor,
  HEADING_SCALE,
  markdownToDisplay,
  presentation,
  visibleLineStart,
  type BlockModel,
  type Glyph,
  type Presentation,
  withHeadingLevel,
  type DisplayModel,
  type EditorAdapter,
  type EditorChangeListener,
  type EditorCursor,
  type EditorCursorListener,
  type EditorDocument,
  type EditorTypography,
  type HeadingLevel,
  type HeadingMarkerActivation,
  type HeadingMarkerListener,
} from '@opera-incerta/core';

/** The gutters' own size, before the zoom of SPEC.md §10.9 scales it. */
const GUTTER_FONT_SIZE = 11;

/**
 * The fixed part of the theme. Heading sizes are the core's ratios in `em`,
 * so the base size set by the author scales the whole hierarchy
 * (SPEC.md §13); the base itself is the typography compartment's.
 */
const editorTheme = EditorView.baseTheme({
  // The manuscript sits on a panel, in the system's ink (SPEC.md §8.8); the
  // caret, the selection and the gutters follow it, or a dark scheme would
  // leave CodeMirror's own light defaults behind.
  '&': { height: '100%', background: 'var(--wi-panel)', color: 'var(--wi-ink)' },
  '.cm-content': { lineHeight: '1.6', caretColor: 'var(--wi-ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--wi-ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    background: 'var(--wi-accent-soft)',
  },
  '.cm-gutters': {
    background: 'var(--wi-panel)',
    color: 'var(--wi-muted)',
    border: '0',
  },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'transparent' },
  '.cm-heading-1': { fontSize: `${HEADING_SCALE[1]}em`, fontWeight: '700' },
  '.cm-heading-2': { fontSize: `${HEADING_SCALE[2]}em`, fontWeight: '700' },
  '.cm-heading-3': { fontSize: `${HEADING_SCALE[3]}em`, fontWeight: '600' },
  '.cm-heading-4': { fontSize: `${HEADING_SCALE[4]}em`, fontWeight: '600' },
  '.cm-heading-5': { fontSize: `${HEADING_SCALE[5]}em`, fontWeight: '600' },
  '.cm-heading-6': { fontSize: `${HEADING_SCALE[6]}em`, fontWeight: '600', fontStyle: 'italic' },
  // GFM display (SPEC.md §10.7): the effect, where the markers were.
  '.cm-inline-bold': { fontWeight: '700' },
  '.cm-inline-italic': { fontStyle: 'italic' },
  '.cm-inline-boldItalic': { fontWeight: '700', fontStyle: 'italic' },
  '.cm-inline-strikethrough': { textDecoration: 'line-through' },
  '.cm-inline-code': {
    fontFamily: 'var(--wi-mono)',
    fontSize: '0.9em',
    background: 'var(--wi-row-hover)',
    borderRadius: '3px',
    padding: '0 3px',
  },
  '.cm-code-block': {
    fontFamily: 'var(--wi-mono)',
    fontSize: '0.9em',
    background: 'var(--wi-row-hover)',
  },
  '.cm-quote': { color: 'var(--wi-muted)', borderLeft: '3px solid var(--wi-line-strong)' },
  '.cm-quote-1': { paddingLeft: '10px' },
  '.cm-quote-2': { paddingLeft: '10px', boxShadow: 'inset 14px 0 0 -11px var(--wi-line-strong)' },
  '.cm-quote-3': { paddingLeft: '10px', boxShadow: 'inset 14px 0 0 -11px var(--wi-line-strong), inset 28px 0 0 -25px var(--wi-line-strong)' },
  '.cm-quote-4': { paddingLeft: '10px', boxShadow: 'inset 14px 0 0 -11px var(--wi-line-strong), inset 28px 0 0 -25px var(--wi-line-strong), inset 42px 0 0 -39px var(--wi-line-strong)' },
  '.cm-list-item-0': { paddingLeft: '1.4em', textIndent: '-1.4em' },
  '.cm-list-item-1': { paddingLeft: '2.8em', textIndent: '-1.4em' },
  '.cm-list-item-2': { paddingLeft: '4.2em', textIndent: '-1.4em' },
  '.cm-list-item-3': { paddingLeft: '5.6em', textIndent: '-1.4em' },
  '.cm-list-item-4': { paddingLeft: '7em', textIndent: '-1.4em' },
  '.cm-thematic-break': { padding: '6px 0' },
  '.cm-glyph': { color: 'var(--wi-muted)' },
  '.cm-glyph-bullet': { display: 'inline-block', width: '1.4em', textIndent: '0' },
  '.cm-glyph-checked, .cm-glyph-unchecked': { marginRight: '0.4em' },
  '.cm-glyph-rule': {
    display: 'inline-block',
    width: '100%',
    height: '0',
    borderTop: '1px solid var(--wi-line-strong)',
    verticalAlign: 'middle',
  },
  '.cm-glyph-break': { fontSize: '0.8em', opacity: '0.7' },
  '.cm-marker-gutter': {
    minWidth: '32px',
    padding: '0 6px',
    fontFamily: 'var(--wi-sans)',
    fontSize: `${GUTTER_FONT_SIZE}px`,
    color: 'var(--wi-muted)',
  },
  // The line numbers of SPEC.md §10.8. Right-aligned, so the digits line up
  // and a document passing 99 lines does not shift its text.
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 3px 0 8px',
    fontFamily: 'var(--wi-sans)',
    fontSize: `${GUTTER_FONT_SIZE}px`,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--wi-muted)',
  },
});

/** The label shown beside a heading line. SPEC.md §10.2. */
class HeadingGutterMarker extends GutterMarker {
  readonly #level: HeadingLevel;
  readonly #line: number;

  constructor(level: HeadingLevel, line: number) {
    super();
    this.#level = level;
    this.#line = line;
  }

  override toDOM(): Node {
    const element = document.createElement('span');
    element.textContent = `H${this.#level}`;
    element.dataset['line'] = String(this.#line);
    element.className = 'cm-heading-marker';
    return element;
  }
}

/**
 * The display model of the current document, computed once per change.
 *
 * Decorations and the gutter both read it, which is not merely an
 * optimization: a gutter that parsed each line on its own would label a `#`
 * inside a fenced code block as a heading, because that judgement needs the
 * whole document. It did exactly that until the visual check caught it.
 */
const displayModelField = StateField.define<DisplayModel>({
  create(state) {
    return displayModel(state.doc.toString(), state.doc.lineAt(state.selection.main.head).number);
  },
  update(value, transaction) {
    if (!transaction.docChanged && transaction.selection === undefined) {
      return value;
    }
    const { state } = transaction;
    const cursorLine = state.doc.lineAt(state.selection.main.head).number;
    // The model depends on the text and on which line holds the cursor. A
    // selection change that stays on its line — most of them — changes
    // neither, and re-parsing the whole document for it was the cost of
    // every arrow key.
    if (!transaction.docChanged) {
      const before = transaction.startState;
      if (before.doc.lineAt(before.selection.main.head).number === cursorLine) {
        return value;
      }
    }
    return displayModel(state.doc.toString(), cursorLine);
  },
});

/**
 * The block structure, read by the parser once per change. Selection moves
 * do not touch it: the structure is the text's, not the cursor's.
 */
const blockModelField = StateField.define<BlockModel>({
  create(state) {
    return parseBlocks(state.doc.toString());
  },
  update(value, transaction) {
    return transaction.docChanged ? parseBlocks(transaction.state.doc.toString()) : value;
  },
});

/**
 * The presentation of SPEC.md §10.7, from both models and the cursor's line.
 * Recomputed with the display model's rhythm: on a change, and on a move
 * that crosses a line.
 */
const presentationField = StateField.define<Presentation>({
  create(state) {
    return presentationOf(state);
  },
  update(value, transaction) {
    if (!transaction.docChanged && transaction.selection === undefined) {
      return value;
    }
    const { state } = transaction;
    if (!transaction.docChanged) {
      const before = transaction.startState;
      if (
        before.doc.lineAt(before.selection.main.head).number ===
        state.doc.lineAt(state.selection.main.head).number
      ) {
        return value;
      }
    }
    return presentationOf(state);
  },
});

function presentationOf(state: EditorState): Presentation {
  return presentation(
    state.doc.toString(),
    state.field(displayModelField),
    state.field(blockModelField),
    state.doc.lineAt(state.selection.main.head).number,
  );
}

/** A glyph that stands in for hidden markup: a bullet, a box, a rule, a return. */
class GlyphWidget extends WidgetType {
  readonly #glyph: Glyph;

  constructor(glyph: Glyph) {
    super();
    this.#glyph = glyph;
  }

  override eq(other: GlyphWidget): boolean {
    return other.#glyph === this.#glyph;
  }

  override toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = `cm-glyph cm-glyph-${this.#glyph}`;
    element.setAttribute('aria-hidden', 'true');
    element.textContent = GLYPH_TEXT[this.#glyph];
    return element;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const GLYPH_TEXT: Readonly<Record<Glyph, string>> = {
  bullet: '•',
  checked: '☑',
  unchecked: '☐',
  rule: '',
  break: '↵',
};

function lineClass(style: Presentation['lines'][number]['style']): string {
  switch (style.kind) {
    case 'blockquote':
      return `cm-quote cm-quote-${Math.min(style.depth, 4)}`;
    case 'listItem':
      return `cm-list-item cm-list-item-${Math.min(style.depth, 4)}${style.ordered ? ' cm-list-ordered' : ''}`;
    case 'codeBlock':
      return 'cm-code-block';
    case 'thematicBreak':
      return 'cm-thematic-break';
  }
}

/**
 * Builds every decoration from the core's models, so the editor and any
 * other presentation of the same document agree by construction: the
 * display model's headings and hidden delimiters, and the presentation's
 * line styles, replacements, and marks, each drawn one-to-one.
 */
function decorationsFor(view: EditorView): DecorationSet {
  const model = view.state.field(displayModelField);
  const shown = view.state.field(presentationField);
  const doc = view.state.doc;

  const decorations = [
    ...model.headings.map((heading) =>
      Decoration.line({ class: `cm-heading-${heading.level}` }).range(heading.from),
    ),
    ...model.hidden.map((range) => Decoration.replace({}).range(range.from, range.to)),
    ...shown.lines.map((instruction) =>
      Decoration.line({ class: lineClass(instruction.style) }).range(doc.line(instruction.line).from),
    ),
    ...shown.replacements.map((range) =>
      (range.glyph === null
        ? Decoration.replace({})
        : Decoration.replace({ widget: new GlyphWidget(range.glyph) })
      ).range(range.from, range.to),
    ),
    ...shown.marks.map((mark) =>
      Decoration.mark({ class: `cm-inline cm-inline-${mark.kind}` }).range(mark.from, mark.to),
    ),
  ];

  // The `true` asks CodeMirror to sort, which it does by position and then by
  // the decorations' own side ordering — the part that gets a line decoration
  // and a replacement at the same offset into the right order.
  return Decoration.set(decorations, true);
}

const displayPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorationsFor(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = decorationsFor(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * The gutter with the heading labels, and the menu they open. SPEC.md §10.2.
 *
 * Built per adapter, like the change listener: the click handler needs the
 * adapter that owns the view, and a closure is how a per-state extension
 * reaches it. (A module-level map from view to adapter did the same job with
 * bookkeeping on both ends.)
 */
function markerGutter(onActivate: (activation: HeadingMarkerActivation) => void): Extension {
  return gutter({
    class: 'cm-marker-gutter',
    domEventHandlers: {
      mousedown(view, block, event) {
        const line = view.state.doc.lineAt(block.from);
        const heading = view.state
          .field(displayModelField)
          .headings.find((candidate) => candidate.line === line.number);
        // A line without a level has no marker, and no menu (SPEC.md §10.2).
        if (heading === undefined) {
          return false;
        }

        const pointer = event as MouseEvent;
        onActivate({
          line: line.number,
          level: heading.level,
          x: pointer.clientX,
          y: pointer.clientY,
        });
        return true;
      },
    },
    lineMarker(view, block) {
      const line = view.state.doc.lineAt(block.from);
      const heading = view.state
        .field(displayModelField)
        .headings.find((candidate) => candidate.line === line.number);
      return heading === undefined ? null : new HeadingGutterMarker(heading.level, line.number);
    },
    lineMarkerChange(update) {
      return update.docChanged;
    },
    initialSpacer: () => new HeadingGutterMarker(6, 0),
  });
}

/**
 * Turns a typed dot command into a heading level. SPEC.md §10.2.
 *
 * A transaction filter rather than a listener, so the conversion is part of
 * the same transaction as the keystroke: one undo takes back the whole thing,
 * and no intermediate state is ever rendered.
 *
 * It reacts to typing only. A file containing a line that begins with `.h1`
 * must open unchanged — converting it would mean that opening a document
 * rewrites it.
 */
const dotCommandFilter = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged || !transaction.isUserEvent('input.type')) {
    return transaction;
  }

  const state = transaction.state;
  const line = state.doc.lineAt(state.selection.main.head);

  // Whether this line is inside a fenced code block is a question about the
  // whole document, not about the line — asking the line alone turned a `.h3`
  // inside a fence into a heading, which the smoke caught.
  if (state.field(displayModelField).verbatimLines.has(line.number)) {
    return transaction;
  }

  const [display] = markdownToDisplay(line.text);
  if (display === undefined) {
    return transaction;
  }

  const converted = applyDotCommand(display);
  if (converted === null) {
    return transaction;
  }

  const rewritten = displayToMarkdown([converted]);
  return [
    transaction,
    {
      changes: { from: line.from, to: line.to, insert: rewritten },
      selection: { anchor: line.from + rewritten.length },
      sequential: true,
    },
  ];
});

/**
 * Heading syntax is one unit for the cursor. SPEC.md §10.2.
 *
 * Without this the caret can sit between `##` and its space — invisible, and
 * whatever is typed next lands where the author cannot see it. It is not only
 * a backspace concern: arrow keys, `Home`, shift-selection, and a click just
 * left of the first letter all end up there.
 */
const atomicHeadingSyntax = EditorView.atomicRanges.of((view) => {
  const builder = new RangeSetBuilder();
  for (const range of view.state.field(displayModelField).hidden) {
    if (range.kind === 'heading') {
      builder.add(range.from, range.to, Decoration.mark({}));
    }
  }
  return builder.finish();
});

/** The visible start of the line holding the cursor. */
function visibleStartOfCursorLine(view: EditorView): { line: number; start: number } {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const model = view.state.field(displayModelField);
  return { line: line.number, start: visibleLineStart(model, line.from) };
}

/**
 * Backspace at the visible start of a heading removes the level rather than
 * deleting hidden characters.
 *
 * The word-processor behavior: the first press takes off the paragraph
 * formatting, a second merges with the line above. Deleting the prefix
 * character by character would otherwise leave `##Chapter`, which is no longer
 * a heading to any Markdown reader — a state produced by a keystroke whose
 * target the author could not see.
 *
 * It runs the same operation as the gutter menu, so both gestures undo as one
 * thing.
 */
const removeHeadingOnBackspace: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const { line, start } = visibleStartOfCursorLine(view);
  if (selection.head !== start) {
    return false;
  }

  const heading = view.state
    .field(displayModelField)
    .headings.find((candidate) => candidate.line === line);
  if (heading === undefined) {
    return false;
  }

  applyHeadingLevel(view, line, null);
  return true;
};

/** `Home` goes to the first character the author can see. */
const cursorToVisibleLineStart: Command = (view) => {
  const { start } = visibleStartOfCursorLine(view);
  if (view.state.selection.main.head === start) {
    return false;
  }
  view.dispatch({ selection: { anchor: start }, scrollIntoView: true });
  return true;
};

/** `Shift-Home` selects to the first visible character. */
const selectToVisibleLineStart: Command = (view) => {
  const { start } = visibleStartOfCursorLine(view);
  view.dispatch({
    selection: { anchor: view.state.selection.main.anchor, head: start },
    scrollIntoView: true,
  });
  return true;
};

/**
 * Copying a heading yields Markdown.
 *
 * The atomic range keeps a selection from starting inside the prefix, which
 * also means it starts *after* it — so a copied heading would arrive as bare
 * text and lose its level when pasted into any other Markdown tool. The prefix
 * is put back here.
 */
const clipboardKeepsMarkdown = EditorView.clipboardOutputFilter.of((text, state) => {
  const selection = state.selection.main;
  if (selection.empty) {
    return text;
  }

  const line = state.doc.lineAt(selection.from);
  const model = displayModel(state.doc.toString(), null);
  if (selection.from !== visibleLineStart(model, line.from)) {
    return text;
  }

  const prefix = headingPrefixRange(model, line.from);
  return prefix === null ? text : state.doc.sliceString(prefix.from, prefix.to) + text;
});

/**
 * Cutting a heading takes its prefix with it. SPEC.md §10.2.
 *
 * The clipboard already receives Markdown, so without this the two halves of
 * one gesture disagree: the text arrives elsewhere as a heading while an empty
 * `##### ` stays behind.
 *
 * Deliberately limited to cutting. Deleting a selection inside a heading
 * leaves the level alone, because the intent differs: cut means "this moves
 * elsewhere", so the formatting travels with it, while delete means "this text
 * goes", and an author clearing a title to retype it wants the heading to
 * survive. Backspace at the visible start remains the deliberate way to remove
 * a level.
 */
const cutTakesHeadingPrefix = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged || !transaction.isUserEvent('delete.cut')) {
    return transaction;
  }

  const before = transaction.startState;
  const selection = before.selection.main;
  if (selection.empty) {
    return transaction;
  }

  const line = before.doc.lineAt(selection.from);
  const model = before.field(displayModelField);
  if (selection.from !== visibleLineStart(model, line.from)) {
    return transaction;
  }

  const prefix = headingPrefixRange(model, line.from);
  if (prefix === null) {
    return transaction;
  }

  // Sequential: the prefix sits before the removed range, so its offsets are
  // unchanged by the cut itself.
  return [transaction, { changes: { from: prefix.from, to: prefix.to }, sequential: true }];
});

function extensions(
  onChange: () => void,
  onActivate: (activation: HeadingMarkerActivation) => void,
  onCursor: () => void,
): readonly Extension[] {
  return [
    displayModelField,
    blockModelField,
    presentationField,
    dotCommandFilter,
    atomicHeadingSyntax,
    clipboardKeepsMarkdown,
    cutTakesHeadingPrefix,
    history(),
    // Before the defaults, so these three win where they apply and fall
    // through to normal editing everywhere else.
    keymap.of([
      { key: 'Backspace', run: removeHeadingOnBackspace },
      { key: 'Home', run: cursorToVisibleLineStart },
      { key: 'Mod-ArrowLeft', run: cursorToVisibleLineStart },
      { key: 'Shift-Home', run: selectToVisibleLineStart },
    ]),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    editorTheme,
    displayPlugin,
    markerGutter(onActivate),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange();
      }
      if (update.docChanged || update.selectionSet) {
        onCursor();
      }
    }),
  ];
}

/**
 * Rewrites one line's heading level through the core's rule, so the editor and
 * the file agree about what a level change means. Shared by the gutter menu,
 * the adapter's method, and the backspace command.
 */
function applyHeadingLevel(view: EditorView, line: number, level: HeadingLevel | null): void {
  if (line < 1 || line > view.state.doc.lines) {
    return;
  }
  const target = view.state.doc.line(line);
  const [current] = markdownToDisplay(target.text);
  if (current === undefined) {
    return;
  }

  const rewritten = displayToMarkdown([withHeadingLevel(current, level)]);
  if (rewritten === target.text) {
    return;
  }
  view.dispatch({
    changes: { from: target.from, to: target.to, insert: rewritten },
    selection: { anchor: target.from + rewritten.length },
  });
}

/**
 * Creates an adapter bound to a host element.
 *
 * The host is taken here rather than passed through the interface, which is
 * what keeps the interface free of DOM types and lets the contract suite run
 * against a double.
 */
export function createCodeMirrorEditorAdapter(
  host: HTMLElement,
  typography: EditorTypography = DEFAULT_EDITOR_TYPOGRAPHY,
  zoom: number = DEFAULT_EDITOR_ZOOM,
): EditorAdapter & TypographyAware {
  return new CodeMirrorEditorAdapter(host, typography, zoom);
}

/**
 * What the adapter shows text in. Not part of the core's `EditorAdapter`,
 * which speaks of text, lines, and heading levels only: this is the
 * component's own concern, and the shell reaches it through this face.
 *
 * Two calls, because they are two concepts: what the author **configured**
 * (§13) and how far the view is **zoomed** (§10.9). The zoom never changes
 * the configured size — it multiplies it on the way to the screen.
 */
export interface TypographyAware {
  setTypography(typography: EditorTypography): void;
  setZoom(zoom: number): void;
}

/**
 * The line-number gutter, or nothing. SPEC.md §10.8.
 *
 * CodeMirror's own: it draws one number per **logical** line at that line's
 * first visual line, and takes each line's height from the layout rather than
 * from a computed line height — which is what the specification asks for and
 * what a gutter of our own would have had to reimplement.
 */
function lineNumberGutter(typography: EditorTypography): Extension {
  return typography.lineNumbers ? lineNumbers() : [];
}

/**
 * The theme for a typography and a zoom: what the author set, times how far
 * the view is zoomed (SPEC.md §13, §10.9).
 *
 * The gutters are in here too, because §10.9 scales the editor's text **and
 * its gutters**: a marker or a line number left at eleven pixels beside
 * doubled text is a column that no longer belongs to its lines. The heading
 * ratios need nothing: they are `em` on the scaled base.
 */
function typographyTheme(typography: EditorTypography, zoom: number): Extension {
  const factor = editorZoomFactor(zoom);
  const gutterSize = `${GUTTER_FONT_SIZE * factor}px`;
  return EditorView.theme({
    '.cm-content': {
      fontFamily: EDITOR_FONT_STACKS[typography.fontFamily],
      fontSize: `${typography.fontSize * factor}px`,
    },
    '.cm-marker-gutter': { fontSize: gutterSize },
    '.cm-lineNumbers .cm-gutterElement': { fontSize: gutterSize },
  });
}

class CodeMirrorEditorAdapter implements EditorAdapter, TypographyAware {
  readonly #view: EditorView;
  /** Reconfigured in place: the document, its history, and its cursor stay. */
  readonly #typography = new Compartment();
  readonly #wrapping = new Compartment();
  readonly #lineNumbers = new Compartment();
  #currentTypography: EditorTypography;
  #currentZoom: number;
  /** One state per document: this is what gives each its own undo history. */
  readonly #states = new Map<string, EditorState>();
  readonly #listeners = new Set<EditorChangeListener>();
  readonly #cursorListeners = new Set<EditorCursorListener>();
  readonly #markerListeners = new Set<HeadingMarkerListener>();
  #openId: string | null = null;
  #destroyed = false;

  constructor(host: HTMLElement, typography: EditorTypography, zoom: number) {
    this.#currentTypography = typography;
    this.#currentZoom = zoom;
    this.#view = new EditorView({
      state: EditorState.create({ extensions: [...this.#extensions()] }),
      parent: host,
    });
  }

  #extensions(): readonly Extension[] {
    return [
      // First, because gutters appear in the order their extensions do, and
      // the numbers belong left of the marker gutter (SPEC.md §10.8).
      this.#lineNumbers.of(lineNumberGutter(this.#currentTypography)),
      ...extensions(
        () => this.#notify(),
        (activation) => this.#activate(activation),
        () => this.#notifyCursor(),
      ),
      this.#typography.of(typographyTheme(this.#currentTypography, this.#currentZoom)),
      this.#wrapping.of(this.#currentTypography.wordWrap ? EditorView.lineWrapping : []),
    ];
  }

  setTypography(typography: EditorTypography): void {
    this.#currentTypography = typography;
    this.#reapply();
  }

  /** The zoom of SPEC.md §10.9. The configured size is untouched by it. */
  setZoom(zoom: number): void {
    this.#currentZoom = zoom;
    this.#reapply();
  }

  /** Applies the current typography and zoom to every state this adapter holds. */
  #reapply(): void {
    if (this.#destroyed) {
      return;
    }
    // Every kept state carries its own compartments; the visible one is
    // reconfigured now, the others when they are shown again.
    this.#view.dispatch({ effects: this.#reconfigured() });
    for (const [id, state] of this.#states) {
      if (id !== this.#openId) {
        this.#states.set(id, state.update({ effects: this.#reconfigured() }).state);
      }
    }
  }

  /**
   * What every kept state is reconfigured with when the settings or the zoom
   * change. One list, because three compartments in two places had already
   * grown apart by one entry once.
   */
  #reconfigured(): readonly StateEffect<unknown>[] {
    const typography = this.#currentTypography;
    return [
      this.#typography.reconfigure(typographyTheme(typography, this.#currentZoom)),
      this.#wrapping.reconfigure(typography.wordWrap ? EditorView.lineWrapping : []),
      this.#lineNumbers.reconfigure(lineNumberGutter(typography)),
    ];
  }

  open(document_: EditorDocument): void {
    if (this.#destroyed) {
      return;
    }
    this.#rememberCurrent();

    const existing = this.#states.get(document_.id);
    const next =
      existing ??
      EditorState.create({
        doc: document_.text,
        extensions: [...this.#extensions()],
      });

    this.#states.set(document_.id, next);
    this.#openId = document_.id;
    this.#view.setState(next);
    // setState is not an update the listener sees; the move it makes is.
    this.#notifyCursor();
  }

  replace(text: string): void {
    if (this.#destroyed) {
      return;
    }
    this.#view.dispatch({
      changes: { from: 0, to: this.#view.state.doc.length, insert: text },
    });
  }

  openDocumentId(): string | null {
    return this.#openId;
  }

  text(): string {
    return this.#view.state.doc.toString();
  }

  focusedLine(): number {
    return this.#view.state.doc.lineAt(this.#view.state.selection.main.head).number;
  }

  /**
   * The column counts from the visible start of the line: a heading's hidden
   * prefix is not where the author is (SPEC.md §10.5).
   */
  cursor(): EditorCursor {
    const state = this.#view.state;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const model = displayModel(state.doc.toString(), line.number);
    const start = visibleLineStart(model, line.from);
    return { line: line.number, column: Math.max(1, head - start + 1) };
  }

  onCursorChange(listener: EditorCursorListener): () => void {
    this.#cursorListeners.add(listener);
    return () => {
      this.#cursorListeners.delete(listener);
    };
  }

  #notifyCursor(): void {
    if (this.#destroyed) {
      return;
    }
    const cursor = this.cursor();
    for (const listener of this.#cursorListeners) {
      listener(cursor);
    }
  }

  revealLine(line: number): void {
    const clamped = Math.min(Math.max(1, line), this.#view.state.doc.lines);
    const target = this.#view.state.doc.line(clamped);
    this.#view.dispatch({
      selection: { anchor: target.from },
      scrollIntoView: true,
    });
  }

  /**
   * Rewrites one line's heading level through the core's rule, so the editor
   * and the file agree about what a level change means.
   */
  setHeadingLevel(line: number, level: HeadingLevel | null): void {
    applyHeadingLevel(this.#view, line, level);
  }

  undo(): void {
    cmUndo(this.#view);
  }

  redo(): void {
    cmRedo(this.#view);
  }

  onChange(listener: EditorChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  onHeadingMarkerActivate(listener: HeadingMarkerListener): () => void {
    this.#markerListeners.add(listener);
    return () => {
      this.#markerListeners.delete(listener);
    };
  }

  forget(documentId: string): void {
    // The open document's state lives in the view until the next open; what
    // is dropped here is the remembered copy, so it is not put back then.
    this.#states.delete(documentId);
    if (this.#openId === documentId) {
      this.#openId = null;
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#listeners.clear();
    this.#markerListeners.clear();
    this.#states.clear();
    this.#openId = null;
    this.#view.destroy();
  }

  /** Keeps the outgoing document's history, cursor, and scroll position. */
  #rememberCurrent(): void {
    if (this.#openId !== null) {
      this.#states.set(this.#openId, this.#view.state);
    }
  }

  #notify(): void {
    const text = this.text();
    for (const listener of this.#listeners) {
      listener(text);
    }
  }

  #activate(activation: HeadingMarkerActivation): void {
    for (const listener of this.#markerListeners) {
      listener(activation);
    }
  }
}
