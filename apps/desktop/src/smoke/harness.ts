/**
 * Driving the renderer from the main process: waiting, clicking, typing.
 *
 * Every helper takes the window first. None of them knows what is being
 * checked; they only do what a hand would do and report what a hand would
 * see. A check is built from these, never from `executeJavaScript` calls of
 * its own where a helper exists.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { type BrowserWindow, Menu } from 'electron';
import { MENU_ACCELERATORS, menuItemId } from './../application-menu.js';
import type { Smoke } from './context.js';

/**
 * Waits until a condition holds, and fails saying what it waited for.
 *
 * The one way a check waits for a **consequence** — a file on disk, a row in
 * a list, a dialog gone. It polls, so a fast machine moves on at once and a
 * slow one is given its time; a fixed sleep gives both the same, and is wrong
 * for one of them.
 */
export async function waitUntil(
  what: string,
  done: () => Promise<boolean> | boolean,
  timeoutMs = 8000,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await done()) {
      return;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`gave up waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Lets the renderer take what it was just sent and paint it: a macrotask, so
 * an input event already delivered is handled, then two frames, so the change
 * detection that followed has rendered.
 *
 * The wait after an **input** — a click, a key, a pointer move — where the
 * consequence is not one thing a check can name. Where it is, `waitUntil`
 * names it instead. Also the wait before a screenshot: an element is in the
 * DOM before the compositor has drawn it.
 */
export async function rendered(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => setTimeout(() => ' +
      'requestAnimationFrame(() => requestAnimationFrame(resolve)), 0))',
  );
}

/** The panel-header title starting with `prefix`, dirty marker included, or null. */
export async function headerTitle(window: BrowserWindow, prefix: string): Promise<string | null> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith(${JSON.stringify(prefix)})) ?? null`,
  )) as string | null;
}

/** The titles the sheet list shows, in order. */
export async function sheetTitles(window: BrowserWindow): Promise<readonly string[]> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((e) => e.textContent.trim())`,
  )) as readonly string[];
}

/** The name of the selected group in the tree, or null. */
export async function selectedGroupName(window: BrowserWindow): Promise<string | null> {
  return (await window.webContents.executeJavaScript(
    `document.querySelector('wi-explorer-node .row.selected .name')?.textContent.trim() ?? null`,
  )) as string | null;
}

/** Whether an element matching `selector` carries `text`. */
export async function rowShown(
  window: BrowserWindow,
  selector: string,
  text: string,
): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll(${JSON.stringify(selector)})]
       .some((candidate) => candidate.textContent.includes(${JSON.stringify(text)}))`,
  )) as boolean;
}

export async function waitForSelector(
  window: BrowserWindow,
  selector: string,
  attempts = 100,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const found = (await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    )) as boolean;
    if (found) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`nothing matched ${selector} after waiting`);
}

/** Waits for the project window to exist and finish loading. */

export async function waitForProjectWindow(smoke: Smoke): Promise<BrowserWindow> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const window = smoke.shell.projectWindow();
    if (window !== null && !window.isDestroyed() && !window.webContents.isLoading()) {
      return window;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the project window never appeared');
}

export async function isVisible(window: BrowserWindow, selector: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}) !== null`,
  )) as boolean;
}

export async function editorContains(window: BrowserWindow, text: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('.cm-line')]
       .map((line) => line.textContent).join('\\n').includes(${JSON.stringify(text)})`,
  )) as boolean;
}

/** Opens the confirmation for one entry through its context menu. */

export async function clickText(window: BrowserWindow, selector: string, text: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(text)}));
       if (element === undefined) { return false; }
       element.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no ${selector} containing ${text}`);
  }
  await rendered(window);
}

/** Types into the open prompt and confirms it. */

export async function rightClick(window: BrowserWindow, selector: string): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector(${JSON.stringify(selector)});
       if (element === null) { return null; }
       const bounds = element.getBoundingClientRect();
       return { x: Math.round(bounds.left + 8), y: Math.round(bounds.top + bounds.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error(`nothing to right-click at ${selector}`);
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await rendered(window);
}

/** Clicks the first element matching a selector whose text contains `text`. */

export async function rightClickNodeContaining(window: BrowserWindow, text: string): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const name = [...document.querySelectorAll('wi-explorer-node .name')]
         .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)});
       if (name === undefined) { return null; }
       const bounds = name.getBoundingClientRect();
       return { x: Math.round(bounds.left + 8), y: Math.round(bounds.top + bounds.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error(`no explorer node named ${text}`);
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await rendered(window);
}

/** Right-clicks the sheet-list row containing the given text. */

export async function rightClickRowContaining(window: BrowserWindow, text: string): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-sheet-list .row')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(text)}));
       if (row === undefined) { return null; }
       const bounds = row.getBoundingClientRect();
       return { x: Math.round(bounds.left + 12), y: Math.round(bounds.top + 10) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error(`no sheet row containing ${text}`);
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'right',
    clickCount: 1,
  });
  await rendered(window);
}

/** Right-clicks the first element matching a selector. */

export async function fillPrompt(window: BrowserWindow, value: string): Promise<void> {
  const filled = (await window.webContents.executeJavaScript(
    `(() => {
       const input = document.querySelector('wi-text-prompt input');
       if (input === null) { return false; }
       input.value = ${JSON.stringify(value)};
       input.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!filled) {
    throw new Error('no prompt to fill');
  }
  await rendered(window);

  const confirmed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-text-prompt button')]
         .find((candidate) => !candidate.disabled && candidate.textContent.trim() !== 'Cancel');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!confirmed) {
    throw new Error('the prompt would not confirm');
  }
}

