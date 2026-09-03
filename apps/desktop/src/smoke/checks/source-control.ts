/**
 * Source control against a real repository, and a real remote made inside
 * the check: committing, the live status, discarding, fetch and pull, a real
 * conflict, branches, amending, and `.gitignore`. SPEC.md §12.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  settleWatch,
  typeText,
  waitForSelector,
} from '../harness.js';
import type { Smoke } from '../context.js';

/**
 * Checks the commit model of `SPEC.md` §12 against a real repository: stage
 * everything in one batch, unstage one file where there is no `HEAD` to
 * resolve against, commit, and surface a failing push without losing the
 * commit.
 */
export async function checkCommitting(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const before = (await window.webContents.executeJavaScript(
    "document.querySelectorAll('wi-source-control .change').length",
  )) as number;
  if (before < 2) {
    throw new Error(`a fresh repository should list its files, found ${String(before)}`);
  }

  // Everything at once, through the tri-state header — one batch, one guard.
  await clickSourceControl(window, '.changes-header input');
  const staged = smoke.git(smoke.projectPath, ['diff', '--cached', '--name-only']).trim().split('\n');
  if (staged.length < 2) {
    throw new Error(`staging all left ${JSON.stringify(staged)} in the index`);
  }

  // One back out again. Without a commit there is no HEAD to restore against,
  // which is exactly the case §12 calls out.
  const removed = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes('opening.md'));
       const box = row?.querySelector('input');
       if (box === null || box === undefined) { return null; }
       box.click();
       return row.textContent.trim();
     })()`,
  )) as string | null;
  if (removed === null) {
    throw new Error('no row for opening.md to unstage');
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (smoke.git(smoke.projectPath, ['diff', '--cached', '--name-only']).includes('opening.md')) {
    throw new Error('unstaging without a HEAD left the file in the index');
  }

  await fillCommitMessage(window, 'The first commit, from the smoke');
  await clickText(window, 'wi-source-control button', 'Commit');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const log = smoke.git(smoke.projectPath, ['log', '--oneline']).trim();
  if (!log.includes('The first commit, from the smoke')) {
    throw new Error(`nothing was committed: ${JSON.stringify(log)}`);
  }
  const committed = smoke.git(smoke.projectPath, ['show', '--name-only', '--format=', 'HEAD']);
  if (committed.includes('opening.md')) {
    throw new Error('the file that was unstaged went into the commit anyway');
  }

  // A push with no remote must surface the error and keep the commit.
  await clickSourceControl(window, '.changes-header input');
  await fillCommitMessage(window, 'The second commit, which cannot be pushed');
  await clickText(window, 'wi-source-control button', 'Commit and push');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const after = smoke.git(smoke.projectPath, ['log', '--oneline']).trim().split('\n');
  if (after.length !== 2) {
    throw new Error(`the commit did not stand through a failed push: ${JSON.stringify(after)}`);
  }
  const reported = (await window.webContents.executeJavaScript(
    "document.querySelector('wi-source-control .failure, .failure')?.textContent?.trim() ?? null",
  )) as string | null;
  if (reported === null || reported === '') {
    throw new Error('a failed push reported nothing');
  }
  // Git's own words, not our code for them: "no configured push destination"
  // tells the author what to do (SPEC.md §12).
  if (!reported.toLowerCase().includes('git') && !reported.toLowerCase().includes('remote')) {
    throw new Error(`a failed push reported a code rather than a reason: ${reported}`);
  }

  console.log(
    'smoke ok: staged in one batch, unstaged without a HEAD, committed, and a push with no ' +
      `remote kept the commit and said why (${reported.slice(0, 40)})`,
  );

}

/**
 * The live update of `SPEC.md` §12: while the panel is on screen, a change in
 * the working tree appears without anyone asking — and the panel does not then
 * keep refreshing itself.
 */
export async function checkLiveStatus(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const countRows = async (): Promise<number> =>
    (await window.webContents.executeJavaScript(
      "document.querySelectorAll('wi-source-control .change').length",
    )) as number;

  const before = await countRows();
  // Not a sheet: git reports it, and the library does not, so this check
  // leaves the fixture exactly as it found it for the checks that follow.
  writeFileSync(join(smoke.projectPath, 'written-by-someone-else.txt'), 'Not a sheet.\n', 'utf8');

  await settleWatch(window, async () => (await countRows()) > before);
  const listed = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-source-control .change')].map((row) => row.textContent.trim())`,
  )) as readonly string[];
  if (!listed.some((row) => row.includes('written-by-someone-else.txt'))) {
    throw new Error(`the status did not notice a new file by itself: ${JSON.stringify(listed)}`);
  }

  // And now the part `CONVENTIONS.md` C-F4 exists for: `git status` writes
  // inside `.git` on every read, so without the filter each refresh would
  // trigger the next one, for as long as the panel stays open.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const quiet = smoke.shell.repositoryReports();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (smoke.shell.repositoryReports() !== quiet) {
    throw new Error(
      `the repository watch reported ${String(smoke.shell.repositoryReports() - quiet)} times with nobody ` +
        'touching anything: it is triggering itself',
    );
  }

  console.log(
    'smoke ok: a file written behind the application’s back appeared in source control by ' +
      'itself, and the watch then stayed quiet for three seconds',
  );

}

