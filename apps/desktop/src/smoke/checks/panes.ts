/**
 * The panes around the editor: inspector, outline, front matter area, page
 * categories, and the column dividers. SPEC.md §8, §10.4, §6.6.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow } from 'electron';
import {
  activateSidebar,
  clickMenuItem,
  clickText,
  toggleSwitch,
  waitForSelector,
} from '../harness.js';
import type { Smoke } from '../context.js';

export async function checkPanes(window: BrowserWindow): Promise<void> {

  // The inspector shows the metadata of the open sheet and its progress.
  const inspector = (await window.webContents.executeJavaScript(
    `(() => {
       const fields = [...document.querySelectorAll('wi-inspector label')].map((label) => ({
         name: (label.firstChild?.textContent ?? '').trim(),
         value: label.querySelector('input, textarea')?.value ?? null,
       }));
       const progress = document.querySelector('wi-inspector .progress')?.textContent ?? '';
       return { fields, progress };
     })()`,
  )) as { fields: Array<{ name: string; value: string | null }>; progress: string };

  const topic = inspector.fields.find((field) => field.name === 'Topic');
  if (topic?.value !== 'harbour') {
    throw new Error(`the inspector does not show the topic: ${JSON.stringify(inspector.fields)}`);
  }
  if (!/\d+ words/.test(inspector.progress)) {
    throw new Error(`the inspector shows no progress: ${JSON.stringify(inspector.progress)}`);
  }

  // Editing a field marks the sheet dirty, exactly as editing the body does.
  const dirtied = (await window.webContents.executeJavaScript(
    `(() => {
       const label = [...document.querySelectorAll('wi-inspector label')]
         .find((candidate) => candidate.textContent.trim().startsWith('Status'));
       const input = label?.querySelector('input');
       if (input === undefined || input === null) { return 'no field'; }
       input.value = 'review';
       input.dispatchEvent(new Event('change', { bubbles: true }));
       return 'ok';
     })()`,
  )) as string;
  if (dirtied !== 'ok') {
    throw new Error(`could not edit a metadata field: ${dirtied}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));

  const marker = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())
       .find((text) => text.startsWith('A Scene')) ?? null`,
  )) as string | null;
  if (marker === null || !marker.endsWith('•')) {
    throw new Error(`editing metadata did not mark the sheet dirty: ${JSON.stringify(marker)}`);
  }

  // The outline lists the headings of the open sheet.
  await activateSidebar(window, 'Outline');
  const outline = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-outline .entry')].map((entry) => entry.textContent.trim())`,
  )) as string[];
  if (!outline.some((entry) => entry.includes('The Second Bell'))) {
    throw new Error(`the outline is missing its heading: ${JSON.stringify(outline)}`);
  }

  // Activating the visible view again collapses the sidebar (SPEC.md §8.4).
  await activateSidebar(window, 'Outline');
  const collapsed = (await window.webContents.executeJavaScript(
    "document.querySelector('.secondary-sidebar') === null",
  )) as boolean;
  if (!collapsed) {
    throw new Error('activating the visible view did not collapse the sidebar');
  }
  await activateSidebar(window, 'Inspector');

  // Source control reads the repository the project sits in.
  const switched = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-activity-bar button')]
         .find((candidate) => candidate.getAttribute('aria-label') === 'Source control');
       if (button === undefined) { return 'no button'; }
       button.click();
       return 'ok';
     })()`,
  )) as string;
  if (switched !== 'ok') {
    throw new Error(`could not switch the navigator: ${switched}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  const sourceControl = (await window.webContents.executeJavaScript(
    `(() => {
       const panel = document.querySelector('wi-source-control');
       if (panel === null) { return null; }
       return {
         text: panel.textContent.trim().slice(0, 80),
         hasChangeList: panel.querySelector('.changes') !== null,
       };
     })()`,
  )) as { text: string; hasChangeList: boolean } | null;

  if (sourceControl === null) {
    throw new Error('the source control panel did not render');
  }
  if (!sourceControl.hasChangeList) {
    throw new Error(`the source control panel lists no changes: ${JSON.stringify(sourceControl)}`);
  }

  console.log('smoke ok: inspector, outline, sidebar collapse, and source control all work');
}

/**
 * Checks the front matter area: two blocks, three switches, and read-only that
 * is a different control rather than a disabled one. SPEC.md §10.4.
 */
