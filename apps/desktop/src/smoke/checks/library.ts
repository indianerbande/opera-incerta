/**
 * The library: creating, renaming, reordering by a real drag, deleting into
 * the trash, moving between groups, and a change made behind the
 * application's back. SPEC.md §6, §10.6.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow } from 'electron';
import {
  clickMenuItem,
  clickText,
  editorContains,
  fillPrompt,
  isVisible,
  placeCursorInEditor,
  pressKey,
  reloadFromDisk,
  rightClick,
  rightClickNodeContaining,
  rightClickRowContaining,
  settleWatch,
  typeText,
  waitForSelector,
} from '../harness.js';
import type { Smoke } from '../context.js';

/**
 * Creating and renaming from the context menus. SPEC.md §6.4, §6.5.
 *
 * The rule under test is the one that makes the library survive: renaming
 * changes a title, never a file name.
 */
export async function checkLibraryEdits(smoke: Smoke, window: BrowserWindow): Promise<void> {
  // Back to the explorer: the previous check left the navigator on source
  // control, and the tree is where a group is right-clicked.
  const backToExplorer = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-activity-bar button')]
         .find((candidate) => candidate.getAttribute('aria-label') === 'Explorer');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!backToExplorer) {
    throw new Error('no Explorer entry in the activity bar');
  }
  await waitForSelector(window, 'wi-explorer-node .name');

  // Right-click the root group and create a sheet.
  await rightClick(window, 'wi-explorer-node .name');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Sheet');
  await waitForSelector(window, 'wi-text-prompt input');

  await fillPrompt(window, 'A Brand New Scene');
  await new Promise((resolve) => setTimeout(resolve, 600));

  const created = readFileSync(join(smoke.projectPath, 'a-brand-new-scene.md'), 'utf8');
  if (!created.includes('title: A Brand New Scene')) {
    throw new Error(`the new sheet lacks its title: ${JSON.stringify(created)}`);
  }
  if (!created.endsWith('---\n')) {
    throw new Error(`the new sheet should start empty: ${JSON.stringify(created)}`);
  }

  const openedTitle = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith('A Brand New Scene')) ?? null`,
  )) as string | null;
  if (openedTitle === null) {
    throw new Error('the created sheet did not open in the editor');
  }

  // Rename a sheet that is *not* open, so the file itself is rewritten.
  await rightClickRowContaining(window, 'Opening');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'Rename');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Renamed In Place');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const files = readdirSync(smoke.projectPath).filter((name) => name.endsWith('.md')).sort();
  // The rule that makes the library survive: the title changed, the file name
  // did not (SPEC.md §6.4).
  if (!files.includes('opening.md') || !files.includes('a-brand-new-scene.md')) {
    throw new Error(`renaming moved a file: ${JSON.stringify(files)}`);
  }
  const opening = readFileSync(join(smoke.projectPath, 'opening.md'), 'utf8');
  if (!opening.includes('title: Renamed In Place')) {
    throw new Error('the file does not carry the new title');
  }

  // Renaming the *open* sheet goes through its editing state instead, because
  // writing the file would discard what is unsaved in the editor.
  await rightClickRowContaining(window, 'A Brand New Scene');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'Rename');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Renamed While Open');
  await new Promise((resolve) => setTimeout(resolve, 500));

  const onDisk = readFileSync(join(smoke.projectPath, 'a-brand-new-scene.md'), 'utf8');
  if (onDisk.includes('Renamed While Open')) {
    throw new Error('renaming the open sheet wrote the file behind the editor');
  }

  const dirtyTitle = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith('Renamed While Open')) ?? null`,
  )) as string | null;
  if (dirtyTitle === null || !dirtyTitle.endsWith('•')) {
    throw new Error(`the open sheet was not renamed into its editing state: ${String(dirtyTitle)}`);
  }

  // A group: the directory takes the slug, the display name goes to
  // structure.json, and the new group is what the columns show (SPEC.md §6.4).
  await rightClickNodeContaining(window, 'Smoke Project');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Group');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Part Two');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const groupPath = join(smoke.projectPath, 'part-two');
  if (!statSync(groupPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('the group directory was not created under its slug');
  }
  if (displayNameOf(smoke.projectPath, 'part-two') !== 'Part Two') {
    throw new Error('structure.json did not record the display name');
  }

  const afterGroup = (await window.webContents.executeJavaScript(
    `(() => {
       const selected = document.querySelector('wi-explorer-node .row.selected .name');
       return {
         selected: selected === null ? null : selected.textContent.trim(),
         sheets: document.querySelectorAll('wi-sheet-list .row').length,
         title: document.querySelector('wi-panel-header .title')?.textContent.trim() ?? null,
       };
     })()`,
  )) as { selected: string | null; sheets: number; title: string | null };
  if (afterGroup.selected !== 'Part Two') {
    throw new Error(`the new group is not the selected one: ${String(afterGroup.selected)}`);
  }
  if (afterGroup.sheets !== 0) {
    throw new Error(`the new group should hold no sheets, the list shows ${afterGroup.sheets}`);
  }

  // Renaming a group touches structure.json alone — the directory keeps its
  // name, which is what keeps `order` and every path valid.
  await rightClickNodeContaining(window, 'Part Two');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'Rename');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'The Second Part');
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (!statSync(groupPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('renaming a group moved its directory');
  }
  if (displayNameOf(smoke.projectPath, 'part-two') !== 'The Second Part') {
    throw new Error('the group rename did not reach structure.json');
  }

  console.log(
    'smoke ok: created a sheet, renamed a closed one on disk and the open one into its edits, ' +
      'and created and renamed a group — no file or directory name changed',
  );

}

