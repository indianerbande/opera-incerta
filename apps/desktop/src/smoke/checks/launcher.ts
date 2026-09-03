/**
 * The launcher window: opening a project, returning to it, creating one, and
 * the native menu. SPEC.md §8.5, §8.6.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow, Menu } from 'electron';
import { MENU_ACCELERATORS, menuItemId } from '../../application-menu.js';
import {
  activateSidebar,
  clickMenuItem,
  clickText,
  forwardConsole,
  waitForProjectWindow,
  waitForSelector,
  waitUntil,
} from '../harness.js';
import type { Smoke } from '../context.js';

/**
 * The launcher, and the transition to the workbench. SPEC.md §8.5, §8.6.
 *
 * Returns the project window, which every later check runs against.
 */
export async function checkLauncherAndOpen(smoke: Smoke, launcher: BrowserWindow): Promise<BrowserWindow> {
  // `ready-to-show` fires before the renderer has asked which window it is and
  // loaded the matching component, so the element is waited for rather than
  // assumed.
  await waitForSelector(launcher, '.welcome .actions button');

  const welcome = (await launcher.webContents.executeJavaScript(
    `(() => {
       const root = document.querySelector('wi-root .welcome');
       if (root === null) { return null; }
       return {
         heading: root.querySelector('h1')?.textContent ?? null,
         buttons: [...root.querySelectorAll('.actions button')].map((b) => b.textContent.trim()),
         entries: root.querySelectorAll('.entry').length,
         hint: root.querySelector('.hint')?.textContent ?? null,
       };
     })()`,
  )) as { heading: string | null; buttons: string[]; entries: number; hint: string | null } | null;

  if (welcome === null) {
    throw new Error('the launcher did not render');
  }
  if (welcome.heading !== 'Opera Incerta') {
    throw new Error(`unexpected launcher heading: ${JSON.stringify(welcome.heading)}`);
  }
  if (welcome.buttons.length !== 2) {
    throw new Error(`the launcher must offer open and new: ${JSON.stringify(welcome.buttons)}`);
  }
  // Fresh user data, so nothing has been opened yet.
  if (welcome.entries !== 0 || welcome.hint === null) {
    throw new Error(`expected an empty recent list: ${JSON.stringify(welcome)}`);
  }

  const clicked = (await launcher.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('.actions button')]
         .find((candidate) => candidate.textContent.includes('Open project'));
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error('no "Open project" button in the launcher');
  }

  const window = await waitForProjectWindow(smoke);
  await waitForSelector(window, 'wi-root .workbench');
  await waitUntil('the launcher to give way', () => smoke.shell.welcomeWindow() === null);

  if (smoke.shell.welcomeWindow() !== null) {
    throw new Error('the launcher stayed open after the project appeared');
  }

  console.log('smoke ok: launcher opened a project and gave way to the workbench');
  return window;
}

/** Waits until a selector matches, or fails saying what was expected. */

/**
 * Closing the project returns to the launcher, with the project now in the
 * recent list. SPEC.md §8.5, §8.6.
 */
