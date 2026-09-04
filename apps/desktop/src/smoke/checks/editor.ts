/**
 * The editor: dot commands, the gutter menu, the cursor rules around hidden
 * heading syntax, saving through the menu, and switching sheets.
 * SPEC.md §10.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow, clipboard } from 'electron';
import {
  clickMenuItem,
  clickText,
  editorContains,
  headerTitle,
  isVisible,
  placeCursorInEditor,
  pressKey,
  rendered,
  sheetTitles,
  typeText,
  waitForSelector,
  waitUntil,
} from '../harness.js';
import type { Smoke } from '../context.js';

/**
 * Exercises the two gestures that change a heading level: the dot command and
 * the gutter menu. SPEC.md §10.2.
 *
 * Driven through real input events rather than through the adapter's own API,
 * because what is in doubt is precisely the path from a keystroke or a click to
 * the document.
 */
export async function checkHeadingGestures(window: BrowserWindow): Promise<void> {
  // Put the cursor at the start of the last line, which is empty.
  const placed = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const last = lines[lines.length - 1];
       if (last === undefined) { return null; }
       const rect = last.getBoundingClientRect();
       return { x: Math.round(rect.left + 4), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (placed === null) {
    throw new Error('could not locate the last editor line');
  }

  window.webContents.sendInputEvent({ type: 'mouseDown', x: placed.x, y: placed.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: placed.x, y: placed.y, clickCount: 1 });
  await rendered(window);

  // Start a fresh line at the very end, the way an author would before
  // writing. The fixture's last line closes a fenced block, where a dot
  // command deliberately does nothing.
  await pressKey(window, 'End', ['cmd']);
  await pressKey(window, 'Return');
  await typeText(window, '.h3 Typed heading');

  const afterTyping = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const typed = lines.find((line) => line.textContent.includes('Typed heading'));
       if (typed === undefined) { return null; }
       return {
         text: typed.textContent,
         isHeading: typed.classList.contains('cm-heading-3'),
       };
     })()`,
  )) as { text: string; isHeading: boolean } | null;

  if (afterTyping === null) {
    throw new Error('the typed line did not appear');
  }
  if (!afterTyping.isHeading) {
    throw new Error(`the dot command did not apply: ${JSON.stringify(afterTyping)}`);
  }
  if (afterTyping.text.includes('.h3')) {
    throw new Error(`the dot command text is still visible: ${JSON.stringify(afterTyping.text)}`);
  }

  // Now the gutter menu on that same line's marker.
  const marker = (await window.webContents.executeJavaScript(
    `(() => {
       const markers = [...document.querySelectorAll('.cm-heading-marker')]
         .filter((element) => element.textContent === 'H3' && element.dataset.line !== '0');
       const target = markers[markers.length - 1];
       if (target === undefined) { return null; }
       const rect = target.getBoundingClientRect();
       return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (marker === null) {
    throw new Error('no H3 gutter marker to activate');
  }

  window.webContents.sendInputEvent({ type: 'mouseDown', x: marker.x, y: marker.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: marker.x, y: marker.y, clickCount: 1 });
  await waitForSelector(window, 'wi-heading-menu [role="menu"]');

  const menu = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector('wi-heading-menu [role="menu"]');
       if (element === null) { return null; }
       const items = [...element.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')];
       const checked = items.filter((item) => item.getAttribute('aria-checked') === 'true');
       const target = items.find((item) => item.textContent.includes('Heading 5'));
       const rect = target === undefined ? null : target.getBoundingClientRect();
       return {
         items: items.length,
         checkedLabel: checked.length === 1 ? checked[0].textContent.trim() : null,
         target: rect === null
           ? null
           : { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
       };
     })()`,
  )) as { items: number; checkedLabel: string | null; target: { x: number; y: number } | null } | null;

  if (menu === null) {
    throw new Error('the gutter menu did not open');
  }
  if (menu.items !== 7) {
    throw new Error(`expected six levels plus "no heading", found ${menu.items}`);
  }
  if (menu.checkedLabel !== '✓ Heading 3') {
    throw new Error(`the active level is not marked: ${JSON.stringify(menu.checkedLabel)}`);
  }
  if (menu.target === null) {
    throw new Error('no "Heading 5" entry in the menu');
  }

  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: menu.target.x,
    y: menu.target.y,
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: menu.target.x,
    y: menu.target.y,
    clickCount: 1,
  });
  await waitUntil(
    'the menu to close after the choice',
    async () => !(await isVisible(window, 'wi-heading-menu [role="menu"]')),
  );

  const afterMenu = (await window.webContents.executeJavaScript(
    `(() => {
       const line = [...document.querySelectorAll('.cm-line')]
         .find((candidate) => candidate.textContent.includes('Typed heading'));
       return line === undefined
         ? null
         : {
             level5: line.classList.contains('cm-heading-5'),
             menuOpen: document.querySelector('wi-heading-menu [role="menu"]') !== null,
           };
     })()`,
  )) as { level5: boolean; menuOpen: boolean } | null;

  if (afterMenu === null || !afterMenu.level5) {
    throw new Error(`choosing Heading 5 did not change the line: ${JSON.stringify(afterMenu)}`);
  }
  if (afterMenu.menuOpen) {
    throw new Error('the menu stayed open after a choice');
  }

  console.log('smoke ok: dot command applied, gutter menu opened and changed the level');
}

/**
 * The cursor rules around hidden heading syntax. SPEC.md §10.2.
 *
 * Everything here is driven through real keys and the real clipboard, because
 * what is in question is the behavior a hand at the keyboard produces.
 */
/**
 * The status bar: where the cursor is, and this sheet's wrap switch.
 * SPEC.md §10.5. The column is read after a real keystroke, and the switch
 * is read off the editor's own class list, not off the button.
 */
export async function checkStatusBar(window: BrowserWindow): Promise<void> {
  const position = async (): Promise<string> =>
    (await window.webContents.executeJavaScript(
      `document.querySelector('wi-status-bar .position')?.textContent.trim() ?? ''`,
    )) as string;
  const wrapping = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      `document.querySelector('.cm-content')?.classList.contains('cm-lineWrapping') === true`,
    )) as boolean;

  await placeCursorInEditor(window);
  const lineCount = (await window.webContents.executeJavaScript(
    `document.querySelectorAll('.cm-line').length`,
  )) as number;
  await waitUntil(
    'the status bar to name the last line',
    async () => (await position()) === `Ln ${lineCount}, Col 1`,
  );

  // The last line may be empty, so Right would go nowhere: a typed character
  // moves the cursor for certain, and Backspace takes it back out again.
  await typeText(window, 'x');
  await waitUntil('the column to move with the cursor', async () => (await position()) === `Ln ${lineCount}, Col 2`);
  await pressKey(window, 'Backspace');
  await waitUntil('the column to move back', async () => (await position()) === `Ln ${lineCount}, Col 1`);

  const barHeight = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-status-bar .status-bar')?.getBoundingClientRect().height ?? 0`,
  )) as number;
  if (barHeight !== 24) {
    throw new Error(`the status bar is ${barHeight}px high, not 24`);
  }

  if (!(await wrapping())) {
    throw new Error('the sheet does not start on the settings default, wrapping');
  }
  await clickText(window, 'wi-status-bar button.wrap', 'Wrap');
  await waitUntil('wrapping to leave this sheet', async () => !(await wrapping()));
  await clickText(window, 'wi-status-bar button.wrap', 'Wrap');
  await waitUntil('wrapping to come back', wrapping);

  console.log(
    `smoke ok: the status bar named line ${lineCount} and followed the cursor by one column, ` +
      'and its wrap switch turned this sheet’s wrapping off and on',
  );
}