/**
 * Checks that a sheet and a group can be dragged into a new order, and that
 * the order lands in `structure.json`. SPEC.md §6.4.
 */
export async function checkReordering(smoke: Smoke, window: BrowserWindow, projectPath: string): Promise<void> {
  // Back to the root group, whose sheet list holds two sheets.
  await clickText(window, 'wi-explorer-node .name', 'Smoke Project');
  await new Promise((resolve) => setTimeout(resolve, 300));

  const first = await rowPoint(window, 'wi-sheet-list li', 'Renamed In Place');
  const second = await rowPoint(window, 'wi-sheet-list li', 'Renamed While Open');
  // Past the middle of the row below, which is where the insertion line moves.
  // Into the lower band of the row below, which means "after that row".
  await dragTo(smoke, 
    window,
    first,
    { x: first.x, y: second.y + Math.round(second.height * 0.4) },
    'smoke-drag.png',
  );

  const sheetOrder = orderOf(projectPath, '.');
  if (sheetOrder.indexOf('a-brand-new-scene.md') > sheetOrder.indexOf('opening.md')) {
    throw new Error(`the sheet did not move: ${JSON.stringify(sheetOrder)}`);
  }

  const shown = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (shown[0] !== 'Renamed While Open' || shown[1] !== 'Renamed In Place') {
    throw new Error(`the list still shows the old order: ${JSON.stringify(shown)}`);
  }

  // Dragging a sheet must not also open it: the author was moving it.
  const headers = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!headers.some((title) => title.startsWith('Renamed While Open'))) {
    throw new Error(`the editor lost its sheet while dragging: ${JSON.stringify(headers)}`);
  }
  if (headers.some((title) => title.startsWith('Renamed In Place'))) {
    throw new Error('dragging a sheet opened it');
  }

  // The same gesture in the tree, where a group moves among its siblings.
  const second_ = await rowPoint(window, 'wi-explorer-node .row', 'The Second Part');
  const partOne = await rowPoint(window, 'wi-explorer-node .row', 'Part One');
  // Into the upper band of Part One, which means "before that row".
  await dragTo(smoke, window, second_, { x: second_.x, y: partOne.y - Math.round(partOne.height * 0.4) });

  const groupOrder = orderOf(projectPath, '.');
  if (groupOrder.indexOf('part-two') > groupOrder.indexOf('part-1')) {
    throw new Error(`the group did not move: ${JSON.stringify(groupOrder)}`);
  }

  const tree = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-explorer-node .name')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (tree[1] !== 'The Second Part' || tree[2] !== 'Part One') {
    throw new Error(`the tree still shows the old order: ${JSON.stringify(tree)}`);
  }

  console.log(
    'smoke ok: dragged a sheet and a group into a new order, recorded in structure.json, ' +
      'and dragging opened nothing',
  );

}

