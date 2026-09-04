# The desktop smoke

Status: Accepted

Date: 2026-09-03

This directory is the end-to-end check of the desktop application. It starts
the **real shell**, opens the **real renderer**, and drives it with **real
input events** — clicks, keys, pointer drags — the way an author would. It
then reads the result **from disk and from git**, never from the application's
own belief about what it did. `TESTING.md` §2.7 lists what it must prove.

This file explains how to read it, run it, debug it, and add to it. It is
written so that someone — or something — that has never seen the code can do
all four without reading anything else first.

## Run it

```bash
pnpm run desktop:smoke
```

That builds the renderer, the production bundle, and the smoke bundle, then
runs `electron dist/smoke.cjs`. It prints one `smoke ok: …` line per check
and exits 0, or prints `smoke failed: …` with the error and exits 1.
Screenshots land in `build/desktop/smoke*.png`. A green run takes about
half a minute.

The smoke needs `git` on the path and a display server (it runs windowed;
on macOS and Windows that is always there, on Linux use `xvfb-run`).

## What is where

| File | What it holds |
| --- | --- |
| `main.ts` | The entry. Makes the temporary directories, starts the shell, and holds **the whole order of the run** in `run()`, top to bottom. Start reading here. |
| `context.ts` | `Smoke`: the one object every check receives — the shell handle, the project copy, the trash directory, the evidence directory, `git()`. |
| `harness.ts` | Helpers that do what a hand does: wait for a selector, click text, right-click a row, fill a prompt, press a key, type. They know nothing about what is being checked. |
| `checks/launcher.ts` | Opening a project from the launcher, returning to it, creating a project, giving it a repository and an identity, the native menu. |
| `checks/bridge.ts` | The workbench rendered, the bridge answers, the bridge refuses a path out of the project, the editor laid out. |
| `checks/editor.ts` | Dot commands, the gutter menu, cursor rules around hidden heading syntax, the status bar, saving through the menu, switching sheets. |
| `checks/panes.ts` | Front matter area, page categories, inspector, outline, sidebar collapse, column dividers. |
| `checks/settings.ts` | The settings dialog: from the menu and the activity bar, a switch reaching the preference file, Escape and focus, the identity in place, the language switched to German and back with the native menu following, reset. |
| `checks/source-control.ts` | Committing, live status, discarding, fetch and pull against a real remote, a real conflict, branches, amend, `.gitignore`. |
| `checks/library.ts` | Create, rename, reorder by drag, delete into the trash, move between groups, a change made behind the application's back. |

The production entry is `../main.ts`; the shell both entries start is
`../shell.ts`. The smoke is bundled to `dist/smoke.cjs`, separately from
`dist/main.cjs`, and `scripts/check-desktop-production.mjs` fails the build if
any of it reaches the production bundle.

## How the smoke gets at the shell

The shell is started with `startShell(options)`. The production entry passes
nothing. The smoke passes four substitutions and one callback, all declared in
`ShellOptions` in `shell.ts`:

- `chooseProjectToOpen` — returns the copied fixture instead of showing the
  native directory chooser;
- `chooseProjectParent` — returns a temporary directory instead of asking
  where a new project should live;
- `trashItem` — moves a deleted entry into a temporary directory instead of
  the desktop trash, so a check can find it there and the author's trash
  stays clean;
- `userDataPath` — a temporary directory for the recent list and the
  preference record, so a run never writes into the author's;
- `onLauncherShown` — called once, with the launcher window; the smoke
  starts `run()` from it.

`startShell` returns a `Shell` handle: the current project and launcher
windows, the count of repository-watch reports, and `exit(code)`. That is
everything the smoke can see of the shell. There is no other seam: the shell
does not know a smoke exists, and must not.

## How a check is written

Every check is an exported `async function` with this shape:

```ts
/**
 * One sentence: what this proves, and the SPEC.md section it proves.
 */
export async function checkSomething(smoke: Smoke, window: BrowserWindow): Promise<void> {
  // 1. Act, through the harness — a click, a key, a drag.
  await clickText(window, 'wi-source-control button', 'Commit');

  // 2. Wait for the consequence, never for a fixed time when a condition
  //    can be waited for.
  await waitForSelector(window, '.commit-done');

  // 3. Read the truth from where it lives: the disk, git, the DOM's
  //    computed style — not from a store or a bridge answer.
  const log = smoke.git(smoke.projectPath, ['log', '--oneline']);

  // 4. Fail with a message that says what was expected and what was found.
  if (!log.includes('The message')) {
    throw new Error(`nothing was committed: ${JSON.stringify(log)}`);
  }

  // 5. Say what was proven, in one line starting with `smoke ok:`.
  console.log('smoke ok: committed through the panel, read back with git log');
}
```

Rules that every check follows:

- **`smoke` first, `window` second.** A check that needs neither the
  fixture nor the shell takes only `window`. A helper takes `window` first.
- **Real input events.** Type with `typeText`, press with `pressKey`, click
  with `clickText`, drag with `dragTo`. Calling a component method or a store
  from `executeJavaScript` would test the store, not the application.