/**
 * Throwing a change away, confirmed first. SPEC.md §12.
 *
 * Both kinds, because they end differently: a tracked file goes back to its
 * last committed state, and an untracked one has no state to go back to and
 * goes to the trash.
 */
export async function checkDiscarding(smoke: Smoke, window: BrowserWindow): Promise<void> {
  // An untracked file has nothing to go back to. Cancelling first, because a
  // confirmation that is not asked is not a confirmation.
  const untracked = join(smoke.projectPath, 'written-by-someone-else.txt');
  if (!existsSync(untracked)) {
    throw new Error('the untracked file the live check wrote is gone');
  }

  // A file with nothing behind it is shown as entirely added.
  await openDiff(window, 'written-by-someone-else.txt');
  const asAdded = await diffLines(window);
  if (!asAdded.some((line) => line.kind === 'added' && line.text.includes('Not a sheet.'))) {
    throw new Error(`an untracked file is not shown as added: ${JSON.stringify(asAdded)}`);
  }
  if (asAdded.some((line) => line.kind === 'removed')) {
    throw new Error('an untracked file cannot have removed lines');
  }
  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));

  await openDiscard(window, 'written-by-someone-else.txt');
  const warning = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-confirm-prompt .warning')?.textContent.trim() ?? null`,
  )) as string | null;
  if (warning === null || !warning.includes('trash')) {
    throw new Error(`the confirmation does not say where it goes: ${String(warning)}`);
  }

  // A frame, so the picture has the dialog in it: the element is in the DOM
  // before the compositor has drawn it.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await window.webContents.capturePage();
  const evidencePath = join(smoke.evidenceDirectory, 'smoke-discard.png');
  writeFileSync(evidencePath, image.toPNG());
  console.log(`smoke evidence: ${evidencePath}`);

  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!existsSync(untracked)) {
    throw new Error('cancelling the confirmation discarded the file anyway');
  }

  await openDiscard(window, 'written-by-someone-else.txt');
  await clickText(window, 'wi-confirm-prompt button', 'Discard');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (existsSync(untracked)) {
    throw new Error('the untracked file is still in the project');
  }
  if (!existsSync(join(smoke.trashPath, 'written-by-someone-else.txt'))) {
    throw new Error('the untracked file was removed instead of moved to the trash');
  }

  // The tracked case, on the sheet the editor holds — which is the one that
  // matters, because the editor is still holding a version of it.
  const sheet = join(smoke.projectPath, 'part-1', 'scene.md');
  const committed = smoke.git(smoke.projectPath, ['show', 'HEAD:part-1/scene.md']);

  // Save what the inspector changed earlier, so there is something to discard.
  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (readFileSync(sheet, 'utf8') === committed) {
    throw new Error('nothing was saved, so there is nothing to discard');
  }
  await settleWatch(window, async () => rowFor(window, 'scene.md'));

  // What changed against the last commit. A sheet opens word by word — the
  // whole point: Git would report the entire line twice.
  await openDiff(window, 'scene.md');
  const wordwise = (await window.webContents.executeJavaScript(
    `(() => {
       const prose = document.querySelector('wi-diff-view .prose');
       if (prose === null) { return null; }
       return {
         mode: document.querySelector('wi-diff-view .mode.active')?.textContent.trim() ?? null,
         added: [...prose.querySelectorAll('.word.added')].map((e) => e.textContent),
         removed: [...prose.querySelectorAll('.word.removed')].map((e) => e.textContent),
         text: prose.textContent,
       };
     })()`,
  )) as { mode: string | null; added: string[]; removed: string[]; text: string } | null;

  if (wordwise === null || wordwise.mode !== 'Words') {
    throw new Error(`a sheet did not open word by word: ${JSON.stringify(wordwise)}`);
  }
  // The inserted run is the words plus the whitespace that follows them: the
  // whitespace *before* them was already there, in front of the next line.
  if (wordwise.added.join('').trim() !== 'status: review') {
    throw new Error(`the word view marks more than what changed: ${JSON.stringify(wordwise.added)}`);
  }
  if (wordwise.removed.length !== 0) {
    throw new Error(`nothing was removed, yet: ${JSON.stringify(wordwise.removed)}`);
  }
  // Nothing invented and nothing lost: what it shows is the file itself.
  if (!wordwise.text.includes('## The Second Bell')) {
    throw new Error('the word view does not show the text it is comparing');
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const proseImage = await window.webContents.capturePage();
  const proseEvidence = join(smoke.evidenceDirectory, 'smoke-prose-diff.png');
  writeFileSync(proseEvidence, proseImage.toPNG());
  console.log(`smoke evidence: ${proseEvidence}`);

  // Git's own reading is still one click away.
  await clickText(window, 'wi-diff-view .mode', 'Lines');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const changed = await diffLines(window);
  if (!changed.some((line) => line.kind === 'added' && line.text.includes('status: review'))) {
    throw new Error(`the diff does not show what was saved: ${JSON.stringify(changed)}`);
  }
  // The header is a header: `--- a/…` and `+++ b/…` start like a change and
  // are not one.
  const header = changed.slice(0, 4).every((line) => line.kind === 'meta');
  if (!header || !changed.some((line) => line.kind === 'hunk')) {
    throw new Error(`the diff is not read as a diff: ${JSON.stringify(changed.slice(0, 6))}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const diffImage = await window.webContents.capturePage();
  const diffEvidence = join(smoke.evidenceDirectory, 'smoke-diff.png');
  writeFileSync(diffEvidence, diffImage.toPNG());
  console.log(`smoke evidence: ${diffEvidence}`);

  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (await isVisible(window, 'wi-diff-view')) {
    throw new Error('Escape left the diff open');
  }

  // And type something on top, unsaved.
  await placeCursorInEditor(window);
  await typeText(window, 'Typed, and about to be discarded.');
  await new Promise((resolve) => setTimeout(resolve, 300));

  await openDiscard(window, 'scene.md');
  await clickText(window, 'wi-confirm-prompt button', 'Discard');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (readFileSync(sheet, 'utf8') !== committed) {
    throw new Error('the file did not go back to its committed state');
  }
  if (await editorContains(window, 'Typed, and about to be discarded.')) {
    throw new Error('the editor still holds what was discarded, and would write it back');
  }
  // No conflict prompt: the author has just decided this, and being asked
  // about it afterwards would be asking them to decide it twice.
  if (await isVisible(window, 'wi-confirm-prompt')) {
    throw new Error('discarding raised a prompt about the change it had just discarded');
  }
  const marker = (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-panel-header .title')]
       .some((element) => element.textContent.trim().endsWith('•'))`,
  )) as boolean;
  if (marker) {
    throw new Error('the sheet is still marked unsaved after its change was discarded');
  }

  console.log(
    'smoke ok: discarding put a tracked file back to its committed state and took the editor’s ' +
      'unsaved version with it, sent an untracked one to the trash, and cancelling kept both',
  );

}