/**
 * Checks that an entry goes to the trash, that it is really *moved* there, and
 * that neither Escape nor Return takes anything away. SPEC.md §6.7.
 */
export async function checkDeletion(smoke: Smoke, window: BrowserWindow, projectPath: string): Promise<void> {
  // Return must not delete — and the dialog must actually be gone afterwards.
  // Without that second half, a dialog that ignores Return passes this check.
  for (const key of ['Return', 'Escape']) {
    await openDeleteDialog(window, 'wi-sheet-list .row', 'Renamed In Place', 'Delete Sheet');

    const focused = (await window.webContents.executeJavaScript(
      "(document.activeElement || {}).textContent?.trim() ?? null",
    )) as string | null;
    if (focused !== 'Cancel') {
      throw new Error(`the confirmation put the keyboard on ${String(focused)}, not on Cancel`);
    }

    await pressKey(window, key);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stillOpen = (await window.webContents.executeJavaScript(
      "document.querySelector('wi-confirm-prompt') !== null",
    )) as boolean;
    if (stillOpen) {
      throw new Error(`${key} left the confirmation open`);
    }
    if (!existsSync(join(projectPath, 'opening.md'))) {
      throw new Error(`${key} in the confirmation deleted the sheet`);
    }
  }

  // Aimed at, it deletes.
  await openDeleteDialog(window, 'wi-sheet-list .row', 'Renamed In Place', 'Delete Sheet');
  await clickText(window, 'wi-confirm-prompt button', 'Delete');
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (existsSync(join(projectPath, 'opening.md'))) {
    throw new Error('the sheet is still in the project');
  }
  // Moved, not destroyed — the whole point of a trash.
  const trashed = readFileSync(join(smoke.trashPath, 'opening.md'), 'utf8');
  if (!trashed.includes('title: Renamed In Place')) {
    throw new Error('what reached the trash is not the sheet that was deleted');
  }
  if (orderOf(projectPath, '.').includes('opening.md')) {
    throw new Error('structure.json still names the deleted sheet');
  }

  // The author is left somewhere, not nowhere.
  const remaining = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (remaining.length !== 1 || remaining[0] !== 'Renamed While Open') {
    throw new Error(`the list is wrong after deleting: ${JSON.stringify(remaining)}`);
  }

  // A group takes its contents along, in one piece.
  await openDeleteDialog(window, 'wi-explorer-node .row', 'Part One', 'Delete Group');
  const warning = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-confirm-prompt .warning')?.textContent.trim() ?? null`,
  )) as string | null;
  if (warning === null || !warning.includes('1 sheet')) {
    throw new Error(`the confirmation does not say what goes along: ${String(warning)}`);
  }

  const image = await window.webContents.capturePage();
  const evidencePath = join(smoke.evidenceDirectory, 'smoke-delete.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  await clickText(window, 'wi-confirm-prompt button', 'Delete');
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (existsSync(join(projectPath, 'part-1'))) {
    throw new Error('the group is still in the project');
  }
  if (!existsSync(join(smoke.trashPath, 'part-1', 'scene.md'))) {
    throw new Error('the group did not reach the trash with its sheet inside');
  }

  console.log(
    'smoke ok: a sheet and a group moved to the trash with their contents, the record forgot ' +
      'them, and neither Return nor Escape deleted anything',
  );

}