- **Evidence from outside the application.** A file is read with
  `readFileSync`, a commit with `smoke.git`, a colour from `getComputedStyle`.
  A bridge answer or a store value is the application's opinion of itself.
- **A screenshot where looking matters.** Write it to
  `join(smoke.evidenceDirectory, 'smoke-<name>.png')` and print
  `smoke evidence: <path>`. Then **look at it** — capturing is not inspecting
  (`AGENTS.md`, "Definition of done").
- **Negative cases prove the dialog closed**, not only that nothing
  happened. A confirmation that ignores a key would otherwise pass a check
  that only asks whether the file is still there.
- **One `smoke ok:` line per check**, at the end, saying what was proven.
- **Close what you open.** `run()` calls `expectNoStrayDialog` after every
  check: a dialog up at a boundary fails the run, naming the check before
  it. A conflict prompt once stood through twenty checks of every run
  because nothing looked; now something does.

## The order is part of the check

`run()` in `main.ts` is a straight sequence. Every check leaves the project
in the state the next one starts from: committing needs the files the editor
checks wrote, discarding needs the commit, the merge needs the remote that
the fetch check created, deleting needs the sheet the library check created.
**Do not reorder checks without reading both neighbours.** A check that must
hand something to the next one returns it — the clone path from
`checkFetchAndPull` to `checkMergeAndResolve`, the open sheet from
`checkExternalChange` to `checkWatchedChange` — rather than storing it
anywhere.

`checkReturnToLauncher` and `checkCreateProject` run last, because the first
of them closes the window everything else needed.

## Waiting

The renderer is asynchronous and the smoke is not inside it, so every action
is followed by a wait. There are two kinds, and there is no third:

- **`waitUntil(what, condition)`** polls until the condition holds and fails
  naming `what` it waited for. This is the wait for a **consequence**: a
  file on disk, a row in a list, a dialog gone, a commit in the log. Every
  check names its consequence this way. `waitForSelector` and `settleWatch`
  are the same thing with a fixed condition.
- **`rendered(window)`** lets the renderer take what it was just sent and
  paint it — a macrotask, then two frames. This is the wait after an
  **input** (a click, a key, a pointer move) whose consequence is not one
  thing a check can name, and the wait before a screenshot. Every harness
  helper that sends input ends with it.

There is no fixed sleep. Ninety of them were replaced on 2026-09-03; a
fixed sleep gives a fast machine and a slow one the same time, and is wrong
for one of them. The two `setTimeout` calls that remain, in the live-status
check, are the **measurement** itself — the watch must stay quiet for three
seconds — and are commented as such.

**Wait for the panel, not for git.** After a click that writes through the
store, the store re-reads the status behind the same guard that refuses the
next click while it runs. Git reports the write done *before* that re-read
has finished, so a check that waits for git and then clicks again finds its
click refused as busy. Wait for what the panel shows — a box checked, a row
gone, a branch named — and the guard is free by the time you click. The
first run without sleeps found this four times.

## Debugging a failure

1. **Read the `smoke failed:` line.** Every check throws with what it
   expected and what it found; the message is the diagnosis more often than
   not.
2. **Read the renderer's console.** `forwardConsole` prints every
   renderer-side message with a `renderer:` prefix. A check that reports
   "script failed to execute" has its real cause there.
3. **Look at the last screenshot** in `build/desktop/`. The evidence images
   are written *before* the assertion that follows them, so the last one
   shows the state the failing check saw.
4. **Run the failing check alone.** Comment out the checks after it in
   `run()`. Do not comment out the ones before it — they build the state it
   needs.
5. **Read the `gave up waiting for …` message.** It names the consequence
   that never came. If the consequence did happen but the check moved on too
   early elsewhere, look for a wait on git state that should be a wait on
   the panel (see "Waiting").

## Adding a check

1. Decide which file it belongs to by the table above, or add a file under
   `checks/` if none fits.
2. Write it in the shape shown above. Give it a doc comment naming the
   `SPEC.md` section it proves.
3. Add one line to `run()` in `main.ts`, at the point in the sequence where
   the state it needs exists. Read the neighbours.
4. Add what it proves to the list in `TESTING.md` §2.7.
5. Run it. Then **falsify it**: break the thing it watches, see it fail for
   that reason, put it back (`AGENTS.md`, "Definition of done"). A check that
   has not been seen red proves nothing.
6. Look at any screenshot it writes.

## Things that are easy to get wrong

- **`__dirname` is `dist/`.** Both bundles live there, so paths to the
  repository root are `join(__dirname, '..', '..', '..')`. The renderer root
  and the preload path are resolved the same way inside the shell.
- **The fixture is a copy.** `examples/smoke-project` is never written to.
  If a check needs a file that is not in the fixture, write it into
  `smoke.projectPath` during the check.
- **The project window may be re-created.** After `checkReturnToLauncher`
  the old window is gone; use the launcher it returns.
- **`smoke.shell.projectWindow()` is null for a destroyed window**, so a
  destroyed check is never needed on it.
- **Menu commands go through the real menu item** (`clickMenuItem`), because
  a synthetic keystroke bypasses accelerators (`TESTING.md` §2.7).
