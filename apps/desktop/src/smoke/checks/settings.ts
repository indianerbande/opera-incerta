import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Menu, type BrowserWindow } from 'electron';
import { menuItemId } from '../../application-menu.js';
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
  readonly colorScheme?: string;
  readonly accentPalette?: string;
  readonly editorFontSize?: number;
  readonly editorWordWrap?: boolean;
  readonly showBlankLines?: boolean;
  readonly sheetListDensity?: string;
  readonly showDeeperOutline?: boolean;
  readonly interfaceLanguage?: string;
}

async function dialogTitle(window: BrowserWindow): Promise<string | null> {
  return (await window.webContents.executeJavaScript(
    `document.querySelector('wi-settings h2')?.textContent.trim() ?? null`,
  )) as string | null;
}

/** Picks a language by the label beside its radio button. */
async function chooseLanguage(window: BrowserWindow, label: string): Promise<void> {
  const chosen = (await window.webContents.executeJavaScript(
    `(() => {
       const option = [...document.querySelectorAll('wi-settings fieldset.language label')]
         .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)});
       const radio = option?.querySelector('input');
       if (!radio) { return false; }
       radio.click();
       return true;
     })()`,
  )) as boolean;
  if (!chosen) {
    throw new Error(`no language labelled ${label}`);
  }
  await rendered(window);
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

  // The editor settings, measured on the editor itself (SPEC.md §13).
  await clickText(window, 'wi-settings .category', 'Editor');
  const measure = async (): Promise<{ size: number; family: string; wrapping: boolean; h2: number }> =>
    (await window.webContents.executeJavaScript(
      `(() => {
         const content = document.querySelector('.cm-content');
         const style = getComputedStyle(content);
         const heading = document.querySelector('.cm-heading-2');
         return {
           size: Number.parseFloat(style.fontSize),
           family: style.fontFamily,
           wrapping: content.classList.contains('cm-lineWrapping'),
           h2: heading === null ? 0 : Number.parseFloat(getComputedStyle(heading).fontSize),
         };
       })()`,
    )) as { size: number; family: string; wrapping: boolean; h2: number };
  const defaults = await measure();
  if (defaults.size !== 16 || !defaults.wrapping || !/Georgia/u.test(defaults.family)) {
    throw new Error(`the editor does not start from its defaults: ${JSON.stringify(defaults)}`);
  }
  await window.webContents.executeJavaScript(
    `(() => {
       const field = document.querySelector('wi-settings input[name="fontSize"]');
       field.value = '20';
       field.dispatchEvent(new Event('change', { bubbles: true }));
     })()`,
  );
  await waitUntil('the base size to reach the editor', async () => (await measure()).size === 20);
  const larger = await measure();
  if (Math.round(larger.h2) !== 32) {
    throw new Error(`H2 did not keep its ratio to the base: ${JSON.stringify(larger)}`);
  }
  await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-settings fieldset.font-family label')]
       .find((label) => label.textContent.trim() === 'Monospace')?.querySelector('input')?.click()`,
  );
  await waitUntil('the family to reach the editor', async () => /Menlo|monospace/u.test((await measure()).family));
  await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-settings label.switch')]
       .find((label) => label.textContent.includes('Wrap long lines'))?.querySelector('input')?.click()`,
  );
  await waitUntil('wrapping to leave the editor', async () => !(await measure()).wrapping);
  await waitUntil(
    'the editor settings to reach the preference file',
    () => readStored(smoke)?.editorFontSize === 20 && readStored(smoke)?.editorWordWrap === false,
  );
  const editorEvidence = join(smoke.evidenceDirectory, 'smoke-settings-editor.png');
  await rendered(window);
  writeFileSync(editorEvidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${editorEvidence}`);

  // The interface language, and the native menu with it (SPEC.md §14).
  await clickText(window, 'wi-settings .category', 'Appearance');
  await chooseLanguage(window, 'Deutsch');
  await waitUntil(
    'the dialog to speak German',
    async () => (await dialogTitle(window)) === 'Einstellungen',
  );
  const menuLabel = (): string | undefined =>
    Menu.getApplicationMenu()?.getMenuItemById(menuItemId('settings/open'))?.label;
  await waitUntil('the native menu to follow', () => menuLabel() === 'Einstellungen…');
  const lang = (await window.webContents.executeJavaScript('document.documentElement.lang')) as string;
  if (lang !== 'de') {
    throw new Error(`the document's language is ${JSON.stringify(lang)}, not de`);
  }
  const gear = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-activity-bar button.tool')?.getAttribute('aria-label')`,
  )) as string | null;
  if (gear !== 'Einstellungen') {
    throw new Error(`the activity bar says ${JSON.stringify(gear)} in German`);
  }
  const german = join(smoke.evidenceDirectory, 'smoke-settings-de.png');
  await rendered(window);
  writeFileSync(german, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${german}`);
  await chooseLanguage(window, 'English');
  await waitUntil('the dialog to speak English again', async () => (await dialogTitle(window)) === 'Settings');
  await waitUntil('the native menu to follow back', () => menuLabel() === 'Settings…');

  // Reset restores the complete default record.
  await clickText(window, 'wi-settings button.reset', 'Reset all settings');
  await waitUntil(
    'the defaults to reach the preference file',
    () => readStored(smoke)?.showBlankLines === false && readStored(smoke)?.sheetListDensity === 'standard',
  );
  await waitUntil('the editor to return to its defaults', async () => {
    const now = await measure();
    return now.size === 16 && now.wrapping;
  });
  // The default follows the system, which on this machine may be German:
  // English is put back explicitly, so the checks after this one can read.
  await waitUntil(
    'the record to say system after the reset',
    () => readStored(smoke)?.interfaceLanguage === 'system',
  );
  // The first category is Appearance in either language — after the reset
  // the list may already say "Darstellung".
  await clickText(window, 'wi-settings .category', '');
  await chooseLanguage(window, 'English');
  await waitUntil('English to be recorded', () => readStored(smoke)?.interfaceLanguage === 'en');
  await pressKey(window, 'Escape');
  await waitUntil('the dialog to close after the reset', async () => !(await settingsOpen(window)));
  // The reset put the navigator back on the explorer; the checks after this
  // one expect source control showing, as they found it.
  await activateSidebar(window, 'Source control');
  await waitForSelector(window, 'wi-source-control .changes');

  console.log(
    'smoke ok: settings opened from the menu and the activity bar, a switch reached the ' +
      'preference file, Escape returned focus, the identity reached the repository, the ' +
      'interface and the native menu spoke German and English again, the editor took a base ' +
      'size, a family and no wrapping with headings keeping their ratio, reset restored the defaults',
  );
}

/** What the visual system computes to, read off the running workbench. */
interface Appearance {
  readonly scheme: string | null;
  readonly palette: string | null;
  readonly canvas: string;
  readonly accent: string;
  readonly workbenchFont: string;
  readonly editorPanel: string;
  /** Every packaged face, fetched over the renderer's own protocol. */
  readonly served: readonly string[];
  /** The width of a line set in Plex, against the same line in a face that is not there. */
  readonly plexWidth: number;
  readonly fallbackWidth: number;
}

async function appearance(window: BrowserWindow): Promise<Appearance> {
  return (await window.webContents.executeJavaScript(
    `(async () => {
       const root = document.documentElement;
       const styles = getComputedStyle(root);
       const workbench = document.querySelector('.workbench');
       const editor = document.querySelector('.cm-editor');
       const pen = document.createElement('canvas').getContext('2d');
       const measure = (family) => {
         pen.font = '16px ' + family;
         return pen.measureText('Handgloves 0123456789 — the quick brown fox').width;
       };
       return {
         scheme: root.dataset.colorScheme ?? null,
         palette: root.dataset.colorPalette ?? null,
         canvas: styles.getPropertyValue('--wi-canvas').trim(),
         accent: styles.getPropertyValue('--wi-accent').trim(),
         workbenchFont: workbench === null ? '' : getComputedStyle(workbench).fontFamily,
         editorPanel: editor === null ? '' : getComputedStyle(editor).backgroundColor,
         served: await Promise.all(
           [
             'IBMPlexSans-Regular', 'IBMPlexSans-Medium', 'IBMPlexSans-SemiBold',
             'IBMPlexSans-Bold', 'IBMPlexSans-Italic',
             'IBMPlexMono-Regular', 'IBMPlexMono-Bold', 'IBMPlexMono-Italic',
           ].map(async (name) => {
             try {
               const response = await fetch('/fonts/ibm-plex/' + name + '.woff2');
               if (!response.ok) { return name + ': ' + response.status; }
               const bytes = new Uint8Array((await response.arrayBuffer()).slice(0, 4));
               return name + ': ' + String.fromCharCode(...bytes);
             } catch (error) {
               return name + ': ' + String(error);
             }
           }),
         ),
         // A face that is declared but never arrived falls back silently, and
         // every name-based question would still say yes. Two lines of the
         // same text in two families differ in width only if the first one is
         // really there.
         plexWidth: measure('"IBM Plex Sans"'),
         fallbackWidth: measure('"wi-no-such-face"'),
       };
     })()`,
  )) as Appearance;
}

/**
 * The visual system. SPEC.md §8.8.
 *
 * That the packaged face actually arrived over the renderer's own protocol,
 * that the scheme reaches the root element and the tokens with it, and that a
 * palette changes the accent and nothing else. Everything is read as the
 * browser computed it, not as the stylesheet wrote it.
 */
export async function checkAppearance(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const start = await appearance(window);
  // Every packaged file arrives over the renderer's protocol, and arrives as a
  // WOFF2 rather than as an error page.
  const wrong = start.served.filter((entry) => !entry.endsWith(': wOF2'));
  if (wrong.length > 0) {
    throw new Error(`packaged faces did not arrive: ${JSON.stringify(wrong)}`);
  }
  if (start.plexWidth === start.fallbackWidth || start.plexWidth === 0) {
    throw new Error(
      `IBM Plex Sans renders exactly like a face that does not exist (${start.plexWidth}px): it did not load`,
    );
  }
  if (!start.workbenchFont.includes('IBM Plex Sans')) {
    throw new Error(`the workbench is set in ${JSON.stringify(start.workbenchFont)}`);
  }
  if (start.palette !== 'blue' || (start.scheme !== 'light' && start.scheme !== 'dark')) {
    throw new Error(`the root does not carry a resolved appearance: ${JSON.stringify(start)}`);
  }

  // Dark, chosen explicitly: the whole token set changes, not a filter over it.
  await clickText(window, 'wi-activity-bar button[aria-label="Settings"]', '');
  await waitForSelector(window, 'wi-settings');
  await clickText(window, 'wi-settings .category', 'Appearance');
  await clickText(window, 'wi-settings fieldset.scheme label', 'Dark');
  await waitUntil('the dark scheme to reach the root', async () => (await appearance(window)).scheme === 'dark');

  const dark = await appearance(window);
  if (dark.canvas === start.canvas && start.scheme === 'light') {
    throw new Error(`the canvas did not change with the scheme: ${dark.canvas}`);
  }
  if (dark.editorPanel === 'rgb(255, 255, 255)') {
    throw new Error('the editor stayed white in the dark scheme');
  }
  await waitUntil(
    'the scheme to reach the preference file',
    () => readStored(smoke)?.colorScheme === 'dark',
  );
  const evidence = join(smoke.evidenceDirectory, 'smoke-appearance-dark.png');
  await rendered(window);
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  // A palette changes the accent; the surfaces follow it, the ink does not.
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const swatch = document.querySelector('wi-settings .swatch[data-color-palette="green"] input');
       if (swatch === null) { return false; }
       swatch.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error('the appearance category shows no green swatch');
  }
  await waitUntil('the palette to reach the root', async () => (await appearance(window)).palette === 'green');
  const green = await appearance(window);
  if (green.accent === dark.accent) {
    throw new Error(`the accent did not change with the palette: ${green.accent}`);
  }
  await waitUntil(
    'the palette to reach the preference file',
    () => readStored(smoke)?.accentPalette === 'green',
  );
  const paletteEvidence = join(smoke.evidenceDirectory, 'smoke-appearance-palette.png');
  await rendered(window);
  writeFileSync(paletteEvidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${paletteEvidence}`);

  // Back to what the checks after this one expect: the system's scheme, blue.
  await clickText(window, 'wi-settings fieldset.scheme label', 'Follow the system');
  await window.webContents.executeJavaScript(
    `document.querySelector('wi-settings .swatch[data-color-palette="blue"] input')?.click()`,
  );
  await waitUntil(
    'the appearance to be back where it started',
    async () => {
      const now = await appearance(window);
      return now.palette === 'blue' && now.scheme === start.scheme;
    },
  );
  await pressKey(window, 'Escape');
  await waitUntil('the settings dialog to close', async () => !(await settingsOpen(window)));

  console.log(
    'smoke ok: the packaged face loaded and the workbench is set in it; the dark scheme reached ' +
      'the root, the tokens and the preference file; a palette changed the accent and went back',
  );
}