/**
 * Checks that an entry can be dragged into another group — the sheet list into
 * the tree, and the tree into itself. SPEC.md §6.8.
 */
export async function checkMovingBetweenGroups(smoke: Smoke, window: BrowserWindow, projectPath: string): Promise<void> {
  // A second group to move things into.
  await rightClickNodeContaining(window, 'Smoke Project');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Group');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Part Three');
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Creating one selects it, and its sheet list is empty; the sheet to be
  // moved is in the root.
  await clickText(window, 'wi-explorer-node .name', 'Smoke Project');
  await new Promise((resolve) => setTimeout(resolve, 300));

  // The open sheet, from the sheet list into a group in the tree.
  const sheet = await rowPoint(window, 'wi-sheet-list .row', 'Renamed While Open');
  const partThree = await rowPoint(window, 'wi-explorer-node .row', 'Part Three');
  await dragTo(smoke, window, sheet, { x: partThree.x, y: partThree.y }, 'smoke-move.png');

  if (existsSync(join(projectPath, 'a-brand-new-scene.md'))) {
    throw new Error('the sheet is still in the group it was dragged out of');
  }
  if (!existsSync(join(projectPath, 'part-three', 'a-brand-new-scene.md'))) {
    throw new Error('the sheet did not arrive in the group it was dropped on');
  }
  if (orderOf(projectPath, '.').includes('a-brand-new-scene.md')) {
    throw new Error('the record still holds the sheet in its old group');
  }
  // The editor holds the same document, at its new path.
  const headers = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!headers.some((title) => title.startsWith('Renamed While Open'))) {
    throw new Error(`moving the open sheet closed it: ${JSON.stringify(headers)}`);
  }

  // A group into another group, with everything in it.
  const source = await rowPoint(window, 'wi-explorer-node .row', 'Part Three');
  const target = await rowPoint(window, 'wi-explorer-node .row', 'The Second Part');
  await dragTo(smoke, window, source, { x: target.x, y: target.y });

  if (!existsSync(join(projectPath, 'part-two', 'part-three', 'a-brand-new-scene.md'))) {
    throw new Error('the group did not arrive with its sheet inside');
  }
  if (displayNameOf(projectPath, 'part-two/part-three') !== 'Part Three') {
    throw new Error('the moved group lost its display name: its entry was not carried along');
  }
  if (displayNameOf(projectPath, 'part-three') !== null) {
    throw new Error('the record still has an entry at the old path');
  }

  // Still the same document, two moves later.
  const afterwards = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!afterwards.some((title) => title.startsWith('Renamed While Open'))) {
    throw new Error(`moving the group around the open sheet closed it: ${JSON.stringify(afterwards)}`);
  }

  // A group placed *between* the children of another group: the travelling and
  // the position said in one drop (SPEC.md §6.8).
  await rightClickNodeContaining(window, 'Smoke Project');
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', 'New Group');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'Part Four');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const four = await rowPoint(window, 'wi-explorer-node .row', 'Part Four');
  const three = await rowPoint(window, 'wi-explorer-node .row', 'Part Three');
  await dragTo(smoke, window, four, { x: three.x, y: three.y - Math.round(three.height * 0.4) });

  if (!existsSync(join(projectPath, 'part-two', 'part-four'))) {
    throw new Error('the group did not travel into the other group');
  }
  const placed = orderOf(projectPath, 'part-two');
  if (placed[0] !== 'part-four' || placed[1] !== 'part-three') {
    throw new Error(`the group travelled but was not placed: ${JSON.stringify(placed)}`);
  }

  console.log(
    'smoke ok: dragged a sheet into a group, that group into another, and a third in front of ' +
      'it — one drop said both where and which place, and the open editor followed',
  );

}