export async function checkReturnToLauncher(
  smoke: Smoke,
  _projectView: BrowserWindow,
): Promise<BrowserWindow> {
  // Through the File menu, so the specified path — menu, window close, reset,
  // launcher — is the one under test (SPEC.md §8.5).
  clickMenuItem('project/close');

  let launcher: BrowserWindow | null = null;
  for (let attempt = 0; attempt < 100 && launcher === null; attempt += 1) {
    const candidate = smoke.shell.welcomeWindow();
    if (candidate !== null && !candidate.isDestroyed() && !candidate.webContents.isLoading()) {
      launcher = candidate;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (launcher === null) {
    throw new Error('closing the project did not bring the launcher back');
  }
  forwardConsole(launcher);

  await waitForSelector(launcher, '.welcome .entry');
  const recent = (await launcher.webContents.executeJavaScript(
    `[...document.querySelectorAll('.welcome .entry')].map((entry) => ({
       name: entry.querySelector('.name')?.textContent ?? null,
       unavailable: entry.classList.contains('unavailable'),
     }))`,
  )) as Array<{ name: string | null; unavailable: boolean }>;

  if (recent.length !== 1 || recent[0]?.name !== 'Smoke Project') {
    throw new Error(`the recent list is wrong after closing: ${JSON.stringify(recent)}`);
  }
  if (recent[0]?.unavailable === true) {
    throw new Error('the project it just closed is marked unavailable');
  }

  console.log('smoke ok: closing the project returned to the launcher, with it listed as recent');
  return launcher;
}

/**
 * Creating a project from the launcher. SPEC.md §6.1, §8.6.
 *
 * The display name is what the author writes; the directory is a slug of it.
 * The dialog shows that slug before the project exists, and this checks that
 * what it promised is what appeared on disk.
 */
export async function checkCreateProject(smoke: Smoke, launcher: BrowserWindow): Promise<void> {
  clickMenuItem('project/new');
  await waitForSelector(launcher, 'wi-new-project-dialog input');

  const typed = (await launcher.webContents.executeJavaScript(
    `(() => {
       const input = document.querySelector('wi-new-project-dialog input');
       if (input === null) { return 'no input'; }
       input.value = 'Die Nacht am Hafen';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       const choose = [...document.querySelectorAll('wi-new-project-dialog button')]
         .find((button) => button.textContent.includes('Choose'));
       if (choose === undefined) { return 'no choose button'; }
       choose.click();
       return 'ok';
     })()`,
  )) as string;
  if (typed !== 'ok') {
    throw new Error(`could not fill the dialog: ${typed}`);
  }
  // The location comes back over the bridge; the preview follows the name.
  await waitUntil(
    'the folder preview and a chosen location',
    async () =>
      (await launcher.webContents.executeJavaScript(
        `document.querySelector('wi-new-project-dialog code') !== null &&
         ![...document.querySelectorAll('wi-new-project-dialog button')]
           .find((button) => button.textContent.trim() === 'Create')?.disabled`,
      )) as boolean,
  );

  const preview = (await launcher.webContents.executeJavaScript(
    `(() => {
       const code = document.querySelector('wi-new-project-dialog code');
       const create = [...document.querySelectorAll('wi-new-project-dialog button')]
         .find((button) => button.textContent.trim() === 'Create');
       return {
         folder: code === null ? null : code.textContent,
         enabled: create === undefined ? null : !create.disabled,
       };
     })()`,
  )) as { folder: string | null; enabled: boolean | null };

  // Umlauts become ASCII, spaces become hyphens: the rule, shown before it
  // takes effect.
  if (preview.folder !== 'die-nacht-am-hafen') {
    throw new Error(`the dialog previewed ${JSON.stringify(preview.folder)}`);
  }
  if (preview.enabled !== true) {
    throw new Error('Create is not offered with a name and a location');
  }

  const created = (await launcher.webContents.executeJavaScript(
    `(() => {
       const create = [...document.querySelectorAll('wi-new-project-dialog button')]
         .find((button) => button.textContent.trim() === 'Create');
       if (create === undefined) { return false; }
       create.click();
       return true;
     })()`,
  )) as boolean;
  if (!created) {
    throw new Error('no Create button');
  }

  const window = await waitForProjectWindow(smoke);
  await waitForSelector(window, 'wi-root .workbench');

  const projectPath = join(smoke.createParent, 'die-nacht-am-hafen');
  const record = JSON.parse(
    readFileSync(join(projectPath, '.opera-incerta', 'project.json'), 'utf8'),
  ) as { displayName: string; id: string; created: string };

  if (record.displayName !== 'Die Nacht am Hafen') {
    throw new Error(`the record kept ${JSON.stringify(record.displayName)}`);
  }
  if (typeof record.id !== 'string' || record.id === '') {
    throw new Error('the new project has no id');
  }

  const shownName = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .map((element) => element.textContent.trim())[0] ?? null`,
  )) as string | null;
  if (shownName !== 'Die Nacht am Hafen') {
    throw new Error(`the workbench shows ${JSON.stringify(shownName)}`);
  }

  console.log(
    'smoke ok: created a project — the display name kept its spaces, the folder took the slug',
  );

  await checkCreateRepository(smoke, window, projectPath);
}

/**
 * A project without a repository is offered one. SPEC.md §12.
 *
 * The new project is the one place in the run that has none, so the check
 * lives here. What it proves is read from disk and from git: the repository
 * is in the project root, on `main`, with nothing staged and no commit.
 */
async function checkCreateRepository(
  smoke: Smoke,
  window: BrowserWindow,
  projectPath: string,
): Promise<void> {
  await activateSidebar(window, 'Source control');
  await waitForSelector(window, 'wi-source-control .create-repository');
  if (existsSync(join(projectPath, '.git'))) {
    throw new Error('the new project already had a repository');
  }
  const evidence = join(smoke.evidenceDirectory, 'smoke-create-repository.png');
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  await clickText(window, 'wi-source-control .create-repository', 'Create repository');
  await waitUntil('the repository to exist', () => existsSync(join(projectPath, '.git')));
  await waitForSelector(window, 'wi-source-control .changes');

  if (smoke.git(projectPath, ['symbolic-ref', 'HEAD']).trim() !== 'refs/heads/main') {
    throw new Error('the repository did not start on main');
  }
  if (smoke.git(projectPath, ['diff', '--cached', '--name-only']).trim() !== '') {
    throw new Error('creating the repository staged something');
  }
  let hasCommit = true;
  try {
    smoke.git(projectPath, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    hasCommit = false;
  }
  if (hasCommit) {
    throw new Error('creating the repository made a commit');
  }
  const listed = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-source-control .change')].map((row) => row.textContent.trim())`,
  )) as readonly string[];
  // Git reports an untracked directory as one entry, so the project's record
  // directory is the row, not the files inside it.
  if (!listed.some((row) => row.includes('.opera-incerta'))) {
    throw new Error(`the panel does not list the project as untracked: ${JSON.stringify(listed)}`);
  }

  console.log(
    'smoke ok: a project without a repository was offered one, and got it on main with nothing ' +
      'staged and no commit',
  );
}

