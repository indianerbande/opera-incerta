/**
 * One contract suite for every editor adapter. TESTING.md §2.6, §2.8;
 * `CONVENTIONS.md` C-T11.
 *
 * Written without a test framework on purpose: the same cases run under Vitest
 * against an in-memory double and inside a real renderer against the
 * CodeMirror implementation. An adapter that passes here behaves the same way
 * from the application's point of view, whatever component sits underneath.
 */
import { markdownToDisplay } from './heading.js';
import type { EditorAdapter, EditorDocument } from './editor-adapter.js';

export interface ContractCase {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

type Create = () => EditorAdapter;

function check(name: string, condition: boolean, detail: string): ContractCase {
  return { name, passed: condition, detail };
}

function documentA(): EditorDocument {
  return { id: 'a', text: ['# Heading', 'A **bold** line.', 'Another line.'].join('\n') };
}

function documentB(): EditorDocument {
  return { id: 'b', text: 'Second document.' };
}

/**
 * Runs the contract. Every case is independent: a failure reports rather than
 * throws, so one broken behavior does not hide the rest.
 */
export function runEditorAdapterContract(create: Create): readonly ContractCase[] {
  const cases: ContractCase[] = [];

  cases.push(caseOpenAndRead(create));
  cases.push(caseFocusedLine(create));
  cases.push(caseRevealLine(create));
  cases.push(caseSetHeadingLevel(create));
  cases.push(caseHeadingDoesNotCarryOver(create));
  cases.push(caseRemoveHeading(create));
  cases.push(caseUndoRedo(create));
  cases.push(casePerDocumentUndo(create));
  cases.push(caseChangeListener(create));
  cases.push(caseUnsubscribe(create));
  cases.push(caseMarkerListenerRegistration(create));
  cases.push(caseDestroyIsIdempotent(create));

  return cases;
}

function withAdapter<T>(create: Create, use: (adapter: EditorAdapter) => T): T {
  const adapter = create();
  try {
    return use(adapter);
  } finally {
    adapter.destroy();
  }
}

function caseOpenAndRead(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    const document_ = documentA();
    adapter.open(document_);
    const text = adapter.text();
    return check(
      'open then read returns the document unchanged',
      text === document_.text && adapter.openDocumentId() === 'a',
      `id=${String(adapter.openDocumentId())} length=${text.length}`,
    );
  });
}

function caseFocusedLine(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    adapter.open(documentA());
    const line = adapter.focusedLine();
    return check(
      'a freshly opened document reports a valid focused line',
      Number.isInteger(line) && line >= 1,
      `focusedLine=${line}`,
    );
  });
}

function caseRevealLine(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    adapter.open(documentA());
    adapter.revealLine(3);
    return check(
      'revealing a line moves the cursor to it',
      adapter.focusedLine() === 3,
      `focusedLine=${adapter.focusedLine()}`,
    );
  });
}

function caseSetHeadingLevel(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    adapter.open(documentA());
    adapter.setHeadingLevel(3, 2);
    const lines = adapter.text().split('\n');
    return check(
      'setting a heading level rewrites exactly that line',
      lines[2] === '## Another line.' && lines[1] === 'A **bold** line.',
      JSON.stringify(lines),
    );
  });
}

function caseHeadingDoesNotCarryOver(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    adapter.open({ id: 'c', text: '# Heading\nplain' });
    adapter.setHeadingLevel(1, 1);
    const lines = adapter.text().split('\n');
    return check(
      'a heading never spreads to the following line',
      lines[1] === 'plain',
      JSON.stringify(lines),
    );
  });
}

function caseRemoveHeading(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    adapter.open(documentA());
    adapter.setHeadingLevel(1, null);
    const first = adapter.text().split('\n')[0] ?? '';
    const level = markdownToDisplay(first)[0]?.level ?? null;
    return check(
      'removing a heading level leaves plain text',
      first === 'Heading' && level === null,
      `first=${JSON.stringify(first)}`,
    );
  });
}

function caseUndoRedo(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    const document_ = documentA();
    adapter.open(document_);
    adapter.setHeadingLevel(2, 3);
    const changed = adapter.text();
    adapter.undo();
    const undone = adapter.text();
    adapter.redo();
    const redone = adapter.text();

    return check(
      'undo reverts an edit and redo restores it',
      changed !== document_.text && undone === document_.text && redone === changed,
      `undone==original:${String(undone === document_.text)} redone==changed:${String(
        redone === changed,
      )}`,
    );
  });
}

function casePerDocumentUndo(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    const a = documentA();
    const b = documentB();

    adapter.open(a);
    adapter.setHeadingLevel(3, 4);
    const editedA = adapter.text();

    adapter.open(b);
    const bText = adapter.text();

    adapter.open(a);
    const backToA = adapter.text();
    adapter.undo();
    const undoneA = adapter.text();

    adapter.open(b);
    const bAfterwards = adapter.text();

    return check(
      'undo history belongs to its document and survives switching',
      backToA === editedA && undoneA === a.text && bAfterwards === bText,
      `backToA==edited:${String(backToA === editedA)} undone==original:${String(
        undoneA === a.text,
      )} b untouched:${String(bAfterwards === bText)}`,
    );
  });
}

function caseChangeListener(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    const seen: string[] = [];
    adapter.onChange((text) => seen.push(text));
    adapter.open(documentA());
    adapter.setHeadingLevel(2, 5);

    return check(
      'a change listener is notified with the current text',
      seen.length > 0 && seen[seen.length - 1] === adapter.text(),
      `notifications=${seen.length}`,
    );
  });
}

function caseUnsubscribe(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    let count = 0;
    const unsubscribe = adapter.onChange(() => {
      count += 1;
    });
    adapter.open(documentA());
    unsubscribe();
    const before = count;
    adapter.setHeadingLevel(2, 6);

    return check(
      'unsubscribing stops the notifications',
      count === before,
      `before=${before} after=${count}`,
    );
  });
}

/**
 * Only registration and unsubscription are contracted here. Whether a click
 * actually produces an activation depends on a real gutter, and is checked by
 * the desktop smoke against the rendered editor.
 */
function caseMarkerListenerRegistration(create: Create): ContractCase {
  return withAdapter(create, (adapter) => {
    adapter.open(documentA());
    let unsubscribeFailed = false;
    try {
      const unsubscribe = adapter.onHeadingMarkerActivate(() => {});
      unsubscribe();
      unsubscribe();
    } catch {
      unsubscribeFailed = true;
    }
    return check(
      'a heading marker listener can be registered and removed',
      !unsubscribeFailed,
      `unsubscribeFailed=${String(unsubscribeFailed)}`,
    );
  });
}

function caseDestroyIsIdempotent(create: Create): ContractCase {
  const adapter = create();
  adapter.open(documentA());
  adapter.destroy();
  let secondFailed = false;
  try {
    adapter.destroy();
  } catch {
    secondFailed = true;
  }
  return check('destroy can be called twice', !secondFailed, `secondFailed=${String(secondFailed)}`);
}
