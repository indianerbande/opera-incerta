/**
 * The smoke entry point: `electron dist/smoke.cjs`, run by `pnpm run
 * desktop:smoke`. TESTING.md §2.7.
 *
 * The smoke launches the real shell with three substitutions — a copy of the
 * fixture instead of the directory chooser, a directory instead of the
 * desktop trash, a temporary user-data directory — and then drives the real
 * renderer through real input events, reading the results from disk and from
 * git rather than from the application's own belief about them.
 *
 * This file is the **whole order** of the run, top to bottom, in `run`. The
 * checks are in `checks/`, the helpers they are built from in `harness.ts`,
 * and what every check receives in `context.ts`. `README.md` beside this file
 * explains how to read, run, debug, and extend it.
 *
 * It is bundled to `dist/smoke.cjs`, separately from the production entry
 * (`../main.ts` → `dist/main.cjs`), so none of it ships.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { PREFERENCES_FILE, startShell } from '../shell.js';
import type { Smoke } from './context.js';
import { forwardConsole, selectSmokeSheet } from './harness.js';
import {
  checkBridgeAnswers,
  checkBridgeRefusesTraversal,
  checkEditorLaidOut,
  checkWorkbenchRendered,
} from './checks/bridge.js';
import {
  checkDocumentFlow,
  checkHeadingCursorRules,
  checkHeadingGestures,
  checkLineNumbers,
  checkZoom,
  checkSheetSwitch,
  checkStatusBar,
  checkGfmDisplay,
} from './checks/editor.js';
import {
  checkCreateProject,
  checkLauncherAndOpen,
  checkMenuState,
  checkOpeningAFolder,
  checkReturnToLauncher,
} from './checks/launcher.js';
import {
  checkDeletion,
  checkExternalChange,
  checkLibraryEdits,
  checkMovingBetweenGroups,
  checkReordering,
  checkWatchedChange,
} from './checks/library.js';
import {
  checkColumnDragging,
  checkRegionsAsPanels,
  checkFrontMatterArea,
  checkPageCategories,
  checkPanes,
} from './checks/panes.js';
import { checkAppearance, checkSettings } from './checks/settings.js';
import { expectNoStrayDialog } from './harness.js';
import {
  checkAmendAndIgnore,
  checkBranches,
  checkCommitting,
  checkDiscarding,
  checkFetchAndPull,
  checkLiveStatus,
  checkMergeAndResolve,
} from './checks/source-control.js';

// Electron loads this bundle as CommonJS, so the directory comes from
// `__dirname`; it is `dist/`, the same as the production bundle's.
const currentDirectory = __dirname;
const repositoryRoot = join(currentDirectory, '..', '..', '..');

/** Runs git in a directory and returns its stdout. */
function git(cwd: string, argv: readonly string[]): string {
  return execFileSync('git', [...argv], { cwd, encoding: 'utf8' });
}

/**
 * A copy of the fixture, because the smoke writes to it and a fixture the
 * tests modify stops proving what it says.
 *
 * A real repository, left without a commit on purpose: that is the state a
 * freshly created project is in, and the one where unstaging cannot resolve
 * against HEAD (SPEC.md §12). Identity and signing are set locally, so the
 * run never depends on — or trips over — how the machine is configured.
 */
function prepareProject(): string {
  const source = join(repositoryRoot, 'examples', 'smoke-project');
  const destination = join(mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-')), 'smoke-project');
  cpSync(source, destination, { recursive: true });
  git(destination, ['init', '-b', 'main']);
  git(destination, ['config', 'user.email', 'smoke@opera-incerta.invalid']);
  git(destination, ['config', 'user.name', 'Opera Incerta Smoke']);
  git(destination, ['config', 'commit.gpgsign', 'false']);
  return destination;
}

/**
 * A folder with texts in it and no project: what an author points at when
 * they have been writing before they had this application (SPEC.md §8.6).
 */
function preparePlainFolder(): string {
  const parent = mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-plain-'));
  const folder = join(parent, 'manuscript');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'first-light.md'), '# First light\n\nThe harbour, before six.\n', 'utf8');
  writeFileSync(join(folder, 'the-ferry.md'), '# The ferry\n\nIt leaves without her.\n', 'utf8');
  return parent;
}

const projectPath = prepareProject();
const trashPath = mkdtempSync(join(tmpdir(), 'opera-incerta-trash-'));
const createParent = mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-new-'));
const plainParent = preparePlainFolder();
/** What the directory chooser answers next; checks point it elsewhere. */
let folderToOpen = projectPath;
const evidenceDirectory = join(repositoryRoot, 'build', 'desktop');
mkdirSync(evidenceDirectory, { recursive: true });
// The recent list and the preference record are installation-local state; a
// test run must not write into the author's.
const userDataPath = mkdtempSync(join(tmpdir(), 'opera-incerta-smoke-userdata-'));
// The checks read English words off the screen. The interface follows the
// system language unless told otherwise (SPEC.md §14), and the machine this
// runs on may well be German — so the preference is seeded, not assumed. The
// settings check switches languages and puts this back.
writeFileSync(
  join(userDataPath, PREFERENCES_FILE),
  `${JSON.stringify({ interfaceLanguage: 'en' }, null, 2)}\n`,
  'utf8',
);

