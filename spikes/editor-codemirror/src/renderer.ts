/**
 * Editor spike, renderer half. TESTING.md §2.8.
 *
 * Disposable: this exists to answer one question — can CodeMirror 6 carry the
 * display model of SPEC.md §10? — and is deleted or promoted once answered.
 * It is deliberately not production architecture (CONVENTIONS.md C-W5).
 *
 * Every criterion is measured in a real rendering engine. A DOM stub reports
 * zero for every height, which would turn criteria 1, 2, and 6 into tests that
 * pass while proving nothing.
 */
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { history, historyKeymap, undo } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import {
  displayToMarkdown,
  markdownToDisplay,
} from '@opera-incerta/core';
import { runEditorAdapterContract } from '@opera-incerta/core/testing';
import { createCodeMirrorEditorAdapter } from '@opera-incerta/workbench/editor';

interface CriterionResult {
  readonly id: number;
  readonly name: string;
  readonly passed: boolean;
  readonly detail: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __spikeResult: { readonly criteria: readonly CriterionResult[] } | undefined;
}

/** Heading level of a line, taken from the project's own display transform. */
function headingLevelOf(lineText: string): number | null {
  const [line] = markdownToDisplay(lineText);
  return line?.level ?? null;
}

// --- heading appearance -------------------------------------------------

const headingTheme = EditorView.baseTheme({
  '&': { fontFamily: 'system-ui, sans-serif', fontSize: '15px' },
  '.cm-content': { lineHeight: '1.5' },
  '.cm-heading-1': { fontSize: '30px', fontWeight: '700' },
  '.cm-heading-2': { fontSize: '24px', fontWeight: '700' },
  '.cm-heading-3': { fontSize: '20px', fontWeight: '600' },
  '.cm-heading-4': { fontSize: '17px', fontWeight: '600' },
  '.cm-heading-5': { fontSize: '15px', fontWeight: '600' },
  '.cm-heading-6': { fontSize: '15px', fontWeight: '600', fontStyle: 'italic' },
});

/** Paragraph-level heading formatting: a class per line, never a character. */
function headingDecorations(view: EditorView): DecorationSet {
  const builder: Array<{ from: number; decoration: Decoration }> = [];
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    const line = view.state.doc.line(number);
    const level = headingLevelOf(line.text);
    if (level !== null) {
      builder.push({
        from: line.from,
        decoration: Decoration.line({ class: `cm-heading-${level}` }),
      });
    }
  }
  return Decoration.set(builder.map(({ from, decoration }) => decoration.range(from)));
}

const headingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = headingDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = headingDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

// --- marker gutter ------------------------------------------------------

class HeadingMarker extends GutterMarker {
  readonly #label: string;
  readonly #lineNumber: number;

  constructor(label: string, lineNumber: number) {
    super();
    this.#label = label;
    this.#lineNumber = lineNumber;
  }

  override toDOM(): Node {
    const element = document.createElement('span');
    element.textContent = this.#label;
    element.dataset['line'] = String(this.#lineNumber);
    element.className = 'cm-heading-marker';
    return element;
  }
}

const markerGutter = gutter({
  class: 'cm-marker-gutter',
  lineMarker(view, block) {
    const line = view.state.doc.lineAt(block.from);
    const level = headingLevelOf(line.text);
    return level === null ? null : new HeadingMarker(`H${level}`, line.number);
  },
  initialSpacer: () => new HeadingMarker('H6', 0),
});

// --- inline markers, hidden except on the cursor's line -----------------

const BOLD = /\*\*([^*]+)\*\*/g;

function inlineDecorations(view: EditorView): DecorationSet {
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const ranges: Array<{ from: number; to: number }> = [];

  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    if (number === cursorLine) {
      continue; // The focused line shows its delimiters, so they stay editable.
    }
    const line = view.state.doc.line(number);
    for (const match of line.text.matchAll(BOLD)) {
      const start = line.from + (match.index ?? 0);
      ranges.push({ from: start, to: start + 2 });
      ranges.push({ from: start + 2 + (match[1] ?? '').length, to: start + match[0].length });
    }
  }

