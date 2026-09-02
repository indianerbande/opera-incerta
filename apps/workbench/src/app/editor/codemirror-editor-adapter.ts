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
import { EditorState, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { history, historyKeymap } from '@codemirror/commands';
import { defaultKeymap } from '@codemirror/commands';
import { redo as cmRedo, undo as cmUndo } from '@codemirror/commands';
import type { Command } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import {
  applyDotCommand,
  displayModel,
  displayToMarkdown,
  headingPrefixRange,
  markdownToDisplay,
  visibleLineStart,
  withHeadingLevel,
  type DisplayModel,
  type EditorAdapter,
  type EditorChangeListener,
  type EditorDocument,
  type HeadingLevel,
  type HeadingMarkerActivation,
  type HeadingMarkerListener,
} from '@opera-incerta/core';

/** Heading sizes. One place, as SPEC.md §8.2 requires of every layout number. */
const editorTheme = EditorView.baseTheme({
  '&': { height: '100%' },
  '.cm-content': { fontFamily: 'Georgia, serif', fontSize: '16px', lineHeight: '1.6' },
  '.cm-heading-1': { fontSize: '2em', fontWeight: '700' },
  '.cm-heading-2': { fontSize: '1.6em', fontWeight: '700' },
  '.cm-heading-3': { fontSize: '1.3em', fontWeight: '600' },
  '.cm-heading-4': { fontSize: '1.15em', fontWeight: '600' },
  '.cm-heading-5': { fontSize: '1em', fontWeight: '600' },
  '.cm-heading-6': { fontSize: '1em', fontWeight: '600', fontStyle: 'italic' },
  '.cm-marker-gutter': {
    minWidth: '32px',
    padding: '0 6px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    color: 'rgba(128, 128, 128, 0.9)',
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
    return displayModel(state.doc.toString(), state.doc.lineAt(state.selection.main.head).number);
  },
});

/**
 * Builds every decoration from the core's display model, so the editor and any
 * other presentation of the same document agree by construction.
 */
function decorationsFor(view: EditorView): DecorationSet {
  const model = view.state.field(displayModelField);

  const decorations = [
    ...model.headings.map((heading) =>
      Decoration.line({ class: `cm-heading-${heading.level}` }).range(heading.from),
    ),
    ...model.hidden.map((range) => Decoration.replace({}).range(range.from, range.to)),
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
 * Set while an adapter builds its extensions, so the gutter's event handler can
 * reach the adapter that owns the view. A gutter extension is created once per
 * state, and CodeMirror hands its handler the view rather than the adapter.
 */
const activationSink = new WeakMap<EditorView, (activation: HeadingMarkerActivation) => void>();

const markerGutter = gutter({
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

      const sink = activationSink.get(view);
      if (sink === undefined) {
        return false;
      }
      const pointer = event as MouseEvent;
      sink({ line: line.number, level: heading.level, x: pointer.clientX, y: pointer.clientY });
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

function extensions(onChange: () => void): readonly Extension[] {
  return [
    displayModelField,
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
    markerGutter,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange();
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
export function createCodeMirrorEditorAdapter(host: HTMLElement): EditorAdapter {
  return new CodeMirrorEditorAdapter(host);
}

class CodeMirrorEditorAdapter implements EditorAdapter {
  readonly #view: EditorView;
  /** One state per document: this is what gives each its own undo history. */
  readonly #states = new Map<string, EditorState>();
  readonly #listeners = new Set<EditorChangeListener>();
  readonly #markerListeners = new Set<HeadingMarkerListener>();
  #openId: string | null = null;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#view = new EditorView({
      state: EditorState.create({ extensions: [...extensions(() => this.#notify())] }),
      parent: host,
    });
    activationSink.set(this.#view, (activation) => this.#activate(activation));
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
        extensions: [...extensions(() => this.#notify())],
      });

    this.#states.set(document_.id, next);
    this.#openId = document_.id;
    this.#view.setState(next);
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

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#listeners.clear();
    this.#markerListeners.clear();
    this.#states.clear();
    this.#openId = null;
    activationSink.delete(this.#view);
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
