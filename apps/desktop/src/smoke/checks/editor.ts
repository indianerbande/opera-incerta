/**
 * The editor: dot commands, the gutter menu, the cursor rules around hidden
 * heading syntax, saving through the menu, and switching sheets.
 * specification.md §10.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow, clipboard } from 'electron';
import {
  COMMAND_MODIFIER,
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
 * the gutter menu. specification.md §10.2.
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
  await pressKey(window, 'End', [COMMAND_MODIFIER]);
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
 * The cursor rules around hidden heading syntax. specification.md §10.2.
 *
 * Everything here is driven through real keys and the real clipboard, because
 * what is in question is the behavior a hand at the keyboard produces.
 */
/**
 * The status bar: where the cursor is, and this sheet's wrap switch.
 * specification.md §10.5. The column is read after a real keystroke, and the switch
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
 * The GFM display. specification.md §10.7: markers hidden and the effect shown off
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
    await pressKey(window, 'z', [COMMAND_MODIFIER]);
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
  // the cut is the last of the cursor rules (specification.md §10.2).
  await checkCutTakesPrefix(window, lineStartKey, lineStartModifiers, lineEndKey);
}

/**
 * Cutting a heading must take its prefix with it, or the text arrives
 * elsewhere as a heading while an empty `## ` stays behind. specification.md §10.2.
 */
export async function checkCutTakesPrefix(
  window: BrowserWindow,
  lineStartKey: string,
  lineStartModifiers: readonly string[],
  lineEndKey: string,
): Promise<void> {
  // A fresh heading at the end of the document. The modifiers are the
  // caller's, not `cmd`: this line was macOS-only for as long as the check
  // had only ever run on macOS, and on Linux it moved the cursor nowhere —
  // so the heading was appended to the previous line instead of starting a
  // new one. The first run on another platform found it.
  await pressKey(window, lineEndKey, lineStartModifiers);
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
 * specification.md §6, §10.6.
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

/** Switching groups and sheets. specification.md §9. */

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
  // (specification.md §10.4) — and keeping it out is what protects it from being
  // edited into something the codec can no longer read.
  if (editor.lines.some((line) => line.includes('opera-incerta:'))) {
    throw new Error('front matter is showing inside the editor');
  }
  if (editor.lines.some((line) => line.includes('Written by the smoke'))) {
    throw new Error('the previous document is still in the editor');
  }

  console.log('smoke ok: switching group and sheet loaded the other document');
}

/** The remaining panes and the activity bars. specification.md §8.4, §11, §12. */

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

/** What the line-number gutter and its neighbours measure. specification.md §10.8. */
interface GutterMeasurement {
  readonly numbers: readonly string[];
  readonly logicalLines: number;
  /** Right edge of the number column and left edge of the marker column. */
  readonly numbersRight: number;
  readonly markersLeft: number;
  /** The tallest line, and the gutter element beside it. */
  readonly tallestLineHeight: number;
  readonly tallestGutterHeight: number;
  readonly tallestGutterText: string | null;
  readonly oneLineHeight: number;
}