/**
 * Fetching and pulling against a real remote, with a second working copy
 * standing in for the other machine. SPEC.md §12.
 */
export async function checkFetchAndPull(smoke: Smoke, window: BrowserWindow): Promise<string> {
  // The remote is set up here rather than in the fixture, because an earlier
  // check needs a push to *fail* for want of one.
  const remote = join(mkdtempSync(join(tmpdir(), 'opera-incerta-remote-')), 'origin.git');
  smoke.git(smoke.projectPath, ['init', '--bare', '--initial-branch=main', remote]);

  // Published through the interface, which is also how the upstream comes to
  // exist at all (SPEC.md §12).
  await refreshSourceControl(window);
  const unpublished = await trackingLine(window);
  if (unpublished === null || !unpublished.includes('not published')) {
    throw new Error(`a branch with no upstream is not offered one: ${String(unpublished)}`);
  }

  // An address git would run rather than fetch is refused before git sees it.
  await clickText(window, 'wi-source-control .tracking button', 'Publish');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'ext::sh -c "touch /tmp/opera-incerta-should-not-exist"');
  await new Promise((resolve) => setTimeout(resolve, 800));

  const refused = (await window.webContents.executeJavaScript(
    "document.querySelector('wi-source-control .failure')?.textContent?.trim() ?? null",
  )) as string | null;
  if (refused === null || !refused.includes('unsafe-remote')) {
    throw new Error(`a command-running address was not refused: ${String(refused)}`);
  }
  if (smoke.git(smoke.projectPath, ['remote']).trim() !== '') {
    throw new Error('the refused address was recorded as a remote anyway');
  }

  await clickText(window, 'wi-source-control .tracking button', 'Publish');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, remote);
  await settleWatch(window, async () => (await trackingLine(window))?.includes('origin/main') === true);

  const published = await trackingLine(window);
  if (published === null || !published.includes('origin/main')) {
    throw new Error(`publishing did not set an upstream: ${String(published)}`);
  }
  if (!smoke.git(remote, ['ls-tree', '--name-only', 'main']).includes('part-1')) {
    throw new Error('the manuscript did not reach the remote');
  }

  const elsewhere = join(mkdtempSync(join(tmpdir(), 'opera-incerta-elsewhere-')), 'clone');
  smoke.git(smoke.projectPath, ['clone', remote, elsewhere]);
  for (const setting of [
    ['user.email', 'other@opera-incerta.invalid'],
    ['user.name', 'The Other Machine'],
    ['commit.gpgsign', 'false'],
  ]) {
    smoke.git(elsewhere, ['config', ...setting]);
  }
  // Not a sheet, so the library — and every check after this one — sees the
  // fixture exactly as it was.
  writeFileSync(join(elsewhere, 'from-the-other-machine.txt'), 'Written elsewhere.\n', 'utf8');
  smoke.git(elsewhere, ['add', 'from-the-other-machine.txt']);
  smoke.git(elsewhere, ['commit', '-m', 'from the other machine']);
  smoke.git(elsewhere, ['push']);

  // The upstream is new, so the panel has to be told to look again. Git's own
  // writes inside `.git` are filtered out of the watch, on purpose (§12).
  const refreshed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-panel-header button')]
         .find((candidate) => candidate.getAttribute('title') === 'Refresh');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!refreshed) {
    throw new Error('no refresh button in the source control header');
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  await settleWatch(window, async () => (await trackingLine(window)) !== null);
  const before = await trackingLine(window);
  if (before === null || !before.includes('origin/main') || !before.includes('up to date')) {
    throw new Error(`the panel does not show the upstream: ${String(before)}`);
  }

  await clickText(window, 'wi-source-control .tracking button', 'Fetch');
  await settleWatch(window, async () => ((await trackingLine(window)) ?? '').includes('↓1'));
  const fetched = await trackingLine(window);
  if (fetched === null || !fetched.includes('↓1')) {
    throw new Error(`fetching did not report being behind: ${String(fetched)}`);
  }
  // Fetching changes what is known, and no file in the working tree.
  if (existsSync(join(smoke.projectPath, 'from-the-other-machine.txt'))) {
    throw new Error('fetching brought a file into the working tree');
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const pullImage = await window.webContents.capturePage();
  const pullEvidence = join(smoke.evidenceDirectory, 'smoke-pull.png');
  writeFileSync(pullEvidence, pullImage.toPNG());
  console.log(`smoke evidence: ${pullEvidence}`);

  await clickText(window, 'wi-source-control .tracking button', 'Pull');
  await settleWatch(window, async () =>
    existsSync(join(smoke.projectPath, 'from-the-other-machine.txt')),
  );

  if (!existsSync(join(smoke.projectPath, 'from-the-other-machine.txt'))) {
    throw new Error('pulling did not bring the commit in');
  }
  await settleWatch(window, async () => ((await trackingLine(window)) ?? '').includes('up to date'));
  const after = await trackingLine(window);
  if (after === null || !after.includes('up to date')) {
    throw new Error(`the panel is still behind after pulling: ${String(after)}`);
  }

  console.log(
    'smoke ok: fetching reported one commit behind without touching a file, and pulling brought ' +
      'it in by fast-forward',
  );
  // The other working copy, for the conflict the next check makes.
  return elsewhere;
}

/**
 * A real conflict, decided in the interface. SPEC.md §12.
 *
 * Both sides change the same passage of the same sheet, which is the case a
 * fast-forward pull refuses and the only one where an author has to decide
 * anything.
 */
export async function checkMergeAndResolve(smoke: Smoke, window: BrowserWindow, elsewhere: string): Promise<void> {
  const sheet = join(smoke.projectPath, 'part-1', 'scene.md');
  const front = readFileSync(sheet, 'utf8').split('---\n')[1] ?? '';

  // The other machine rewrites the passage…
  const theirSheet = join(elsewhere, 'part-1', 'scene.md');
  writeFileSync(theirSheet, `---\n${front}---\n## The Second Bell\n\nThe bell rang once.\n`, 'utf8');
  smoke.git(elsewhere, ['commit', '-am', 'the bell rang once']);
  smoke.git(elsewhere, ['push']);

  // …and so does this one, differently.
  writeFileSync(sheet, `---\n${front}---\n## The Second Bell\n\nThe bell rang twice.\n`, 'utf8');
  smoke.git(smoke.projectPath, ['commit', '-am', 'the bell rang twice']);
  smoke.git(smoke.projectPath, ['fetch']);

  await refreshSourceControl(window);
  await settleWatch(window, async () => (await trackingLine(window))?.includes('↑1') === true);

  // Merging is asked for, and confirmed: it is the one operation here that can
  // leave the manuscript needing attention.
  await clickText(window, 'wi-source-control .tracking button', 'Merge');
  await waitForSelector(window, 'wi-confirm-prompt button');
  await clickText(window, 'wi-confirm-prompt button', 'Merge');

  await settleWatch(window, async () => isVisible(window, 'wi-source-control .merging'));
  if (!(await isVisible(window, 'wi-source-control .merging'))) {
    throw new Error('a conflicted merge is not shown as being in progress');
  }
  if (!readFileSync(sheet, 'utf8').includes('<<<<<<<')) {
    throw new Error('the merge did not leave the two versions in the file');
  }

  // The sheet is shown and not editable: markers must never be typed around.
  await settleWatch(window, async () => isVisible(window, '.read-only'));
  if (!(await isVisible(window, '.read-only'))) {
    throw new Error('a sheet full of conflict markers is offered for editing');
  }

  // Decide it: one region, both versions in front of the author.
  await clickText(window, 'wi-source-control .change button.resolve', 'Resolve');
  await waitForSelector(window, 'wi-conflict-resolver .region');
  const shown = (await window.webContents.executeJavaScript(
    `(() => {
       const region = document.querySelector('wi-conflict-resolver .region');
       if (region === null) { return null; }
       return {
         regions: document.querySelectorAll('wi-conflict-resolver .region').length,
         sides: [...region.querySelectorAll('.side .text')].map((e) => e.textContent.trim()),
         count: document.querySelector('wi-conflict-resolver .count')?.textContent.trim() ?? null,
       };
     })()`,
  )) as { regions: number; sides: string[]; count: string | null } | null;

  if (shown === null || shown.regions !== 1) {
    throw new Error(`the resolver does not show the one conflict: ${JSON.stringify(shown)}`);
  }
  if (shown.sides[0] !== 'The bell rang twice.' || shown.sides[1] !== 'The bell rang once.') {
    throw new Error(`the two versions are not both shown: ${JSON.stringify(shown.sides)}`);
  }
  if (shown.count !== '0 of 1 decided') {
    throw new Error(`the resolver does not count what is left: ${String(shown.count)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const mergeImage = await window.webContents.capturePage();
  const mergeEvidence = join(smoke.evidenceDirectory, 'smoke-merge.png');
  writeFileSync(mergeEvidence, mergeImage.toPNG());
  console.log(`smoke evidence: ${mergeEvidence}`);

  // Take theirs, and apply.
  const chose = (await window.webContents.executeJavaScript(
    `(() => {
       const sides = [...document.querySelectorAll('wi-conflict-resolver .side')];
       const theirs = sides[1]?.querySelector('input[type="radio"]');
       if (theirs === null || theirs === undefined) { return false; }
       theirs.click();
       return true;
     })()`,
  )) as boolean;
  if (!chose) {
    throw new Error('the resolver offers no choice to make');
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  await clickText(window, 'wi-conflict-resolver button.apply', 'Apply');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const decided = readFileSync(sheet, 'utf8');
  if (decided.includes('<<<<<<<') || decided.includes('>>>>>>>')) {
    throw new Error('the resolved file still carries markers');
  }
  if (!decided.includes('The bell rang once.') || decided.includes('rang twice')) {
    throw new Error(`the chosen version is not what was written: ${JSON.stringify(decided)}`);
  }

  // Committing finishes the merge.
  await fillCommitMessage(window, 'Merge the other machine');
  await clickText(window, 'wi-source-control .actions button', 'Commit');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // `rev-parse --verify` exits non-zero when there is nothing to verify, which
  // here is the outcome being checked for.
  let stillMerging = true;
  try {
    smoke.git(smoke.projectPath, ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']);
  } catch {
    stillMerging = false;
  }
  if (stillMerging) {
    throw new Error('the merge is still unfinished after committing');
  }
  const parents = smoke.git(smoke.projectPath, ['rev-list', '--parents', '-n', '1', 'HEAD']).trim();
  if (parents.split(/\s+/u).length !== 3) {
    throw new Error(`the commit is not a merge commit: ${parents}`);
  }

  console.log(
    'smoke ok: a real conflict was shown with both versions, decided per region, written back ' +
      'without a marker, and committed as a merge',
  );

}

/**
 * Branches: listing, creating, switching, deleting — and the one rule git
 * cannot enforce, that a switch waits for unsaved work. SPEC.md §12.
 */
export async function checkBranches(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const branchOf = (): string => smoke.git(smoke.projectPath, ['branch', '--show-current']).trim();

  await openBranches(window);
  const listed = await branchNames(window);
  if (listed.length !== 1 || !listed[0]?.includes('main')) {
    throw new Error(`the branch list is wrong: ${JSON.stringify(listed)}`);
  }

  await clickText(window, 'wi-branches button', 'New branch');
  await waitForSelector(window, 'wi-text-prompt input');
  await fillPrompt(window, 'draft/chapter-3');
  await settleWatch(window, async () => branchOf() === 'draft/chapter-3');
  if (branchOf() !== 'draft/chapter-3') {
    throw new Error(`creating a branch did not switch to it: ${branchOf()}`);
  }

  // A switch with unsaved work waits: git knows nothing about the editor.
  await placeCursorInEditor(window);
  await typeText(window, 'Unsaved, and in the way.');
  await new Promise((resolve) => setTimeout(resolve, 300));

  await openBranches(window);
  await clickText(window, 'wi-branches button', 'Switch');
  await waitForSelector(window, 'wi-confirm-prompt button');
  const asked = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-confirm-prompt h2')?.textContent.trim() ?? null`,
  )) as string | null;
  if (asked === null || !asked.includes('Save or discard')) {
    throw new Error(`switching over unsaved work did not stop to ask: ${String(asked)}`);
  }
  await pressKey(window, 'Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (branchOf() !== 'draft/chapter-3') {
    throw new Error('the branch changed although the question was declined');
  }

  // Saving first, and then it goes through.
  clickMenuItem('sheet/save');
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Committed here, so that it belongs to this branch: a change that is only
  // saved is not on any branch yet, and follows a switch as git intends.
  await clickSourceControl(window, '.changes-header input');
  await fillCommitMessage(window, 'Written on the draft branch');
  await clickText(window, 'wi-source-control .actions button', 'Commit');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  await openBranches(window);
  await clickText(window, 'wi-branches button', 'Switch');
  await settleWatch(window, async () => branchOf() === 'main');
  if (branchOf() !== 'main') {
    throw new Error(`switching branches did not take: ${branchOf()}`);
  }

  // The committed work stayed on the branch it was made on, and the working
  // tree followed.
  if (readFileSync(join(smoke.projectPath, 'part-1', 'scene.md'), 'utf8').includes('in the way')) {
    throw new Error('the other branch’s work followed the switch');
  }

  await openBranches(window);
  await clickText(window, 'wi-branches button', 'Delete');
  await waitForSelector(window, 'wi-confirm-prompt button');
  await clickText(window, 'wi-confirm-prompt button', 'Delete');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Refused, and rightly: that branch carries a commit main has never seen.
  const remaining = smoke.git(smoke.projectPath, ['branch', '--format=%(refname:short)']).trim();
  if (!remaining.includes('draft/chapter-3')) {
    throw new Error('a branch whose work is not merged was deleted anyway');
  }
  const refusal = (await window.webContents.executeJavaScript(
    "document.querySelector('wi-source-control .failure')?.textContent?.trim() ?? null",
  )) as string | null;
  if (refusal === null || !refusal.includes('not fully merged')) {
    throw new Error(`the refusal was not reported: ${String(refusal)}`);
  }

  console.log(
    'smoke ok: branches listed, created, switched — with a switch over unsaved work stopping to ' +
      'ask — and an unmerged branch refused deletion in git’s own words',
  );

}

/**
 * Amending the last commit, and keeping files out of the repository.
 * SPEC.md §12.
 */
export async function checkAmendAndIgnore(smoke: Smoke, window: BrowserWindow): Promise<void> {
  const project = smoke.projectPath;
  const headMessage = (): string => smoke.git(project, ['log', '-1', '--pretty=%B']).trim();
  const commitCount = (): string => smoke.git(project, ['rev-list', '--count', 'HEAD']).trim();
  const ignoreFile = join(project, '.gitignore');

  // A file next to the manuscript that does not belong in it.
  writeFileSync(join(project, 'scratch.txt'), 'notes to myself\n');
  await settleWatch(window, async () => rowFor(window, 'scratch.txt'));
  if (!(await rowFor(window, 'scratch.txt'))) {
    throw new Error('the untracked file never appeared in the panel');
  }

  await clickIgnore(window, 'scratch.txt');
  await settleWatch(window, async () => !(await rowFor(window, 'scratch.txt')));

  const ignored = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
  if (!ignored.split('\n').includes('scratch.txt')) {
    throw new Error(`the path was not written to .gitignore: ${JSON.stringify(ignored)}`);
  }
  if (await rowFor(window, 'scratch.txt')) {
    throw new Error('the ignored file is still listed as a change');
  }

  // The file itself stays where it is: ignoring is not deleting.
  if (!existsSync(join(project, 'scratch.txt'))) {
    throw new Error('ignoring the file removed it');
  }

  // The list itself, opened and edited as text.
  await clickSourceControl(window, '.ignore-row button');
  await waitForSelector(window, 'wi-text-editor textarea');
  const shown = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-text-editor textarea')?.value ?? null`,
  )) as string | null;
  if (shown === null || !shown.includes('scratch.txt')) {
    throw new Error(`the ignore editor does not show the file: ${JSON.stringify(shown)}`);
  }

  // The row shows the whole file name while nothing is pointed at: the
  // controls take their width only when they are visible.
  const nameShown = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes('.gitignore'));
       const name = row?.querySelector('.name');
       return name === null || name === undefined
         ? null
         : { text: name.textContent.trim(), cut: name.scrollWidth > name.clientWidth + 1 };
     })()`,
  )) as { text: string; cut: boolean } | null;
  if (nameShown === null || nameShown.text !== '.gitignore' || nameShown.cut) {
    throw new Error(`the file name is cut off at rest: ${JSON.stringify(nameShown)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const ignoreEvidence = join(smoke.evidenceDirectory, 'smoke-ignore.png');
  writeFileSync(ignoreEvidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${ignoreEvidence}`);

  await window.webContents.executeJavaScript(
    `(() => {
       const field = document.querySelector('wi-text-editor textarea');
       field.value = ${JSON.stringify(['scratch.txt', 'export/', ''].join('\n'))};
       field.dispatchEvent(new Event('input', { bubbles: true }));
     })()`,
  );
  await clickText(window, 'wi-text-editor button', 'Save');
  await settleWatch(window, async () => readFileSync(ignoreFile, 'utf8').includes('export/'));
  const saved = readFileSync(ignoreFile, 'utf8');
  if (!saved.includes('export/') || !saved.includes('scratch.txt')) {
    throw new Error(`the edited ignore file was not written: ${JSON.stringify(saved)}`);
  }

  // Committed, so that there is something to amend.
  await refreshSourceControl(window);
  await clickSourceControl(window, '.changes-header input');
  await fillCommitMessage(window, 'Ignore scratch');
  await clickText(window, 'wi-source-control .actions button', 'Commit');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (headMessage() !== 'Ignore scratch') {
    throw new Error(`the commit did not take: ${headMessage()}`);
  }
  const before = commitCount();

  await clickText(window, 'wi-source-control .actions button', 'Amend last commit');
  await waitForSelector(window, 'wi-confirm-prompt button');

  // The wording is carried over, so that amending to add a forgotten file does
  // not cost the author their message.
  const carried = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-source-control textarea.message')?.value ?? null`,
  )) as string | null;
  if (carried !== 'Ignore scratch') {
    throw new Error(`the previous message was not offered: ${JSON.stringify(carried)}`);
  }

  // And the question says which wording it would use: the field is behind the
  // dialog, so pointing at it would be pointing at something out of reach.
  const asked = (await window.webContents.executeJavaScript(
    `document.querySelector('wi-confirm-prompt .warning')?.textContent.trim() ?? null`,
  )) as string | null;
  if (asked === null || !asked.includes('Ignore scratch')) {
    throw new Error(`the question does not name the message: ${String(asked)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const amendEvidence = join(smoke.evidenceDirectory, 'smoke-amend.png');
  writeFileSync(amendEvidence, (await window.webContents.capturePage()).toPNG());
  console.log(`smoke evidence: ${amendEvidence}`);

  await fillCommitMessage(window, 'Keep scratch notes out of the repository');
  await clickText(window, 'wi-confirm-prompt button', 'Amend');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (headMessage() !== 'Keep scratch notes out of the repository') {
    throw new Error(`amending did not replace the message: ${headMessage()}`);
  }
  if (commitCount() !== before) {
    throw new Error(`amending added a commit: ${before} became ${commitCount()}`);
  }

  // Once it is on the remote it is no longer offered: replacing it there would
  // take a forced push, which this application does not do.
  smoke.git(project, ['push']);
  await refreshSourceControl(window);
  if (await isVisible(window, 'wi-source-control button.amend')) {
    throw new Error('a commit that has been pushed is still offered for amending');
  }

  console.log(
    'smoke ok: an untracked file was ignored from its row and the list edited as text, and the ' +
      'last commit was amended in place — no longer offered once it was pushed',
  );
}

/** Clicks the ignore control on one row of the change list. */

export async function clickIgnore(window: BrowserWindow, name: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(name)}));
       const button = row?.querySelector('button.ignore');
       if (button === null || button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no ignore control for ${name}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
}

/** Opens the branch dialog from the panel. */

export async function openBranches(window: BrowserWindow): Promise<void> {
  await clickText(window, 'wi-source-control .branch-row button', 'Branches');
  await waitForSelector(window, 'wi-branches .list');
}

export async function branchNames(window: BrowserWindow): Promise<readonly string[]> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-branches li')].map((row) => row.textContent.replace(/\\s+/gu, ' ').trim())`,
  )) as readonly string[];
}

