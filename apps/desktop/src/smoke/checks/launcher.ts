/**
 * The launcher window: opening a project, returning to it, creating one, and
 * the native menu. SPEC.md §8.5, §8.6.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow, Menu } from 'electron';
import { MENU_ACCELERATORS, menuItemId } from '../../application-menu.js';
import {
  activateSidebar,
  clickAndLeave,
  clickMenuItem,
  clickText,
  headerTitle,
  isVisible,
  rendered,
  sheetTitles,
  waitForLauncher,
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

  await clickAndLeave(launcher, '.welcome .actions button', 'Open project');

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
  const launcher = await waitForLauncher(smoke);

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

/** What the folder question is showing: its heading, text, list, and buttons. */
interface FolderQuestion {
  readonly title: string | null;
  readonly body: string | null;
  readonly where: string | null;
  readonly listed: readonly string[];
  readonly buttons: readonly string[];
}

async function folderQuestion(launcher: BrowserWindow): Promise<FolderQuestion> {
  await waitForSelector(launcher, 'wi-open-folder-question');
  return (await launcher.webContents.executeJavaScript(
    `(() => {
       const dialog = document.querySelector('wi-open-folder-question');
       return {
         title: dialog.querySelector('h2')?.textContent?.trim() ?? null,
         body: dialog.querySelector('.body')?.textContent?.trim() ?? null,
         where: dialog.querySelector('.where')?.textContent?.trim() ?? null,
         listed: [...dialog.querySelectorAll('.projects li')].map((item) => item.textContent.trim()),
         buttons: [...dialog.querySelectorAll('.actions button')].map((b) => b.textContent.trim()),
       };
     })()`,
  )) as FolderQuestion;
}

/** Points the chooser at a folder and presses the launcher's Open button. */
async function openFolder(smoke: Smoke, launcher: BrowserWindow, folder: string): Promise<void> {
  smoke.chooseFolder(folder);
  await clickAndLeave(launcher, '.welcome .actions button', 'Open project');
}

/**
 * Opening a folder that is not a project. SPEC.md §8.6.
 *
 * The three answers other than "this is a project" are questions, and this
 * drives all three through the real launcher: a folder of texts becomes a
 * project, the folder above it offers the project inside it, and a folder
 * holding two names both and opens neither.
 *
 * Returns the launcher, which is a **new** window after each project closes.
 */
