import { describe, expect, it } from 'vitest';
import {
  displayToMarkdown,
  markdownToDisplay,
  withHeadingLevel,
  type EditorAdapter,
  type EditorChangeListener,
  type EditorDocument,
  type HeadingLevel,
  type HeadingMarkerActivation,
  type HeadingMarkerListener,
} from '../src/index.js';
import { runEditorAdapterContract } from '../src/testing/index.js';

/**
 * An in-memory adapter: the contract with no component underneath.
 *
 * It exists so the suite has a second implementation to run against. If a case
 * can only be satisfied by CodeMirror, the contract is describing a component
 * rather than a boundary, and this double is what makes that visible.
 */
class FakeEditorAdapter implements EditorAdapter {
  #documents = new Map<string, { text: string; undo: string[]; redo: string[]; line: number }>();
  #openId: string | null = null;
  #listeners = new Set<EditorChangeListener>();
  #markerListeners = new Set<HeadingMarkerListener>();
  #destroyed = false;

  open(document_: EditorDocument): void {
    if (!this.#documents.has(document_.id)) {
      this.#documents.set(document_.id, {
        text: document_.text,
        undo: [],
        redo: [],
        line: 1,
      });
    }
    this.#openId = document_.id;
  }

  openDocumentId(): string | null {
    return this.#openId;
  }

  replace(text: string): void {
    const state = this.#current();
    if (state !== undefined) {
      state.undo.push(state.text);
      state.text = text;
      this.#notify();
    }
  }

  text(): string {
    return this.#current()?.text ?? '';
  }

  focusedLine(): number {
    return this.#current()?.line ?? 1;
  }

  revealLine(line: number): void {
    const state = this.#current();
    if (state !== undefined) {
      state.line = line;
    }
  }

  setHeadingLevel(line: number, level: HeadingLevel | null): void {
    const state = this.#current();
    if (state === undefined) {
      return;
    }
    const lines = [...markdownToDisplay(state.text)];
    const target = lines[line - 1];
    if (target === undefined) {
      return;
    }
    lines[line - 1] = withHeadingLevel(target, level);
    this.#commit(state, displayToMarkdown(lines));
  }

  undo(): void {
    const state = this.#current();
    const previous = state?.undo.pop();
    if (state === undefined || previous === undefined) {
      return;
    }
    state.redo.push(state.text);
    state.text = previous;
    this.#notify();
  }

  redo(): void {
    const state = this.#current();
    const next = state?.redo.pop();
    if (state === undefined || next === undefined) {
      return;
    }
    state.undo.push(state.text);
    state.text = next;
    this.#notify();
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
    this.#documents.delete(documentId);
    if (this.#openId === documentId) {
      this.#openId = null;
    }
  }

  /** Test seam: the double has no gutter, so activation is triggered by hand. */
  activateMarker(activation: HeadingMarkerActivation): void {
    for (const listener of this.#markerListeners) {
      listener(activation);
    }
  }

  destroy(): void {
    this.#destroyed = true;
    this.#listeners.clear();
    this.#markerListeners.clear();
    this.#documents.clear();
    this.#openId = null;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  #current() {
    return this.#openId === null ? undefined : this.#documents.get(this.#openId);
  }

  #commit(state: { text: string; undo: string[]; redo: string[] }, next: string): void {
    state.undo.push(state.text);
    state.redo.length = 0;
    state.text = next;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener(this.text());
    }
  }
}

describe('editor adapter contract, against the in-memory double', () => {
  const cases = runEditorAdapterContract(() => new FakeEditorAdapter());

  it('covers every behavior the application depends on', () => {
    expect(cases.length).toBeGreaterThanOrEqual(11);
  });

  for (const contractCase of cases) {
    it(contractCase.name, () => {
      expect(contractCase.passed, contractCase.detail).toBe(true);
    });
  }
});

describe('heading marker activation, on the double', () => {
  it('delivers an activation to its listener and stops after unsubscribing', () => {
    const adapter = new FakeEditorAdapter();
    const seen: HeadingMarkerActivation[] = [];
    const unsubscribe = adapter.onHeadingMarkerActivate((activation) => seen.push(activation));

    adapter.activateMarker({ line: 2, level: 3, x: 10, y: 20 });
    unsubscribe();
    adapter.activateMarker({ line: 4, level: 1, x: 0, y: 0 });

    expect(seen).toEqual([{ line: 2, level: 3, x: 10, y: 20 }]);
  });
});

describe('the contract itself', () => {
  it('fails when an adapter misbehaves, rather than passing anything', () => {
    class Broken extends FakeEditorAdapter {
      override setHeadingLevel(): void {
        // Silently does nothing — the defect the contract must catch.
      }
    }

    const failures = runEditorAdapterContract(() => new Broken()).filter(
      (contractCase) => !contractCase.passed,
    );
    expect(failures.length).toBeGreaterThan(0);
  });
});
