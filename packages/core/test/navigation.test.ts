import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  canGoBack,
  canGoForward,
  currentPath,
  readRecentSheets,
  stepped,
  visited,
  withRecentSheet,
  withoutSheet,
} from '../src/index.js';

/** Opens a sequence of sheets, as an author would. */
function after(...paths: readonly string[]) {
  return paths.reduce(visited, EMPTY_HISTORY);
}

describe('the navigation history (SPEC.md §9.4)', () => {
  it('records what was opened, in order', () => {
    const history = after('a.md', 'b.md', 'c.md');
    expect(history.entries).toEqual(['a.md', 'b.md', 'c.md']);
    expect(currentPath(history)).toBe('c.md');
  });

  it('does not record opening what is already open', () => {
    expect(after('a.md', 'a.md').entries).toEqual(['a.md']);
  });

  it('steps back and forward, and stops at both ends', () => {
    let history = after('a.md', 'b.md', 'c.md');
    expect(canGoForward(history)).toBe(false);

    history = stepped(history, 'back');
    expect(currentPath(history)).toBe('b.md');
    history = stepped(history, 'back');
    expect(currentPath(history)).toBe('a.md');
    expect(canGoBack(history)).toBe(false);
    // Nowhere to go: the same history, not an error.
    expect(stepped(history, 'back')).toEqual(history);

    history = stepped(history, 'forward');
    expect(currentPath(history)).toBe('b.md');
  });

  it('truncates the forward branch when something else is opened', () => {
    let history = after('a.md', 'b.md', 'c.md');
    history = stepped(stepped(history, 'back'), 'back');
    history = visited(history, 'd.md');

    expect(history.entries).toEqual(['a.md', 'd.md']);
    expect(currentPath(history)).toBe('d.md');
    expect(canGoForward(history)).toBe(false);
  });

  it('drops a sheet that is gone, and keeps reading on', () => {
    const history = withoutSheet(after('a.md', 'b.md', 'c.md'), 'b.md');
    expect(history.entries).toEqual(['a.md', 'c.md']);
    expect(currentPath(history)).toBe('c.md');
  });

  it('empties when the last sheet it held is gone', () => {
    expect(withoutSheet(after('a.md'), 'a.md')).toEqual(EMPTY_HISTORY);
  });
});

describe('the recently edited list (SPEC.md §9.4)', () => {
  it('puts the newest first, without duplicating', () => {
    let recent = withRecentSheet([], 'a.md');
    recent = withRecentSheet(recent, 'b.md');
    recent = withRecentSheet(recent, 'a.md');
    expect(recent).toEqual(['a.md', 'b.md']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 15 }, (_, index) => `s${index}.md`);
    const recent = many.reduce<readonly string[]>((list, path) => withRecentSheet(list, path), []);
    expect(recent).toHaveLength(10);
    expect(recent[0]).toBe('s14.md');
  });

  it('reads a stored list and discards what it cannot read', () => {
    expect(readRecentSheets(['a.md', 42, '', 'a.md', 'b.md'])).toEqual(['a.md', 'b.md']);
    // A convenience, never a source of truth: nonsense is an empty list.
    expect(readRecentSheets('<<<<<<< HEAD')).toEqual([]);
    expect(readRecentSheets(null)).toEqual([]);
  });
});