/** Presses the navigator's refresh, which source control shares. */

export async function refreshSourceControl(window: BrowserWindow): Promise<void> {
  const refreshed = (await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('wi-panel-header button')]
         .find((candidate) => candidate.getAttribute('title') === 'Refresh');
       if (button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!refreshed) {
    throw new Error('no refresh button in the source control header');
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
}

/** What the panel says about the upstream, or null when it says nothing. */

export async function trackingLine(window: BrowserWindow): Promise<string | null> {
  return (await window.webContents.executeJavaScript(
    `document.querySelector('wi-source-control .tracking')?.textContent.replace(/\\s+/gu, ' ').trim() ?? null`,
  )) as string | null;
}

/** Whether the change list has a row for a file. */

export async function rowFor(window: BrowserWindow, name: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-source-control .change')]
       .some((row) => row.textContent.includes(${JSON.stringify(name)}))`,
  )) as boolean;
}

/** Opens the diff for one row. */

export async function openDiff(window: BrowserWindow, name: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(name)}));
       const button = row?.querySelector('button.show-diff');
       if (button === null || button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no diff control for ${name}`);
  }
  // Either reading, or the note that there is nothing to read.
  await waitForSelector(window, 'wi-diff-view pre, wi-diff-view .prose, wi-diff-view .hint');
}