async function measureGutter(window: BrowserWindow): Promise<GutterMeasurement> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const elements = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
         // The first element is CodeMirror's spacer, which reserves the width
         // and carries no line.
         .slice(1);
       const heights = lines.map((line) => line.getBoundingClientRect().height);
       const tallest = heights.indexOf(Math.max(...heights));
       const numbersBox = document.querySelector('.cm-lineNumbers')?.getBoundingClientRect() ?? null;
       const markersBox = document.querySelector('.cm-marker-gutter')?.getBoundingClientRect() ?? null;
       return {
         numbers: elements.map((element) => element.textContent.trim()),
         logicalLines: lines.length,
         numbersRight: numbersBox === null ? -1 : numbersBox.right,
         markersLeft: markersBox === null ? -1 : markersBox.left,
         tallestLineHeight: heights[tallest] ?? 0,
         tallestGutterHeight: elements[tallest]?.getBoundingClientRect().height ?? 0,
         tallestGutterText: elements[tallest]?.textContent.trim() ?? null,
         oneLineHeight: Math.min(...heights),
       };
     })()`,
  )) as GutterMeasurement;
}

/** Turns one settings switch on or off, through the dialog. specification.md §13. */
async function setEditorSwitch(window: BrowserWindow, label: string): Promise<void> {
  await clickText(window, 'wi-activity-bar button[aria-label="Settings"]', '');
  await waitForSelector(window, 'wi-settings');
  await clickText(window, 'wi-settings .category', 'Editor');
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const box = [...document.querySelectorAll('wi-settings label.switch')]
         .find((label) => label.textContent.includes(${JSON.stringify(label)}))?.querySelector('input');
       if (!box) { return false; }
       box.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`the editor category shows no switch for ${label}`);
  }
  await pressKey(window, 'Escape');
  await waitUntil('the settings dialog to close', async () => !(await isVisible(window, 'wi-settings')));
}

/**
 * The line-number gutter. specification.md §10.8.
 *
 * Off until it is asked for; then a column left of the heading markers, one
 * number per **logical** line even where a line wraps over several visual
 * ones, and heights that follow the text rather than a computed row.
 */
export async function checkLineNumbers(smoke: Smoke, window: BrowserWindow): Promise<void> {
  if (await isVisible(window, '.cm-lineNumbers')) {
    throw new Error('the line-number gutter is there before it was asked for');
  }

  await setEditorSwitch(window, 'Show line numbers');
  await waitForSelector(window, '.cm-lineNumbers');

  // A line long enough to wrap, so "one number per logical line" is a claim
  // about something the screen actually shows. Undone again below.
  await placeCursorInEditor(window);
  await pressKey(window, 'End');
  await pressKey(window, 'Return');
  await typeText(window, `A sentence long enough to run past the right edge of the editor and wrap ${'onwards and '.repeat(12)}back.`);
  await waitUntil('the long line to be in the editor', () => editorContains(window, 'onwards and'));
  await rendered(window);

  const shown = await measureGutter(window);
  if (shown.numbers.length !== shown.logicalLines) {
    throw new Error(
      `${shown.numbers.length} numbers for ${shown.logicalLines} lines: ${JSON.stringify(shown.numbers)}`,
    );
  }
  if (shown.numbers[0] !== '1' || shown.numbers.at(-1) !== String(shown.logicalLines)) {
    throw new Error(`the numbers do not run from 1 to the last line: ${JSON.stringify(shown.numbers)}`);
  }
  if (shown.markersLeft < shown.numbersRight) {
    throw new Error(
      `the numbers are not left of the markers: ${shown.numbersRight} against ${shown.markersLeft}`,
    );
  }
  // The wrapped line: taller than one row, and still one number.
  if (shown.tallestLineHeight < shown.oneLineHeight * 1.8) {
    throw new Error(`nothing wrapped: tallest ${shown.tallestLineHeight} of ${shown.oneLineHeight}`);
  }
  if (Math.abs(shown.tallestGutterHeight - shown.tallestLineHeight) > 1) {
    throw new Error(
      `the gutter did not follow the line's height: ${shown.tallestGutterHeight} against ${shown.tallestLineHeight}`,
    );
  }
  if (shown.tallestGutterText === null || !/^\d+$/u.test(shown.tallestGutterText)) {
    throw new Error(`the wrapped line carries ${JSON.stringify(shown.tallestGutterText)}, not one number`);
  }

  const evidence = join(smoke.evidenceDirectory, 'smoke-line-numbers.png');
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  for (let attempt = 0; attempt < 80 && (await editorContains(window, 'onwards and')); attempt += 1) {
    await pressKey(window, 'z', [COMMAND_MODIFIER]);
  }
  if (await editorContains(window, 'onwards and')) {
    throw new Error('undo did not take the long line back out');
  }

  // Off again, so the checks after this one find the editor as it was.
  await setEditorSwitch(window, 'Show line numbers');
  await waitUntil(
    'the gutter to go away again',
    async () => !(await isVisible(window, '.cm-lineNumbers')),
  );

  console.log(
    'smoke ok: the line-number gutter appeared left of the heading markers when it was asked ' +
      'for, numbered every logical line once — the wrapped one included — and went away again',
  );
}

/** What the zoom moves, and what it must not. specification.md §10.9. */
interface ZoomMeasurement {
  readonly shown: string | null;
  readonly slider: number;
  readonly content: number;
  readonly heading: number;
  readonly gutter: number;
  /** Chrome: the sheet list beside the editor, which must not move. */
  readonly sheetList: number;
  readonly statusBar: number;
}

