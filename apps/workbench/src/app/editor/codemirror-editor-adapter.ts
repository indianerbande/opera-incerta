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
import {
  displayModel,
  displayToMarkdown,
  markdownToDisplay,
  withHeadingLevel,
  type DisplayModel,
  type EditorAdapter,
  type EditorChangeListener,
  type EditorDocument,
  type HeadingLevel,
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

const markerGutter = gutter({
  class: 'cm-marker-gutter',
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

function extensions(onChange: () => void): readonly Extension[] {
  return [
    displayModelField,
    history(),
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
  #openId: string | null = null;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#view = new EditorView({
      state: EditorState.create({ extensions: [...extensions(() => this.#notify())] }),
      parent: host,
    });
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
    if (line < 1 || line > this.#view.state.doc.lines) {
      return;
    }
    const target = this.#view.state.doc.line(line);
    const [current] = markdownToDisplay(target.text);
    if (current === undefined) {
      return;
    }

    const rewritten = displayToMarkdown([withHeadingLevel(current, level)]);
    if (rewritten === target.text) {
      return;
    }
    this.#view.dispatch({
      changes: { from: target.from, to: target.to, insert: rewritten },
    });
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

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#listeners.clear();
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
}