  return Decoration.set(
    ranges.map(({ from, to }) => Decoration.replace({}).range(from, to)),
    true,
  );
}

const inlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = inlineDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = inlineDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

const extensions: readonly Extension[] = [
  history(),
  keymap.of(historyKeymap),
  headingTheme,
  headingPlugin,
  markerGutter,
  inlinePlugin,
  EditorView.lineWrapping,
];

// --- the criteria -------------------------------------------------------

const HEADING_DOCUMENT = [
  '# A first-level heading',
  'An ordinary paragraph line.',
  '## A second-level heading',
  'Another paragraph with **bold text** inside it.',
  '###### A sixth-level heading',
  'A final paragraph.',
].join('\n');

function makeView(doc: string, parent: HTMLElement): EditorView {
  return new EditorView({ state: EditorState.create({ doc, extensions: [...extensions] }), parent });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * A view whose block heights have actually been measured.
 *
 * Until the first measurement lands, CodeMirror reports an estimated height
 * for every line — the same number for all of them. Reading heights before
 * that is the "computed, not measured" mistake the gate exists to catch
 * (CONVENTIONS.md C-U5).
 */
async function settledView(doc: string, parent: HTMLElement): Promise<EditorView> {
  const view = makeView(doc, parent);
  await nextFrame();
  view.requestMeasure();
  await nextFrame();
  return view;
}

async function criterion1(parent: HTMLElement): Promise<CriterionResult> {
  const view = await settledView(HEADING_DOCUMENT, parent);
  const blocks = [1, 2, 3, 5].map((number) => {
    const line = view.state.doc.line(number);
    return { number, height: view.lineBlockAt(line.from).height };
  });

  const h1 = blocks[0]?.height ?? 0;
  const body = blocks[1]?.height ?? 0;
  const h2 = blocks[2]?.height ?? 0;

  let summed = 0;
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    summed += view.lineBlockAt(view.state.doc.line(number).from).height;
  }
  const contentHeight = view.contentHeight;
  const contentStyle = globalThis.getComputedStyle(view.contentDOM);
  const verticalPadding =
    Number.parseFloat(contentStyle.paddingTop) + Number.parseFloat(contentStyle.paddingBottom);
  // The blocks must account for the whole content height once the container's
  // own padding is named. Tolerating an unexplained difference would hide a
  // block model drifting away from the rendered height.
  const heightsAgree = Math.abs(contentHeight - (summed + verticalPadding)) <= 1;

  // Diagnostics: if the heights are uniform, say whether the class reached the
  // DOM or whether the style did not apply.
  const lineElements = [...view.contentDOM.querySelectorAll('.cm-line')];
  const fontSizes = lineElements
    .slice(0, 3)
    .map((element) => globalThis.getComputedStyle(element).fontSize);
  const classes = lineElements.slice(0, 3).map((element) => element.className);

  const passed = h1 > body && h2 > body && h1 > h2 && heightsAgree;
  view.destroy();

  return {
    id: 1,
    name: 'variable heading sizes in one document',
    passed,
    detail: {
      h1Height: h1,
      h2Height: h2,
      bodyHeight: body,
      summed,
      contentHeight,
      verticalPadding,
      fontSizes,
      classes,
    },
  };
}