async function measureZoom(window: BrowserWindow): Promise<ZoomMeasurement> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const size = (selector) => {
         const element = document.querySelector(selector);
         return element === null ? 0 : Number.parseFloat(getComputedStyle(element).fontSize);
       };
       const slider = document.querySelector('wi-status-bar input.zoom');
       return {
         shown: document.querySelector('wi-status-bar .zoom-value')?.textContent.trim() ?? null,
         slider: slider === null ? 0 : Number(slider.value),
         content: size('.cm-content'),
         heading: size('.cm-heading-2'),
         gutter: size('.cm-marker-gutter .cm-gutterElement'),
         sheetList: size('wi-sheet-list .title'),
         statusBar: size('wi-status-bar .position'),
       };
     })()`,
  )) as ZoomMeasurement;
}

/** Drags the zoom slider to a percentage, as an input event. */
async function dragZoom(window: BrowserWindow, percent: number): Promise<void> {
  const moved = (await window.webContents.executeJavaScript(
    `(() => {
       const slider = document.querySelector('wi-status-bar input.zoom');
       if (slider === null) { return false; }
       slider.value = '${percent}';
       slider.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!moved) {
    throw new Error('the status bar has no zoom slider');
  }
  await rendered(window);
}

/**
 * The editor zoom. specification.md §10.9.
 *
 * What it scales — the text, its headings by their ratio, and the gutters —
 * and what it leaves alone: everything that is chrome. Plus the detent at
 * 100 %, the percentage as a way back to it, and the factor in the record.
 */
export async function checkZoom(smoke: Smoke, window: BrowserWindow): Promise<void> {
  await waitForSelector(window, 'wi-status-bar input.zoom');
  const before = await measureZoom(window);
  if (before.shown !== '100 %' || before.slider !== 100) {
    throw new Error(`the editor does not start at 100 %: ${JSON.stringify(before)}`);
  }

  await dragZoom(window, 150);
  await waitUntil('the zoom to reach the editor', async () => (await measureZoom(window)).content > before.content);
  const zoomed = await measureZoom(window);

  const scaled: Array<[string, number, number]> = [
    ['the text', zoomed.content, before.content * 1.5],
    ['the heading, by its ratio', zoomed.heading, before.heading * 1.5],
    ['the gutter', zoomed.gutter, before.gutter * 1.5],
  ];
  for (const [what, measured, expected] of scaled) {
    if (Math.abs(measured - expected) > 0.5) {
      throw new Error(`${what} measured ${measured}, expected ${expected}`);
    }
  }
  // Chrome does not move: the zoom is for reading the manuscript.
  if (zoomed.sheetList !== before.sheetList || zoomed.statusBar !== before.statusBar) {
    throw new Error(`the zoom moved the workbench around it: ${JSON.stringify(zoomed)}`);
  }
  if (zoomed.shown !== '150 %') {
    throw new Error(`the status bar says ${JSON.stringify(zoomed.shown)}`);
  }

  const evidence = join(smoke.evidenceDirectory, 'smoke-zoom.png');
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  const stored = (): number | undefined =>
    (JSON.parse(readFileSync(smoke.preferencesPath, 'utf8')) as { editorZoom?: number }).editorZoom;
  await waitUntil('the zoom to reach the preference file', () => stored() === 150);

  // The detent: a drag that lands beside the middle lands on it.
  await dragZoom(window, 102);
  await waitUntil('the detent to take it to 100', async () => (await measureZoom(window)).shown === '100 %');
  const detent = await measureZoom(window);
  if (detent.content !== before.content) {
    throw new Error(`at the detent the text measures ${detent.content}, not ${before.content}`);
  }

  // The percentage is the way back to 100 %.
  await dragZoom(window, 150);
  await waitUntil('the zoom to grow again', async () => (await measureZoom(window)).shown === '150 %');
  await clickText(window, 'wi-status-bar .zoom-value', '150');
  await waitUntil('the reset to take it back', async () => (await measureZoom(window)).shown === '100 %');
  await waitUntil('100 to reach the preference file', () => stored() === 100);

  const back = await measureZoom(window);
  if (back.content !== before.content || back.gutter !== before.gutter) {
    throw new Error(`100 % is not where it started: ${JSON.stringify(back)}`);
  }

  console.log(
    'smoke ok: the zoom scaled the text, its headings and the gutter and left the workbench ' +
      'around them alone, snapped to 100 % near the middle, and went back to it from the percentage',
  );
}