export async function checkFrontMatterArea(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const blocksNow = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('wi-front-matter-block').length",
  )) as number;
  if (blocksNow !== 0) {
    throw new Error('the front matter area is showing before it was asked for');
  }

  await toggleSwitch(window, 'Variables');
  const shown = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-front-matter-block')].map((block) => ({
       label: block.querySelector('pre, textarea')?.getAttribute('aria-label') ?? null,
       control: block.querySelector('textarea') !== null ? 'textarea' : 'pre',
       text: (block.querySelector('pre, textarea')?.textContent ??
              block.querySelector('textarea')?.value ?? '').trim(),
       // What the author can actually see, against what there is to see. A
       // scrollbar along the bottom takes its space out of the first.
       visible: Math.round(block.querySelector('.block')?.clientHeight ?? 0),
       needed: Math.round(block.querySelector('.measure')?.getBoundingClientRect().height ?? 0),
     }))`,
  )) as Array<{
    label: string | null;
    control: string;
    text: string;
    visible: number;
    needed: number;
  }>;

  if (shown.length !== 2) {
    throw new Error(`expected a foreign and an own block, found ${JSON.stringify(shown)}`);
  }
  const [foreign, owned] = shown as [(typeof shown)[0], (typeof shown)[0]];
  if (!foreign.text.includes('layout: post') || !foreign.text.includes('author: Someone Else')) {
    throw new Error(`the foreign block does not show the foreign keys: ${foreign.text}`);
  }
  if (!owned.text.includes('opera-incerta:') || !owned.text.includes('title: A Scene in Part One')) {
    throw new Error(`the own block does not show what the file carries: ${owned.text}`);
  }
  // "Show everything, up to ten lines" (SPEC.md §10.4). Both blocks are well
  // under the cap, so all of them must be visible — the defect the visual
  // check found was a block one line short, its last line under a scrollbar.
  for (const block of shown) {
    if (block.needed <= 0 || block.visible + 1 < block.needed) {
      throw new Error(`a block shows ${block.visible}px of ${block.needed}px: ${block.text}`);
    }
  }
  // Read-only is a different control, never a disabled one (SPEC.md §10.4).
  if (foreign.control !== 'pre' || owned.control !== 'pre') {
    throw new Error(`read-only is not a pre: ${JSON.stringify(shown.map((b) => b.control))}`);
  }

  await toggleSwitch(window, 'Writable');
  const writable = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-front-matter-block')].map((block) =>
       block.querySelector('textarea') !== null ? 'textarea' : 'pre')`,
  )) as readonly string[];
  if (writable[0] !== 'textarea' || writable[1] !== 'pre') {
    throw new Error(`only the foreign block becomes writable: ${JSON.stringify(writable)}`);
  }
  const disabled = (await window.webContents.executeJavaScript(
    "document.querySelector('wi-front-matter-block textarea')?.disabled === true",
  )) as boolean;
  if (disabled) {
    throw new Error('the writable block is disabled, which is not what writable means');
  }

  await toggleSwitch(window, 'System');
  const withoutOwned = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('wi-front-matter-block').length",
  )) as number;
  if (withoutOwned !== 1) {
    throw new Error(`turning off "System" left ${withoutOwned} blocks`);
  }

  const image = await window.webContents.capturePage();
  const evidencePath = join(smoke.evidenceDirectory, 'smoke-front-matter.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  // Back to where it started, so the checks after this one see what they expect.
  await toggleSwitch(window, 'System');
  await toggleSwitch(window, 'Writable');
  await toggleSwitch(window, 'Variables');

  console.log(
    'smoke ok: the front matter area shows the foreign and the own block, read-only as a ' +
      'selectable control rather than a disabled one, and only the foreign one turns writable',
  );
}

/** Clicks one of the editor header's switches by its label. */

/**
 * Checks page categories end to end: defined in the manager, assigned in the
 * inspector, shown as a badge with the computed text colour. SPEC.md §6.6.
 */