async function criterion2(parent: HTMLElement): Promise<CriterionResult> {
  // A narrow editor forces the long lines to wrap. Line 2 is a *heading* that
  // wraps: the criterion is about a marker on a wrapped line, so a wrapped
  // line without one would prove nothing.
  parent.style.width = '320px';
  const longHeading = `### ${'A wrapping heading that keeps going '.repeat(4)}`;
  const view = await settledView(
    ['# Heading one', longHeading, 'An ordinary paragraph.'].join('\n'),
    parent,
  );

  const lineElements = [...view.contentDOM.querySelectorAll('.cm-line')];
  const offsets: number[] = [];
  for (const number of [1, 2]) {
    const marker = view.dom.querySelector(`[data-line="${number}"]`);
    const lineElement = lineElements[number - 1];
    if (marker === undefined || marker === null || lineElement === undefined) {
      offsets.push(Number.POSITIVE_INFINITY);
      continue;
    }
    // Rect against rect: no arithmetic, so nothing to get wrong.
    offsets.push(
      Math.abs(marker.getBoundingClientRect().top - lineElement.getBoundingClientRect().top),
    );
  }

  const wrappedLine = view.state.doc.line(2);
  const wrappedBlock = view.lineBlockAt(wrappedLine.from);
  const singleBlock = view.lineBlockAt(view.state.doc.line(1).from);
  const wrappedElement = lineElements[1];
  // A block element reports one rect however often its text wraps. A range
  // over the text reports one rect per visual row, which is the actual
  // question here.
  let visualRows = 0;
  if (wrappedElement !== undefined) {
    const range = document.createRange();
    range.selectNodeContents(wrappedElement);
    visualRows = range.getClientRects().length;
  }

  // The wrapped heading must occupy several visual rows and still carry
  // exactly one marker, sitting at the first of them.
  const didWrap = visualRows > 1 && wrappedBlock.height > singleBlock.height;
  const markersOnWrappedLine = view.dom.querySelectorAll('[data-line="2"]').length;

  const aligned = offsets.every((offset) => offset <= 1);
  const passed = aligned && didWrap && markersOnWrappedLine === 1;
  view.destroy();
  parent.style.width = '';

  return {
    id: 2,
    name: 'gutter aligned to measured line heights, wrapped lines included',
    passed,
    detail: {
      markerOffsets: offsets,
      wrappedBlockHeight: wrappedBlock.height,
      unwrappedBlockHeight: singleBlock.height,
      visualRows,
      markersOnWrappedLine,
    },
  };
}

async function criterion3(parent: HTMLElement): Promise<CriterionResult> {
  const view = await settledView(
    ['Line one with **bold** here.', 'Line two with **more bold** here.'].join('\n'),
    parent,
  );

  // Cursor on line 1: line 1 shows its delimiters, line 2 hides them.
  view.dispatch({ selection: { anchor: 2 } });
  await nextFrame();
  const firstRender = view.contentDOM.textContent ?? '';

  // Move to line 2: the exemption must follow the cursor.
  const secondLine = view.state.doc.line(2);
  view.dispatch({ selection: { anchor: secondLine.from + 2 } });
  await nextFrame();
  const secondRender = view.contentDOM.textContent ?? '';

  const firstOk = firstRender.includes('**bold**') && !firstRender.includes('**more bold**');
  const secondOk = secondRender.includes('**more bold**') && !secondRender.includes('**bold**');
  const documentIntact = view.state.doc.toString().includes('**bold**');

  const passed = firstOk && secondOk && documentIntact;
  view.destroy();

  return {
    id: 3,
    name: 'inline markers hidden except on the cursor line',
    passed,
    detail: { firstRender, secondRender, documentIntact },
  };
}

function criterion4(parent: HTMLElement): CriterionResult {
  const view = makeView('Document A', parent);
  const stateA = view.state;
  const stateB = EditorState.create({ doc: 'Document B', extensions: [...extensions] });

  // Edit A.
  view.dispatch({ changes: { from: view.state.doc.length, insert: ' edited' } });
  const editedA = view.state;

  // Switch to B, edit it, switch back to A.
  view.setState(stateB);
  view.dispatch({ changes: { from: view.state.doc.length, insert: ' also edited' } });
  const editedB = view.state;
  view.setState(editedA);

  // One undo must revert A's edit only.
  undo(view);
  const afterUndoA = view.state.doc.toString();
  view.setState(editedB);
  const bAfterwards = view.state.doc.toString();

  const passed =
    afterUndoA === stateA.doc.toString() && bAfterwards === 'Document B also edited';
  view.destroy();

  return {
    id: 4,
    name: 'per-document undo history survives switching documents',
    passed,
    detail: { afterUndoA, bAfterwards },
  };
}