/**
 * The GFM display. SPEC.md §10.7: markers hidden and the effect shown off
 * the focus line, everything as written on it. Typed in, measured with
 * computed styles, and undone.
 */
export async function checkGfmDisplay(smoke: Smoke, window: BrowserWindow): Promise<void> {
  await placeCursorInEditor(window);
  await pressKey(window, 'End');
  const lines = [
    '',
    '> A quoted line',
    '- a bullet',
    '- [x] a done task',
    '1. first of an ordered list',
    '',
    '---',
    '',
    'Some ~~gone~~ and `code` and **bold** text',
  ];
  for (const line of lines) {
    await pressKey(window, 'Return');
    if (line !== '') {
      await typeText(window, line);
    }
  }
  await waitUntil('the typed markup to be in the editor', () => editorContains(window, 'first of an ordered'));

  const read = async (): Promise<Record<string, unknown>> =>
    (await window.webContents.executeJavaScript(
      `(() => {
         const byText = (text) => [...document.querySelectorAll('.cm-line')].find((line) => line.textContent.includes(text)) ?? null;
         const quote = byText('A quoted line');
         const bullet = byText('a bullet');
         const task = byText('a done task');
         const ordered = byText('first of an ordered');
         const rule = document.querySelector('.cm-line.cm-thematic-break');
         const strike = document.querySelector('.cm-inline-strikethrough');
         const code = document.querySelector('.cm-inline-code');
         const bold = document.querySelector('.cm-inline-bold');
         return {
           quoteText: quote?.textContent ?? null,
           quoteBorder: quote === null ? null : getComputedStyle(quote).borderLeftWidth,
           bulletGlyph: bullet?.querySelector('.cm-glyph-bullet') !== null && bullet !== null,
           bulletText: bullet?.textContent ?? null,
           taskGlyph: task?.querySelector('.cm-glyph-checked') !== null && task !== null,
           orderedText: ordered?.textContent ?? null,
           ruleGlyph: rule?.querySelector('.cm-glyph-rule') !== null && rule !== null,
           strike: strike === null ? null : getComputedStyle(strike).textDecorationLine,
           code: code === null ? null : getComputedStyle(code).fontFamily,
           bold: bold === null ? null : getComputedStyle(bold).fontWeight,
         };
       })()`,
    )) as Record<string, unknown>;

  const shown = await read();
  const expectations: Array<[string, boolean]> = [
    ['the quote marker hidden', typeof shown['quoteText'] === 'string' && !(shown['quoteText'] as string).includes('>')],
    ['the quote ruled at the left', shown['quoteBorder'] !== '0px' && shown['quoteBorder'] !== null],
    ['a bullet in place of the dash', shown['bulletGlyph'] === true && !(shown['bulletText'] as string).includes('-')],
    ['a ticked box in place of [x]', shown['taskGlyph'] === true],
    ['the ordered marker kept as written', typeof shown['orderedText'] === 'string' && (shown['orderedText'] as string).startsWith('1.')],
    ['a rule in place of ---', shown['ruleGlyph'] === true],
    ['strikethrough as line-through', shown['strike'] === 'line-through'],
    ['inline code in a monospace face', typeof shown['code'] === 'string' && /Menlo|monospace/u.test(shown['code'] as string)],
    ['bold as a heavier weight', Number(shown['bold']) >= 600],
  ];
  for (const [what, holds] of expectations) {
    if (!holds) {
      throw new Error(`the GFM display does not show ${what}: ${JSON.stringify(shown)}`);
    }
  }

  const evidence = join(smoke.evidenceDirectory, 'smoke-gfm.png');
  await rendered(window);
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  // On the focus line, the marker is back as written.
  const target = (await window.webContents.executeJavaScript(
    `(() => {
       const line = [...document.querySelectorAll('.cm-line')].find((candidate) => candidate.textContent.includes('A quoted line'));
       if (line === undefined) { return null; }
       const rect = line.getBoundingClientRect();
       return { x: Math.round(rect.right - 8), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (target === null) {
    throw new Error('the quoted line is gone');
  }
  window.webContents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await rendered(window);
  await waitUntil('the quote marker to show on the focus line', async () => {
    const now = await read();
    return typeof now['quoteText'] === 'string' && (now['quoteText'] as string).includes('>');
  });

  // Undo what was typed, so the checks after this one find the sheet as it was.
  for (let attempt = 0; attempt < 80 && (await editorContains(window, 'A quoted line')); attempt += 1) {
    await pressKey(window, 'z', ['cmd']);
  }
  if (await editorContains(window, 'A quoted line')) {
    throw new Error('undo did not take the typed markup back out');
  }

  console.log(
    'smoke ok: the GFM display hid a quote marker, a dash, a task box and a rule behind their ' +
      'effects, kept an ordered marker, showed strikethrough, code and bold, and put the marker back on the focus line',
  );
}

export async function checkHeadingCursorRules(window: BrowserWindow): Promise<void> {
  const lineStartKey = process.platform === 'darwin' ? 'Left' : 'Home';
  const lineStartModifiers = process.platform === 'darwin' ? ['cmd'] : [];
  const lineEndKey = process.platform === 'darwin' ? 'Right' : 'End';

  // Put the cursor inside the heading the earlier gestures produced.
  const target = (await window.webContents.executeJavaScript(
    `(() => {
       const line = [...document.querySelectorAll('.cm-line')]
         .find((candidate) => candidate.textContent.includes('Typed heading'));
       if (line === undefined) { return null; }
       const rect = line.getBoundingClientRect();
       return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (target === null) {
    throw new Error('the typed heading is gone');
  }

  window.webContents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, clickCount: 1 });
  await rendered(window);

  // Home, then select to the end, then copy: the clipboard must hold Markdown,
  // which also proves the cursor landed on the first *visible* character.
  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, lineEndKey, [...lineStartModifiers, 'shift']);
  clipboard.clear();
  window.webContents.copy();
  // Electron 44's clipboard mirrors the asynchronous W3C API, and the copy
  // lands in it a moment after the command.
  await waitUntil('the clipboard to fill', async () => (await clipboard.readText()) !== '');

  const copied = await clipboard.readText();
  if (copied !== '##### Typed heading') {
    throw new Error(`the clipboard should hold Markdown, held ${JSON.stringify(copied)}`);
  }

  // Backspace at the visible start removes the level, keeping the text.
  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, 'Backspace');

  const afterFirst = await lineState(window, 'Typed heading');
  if (afterFirst === null) {
    throw new Error('the line vanished on the first backspace');
  }
  if (afterFirst.heading) {
    throw new Error('the first backspace did not remove the heading level');
  }
  if (afterFirst.text !== 'Typed heading') {
    throw new Error(`the text changed unexpectedly: ${JSON.stringify(afterFirst.text)}`);
  }

  // A second backspace merges with the line above, as in any editor. The line
  // above is empty, so the text is unchanged by the merge — the line count is
  // what says it happened.
  const linesBefore = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('.cm-line').length",
  )) as number;

  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, 'Backspace');

  const afterSecond = await lineState(window, 'Typed heading');
  if (afterSecond === null) {
    throw new Error('the line vanished on the second backspace');
  }
  const linesAfter = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('.cm-line').length",
  )) as number;
  if (linesAfter !== linesBefore - 1) {
    throw new Error(
      `the second backspace did not merge: ${linesBefore} lines before, ${linesAfter} after`,
    );
  }

  console.log(
    'smoke ok: heading syntax is atomic — clipboard kept Markdown, ' +
      'backspace removed the level and then merged',
  );

  // Continues here rather than from the run: the keys are decided above, and
  // the cut is the last of the cursor rules (SPEC.md §10.2).
  await checkCutTakesPrefix(window, lineStartKey, lineStartModifiers, lineEndKey);
}

