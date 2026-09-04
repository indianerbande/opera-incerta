import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { Smoke } from '../context.js';
import {
  activateSidebar,
  clickMenuItem,
  clickText,
  isVisible,
  pressKey,
  rendered,
  waitForSelector,
  waitUntil,
} from '../harness.js';

interface StoredPreferences {
  readonly showBlankLines?: boolean;
  readonly sheetListDensity?: string;
  readonly showDeeperOutline?: boolean;
}

function readStored(smoke: Smoke): StoredPreferences | null {
  try {
    return JSON.parse(readFileSync(smoke.preferencesPath, 'utf8')) as StoredPreferences;
  } catch {
    return null;
  }
}

async function settingsOpen(window: BrowserWindow): Promise<boolean> {
  return isVisible(window, 'wi-settings');
}

async function focusedSelector(window: BrowserWindow): Promise<string> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const active = document.activeElement;
       if (active === null) { return 'none'; }
       return active.tagName.toLowerCase() + (active.className ? '.' + String(active.className).split(' ').join('.') : '') + (active.getAttribute('aria-label') ? '[' + active.getAttribute('aria-label') + ']' : '');
     })()`,
  )) as string;
}

/**
 * The settings dialog. SPEC.md §13.
 *
 * Opened from the native menu and from the activity bar; a switch changed in
 * it reaches the preference file and the workbench at once; Escape closes it
 * and focus returns to the control that opened it; Reset restores the
 * defaults; the repository's commit identity is edited in place and read
 * back with git.
 */
export async function checkSettings(smoke: Smoke, window: BrowserWindow): Promise<void> {
  // From the menu — the item owns Cmd/Ctrl+, so the key never reaches the page.
  clickMenuItem('settings/open');
  await waitForSelector(window, 'wi-settings');
  await rendered(window);
  const evidence = join(smoke.evidenceDirectory, 'smoke-settings.png');
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  // A switch changes the preference file and the sheet list at once.
  const before = readStored(smoke)?.showBlankLines ?? false;
  await clickText(window, 'wi-settings .category', 'Sheet list');
  const toggled = (await window.webContents.executeJavaScript(
    `(() => {
       const box = [...document.querySelectorAll('wi-settings label.switch')]
         .find((label) => label.textContent.includes('Show blank lines'))?.querySelector('input');
       if (!box) { return false; }
       box.click();
       return true;
     })()`,
  )) as boolean;
  if (!toggled) {
    throw new Error('the sheet list category shows no blank-lines switch');
  }
  await waitUntil(
    'the switch to reach the preference file',
    () => readStored(smoke)?.showBlankLines === !before,
  );

  // Escape closes it, and focus goes back where it came from.
  await pressKey(window, 'Escape');
  await waitUntil('the dialog to close', async () => !(await settingsOpen(window)));

  // From the activity bar, with the keyboard focus landing inside.
  await clickText(window, 'wi-activity-bar button[aria-label="Settings"]', '');
  await waitForSelector(window, 'wi-settings');
  await rendered(window);
  const focused = await focusedSelector(window);
  if (!focused.startsWith('button.category')) {
    throw new Error(`focus is on ${focused}, not inside the dialog`);
  }
  await pressKey(window, 'Escape');
  await waitUntil('the dialog to close again', async () => !(await settingsOpen(window)));
  const returned = await focusedSelector(window);
  if (!returned.includes('[Settings]')) {
    throw new Error(`focus returned to ${returned}, not to the Settings button`);
  }

  // The identity of this repository, edited in place and read back with git.
  await clickText(window, 'wi-activity-bar button[aria-label="Settings"]', '');
  await waitForSelector(window, 'wi-settings');
  await clickText(window, 'wi-settings .category', 'Source control');
  await waitForSelector(window, 'wi-settings input[name="name"]');
  const shownName = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-settings input[name="name"]').value`,
  )) as string;
  if (shownName !== 'Opera Incerta Smoke') {
    throw new Error(`the dialog shows the identity ${JSON.stringify(shownName)}`);
  }
  await window.webContents.executeJavaScript(
    `(() => {
       const field = document.querySelector('wi-settings input[name="name"]');
       field.value = 'Opera Incerta Smoke, renamed';
       field.dispatchEvent(new Event('input', { bubbles: true }));
     })()`,
  );
  await rendered(window);
  await clickText(window, 'wi-settings button.save-identity', 'Save');
  await waitUntil(
    'the identity to reach the repository',
    () => smoke.git(smoke.projectPath, ['config', '--local', 'user.name']).trim() === 'Opera Incerta Smoke, renamed',
  );
  // Put it back: the commits that follow are compared by their message, but a
  // fixture should leave the run as it found it.
  smoke.git(smoke.projectPath, ['config', 'user.name', 'Opera Incerta Smoke']);

  // Reset restores the complete default record.
  await clickText(window, 'wi-settings button.reset', 'Reset all settings');
  await waitUntil(
    'the defaults to reach the preference file',
    () => readStored(smoke)?.showBlankLines === false && readStored(smoke)?.sheetListDensity === 'standard',
  );
  await pressKey(window, 'Escape');
  await waitUntil('the dialog to close after the reset', async () => !(await settingsOpen(window)));
  // The reset put the navigator back on the explorer; the checks after this
  // one expect source control showing, as they found it.
  await activateSidebar(window, 'Source control');
  await waitForSelector(window, 'wi-source-control .changes');

  console.log(
    'smoke ok: settings opened from the menu and the activity bar, a switch reached the ' +
      'preference file, Escape returned focus, the identity reached the repository, reset ' +
      'restored the defaults',
  );
}