/** Clicks an entry of the trailing activity bar by its accessible name. */

export function checkMenuState(): void {
  const menu = Menu.getApplicationMenu();
  if (menu === null) {
    throw new Error('no application menu is installed');
  }

  for (const command of Object.keys(MENU_ACCELERATORS) as Array<keyof typeof MENU_ACCELERATORS>) {
    const item = menu.getMenuItemById(menuItemId(command));
    if (item === null || item === undefined) {
      throw new Error(`the menu is missing ${command}`);
    }
    if (item.accelerator !== MENU_ACCELERATORS[command]) {
      throw new Error(
        `${command} has accelerator ${String(item.accelerator)}, expected ${MENU_ACCELERATORS[command]}`,
      );
    }
    // With a project open, every command applies.
    if (!item.enabled) {
      throw new Error(`${command} is disabled while a project is open`);
    }
  }

  // The editing roles must survive a custom menu, or copy and paste stop
  // working inside the editor.
  const edit = menu.items.find((item) => item.label.replace('&', '') === 'Edit');
  // Electron reports roles lower-cased, whatever case the template used.
  const roles = (edit?.submenu?.items ?? []).map((item) => String(item.role).toLowerCase());
  for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectall']) {
    if (!roles.includes(role)) {
      throw new Error(`the Edit menu lost its ${role} role`);
    }
  }

  console.log('smoke ok: the menu offers every command with its shortcut, and keeps the edit roles');
}