/**
 * Checks the comparison rule of `SPEC.md` §10.6 where it can already be
 * reached: the explicit re-read.
 */
export async function checkExternalChange(
  window: BrowserWindow,
  projectPath: string,
): Promise<string> {
  // The open sheet, after the two moves above.
  const sheetPath = join(projectPath, 'part-two', 'part-three', 'a-brand-new-scene.md');
  const original = readFileSync(sheetPath, 'utf8');

  await placeCursorInEditor(window);
  await typeText(window, 'Typed but never saved.');
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Someone else writes the file while the author has unsaved work in it.
  writeFileSync(sheetPath, `${original}\nWritten by someone else.\n`, 'utf8');
  await reloadFromDisk(window);

  if (!(await isVisible(window, 'wi-confirm-prompt'))) {
    throw new Error('a file that changed under unsaved work raised no prompt');
  }
  // Asked, not announced: the author's version is still there while it asks.
  if (!(await editorContains(window, 'Typed but never saved.'))) {
    throw new Error('the prompt appeared after the work was already gone');
  }

  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('Escape left the conflict prompt open');
  }
  if (!(await editorContains(window, 'Typed but never saved.'))) {
    throw new Error('keeping the author’s version lost it anyway');
  }
  if (readFileSync(sheetPath, 'utf8').includes('Typed but never saved.')) {
    throw new Error('keeping the author’s version wrote it to disk');
  }

  // With nothing unsaved, the same change is simply taken. Saving first is
  // what makes the buffer clean.
  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 600));
  writeFileSync(sheetPath, `${original}\nWritten again, with nothing unsaved.\n`, 'utf8');
  await reloadFromDisk(window);

  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('an unmodified buffer was asked about instead of reloaded');
  }
  if (!(await editorContains(window, 'Written again, with nothing unsaved.'))) {
    throw new Error('an unmodified buffer did not take the change from disk');
  }

  console.log(
    'smoke ok: a file changed under unsaved work asks before anything is lost, and is taken ' +
      'silently when nothing was typed',
  );
  // The sheet that is open now, for the check that changes it behind the
  // application's back.
  return sheetPath;
}

/**
 * The same rule again, with nobody pressing anything: the watcher of
 * `SPEC.md` §10.6 is what notices. MVP criteria §17.13 and §17.14.
 */