/** The menu offers what is possible, and only that. SPEC.md §8.5. */

export async function typeText(window: BrowserWindow, text: string): Promise<void> {
  for (const character of text) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: character });
    window.webContents.sendInputEvent({ type: 'char', keyCode: character });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: character });
  }
  await rendered(window);
}

export async function pressKey(
  window: BrowserWindow,
  keyCode: string,
  modifiers: readonly string[] = [],
): Promise<void> {
  window.webContents.sendInputEvent({
    type: 'keyDown',
    keyCode,
    modifiers: [...modifiers] as never,
  });
  window.webContents.sendInputEvent({
    type: 'keyUp',
    keyCode,
    modifiers: [...modifiers] as never,
  });
  await rendered(window);
}

/** Text of the line containing `needle`, and whether it is a heading. */

export async function placeCursorInEditor(window: BrowserWindow): Promise<void> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const last = lines[lines.length - 1];
       if (last === undefined) { return null; }
       const rect = last.getBoundingClientRect();
       return { x: Math.round(rect.left + 4), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (point === null) {
    throw new Error('the editor has no lines to click into');
  }
  window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, clickCount: 1 });
  await pressKey(window, 'End', ['cmd']);
}

/** Presses the navigator's reload button, as the author would. */

export async function activateSidebar(window: BrowserWindow, label: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-activity-bar button')]
         .find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no activity bar entry named ${label}`);
  }
  await rendered(window);
}

/** Renderer errors are otherwise invisible from here. */

export function forwardConsole(window: BrowserWindow): void {
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') {
      console.error(`renderer ${details.level}: ${details.message}`);
    }
  });
}

export async function toggleSwitch(window: BrowserWindow, label: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const found = [...document.querySelectorAll('.switch')]
         .find((element) => element.textContent.trim() === ${JSON.stringify(label)});
       const box = found?.querySelector('input');
       if (box === null || box === undefined) { return false; }
       box.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no switch labelled ${label}`);
  }
  await rendered(window);
}

/**
 * Checks that the library views show the project the launcher opened, and
 * selects a sheet. SPEC.md §9.
 */
export async function selectSmokeSheet(window: BrowserWindow): Promise<void> {
  await waitForSelector(window, 'wi-sheet-list .row');

  const library = (await window.webContents.executeJavaScript(
    `(() => {
       const nodes = [...document.querySelectorAll('wi-explorer-node .name')]
         .map((element) => element.textContent.trim());
       const sheets = [...document.querySelectorAll('wi-sheet-list .title')]
         .map((element) => element.textContent.trim());
       const failure = document.querySelector('[role="alert"]');
       return { nodes, sheets, failure: failure === null ? null : failure.textContent };
     })()`,
  )) as { nodes: string[]; sheets: string[]; failure: string | null };

  if (library.failure !== null) {
    throw new Error(`opening the project failed: ${library.failure}`);
  }
  if (!library.nodes.includes('Smoke Project')) {
    throw new Error(`the tree does not show the project: ${JSON.stringify(library.nodes)}`);
  }
  if (!library.nodes.includes('Part One')) {
    throw new Error(`the tree does not show the recorded group name: ${JSON.stringify(library.nodes)}`);
  }
  if (!library.sheets.includes('Opening')) {
    throw new Error(`the sheet list does not show the sheet: ${JSON.stringify(library.sheets)}`);
  }

  // Select the sheet, which is what puts a document in the editor.
  const selected = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-sheet-list .row')]
         .find((candidate) => candidate.textContent.includes('Opening'));
       if (row === undefined) { return false; }
       row.click();
       return true;
     })()`,
  )) as boolean;
  if (!selected) {
    throw new Error('could not select the sheet');
  }
  // The document arrives over the bridge; its first heading is the sign.
  await waitForSelector(window, '.cm-heading-1');

  console.log('smoke ok: project opened, tree and sheet list populated, sheet selected');
}

/** Types a string into the focused element as real key events. */

export async function reloadFromDisk(window: BrowserWindow): Promise<void> {
  const pressed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-panel-header button')]
         .find((candidate) => candidate.getAttribute('title') === 'Reload from disk');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!pressed) {
    throw new Error('no reload button in the navigator');
  }
  // What the re-read leads to is the caller's to wait for: a prompt, or a
  // changed editor.
  await rendered(window);
}

/**
 * Triggers a menu item by its command, and checks it is offered at all.
 *
 * A disabled item does nothing when clicked, which would look exactly like a
 * broken command — so the enabled state is asserted rather than assumed.
 */
export function clickMenuItem(command: keyof typeof MENU_ACCELERATORS): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(menuItemId(command));
  if (item === undefined || item === null) {
    throw new Error(`no menu item for ${command}`);
  }
  if (!item.enabled) {
    throw new Error(`the menu item for ${command} is disabled`);
  }
  item.click();
}

/** Presses one key, optionally with modifiers. */

export async function settleWatch(
  window: BrowserWindow,
  done: () => Promise<boolean>,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await done()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