export async function checkPageCategories(smoke: Smoke, window: BrowserWindow): Promise<void> {
  await clickText(window, 'wi-inspector button', 'Manage');
  await waitForSelector(window, 'wi-category-manager');
  await clickText(window, 'wi-category-manager button', 'Add');
  await new Promise((resolve) => setTimeout(resolve, 200));

  // A dark colour, so the computed text colour has to be white.
  const named = (await window.webContents.executeJavaScript(
    `(() => {
       const row = document.querySelector('wi-category-manager li');
       const name = row?.querySelector('input.name');
       const colour = row?.querySelector('input[type="color"]');
       if (name === null || name === undefined || colour === null || colour === undefined) {
         return false;
       }
       name.value = 'Review';
       name.dispatchEvent(new Event('input', { bubbles: true }));
       colour.value = '#102040';
       colour.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!named) {
    throw new Error('the category manager offered no row to fill in');
  }
  await clickText(window, 'wi-category-manager button', 'Save');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const defined = JSON.parse(
    readFileSync(join(smoke.projectPath, '.opera-incerta', 'categories.json'), 'utf8'),
  ) as Array<{ id: string; name: string; color: string }>;
  if (defined.length !== 1 || defined[0]?.name !== 'Review' || defined[0]?.color !== '#102040') {
    throw new Error(`the category was not written: ${JSON.stringify(defined)}`);
  }

  // Assigned in the inspector, which is where the owned fields are edited.
  const assigned = (await window.webContents.executeJavaScript(
    `(() => {
       const select = document.querySelector('wi-inspector select');
       const option = [...(select?.options ?? [])].find((each) => each.textContent.trim() === 'Review');
       if (select === null || option === undefined) { return false; }
       select.value = option.value;
       select.dispatchEvent(new Event('change', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!assigned) {
    throw new Error('the inspector offers no category to assign');
  }
  await new Promise((resolve) => setTimeout(resolve, 300));

  const badge = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector('wi-sheet-list .badge');
       if (element === null) { return null; }
       const style = getComputedStyle(element);
       return { text: element.textContent.trim(), color: style.color, background: style.backgroundColor };
     })()`,
  )) as { text: string; color: string; background: string } | null;
  if (badge === null || badge.text !== 'Review') {
    throw new Error(`the sheet list shows no badge: ${JSON.stringify(badge)}`);
  }
  // Computed, never stored: a dark background must carry white text.
  if (badge.color !== 'rgb(255, 255, 255)') {
    throw new Error(`the badge text colour was not computed: ${badge.color}`);
  }

  const image = await window.webContents.capturePage();
  const evidencePath = join(smoke.evidenceDirectory, 'smoke-category.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 600));
  const sheet = readFileSync(join(smoke.projectPath, 'part-1', 'scene.md'), 'utf8');
  if (!sheet.includes(`category: ${String(defined[0]?.id)}`)) {
    throw new Error('the assignment did not reach the file');
  }

  console.log(
    'smoke ok: a category was defined, assigned, written to the sheet, and shown as a badge ' +
      'whose text colour is computed from its background',
  );
}

/**
 * Dragging a column divider. SPEC.md §8.2.
 *
 * Through real pointer events, and then read back from the preference file —
 * so what is checked is that the width was stored, not that a signal changed.
 */
export async function checkColumnDragging(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const before = (await window.webContents.executeJavaScript(
    `(() => {
       const navigator = document.querySelector('.navigator');
       const divider = document.querySelector('wi-resize-divider');
       if (navigator === null || divider === null) { return null; }
       const bounds = divider.getBoundingClientRect();
       return {
         width: navigator.getBoundingClientRect().width,
         x: Math.round(bounds.left + bounds.width / 2),
         y: Math.round(bounds.top + 200),
       };
     })()`,
  )) as { width: number; x: number; y: number } | null;
  if (before === null) {
    throw new Error('no divider beside the navigator');
  }

  // Press, move right in steps, release — as a hand does.
  window.webContents.sendInputEvent({ type: 'mouseDown', x: before.x, y: before.y, clickCount: 1 });
  for (let offset = 10; offset <= 40; offset += 10) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: before.x + offset, y: before.y });
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: before.x + 40,
    y: before.y,
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 400));

  const after = (await window.webContents.executeJavaScript(
    "document.querySelector('.navigator')?.getBoundingClientRect().width ?? null",
  )) as number | null;
  if (after === null) {
    throw new Error('the navigator disappeared while dragging');
  }
  if (Math.round(after) <= Math.round(before.width)) {
    throw new Error(`dragging right did not widen the column: ${before.width} to ${after}`);
  }

  // Switching a view must not move it (CONVENTIONS.md C-U1).
  await activateSidebar(window, 'Outline');
  await activateSidebar(window, 'Inspector');
  const afterSwitch = (await window.webContents.executeJavaScript(
    "document.querySelector('.navigator')?.getBoundingClientRect().width ?? null",
  )) as number | null;
  if (Math.round(afterSwitch ?? 0) !== Math.round(after)) {
    throw new Error(`switching views moved the column: ${after} to ${String(afterSwitch)}`);
  }

  // And the width reached the preference file.
  //
  // Compared against the *applied* width rather than the measured one: the
  // divider overlaps its neighbours by a few pixels, so what the column
  // occupies on screen is not the number the layout state set.
  const applied = (await window.webContents.executeJavaScript(
    `Number.parseFloat(document.querySelector('.navigator')?.style.width ?? '0')`,
  )) as number;
  const stored = JSON.parse(readFileSync(smoke.preferencesPath, 'utf8')) as {
    columnWidths: { navigator: number };
  };
  if (stored.columnWidths.navigator !== applied) {
    throw new Error(`stored ${stored.columnWidths.navigator}, applied ${applied}`);
  }

  console.log(
    `smoke ok: dragged the navigator from ${Math.round(before.width)}px to ${applied}px, ` +
      'unchanged by a view switch and stored in the preference file',
  );
}