export async function checkWatchedChange(
  window: BrowserWindow,
  projectPath: string,
  sheetPath: string,
): Promise<void> {
  // Content, with nothing unsaved: the change simply arrives.
  writeFileSync(sheetPath, `${readFileSync(sheetPath, 'utf8')}\nNoticed without being asked.\n`, 'utf8');
  await settleWatch(window, () => editorContains(window, 'Noticed without being asked.'));
  if (!(await editorContains(window, 'Noticed without being asked.'))) {
    throw new Error('a change on disk never reached the editor by itself');
  }
  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('an unmodified buffer was asked about instead of reloaded');
  }

  // Content, with unsaved work: the prompt appears on its own.
  await placeCursorInEditor(window);
  await typeText(window, 'Typed while someone else was writing.');
  await new Promise((resolve) => setTimeout(resolve, 200));
  writeFileSync(sheetPath, `${readFileSync(sheetPath, 'utf8')}\nAnd again from outside.\n`, 'utf8');

  await settleWatch(window, async () => isVisible(window, 'wi-confirm-prompt'));
  if (!(await isVisible(window, 'wi-confirm-prompt'))) {
    throw new Error('a file changed under unsaved work raised no prompt of its own accord');
  }
  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!(await editorContains(window, 'Typed while someone else was writing.'))) {
    throw new Error('the work was gone by the time the prompt appeared');
  }

  // Structure: a sheet appearing in the group on screen. The root is empty by
  // now, so one row is the whole answer.
  await clickText(window, 'wi-explorer-node .name', 'Smoke Project');
  await new Promise((resolve) => setTimeout(resolve, 400));
  writeFileSync(
    join(projectPath, 'appeared.md'),
    '---\nopera-incerta:\n  title: Appeared By Itself\n---\nText\n',
    'utf8',
  );

  await settleWatch(window, async () => {
    const titles = (await window.webContents.executeJavaScript(
      `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
    )) as readonly string[];
    return titles.includes('Appeared By Itself');
  });
  const shown = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-sheet-list .title')].map((element) => element.textContent.trim())`,
  )) as readonly string[];
  if (!shown.includes('Appeared By Itself')) {
    throw new Error(`a new sheet did not appear by itself: ${JSON.stringify(shown)}`);
  }

  console.log(
    'smoke ok: a change made behind the application’s back reached the editor, raised the ' +
      'prompt over unsaved work, and put a new sheet in the list — with nobody pressing refresh',
  );
}

/** Waits for the watcher to have done its work, or gives up. */


/** Clicks into the last editor line, where an author would carry on typing. */

export async function openDeleteDialog(
  window: BrowserWindow,
  selector: string,
  text: string,
  entry: string,
): Promise<void> {
  const point = await rowPoint(window, selector, text);
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
  await waitForSelector(window, 'wi-context-menu [role="menuitem"]');
  await clickText(window, 'wi-context-menu [role="menuitem"]', entry);
  await waitForSelector(window, 'wi-confirm-prompt button');
}

/** The recorded order of one group. */

export function orderOf(projectPath: string, relativePath: string): readonly string[] {
  const structure = JSON.parse(
    readFileSync(join(projectPath, '.opera-incerta', 'structure.json'), 'utf8'),
  ) as Record<string, { order?: string[] } | undefined>;
  return structure[relativePath]?.order ?? [];
}

/** The middle of the element matching `selector` that carries `text`. */

export async function rowPoint(
  window: BrowserWindow,
  selector: string,
  text: string,
): Promise<{ x: number; y: number; height: number }> {
  const point = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll(${JSON.stringify(selector)})]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(text)}));
       if (row === undefined) { return null; }
       const bounds = row.getBoundingClientRect();
       return {
         x: Math.round(bounds.left + bounds.width / 2),
         y: Math.round(bounds.top + bounds.height / 2),
         height: Math.round(bounds.height),
       };
     })()`,
  )) as { x: number; y: number; height: number } | null;
  if (point === null) {
    throw new Error(`no row containing ${text}`);
  }
  return point;
}

/**
 * Presses on a row, travels to a point in steps, and releases — as a hand does.
 * The path is followed in both directions, because a drag may cross from one
 * library column into the other.
 *
 * `evidence` names a screenshot taken while the pointer is still down, because
 * the insertion line and the destination highlight only exist during the drag,
 * and a check that never looks at them cannot say the author sees anything
 * (`TESTING.md` §1.9).
 */
export async function dragTo(
  smoke: Smoke,
  window: BrowserWindow,
  from: { x: number; y: number },
  to: { x: number; y: number },
  evidence?: string,
): Promise<void> {
  window.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, clickCount: 1 });

  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    const x = Math.round(from.x + ((to.x - from.x) * step) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * step) / steps);
    window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  if (evidence !== undefined) {
    const image = await window.webContents.capturePage();
    const directory = smoke.evidenceDirectory;
    mkdirSync(directory, { recursive: true });
    const path = join(directory, evidence);
    writeFileSync(path, image.toPNG());
    console.log(`smoke evidence: ${path}`);
  }

  window.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

/** The display name `structure.json` records for a group, if any. */

export function displayNameOf(projectPath: string, relativePath: string): string | null {
  const structure = JSON.parse(
    readFileSync(join(projectPath, '.opera-incerta', 'structure.json'), 'utf8'),
  ) as Record<string, { displayName?: string } | undefined>;
  return structure[relativePath]?.displayName ?? null;
}

/** Right-clicks the explorer node whose name is the given text. */
