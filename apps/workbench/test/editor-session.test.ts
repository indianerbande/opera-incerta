import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { EditorSession } from '../src/app/editor/editor-session.js';

describe('the editor session (specification.md §10.5)', () => {
  it('starts every sheet on the settings default and flips one sheet at a time', () => {
    const session = new EditorSession();
    const defaultWrap = signal(true);
    const a = session.wrapping('a', defaultWrap);
    const b = session.wrapping('b', defaultWrap);
    expect([a(), b()]).toEqual([true, true]);

    session.toggleWrap('a', defaultWrap());

    expect([a(), b()]).toEqual([false, true]);
  });

  it('keeps a flipped sheet where it was when the default changes, and follows it otherwise', () => {
    const session = new EditorSession();
    const defaultWrap = signal(true);
    const flipped = session.wrapping('a', defaultWrap);
    const untouched = session.wrapping('b', defaultWrap);
    session.toggleWrap('a', true);

    defaultWrap.set(false);

    expect(flipped()).toBe(false);
    expect(untouched()).toBe(false);
  });

  it('forgets a sheet that is gone, and reports no sheet as the default', () => {
    const session = new EditorSession();
    const defaultWrap = signal(false);
    session.toggleWrap('a', false);
    expect(session.wrapping('a', defaultWrap)()).toBe(true);

    session.forget('a');

    expect(session.wrapping('a', defaultWrap)()).toBe(false);
    expect(session.wrapping(null, defaultWrap)()).toBe(false);
  });

  it('holds the cursor the adapter last reported', () => {
    const session = new EditorSession();
    expect(session.cursor()).toEqual({ line: 1, column: 1 });
    session.noteCursor({ line: 4, column: 12 });
    expect(session.cursor()).toEqual({ line: 4, column: 12 });
  });
});