export async function checkOpeningAFolder(
  smoke: Smoke,
  launcher: BrowserWindow,
): Promise<BrowserWindow> {
  const folder = join(smoke.plainParent, 'manuscript');
  await openFolder(smoke, launcher, folder);

  const adoption = await folderQuestion(launcher);
  if (adoption.title !== 'Not a project yet') {
    throw new Error(`the adoption question reads ${JSON.stringify(adoption.title)}`);
  }
  if (adoption.body === null || !adoption.body.includes('manuscript')) {
    throw new Error(`the question does not name the folder: ${JSON.stringify(adoption.body)}`);
  }
  if (adoption.buttons.length !== 2 || !adoption.buttons.includes('Use as project')) {
    throw new Error(`unexpected buttons: ${JSON.stringify(adoption.buttons)}`);
  }
  // Asking is not doing: nothing is written and nothing is opened until the
  // author answers.
  if (existsSync(join(folder, '.opera-incerta'))) {
    throw new Error('the folder was made a project before the question was answered');
  }
  if (smoke.shell.projectWindow() !== null) {
    throw new Error('a project window appeared behind the question');
  }
  // The one button that carries the action wears the accent (SPEC.md §8.9).
  const primary = (await launcher.webContents.executeJavaScript(
    `(() => {
       const button = document.querySelector('wi-open-folder-question button.primary');
       if (button === null) { return null; }
       const style = getComputedStyle(button);
       const accent = getComputedStyle(document.documentElement).getPropertyValue('--wi-accent').trim();
       const probe = document.createElement('span');
       probe.style.color = accent;
       document.body.append(probe);
       const resolved = getComputedStyle(probe).color;
       probe.remove();
       return { background: style.backgroundColor, accent: resolved, weight: style.fontWeight };
     })()`,
  )) as { background: string; accent: string; weight: string } | null;
  if (primary === null || primary.background !== primary.accent) {
    throw new Error(`the affirmative button does not carry the accent: ${JSON.stringify(primary)}`);
  }

  const evidence = join(smoke.evidenceDirectory, 'smoke-adopt-folder.png');
  writeFileSync(evidence, (await launcher.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  // The launcher goes away with this click, so nothing is awaited in it.
  await clickAndLeave(launcher, 'wi-open-folder-question button.confirm', 'Use as project');
  let window = await waitForProjectWindow(smoke);
  await waitForSelector(window, 'wi-root .workbench');

  const record = JSON.parse(
    readFileSync(join(folder, '.opera-incerta', 'project.json'), 'utf8'),
  ) as { displayName: string; id: string };
  if (record.displayName !== 'manuscript') {
    throw new Error(`adoption named the project ${JSON.stringify(record.displayName)}`);
  }
  if (await headerTitle(window, '') !== 'manuscript') {
    throw new Error('the workbench does not show the adopted folder as the project');
  }
  // The texts that were there before are the library now, untouched — and
  // they are listed by file name, because nothing has given them a title yet.
  const sheets = await sheetTitles(window);
  if (sheets.join(', ') !== 'first-light, the-ferry') {
    throw new Error(`the adopted project does not list its texts: ${JSON.stringify(sheets)}`);
  }
  if (readFileSync(join(folder, 'first-light.md'), 'utf8') !== '# First light\n\nThe harbour, before six.\n') {
    throw new Error('adoption rewrote a file it should not have touched');
  }
  console.log('smoke ok: a folder of texts became a project, and kept its texts as they were');

  clickMenuItem('project/close');
  launcher = await waitForLauncher(smoke);

  // The folder above it holds exactly that one project now, so opening it
  // offers the project rather than adopting the parent.
  await openFolder(smoke, launcher, smoke.plainParent);
  const offer = await folderQuestion(launcher);
  if (offer.title !== 'The project is one level down') {
    throw new Error(`the subproject question reads ${JSON.stringify(offer.title)}`);
  }
  if (offer.body === null || !offer.body.includes('manuscript')) {
    throw new Error(`the offer does not name the project: ${JSON.stringify(offer.body)}`);
  }

  await clickAndLeave(launcher, 'wi-open-folder-question button.confirm', 'Open');
  window = await waitForProjectWindow(smoke);
  await waitForSelector(window, 'wi-root .workbench');
  if (await headerTitle(window, '') !== 'manuscript') {
    throw new Error('the offered subproject is not the project that opened');
  }
  console.log('smoke ok: a folder holding one project offered it, and opened that project');

  clickMenuItem('project/close');
  launcher = await waitForLauncher(smoke);

  // A second project beside the first: now only the author knows which.
  const second = join(smoke.plainParent, 'notes');
  mkdirSync(join(second, '.opera-incerta'), { recursive: true });
  writeFileSync(
    join(second, '.opera-incerta', 'project.json'),
    `${JSON.stringify({ id: 'notes', displayName: 'Notes', created: '2026-09-09T00:00:00.000Z' })}\n`,
    'utf8',
  );

  await openFolder(smoke, launcher, smoke.plainParent);
  const several = await folderQuestion(launcher);
  if (several.title !== 'Several projects in this folder') {
    throw new Error(`the list question reads ${JSON.stringify(several.title)}`);
  }
  if (several.listed.join(', ') !== 'manuscript, notes') {
    throw new Error(`it lists ${JSON.stringify(several.listed)}`);
  }
  // Nothing to say yes to: one button, and it only takes the question away.
  if (several.buttons.length !== 1 || several.buttons[0] !== 'Close') {
    throw new Error(`the list offers ${JSON.stringify(several.buttons)}`);
  }
  const listEvidence = join(smoke.evidenceDirectory, 'smoke-several-projects.png');
  writeFileSync(listEvidence, (await launcher.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${listEvidence}`);

  await clickText(launcher, 'wi-open-folder-question button.cancel', 'Close');
  await waitUntil(
    'the question to go away',
    async () => !(await isVisible(launcher, 'wi-open-folder-question')),
  );
  if (smoke.shell.projectWindow() !== null) {
    throw new Error('naming several projects opened one of them');
  }

  console.log('smoke ok: a folder holding several named them all and opened none');
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

  await clickAndLeave(launcher, 'wi-new-project-dialog button', 'Create');

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

  // A machine without a global identity, from here on: git 2.32+ reads the
  // global configuration from this file, and it is empty. The fixture project
  // set its identity locally, so nothing before this point depended on one.
  const globalConfig = join(smoke.createParent, 'global-gitconfig');
  writeFileSync(globalConfig, '');
  process.env['GIT_CONFIG_GLOBAL'] = globalConfig;

  await clickText(window, 'wi-source-control .create-repository', 'Create repository');
  await waitUntil('the repository to exist', () => existsSync(join(projectPath, '.git')));

  // The question follows, because there is no global identity (SPEC.md §12).
  await waitForSelector(window, 'wi-identity-prompt');
  const question = join(smoke.evidenceDirectory, 'smoke-identity-question.png');
  writeFileSync(question, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${question}`);
  await fillIdentity(window, 'Smoke Author', 'author@opera-incerta.invalid');
  await waitUntil(
    'the identity row to be gone',
    async () => !(await isVisible(window, 'wi-source-control .identity-row')),
  );
  await waitForSelector(window, 'wi-source-control .changes');

  const name = smoke.git(projectPath, ['config', '--local', 'user.name']).trim();
  const email = smoke.git(projectPath, ['config', '--local', 'user.email']).trim();
  if (name !== 'Smoke Author' || email !== 'author@opera-incerta.invalid') {
    throw new Error(`the repository records ${JSON.stringify({ name, email })}`);
  }
  if (readFileSync(globalConfig, 'utf8') !== '') {
    throw new Error('the global configuration was written');
  }

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
      'staged and no commit; the identity question followed and its answer went into the ' +
      'repository only',
  );
}

/** Answers the identity question through its two fields and the Save button. */
async function fillIdentity(window: BrowserWindow, name: string, email: string): Promise<void> {
  const filled = (await window.webContents.executeJavaScript(
    `(() => {
       const fields = [
         [document.querySelector('wi-identity-prompt input[name="name"]'), ${JSON.stringify(name)}],
         [document.querySelector('wi-identity-prompt input[name="email"]'), ${JSON.stringify(email)}],
       ];
       if (fields.some(([field]) => field === null)) { return false; }
       for (const [field, value] of fields) {
         field.value = value;
         field.dispatchEvent(new Event('input', { bubbles: true }));
       }
       return true;
     })()`,
  )) as boolean;
  if (!filled) {
    throw new Error('no identity question to answer');
  }
  await rendered(window);
  await clickText(window, 'wi-identity-prompt button.save', 'Save');
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