const shell = startShell({
  chooseProjectToOpen: () => Promise.resolve(folderToOpen),
  chooseProjectParent: () => Promise.resolve(createParent),
  // Moved, never destroyed — the property a deletion check proves is the same
  // as with the desktop trash, without leaving rubbish there on every run.
  trashItem: (absolutePath) => rename(absolutePath, join(trashPath, basename(absolutePath))),
  userDataPath,
  onLauncherShown: (launcher) => {
    void run(launcher);
  },
});

const smoke: Smoke = {
  shell,
  projectPath,
  trashPath,
  createParent,
  plainParent,
  chooseFolder: (absolutePath) => {
    folderToOpen = absolutePath;
  },
  preferencesPath: join(userDataPath, PREFERENCES_FILE),
  evidenceDirectory,
  git,
};

/**
 * The run, in order. Every check leaves the project in the state the next
 * one starts from, so the order is part of what is being checked and must
 * not be shuffled without reading both neighbours.
 */
async function run(launcher: BrowserWindow): Promise<void> {
  // A renderer-side error is otherwise invisible from here: the smoke would
  // report only "script failed to execute" and leave the cause to guesswork.
  forwardConsole(launcher);

  try {
    const window = await checkLauncherAndOpen(smoke, launcher);
    forwardConsole(window);

    await checkWorkbenchRendered(window);
    await expectNoStrayDialog(window, 'checkWorkbenchRendered');
    await checkBridgeAnswers(window);
    await expectNoStrayDialog(window, 'checkBridgeAnswers');
    await checkBridgeRefusesTraversal(window);
    await expectNoStrayDialog(window, 'checkBridgeRefusesTraversal');

    await selectSmokeSheet(window);
    await checkEditorLaidOut(window);
    await expectNoStrayDialog(window, 'checkEditorLaidOut');
    await checkHeadingGestures(window);
    await expectNoStrayDialog(window, 'checkHeadingGestures');
    await checkHeadingCursorRules(window);
    await checkStatusBar(window);
    await checkGfmDisplay(smoke, window);
    await expectNoStrayDialog(window, 'checkHeadingCursorRules');
    await checkDocumentFlow(smoke, window);
    await expectNoStrayDialog(window, 'checkDocumentFlow');
    await checkSheetSwitch(window);
    await expectNoStrayDialog(window, 'checkSheetSwitch');

    await checkFrontMatterArea(smoke, window);
    await expectNoStrayDialog(window, 'checkFrontMatterArea');
    await checkPageCategories(smoke, window);
    await expectNoStrayDialog(window, 'checkPageCategories');
    await checkPanes(smoke, window);
    await expectNoStrayDialog(window, 'checkPanes');
    await checkSettings(smoke, window);
    await expectNoStrayDialog(window, 'checkSettings');
    await checkLineNumbers(smoke, window);
    await expectNoStrayDialog(window, 'checkLineNumbers');
    await checkZoom(smoke, window);
    await expectNoStrayDialog(window, 'checkZoom');
    await checkAppearance(smoke, window);
    await expectNoStrayDialog(window, 'checkAppearance');

    await checkCommitting(smoke, window);
    await expectNoStrayDialog(window, 'checkCommitting');
    await checkLiveStatus(smoke, window);
    await expectNoStrayDialog(window, 'checkLiveStatus');
    await checkDiscarding(smoke, window);
    await expectNoStrayDialog(window, 'checkDiscarding');
    const elsewhere = await checkFetchAndPull(smoke, window);
    await expectNoStrayDialog(window, 'checkFetchAndPull');
    await checkMergeAndResolve(smoke, window, elsewhere);
    await expectNoStrayDialog(window, 'checkMergeAndResolve');
    await checkBranches(smoke, window);
    await expectNoStrayDialog(window, 'checkBranches');
    await checkAmendAndIgnore(smoke, window);
    await expectNoStrayDialog(window, 'checkAmendAndIgnore');

    checkMenuState();
    await checkRegionsAsPanels(smoke, window);
    await expectNoStrayDialog(window, 'checkRegionsAsPanels');
    await checkColumnDragging(smoke, window);
    await expectNoStrayDialog(window, 'checkColumnDragging');

    await checkLibraryEdits(smoke, window);
    await expectNoStrayDialog(window, 'checkLibraryEdits');
    await checkReordering(smoke, window, projectPath);
    await expectNoStrayDialog(window, 'checkReordering');
    await checkDeletion(smoke, window, projectPath);
    await expectNoStrayDialog(window, 'checkDeletion');
    await checkMovingBetweenGroups(smoke, window, projectPath);
    await expectNoStrayDialog(window, 'checkMovingBetweenGroups');
    const sheetPath = await checkExternalChange(window, projectPath);
    await expectNoStrayDialog(window, 'checkExternalChange');
    await checkWatchedChange(window, projectPath, sheetPath);
    await expectNoStrayDialog(window, 'checkWatchedChange');

    const image = await window.webContents.capturePage();
    const evidencePath = join(evidenceDirectory, 'smoke.png');
    writeFileSync(evidencePath, image.toPNG());
    console.log(`smoke evidence: ${evidencePath}`);

    // Last, because it closes the window everything else needed.
    const launcherAgain = await checkReturnToLauncher(smoke, window);
    const launcherAfterFolders = await checkOpeningAFolder(smoke, launcherAgain);
    await checkCreateProject(smoke, launcherAfterFolders);

    shell.exit(0);
  } catch (error: unknown) {
    console.error('smoke failed:', error);
    shell.exit(1);
  }
}
