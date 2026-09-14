/**
 * Which build is running, where the author reads it. specification.md §16.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 *
 * The expected line is not read from the record the build wrote — a check
 * that compared the record with itself would pass with a record that is
 * wrong. It is asked of Git, in this checkout, the way the build asks.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { Smoke } from '../context.js';
import { clickMenuItem, pressKey, rendered, waitForSelector, waitUntil, isVisible } from '../harness.js';

/** The line the application should show, from Git itself. */
function expectedLine(smoke: Smoke): string {
  const revision = smoke.git(smoke.repositoryRoot, ['describe', '--tags', '--always', '--dirty']).trim();
  return `Build ${revision}`;
}

interface ShownLine {
  readonly text: string;
  readonly userSelect: string;
}

async function shownLine(window: BrowserWindow, selector: string): Promise<ShownLine | null> {
  return (await window.webContents.executeJavaScript(
    `(() => {
       const line = document.querySelector(${JSON.stringify(selector)});
       if (line === null) { return null; }
       return { text: line.textContent.trim(), userSelect: getComputedStyle(line).userSelect };
     })()`,
  )) as ShownLine | null;
}

function expectLine(where: string, shown: ShownLine | null, expected: string): void {
  if (shown === null) {
    throw new Error(`${where} shows no build line`);
  }
  if (shown.text !== expected) {
    throw new Error(`${where} shows ${JSON.stringify(shown.text)}, git describe says ${JSON.stringify(expected)}`);
  }
  // It is there to be copied into a report.
  if (shown.userSelect !== 'text') {
    throw new Error(`${where}: the build line cannot be selected (user-select: ${shown.userSelect})`);
  }
}

/** The launcher, before anything is opened: the line sits at its foot. */
export async function checkBuildIdentityInLauncher(smoke: Smoke, launcher: BrowserWindow): Promise<void> {
  const selector = '.welcome footer wi-build-identity .line';
  await waitForSelector(launcher, selector);
  await rendered(launcher);
  const expected = expectedLine(smoke);
  expectLine('the launcher', await shownLine(launcher, selector), expected);

  const evidence = join(smoke.evidenceDirectory, 'smoke-build-launcher.png');
  writeFileSync(evidence, (await launcher.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);
  console.log(`smoke ok: the launcher names the running build as git describe does (${expected})`);
}

/** The settings dialog, opened from the menu: the line sits in its footer. */
export async function checkBuildIdentityInSettings(smoke: Smoke, window: BrowserWindow): Promise<void> {
  clickMenuItem('settings/open');
  const selector = 'wi-settings .actions wi-build-identity .line';
  await waitForSelector(window, selector);
  await rendered(window);
  const expected = expectedLine(smoke);
  expectLine('the settings dialog', await shownLine(window, selector), expected);

  const evidence = join(smoke.evidenceDirectory, 'smoke-build-settings.png');
  writeFileSync(evidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${evidence}`);

  await pressKey(window, 'Escape');
  await waitUntil('the settings dialog to close', async () => !(await isVisible(window, 'wi-settings')));
  console.log('smoke ok: the settings dialog names the same build, and the line can be selected');
}