/** What the find bar and the marked text report. specification.md §10.11. */
interface FindState {
  readonly open: boolean;
  readonly query: string;
  readonly count: string | null;
  readonly marks: number;
  readonly current: string | null;
}

async function findState(window: BrowserWindow): Promise<FindState> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const bar = document.querySelector('wi-find-bar');
       const field = bar?.querySelector('input.query') ?? null;
       const current = document.querySelector('.cm-search-current');
       return {
         open: bar !== null,
         query: field === null ? '' : field.value,
         count: bar?.querySelector('.count')?.textContent?.trim() ?? null,
         marks: document.querySelectorAll('.cm-search-match').length,
         current: current === null ? null : current.textContent,
       };
     })()`,
  )) as FindState;
}

/**
 * Finding in the open sheet. specification.md §10.11.
 *
 * Opened from the native menu item, because the menu owns `Cmd+F` and a key
 * handler in the page would never see it; then every match marked, the count
 * read off the bar, the steps wrapping, and Escape leaving nothing behind.
 */
export async function checkFindInSheet(smoke: Smoke, window: BrowserWindow): Promise<void> {
  if ((await findState(window)).open) {
    throw new Error('the find bar is up before anyone asked for it');
  }

  // A word selected first: opening the bar seeds the field with it.
  const word = (await window.webContents.executeJavaScript(
    `(() => {
       const line = [...document.querySelectorAll('.cm-line')].find((candidate) =>
         candidate.textContent.includes('nested group'));
       if (line === undefined) { return null; }
       const rect = line.getBoundingClientRect();
       return { x: Math.round(rect.left + 30), y: Math.round(rect.top + rect.height / 2) };
     })()`,
  )) as { x: number; y: number } | null;
  if (word === null) {
    throw new Error('the smoke sheet does not hold the line the find check needs');
  }
  window.webContents.sendInputEvent({ type: 'mouseDown', x: word.x, y: word.y, button: 'left', clickCount: 2 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: word.x, y: word.y, button: 'left', clickCount: 2 });
  await rendered(window);

  clickMenuItem('editor/find');
  await waitForSelector(window, 'wi-find-bar input.query');
  const seeded = await findState(window);
  if (seeded.query.trim() === '') {
    throw new Error('the field was not seeded with the selection');
  }

  // Now a query of its own. `ne` stands in "line" and in "nested" — two
  // matches in a sheet that is two lines long, which is what this check needs:
  // more than one, and a number it can read off the bar rather than assume.
  await window.webContents.executeJavaScript(
    `(() => {
       const field = document.querySelector('wi-find-bar input.query');
       field.value = 'ne';
       field.dispatchEvent(new Event('input', { bubbles: true }));
     })()`,
  );
  await waitUntil('the matches to be marked', async () => (await findState(window)).marks > 1);

  const found = await findState(window);
  const total = Number(found.count?.split(' ').at(-1) ?? 0);
  if (total < 2 || found.marks !== total) {
    throw new Error(`the bar says ${JSON.stringify(found.count)} for ${found.marks} marks`);
  }
  if (found.current === null) {
    throw new Error('no match is drawn as the current one');
  }
  // The cursor is in the second line, where the word was double-clicked, so
  // the match the find lands on is the one at or after it — not the first in
  // the document (specification.md §10.11).
  if (!found.count?.startsWith(`${total} `)) {
    throw new Error(`the find did not start at the cursor: ${JSON.stringify(found.count)}`);
  }

  const evidence = join(smoke.evidenceDirectory, 'smoke-find.png');
  await rendered(window);
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  // Return steps forward and wraps round to the first; Shift+Return comes back.
  await pressKey(window, 'Return');
  await waitUntil(
    'the step past the last match to wrap round',
    async () => (await findState(window)).count?.startsWith('1 ') === true,
  );
  await pressKey(window, 'Return', ['shift']);
  await waitUntil(
    'the step back from the first to wrap round',
    async () => (await findState(window)).count?.startsWith(`${total} `) === true,
  );

  // Escape closes it and takes the marks with it.
  await pressKey(window, 'Escape');
  await waitUntil('the bar to close', async () => !(await findState(window)).open);
  const after = await findState(window);
  if (after.marks !== 0) {
    throw new Error(`${after.marks} marks were left behind`);
  }

  console.log(
    'smoke ok: find opened from the menu seeded with the selection, marked every match, counted ' +
      'them, started at the cursor, stepped forwards and back through the ring, and left nothing behind',
  );
}