function criterion5(parent: HTMLElement): CriterionResult {
  const view = makeView('', parent);
  const pasted = '# Pasted heading\r\n\twith a tab\r\nand **bold** text\r\n';

  let usedClipboardEvent = false;
  try {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', pasted);
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true });
    view.contentDOM.dispatchEvent(event);
    usedClipboardEvent = view.state.doc.length > 0;
  } catch {
    usedClipboardEvent = false;
  }

  if (!usedClipboardEvent) {
    view.dispatch({ changes: { from: 0, insert: pasted } });
  }

  const document_ = view.state.doc.toString();
  // CodeMirror normalizes CRLF to the document's line separator, which is the
  // correct behavior for a text editor; the criterion is that no content is
  // lost or reordered and that the display transform round-trips it.
  const normalized = pasted.replace(/\r\n/g, '\n');
  const contentIntact = document_ === normalized;
  const roundTripped = displayToMarkdown(markdownToDisplay(document_)) === document_;

  const passed = contentIntact && roundTripped;
  view.destroy();

  return {
    id: 5,
    name: 'paste arrives intact and round-trips through the display transform',
    passed,
    detail: { usedClipboardEvent, contentIntact, roundTripped, length: document_.length },
  };
}

async function criterion6(parent: HTMLElement): Promise<CriterionResult> {
  const paragraph = 'The harbour was quiet, and the gulls had not yet woken. ';
  const large = `# A large document\n\n${paragraph.repeat(2000)}`;
  const view = await settledView(large, parent);

  const samples: number[] = [];
  const insertAt = Math.floor(large.length / 2);
  for (let index = 0; index < 200; index += 1) {
    const start = performance.now();
    view.dispatch({ changes: { from: insertAt + index, insert: 'x' } });
    // Force layout so the measurement covers what the user actually waits for.
    void view.contentDOM.offsetHeight;
    samples.push(performance.now() - start);
  }

  samples.sort((left, right) => left - right);
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? Number.POSITIVE_INFINITY;
  const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
  const passed = p95 < 16;

  view.destroy();

  return {
    id: 6,
    name: 'typing latency in a document of 100,000+ characters',
    passed,
    detail: {
      documentLength: large.length,
      samples: samples.length,
      medianMs: Number(median.toFixed(3)),
      p95Ms: Number(p95.toFixed(3)),
      thresholdMs: 16,
    },
  };
}

/**
 * The adapter contract, run against the real implementation.
 *
 * The same cases run under Vitest against an in-memory double
 * (`packages/core/test/editor-adapter.test.ts`). An adapter that passes both is
 * a boundary rather than a description of one component
 * (`CONVENTIONS.md` C-T11).
 */
function criterion7(parent: HTMLElement): CriterionResult {
  const host = document.createElement('div');
  parent.append(host);

  const cases = runEditorAdapterContract(() => createCodeMirrorEditorAdapter(host));
  const failures = cases.filter((contractCase) => !contractCase.passed);
  host.remove();

  return {
    id: 7,
    name: 'the CodeMirror adapter satisfies the editor contract',
    passed: failures.length === 0 && cases.length > 0,
    detail: {
      cases: cases.length,
      failures: failures.map((contractCase) => `${contractCase.name} — ${contractCase.detail}`),
    },
  };
}

async function run(): Promise<void> {
  const parent = document.getElementById('editor');
  if (parent === null) {
    globalThis.__spikeResult = { criteria: [] };
    return;
  }

  const criteria = [
    await criterion1(parent),
    await criterion2(parent),
    await criterion3(parent),
    criterion4(parent),
    criterion5(parent),
    await criterion6(parent),
    criterion7(parent),
  ];
  globalThis.__spikeResult = { criteria };
}

void run();