/**
 * Cutting a heading must take its prefix with it, or the text arrives
 * elsewhere as a heading while an empty `## ` stays behind. SPEC.md §10.2.
 */
export async function checkCutTakesPrefix(
  window: BrowserWindow,
  lineStartKey: string,
  lineStartModifiers: readonly string[],
  lineEndKey: string,
): Promise<void> {
  // A fresh heading at the end of the document.
  await pressKey(window, lineEndKey, ['cmd']);
  await pressKey(window, 'Return');
  await typeText(window, '.h2 Cut me');

  const created = await lineState(window, 'Cut me');
  if (created === null || !created.heading) {
    throw new Error(`could not create a heading to cut: ${JSON.stringify(created)}`);
  }

  await pressKey(window, lineStartKey, lineStartModifiers);
  await pressKey(window, lineEndKey, [...lineStartModifiers, 'shift']);
  clipboard.clear();
  window.webContents.cut();
  await waitUntil('the clipboard to fill', async () => (await clipboard.readText()) !== '');

  const cutText = await clipboard.readText();
  if (cutText !== '## Cut me') {
    throw new Error(`cut should place Markdown on the clipboard, placed ${JSON.stringify(cutText)}`);
  }

  const remainder = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const last = lines[lines.length - 1];
       return last === undefined
         ? null
         : { text: last.textContent, heading: last.className.includes('cm-heading') };
     })()`,
  )) as { text: string; heading: boolean } | null;

  if (remainder === null) {
    throw new Error('the document lost its last line');
  }
  if (remainder.heading || remainder.text !== '') {
    throw new Error(`cut left something behind: ${JSON.stringify(remainder)}`);
  }

  console.log('smoke ok: cut took the heading prefix with it, leaving an empty line');
}

/**
 * The document round trip: edit, save, and find the change on disk.
 * SPEC.md §6, §10.6.
 *
 * The file is read here in the main process rather than through the bridge,
 * so what is checked is the manuscript itself and not the application's belief
 * about it.
 */
export async function checkDocumentFlow(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const marker = `Written by the smoke at line ${Date.now() % 100000}`;
  await typeText(window, marker);
  await waitUntil(
    'the dirty marker',
    async () => (await headerTitle(window, 'Opening'))?.endsWith('•') === true,
  );

  const dirty = (await window.webContents.executeJavaScript(
    `(() => {
       const title = [...document.querySelectorAll('wi-panel-header .title')]
         .map((element) => element.textContent.trim())
         .find((text) => text.startsWith('Opening'));
       const saveButton = [...document.querySelectorAll('button')]
         .some((button) => button.textContent.trim() === 'Save');
       return { title: title ?? null, saveButton };
     })()`,
  )) as { title: string | null; saveButton: boolean };

  if (dirty.title === null || !dirty.title.endsWith('•')) {
    throw new Error(`the dirty marker is missing: ${JSON.stringify(dirty.title)}`);
  }
  if (!dirty.saveButton) {
    throw new Error('no save action while the document is dirty');
  }

  // Saving goes through the File menu, which owns Cmd+S. A synthetic key
  // event reaches the page directly and bypasses the accelerator, so the menu
  // item itself is triggered — which is also the path an author takes.
  clickMenuItem('sheet/save');
  const sheetPath = join(smoke.projectPath, 'opening.md');
  await waitUntil('the save to reach the disk', () =>
    readFileSync(sheetPath, 'utf8').includes(marker),
  );

  const onDisk = readFileSync(sheetPath, 'utf8');
  if (!onDisk.includes(marker)) {
    throw new Error('the saved file does not contain the edit');
  }
  if (!onDisk.startsWith('---\nopera-incerta:\n  title: Opening\n---\n')) {
    throw new Error(`saving damaged the front matter: ${JSON.stringify(onDisk.slice(0, 80))}`);
  }

  await waitUntil(
    'the dirty marker to go',
    async () => (await headerTitle(window, 'Opening')) === 'Opening',
  );
  const clean = (await window.webContents.executeJavaScript(
    `(() => {
       const title = [...document.querySelectorAll('wi-panel-header .title')]
         .map((element) => element.textContent.trim())
         .find((text) => text.startsWith('Opening'));
       const saveButton = [...document.querySelectorAll('button')]
         .some((button) => button.textContent.trim() === 'Save');
       return { title: title ?? null, saveButton };
     })()`,
  )) as { title: string | null; saveButton: boolean };

  if (clean.title !== 'Opening') {
    throw new Error(`the dirty marker survived the save: ${JSON.stringify(clean.title)}`);
  }
  if (clean.saveButton) {
    throw new Error('the save action is still offered after saving');
  }

  console.log('smoke ok: edited, saved through the File menu, and the change is on disk');
}

/** Switching groups and sheets. SPEC.md §9. */

export async function checkSheetSwitch(window: BrowserWindow): Promise<void> {
  const switched = (await window.webContents.executeJavaScript(
    `(() => {
       const group = [...document.querySelectorAll('wi-explorer-node .name')]
         .find((element) => element.textContent.trim() === 'Part One');
       if (group === undefined) { return 'no group'; }
       group.click();
       return 'ok';
     })()`,
  )) as string;
  if (switched !== 'ok') {
    throw new Error(`could not select the nested group: ${switched}`);
  }
  await waitUntil('the sheet list to follow the group', async () =>
    (await sheetTitles(window)).includes('A Scene in Part One'),
  );

  const listed = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as string[];
  if (listed.length !== 1 || listed[0] !== 'A Scene in Part One') {
    throw new Error(`the sheet list did not follow the group: ${JSON.stringify(listed)}`);
  }

  const opened = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-sheet-list .row')][0];
       if (row === undefined) { return 'no row'; }
       row.click();
       return 'ok';
     })()`,
  )) as string;
  if (opened !== 'ok') {
    throw new Error('could not open the nested sheet');
  }
  await waitUntil('the editor to load the other sheet', () =>
    editorContains(window, 'The Second Bell'),
  );

  const editor = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')].map((line) => line.textContent);
       const title = [...document.querySelectorAll('wi-panel-header .title')]
         .map((element) => element.textContent.trim())
         .find((text) => text.startsWith('A Scene'));
       return { lines, title: title ?? null };
     })()`,
  )) as { lines: string[]; title: string | null };

  if (editor.title !== 'A Scene in Part One') {
    throw new Error(`the editor header did not follow: ${JSON.stringify(editor.title)}`);
  }
  if (!editor.lines.some((line) => line.includes('The Second Bell'))) {
    throw new Error(`the editor did not load the other sheet: ${JSON.stringify(editor.lines)}`);
  }
  // Front matter belongs to its own area, not to the writing surface
  // (SPEC.md §10.4) — and keeping it out is what protects it from being
  // edited into something the codec can no longer read.
  if (editor.lines.some((line) => line.includes('opera-incerta:'))) {
    throw new Error('front matter is showing inside the editor');
  }
  if (editor.lines.some((line) => line.includes('Written by the smoke'))) {
    throw new Error('the previous document is still in the editor');
  }

  console.log('smoke ok: switching group and sheet loaded the other document');
}

/** The remaining panes and the activity bars. SPEC.md §8.4, §11, §12. */

export async function lineState(
  window: BrowserWindow,
  needle: string,
): Promise<{ text: string; heading: boolean; count: number } | null> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const found = lines.filter((line) => line.textContent.includes(${JSON.stringify(needle)}));
       const line = found[0];
       return line === undefined
         ? null
         : {
             text: line.textContent,
             heading: line.className.includes('cm-heading'),
             count: found.length,
           };
     })()`,
  )) as { text: string; heading: boolean; count: number } | null;
}
