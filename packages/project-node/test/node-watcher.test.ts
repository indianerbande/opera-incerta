import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryWatcher, type Disposable } from '../src/index.js';

/**
 * Short enough for a test to wait it out, long enough to still coalesce a
 * burst. The specified figure is checked where it is declared, in the core.
 */
const DEBOUNCE = 40;

let root = '';
const open: Disposable[] = [];

/** Waits long enough for a burst to settle, plus room for the filesystem. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE * 8));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'opera-incerta-watch-'));
  await mkdir(join(root, 'part-1'), { recursive: true });
  await writeFile(join(root, 'part-1', 'scene.md'), 'original\n', 'utf8');
});

afterEach(async () => {
  for (const handle of open.splice(0)) {
    handle.dispose();
  }
  await rm(root, { recursive: true, force: true });
});

function watcher(): ReturnType<typeof createLibraryWatcher> {
  return createLibraryWatcher(DEBOUNCE);
}

/**
 * Starts a watch and lets it go quiet before the test acts.
 *
 * A watch delivers a short history: without this, what the fixture wrote a
 * moment ago arrives afterwards and is counted as the change under test. Two
 * of these cases passed for that reason before it was added, and two failed.
 */
async function watching(
  start: (onChange: () => void) => Disposable,
): Promise<{ readonly calls: () => number }> {
  let count = 0;
  open.push(start(() => (count += 1)));
  await settle();
  count = 0;
  return { calls: () => count };
}

describe('watching a directory', () => {
  it('reports a file appearing in it', async () => {
    const seen = await watching((onChange) => watcher().watchDirectory(root, onChange));

    await writeFile(join(root, 'new.md'), 'text\n', 'utf8');
    await settle();

    expect(seen.calls()).toBeGreaterThan(0);
  });

  it('coalesces a burst into one report', async () => {
    // A window wide enough to contain the whole burst. At the 40 ms the other
    // cases use, the platform's own delivery gaps exceed it and the burst
    // legitimately arrives as two — which is the debounce working, not failing.
    let count = 0;
    open.push(createLibraryWatcher(250).watchDirectory(root, () => (count += 1)));
    await new Promise((resolve) => setTimeout(resolve, 900));
    count = 0;

    // One atomic save is already several events; ten writes are many more.
    for (let index = 0; index < 10; index += 1) {
      await writeFile(join(root, `file-${String(index)}.md`), 'text\n', 'utf8');
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(count).toBe(1);
  });

  it('reports a change deep in the tree when asked to be recursive', async () => {
    const deep = await watching((onChange) =>
      watcher().watchDirectory(root, onChange, { recursive: true }),
    );

    await writeFile(join(root, 'part-1', 'another.md'), 'text\n', 'utf8');
    await settle();

    expect(deep.calls()).toBeGreaterThan(0);
  });

  it('ignores what git writes about itself', async () => {
    const seen = await watching((onChange) =>
      watcher().watchDirectory(root, onChange, { recursive: true }),
    );

    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, '.git', 'index'), 'x', 'utf8');
    await settle();

    // Without this the watcher re-triggers itself for as long as it runs.
    expect(seen.calls()).toBe(0);
  });

  it('reports nothing, and does not throw, for a directory that is not there', async () => {
    let count = 0;
    expect(() =>
      open.push(watcher().watchDirectory(join(root, 'gone'), () => (count += 1))),
    ).not.toThrow();
    await settle();
    expect(count).toBe(0);
  });

  it('stops reporting once disposed', async () => {
    let count = 0;
    const handle = watcher().watchDirectory(root, () => (count += 1));
    handle.dispose();
    // Disposing twice is not an error; the shell does it on every switch.
    handle.dispose();

    await writeFile(join(root, 'after.md'), 'text\n', 'utf8');
    await settle();

    expect(count).toBe(0);
  });
});

describe('watching a file', () => {
  it('survives the file being replaced by a rename, which is how saving works', async () => {
    const sheet = join(root, 'part-1', 'scene.md');
    const seen = await watching((onChange) => watcher().watchFile(sheet, onChange));

    const temporary = `${sheet}.tmp`;
    await writeFile(temporary, 'saved atomically\n', 'utf8');
    await rename(temporary, sheet);
    await settle();
    const afterFirst = seen.calls();

    // The measured trap: a watch on the path itself is deaf from here on.
    await writeFile(sheet, 'and again\n', 'utf8');
    await settle();

    expect(afterFirst).toBeGreaterThan(0);
    expect(seen.calls()).toBeGreaterThan(afterFirst);
  });

  it('says nothing about its neighbours', async () => {
    const seen = await watching((onChange) =>
      watcher().watchFile(join(root, 'part-1', 'scene.md'), onChange),
    );

    await writeFile(join(root, 'part-1', 'other.md'), 'text\n', 'utf8');
    await settle();

    expect(seen.calls()).toBe(0);
  });
});