/** The diff as the author sees it: each line with the kind it was given. */

export async function diffLines(
  window: BrowserWindow,
): Promise<Array<{ text: string; kind: string }>> {
  return (await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('wi-diff-view .line')].map((element) => ({
       text: element.textContent,
       kind: element.classList.contains('added')
         ? 'added'
         : element.classList.contains('removed')
           ? 'removed'
           : element.classList.contains('hunk')
             ? 'hunk'
             : element.classList.contains('meta')
               ? 'meta'
               : 'context',
     }))`,
  )) as Array<{ text: string; kind: string }>;
}

/** Opens the discard confirmation for one row. */

export async function openDiscard(window: BrowserWindow, name: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const row = [...document.querySelectorAll('wi-source-control .change')]
         .find((candidate) => candidate.textContent.includes(${JSON.stringify(name)}));
       const button = row?.querySelector('button.discard');
       if (button === null || button === undefined) { return false; }
       button.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`no discard control for ${name}`);
  }
  await waitForSelector(window, 'wi-confirm-prompt button');
}

/** Clicks one control inside the source control panel. */

export async function clickSourceControl(window: BrowserWindow, selector: string): Promise<void> {
  const clicked = (await window.webContents.executeJavaScript(
    `(() => {
       const element = document.querySelector('wi-source-control ' + ${JSON.stringify(selector)});
       if (element === null) { return false; }
       element.click();
       return true;
     })()`,
  )) as boolean;
  if (!clicked) {
    throw new Error(`nothing to click at ${selector}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
}

export async function fillCommitMessage(window: BrowserWindow, message: string): Promise<void> {
  const filled = (await window.webContents.executeJavaScript(
    `(() => {
       const field = document.querySelector('wi-source-control textarea.message');
       if (field === null) { return false; }
       field.value = ${JSON.stringify(message)};
       field.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`,
  )) as boolean;
  if (!filled) {
    throw new Error('no commit message field');
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
