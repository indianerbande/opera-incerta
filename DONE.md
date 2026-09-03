# Opera Incerta — completed work

Newest entry first. Each entry records what was built, why it was built that
way, how it was verified, and what was learned (`AGENTS.md`, "Working
documents").

---

## 2026-09-03 — the Electron runtime arrives with the install

**What was open** (`TODO.md` §2). A clean checkout did not get the Electron
binary from `pnpm install`, although `allowBuilds` named the package, and
the runtime had to be fetched by running `install.js` by hand. The item
asked for the pnpm 11 setting that makes one step suffice.

**What was found.** There is no such setting, because there is nothing for
it to allow: the published `electron@44.0.0` package carries no `scripts`
at all. Its download lives behind a command, `install-electron`, that
nothing runs unless asked. A fresh clone installed with the lockfile
reproduced the empty `dist/` exactly, and `pnpm rebuild electron` did
nothing, for the same reason.

**What changed.** The workspace root has a `postinstall` script that runs
the command inside the desktop package. It is idempotent — the script
checks `dist/version` and `path.txt` and exits when they match — so a
repeated install costs nothing. `allowBuilds` keeps `electron: true` with a
comment saying why it is not what fetches the binary. `README.md` and
`DEPENDENCIES.md` say the same; the `PLATFORMS.md` bullet in `TODO.md`
carries it into the packaging round.

**Verification.** In a fresh clone: `pnpm install --frozen-lockfile` left
`Electron.app` under the package's `dist/`, and `pnpm run desktop:smoke`
in that clone ran green across thirty-one checks. The falsification is the
state before the change, seen in the same clone the same hour: no
`postinstall`, no binary.

**Lesson.** The item assumed a configuration mistake and asked for the
right key. Reading the installed package's `package.json` took a minute
and dissolved the question: a build setting cannot run a script that is
not there. Look at what the tool is being asked to do before looking for
the option that would make it do it.

---

## 2026-09-03 — the identity git needs, asked once and kept local

**What was open** (`TODO.md` §5, decided in `SPEC.md` §12). Without
`user.name` and `user.email` the first commit fails with "Author identity
unknown" and three lines of `git config --global` advice. For an author who
has never used git that is the normal case, and it arrived after creating,
writing, and staging had all worked.

**What changed.** Creating a repository now ends with a question when — and
only when — the machine has no global identity: a name, an e-mail address,
and one sentence saying that both go into every commit and travel with the
manuscript, and that they are recorded in this project only. The answer is
written with `git config --local`; the author's global configuration is
never written. **Not now** is an ordinary answer: the repository stays, and
the panel shows one row, "Commits have no author yet" with a **Set…**
button, for as long as neither scope has an identity. Correcting a recorded
identity starts from what the repository has.

The pieces: `identity(scope)` and `setIdentity` in the adapter, `gitIdentity`
and `gitSetIdentity` on the bridge, the identity read alongside the status in
the store, `createRepository` and `askForIdentity` as flows in the actions,
one new overlay kind with its dialog, and the row in the panel.

**Verification.** `pnpm run check` green: **896 tests** — the adapter's
arguments, a real repository unset then set locally with the global file
untouched, the store reading the identity only inside a repository, the
flows asking when the global identity is missing and not when it is there.
`pnpm run desktop:smoke` green across **thirty-one checks**: the run points
`GIT_CONFIG_GLOBAL` at an empty file, creates the repository, answers the
question through its two fields, and reads the answer back with
`git config --local` while the global file is still empty. Falsified twice:
an adapter writing the name with `--global` failed the real-repository test
and the smoke, which gave up waiting for the panel's row to go — neither
scope then held both halves; flows that skipped the question failed the
actions test.

**Lesson.** The line this application draws — nothing outside the project
changes — was easy to keep here because it was written down before the
feature was. `git config --global` is the answer every tutorial gives, and
the tempting one; the specification said no in advance, and the smoke reads
the global file to make sure.

---

## 2026-09-03 — a project without a repository is offered one

**What was open** (`TODO.md` §1.4, specified in `SPEC.md` §12 since the
gap check). The panel said the project was not inside a Git repository and
offered nothing; a freshly created project is exactly that state.

**What changed.** The panel's no-repository notice carries one button,
**Create repository**. It runs `git init --initial-branch=main` in the
project root — never a parent, because the manuscript is what gets a
history — and the status read that follows every write turns the notice
into a list of untracked files. Nothing is staged, nothing is committed:
what goes into the first commit stays the author's decision. The main
process refuses the request where the project is already inside a
repository, with `git/already-a-repository`, because `git init` there would
reinitialise, which is not what the button says.

The pieces: `GitService.init` in the adapter, `gitInit` on the bridge with
its handler in the shell, `createRepository` in the store as an ordinary
guarded write, the button in the panel.

**Verification.** `pnpm run check` green: **886 tests** — the
adapter's argument and a real directory left on `main` with nothing staged
and no commit; the store asking the bridge and reading the status that now
exists, and reporting the refusal. `pnpm run desktop:smoke` green across
**thirty-one checks**: the new project from the launcher, which has no
repository, is offered one; after the click `.git` is in the project root,
`HEAD` names `main`, nothing is staged, there is no commit, and the panel
lists the project as untracked — all read from disk and from git.
Falsified by having the handler skip `git init`: the smoke gave up waiting
for the repository to exist.

**Lesson.** The first thing an author without git sees of source control is
a sentence about their project not being in a repository. A sentence that
ends there is a wall; the same sentence with the one fitting offer beside it
is a door. The feature was five small pieces, and the sentence was the
reason for all of them.

---

## 2026-09-03 — the editor forgets a document that is gone

**What was open** (`TODO.md` §1.7 until this round). The CodeMirror adapter
kept an `EditorState` — text, undo history, cursor, scroll position — per
document id for as long as it lived, deleted sheets included. A memory
question only for a very long session, and a boundary question before that:
nothing could tell the adapter that a document was gone.

**What changed.** `EditorAdapter.forget(documentId)` is part of the editor
boundary: what is remembered for that id is released, opening the id again
starts fresh, and forgetting an unknown id or the open document is not an
error. The contract suite has a case for it, so both implementations — the
CodeMirror adapter and the in-memory double — are held to it, and the editor
spike runs it against the real component.

Who says a document is gone: the workspace store, which sees on every
re-read which handles the new snapshot no longer carries, and accumulates
them as `retiredHandles`. The editor component takes that list as an input
and forgets each id once. Handles are kept across re-reads since the port
round, so an id goes only when its sheet was deleted or moved.

**Verification.** `pnpm run check` green: **882 tests** — the contract
case runs twice, against the double and against the real adapter in the
spike (`pnpm run spike:editor` 7/7 with fourteen cases now), and the store
test proves a deleted sheet's handle is retired and an untouched one is
not. `pnpm run desktop:smoke` green across **thirty checks**. Falsified by
having the CodeMirror adapter keep the state on `forget`: the contract case
failed in the spike, and only there — the double was right — which is the
suite doing what it exists for.

**Lesson.** "A memory question only for a very long session" was true and
was not the point. The point was that the boundary had no word for a
document ending, and a boundary that cannot say "gone" leaves every
implementation to keep everything forever.

---

## 2026-09-03 — the core rules the review found loose, tightened

**What was open** (`TODO.md` §1.8 until this round): eleven rules in the
portable core that the review had found wrong, loose, or in the wrong
place, each confirmed against the built code before the round began.

**What changed.**

- **The two conflict rules agree.** `hasConflictMarkers` is defined through
  the parser: a start marker that never closes is text to both, where the
  store used to lock a sheet the resolver had nothing to resolve in.
- **A rename detected in the working tree** (` R`, git ≥ 2.18) consumes its
  old path like an index rename does, rather than inventing a file from it.
- **Emphasis has a flanking rule**, in its smallest form: an asterisk
  followed by a space opens nothing, one preceded by a space closes nothing.
  `2 * 3 * 4` is arithmetic again.
- **Fences and indented code as CommonMark has them.** A fence closes only
  on one at least as long and of the same character; four spaces or a tab
  after a blank line is verbatim, an indented continuation of a paragraph
  is not.
- **The outline is one-based**, like every other line number the core hands
  out; the outline component no longer adds one.
- **`previewLines` is generic over the line**, so the level travels with the
  text and the sheet list no longer matches levels back by comparing texts.
- **The editor contract suite is `@opera-incerta/core/testing`**, a
  subpath export: a test suite in the production export was a test suite in
  the production bundle. The core's own test and the editor spike import it
  from there.
- **Progress figures count the prose**, not the file: heading hashes and
  emphasis delimiters are not words; a fenced block counts as written.
- **Slugs keep every letter.** The text is decomposed and its combining
  marks dropped after the umlaut table has run, so `Café` is `cafe` and
  `Größe` stays `groesse`. The test that enshrined `caf-nave` now enshrines
  `cafe-naive`.
- **A category colour is stored as `#RRGGBB`** whatever the file spelled;
  the badge binds the string into a style, where `ff8000` is not a colour.
- **The refresh coordinator runs the follow-up it coalesced even when the
  run before it failed.** Requests made during a run wait for the
  follow-up, not for the run that began before they asked; the comment that
  described a case that could not occur is gone. `ExclusiveTask.run` says
  `{ ran: false }` rather than `null`, which an operation may itself answer.
- **`block-height.ts` is gone**, with its exports and the tests that lived
  in another module's file; `front-matter-view.ts` had carried the same
  rule all along.

**What was left as it is, deliberately.** `HeadingMarkerActivation` still
carries the marker's viewport coordinates through the core boundary: the
menu is placed by the shell, and a pair of numbers with a documented meaning
is the least the boundary can carry for that. The layout and preference
constants stay in the core: they are pure, tested, and shared by two
frontends' worth of code (the workbench and the smoke), which is what the
core is for.

**Verification.** `pnpm run check` green: **880 tests** — fifteen new in
the core for the tightened rules, the outline and preview tests re-pinned,
the refresh tests extended. `pnpm run spike:editor` 7/7 with the suite
imported from its new place. `pnpm run desktop:smoke` green across
**thirty checks** — after one run stopped at the merge check because the
Resolve click had no wait of its own and came one status refresh early,
which is the rule of the sleep round applied once more: wait for the panel.
Three green runs followed.

Three falsifications: with each half of the flanking rule removed in turn,
exactly the tests for that half failed — the first attempt removed only the
opening half and found that no test needed it, so one was written; with the worktree rename ignored again, exactly the
` R` test failed; with `hasConflictMarkers` back to looking for `<<<<<<<`
alone, exactly the agreement test failed.

**Lesson.** A rule that two places must apply the same way is one rule,
defined once — `hasConflictMarkers` through the parser, the visible children
of a directory through one function, the preview line with its level in
one object. Every item in this round that was a *bug* was two places
disagreeing; every one that was *loose* was a rule that had stopped one
case short of where the format's own rules end.

---

## 2026-09-03 — the port is the only way to the disk

**What was open** (`TODO.md` §1.8 until this round). The `ProjectFilesystem`
port existed "so tests run against an in-memory double", and no double
existed; the session and the shell reached past it to `node:fs` for what it
did not offer — a directory to create, a file to move, a kind to know. The
scan read every non-Markdown file in full to learn it was not a directory.
`readStructure` and `readCategories` turned every failure into an empty
record, and the next edit wrote `{}` over the author's arrangement; the
records were written directly while sheets were written atomically.
`placeEntry` re-read the whole project twice per drag and re-minted every
handle, while the comment on `reopen` said handles were kept.

**What changed.**

- **The port is complete**: `listEntries` with each entry's kind,
  `isDirectory`, `createDirectory`, `moveEntry`. Neither the session nor the
  shell imports `node:fs` any more; the shell holds one filesystem and hands
  it to the session.
- **An in-memory implementation** (`MemoryProjectFilesystem`) with the same
  rules — a write needs its parent, a move takes a subtree along — and **one
  contract suite** that runs against both implementations: nine cases, over
  the disk and in memory. A double that behaves differently from the real
  thing tests nothing, and the suite is what says whether it does.
- **The scan classifies from the listing.** `visibleChildren` is the one
  rule for what a directory shows, used by the scan and by `placeEntry`,
  which now lists the target once instead of re-reading the project.
- **Only a missing or malformed record takes the fallback.** A record file
  that is there and cannot be read fails with `structure/unreadable` or
  `categories/unreadable`; the test puts a directory where the file should
  be. Records are written atomically, like sheets.
- **Handles are kept across a re-read of the same project**, as the comment
  had claimed: a save in flight during a library edit still names its file.
  `isProjectDirectory` asks for access rather than reading the record.

**Verification.** `pnpm run check` green: **872 tests** — eighteen in the
contract suite (nine cases, twice), two for the unreadable record and the
atomic write, one for the kept handle; every existing session and adapter
test unchanged. `pnpm run desktop:smoke` green across **thirty checks**,
twice — the drags, the deletions, the moves, all through the port.

Three falsifications: with the double moving a directory but leaving its
files behind, exactly the in-memory move case failed and the disk one stayed
green; with every read failure an empty record again, exactly the
unreadable-record test failed; with handles minted fresh on every re-read,
exactly the kept-handle test failed.

**Lesson.** A port that is missing an operation does not stay a port: the
first caller that needs the operation goes around it, and after that the
port describes what the code used to do. The way to keep a boundary is to
make it complete enough that going around it is more work than using it —
and to have a second implementation, because a boundary with one
implementation is a boundary nobody has tested.

---

## 2026-09-03 — one shape for a failure, and a contract that names what it carries

**What was open** (`TODO.md` §1.8 until this round). Four error classes of
the same shape on four sides of the bridge, and the bridge duck-typing
between them: anything with a `code` crossed with its message, which is how
Node's `ENOENT` reached the renderer with an absolute path in it. `GitError`
had one code for everything, so the renderer could not tell a missing
upstream from a diverged history except by reading stderr. The contract
transported the library, the categories, and the status entries as
`unknown`, and the renderer cast at six places; three git types were
declared twice; fourteen request guards were hand-written and uneven; and
nothing typed the preload against the interface it exposes.

**What changed.**

- **`CodedError`** in the core: a code and a message that is either the
  tool's own words or empty. `ProjectError` (with its path, for the log),
  `ProjectSessionError`, `GitError` (with its exit code and stderr),
  `GitUnavailableError`, and the renderer's `BridgeFailure` all extend it.
  The bridge lets only a `CodedError` cross with its words; anything else is
  logged in the main process and crosses as `bridge/failed` with none —
  `failureResult`, in a file without Electron, so it is a unit test. The
  test feeds it an `ENOENT` with `/Users/someone/secret.md` in its message
  and asserts the path does not come out.
- **Git's failures are named.** `classifyGitFailure` in the core reads
  stderr and stdout — a merge writes `CONFLICT` to stdout, which the first
  version missed — into ten codes: no upstream, not fast-forward, conflict,
  authentication, branch not merged, nothing to commit, index locked, no
  identity, not a repository, and `git/command-failed` for the rest. Every
  real-repository test that pinned `git/command-failed` now pins the code
  it should have had: the push without a remote is `git/no-upstream`, the
  diverged pull `git/not-fast-forward`, the conflicted merge
  `git/conflict`, the refused deletion `git/branch-not-merged`.
- **The contract depends on the core and names what it carries.**
  `library: GroupEntry`, `categories: readonly PageCategory[]`,
  `entries: readonly GitFileStatus[]`; `GitBranch`, `GitRemote`, and
  `GitTracking` live in the core once. The six casts are gone.
- **Guards from combinators.** `shape`, `arrayOf`, `nullable`, `optional`,
  `literal`, and five scalar guards; every request guard is a shape now,
  three of the old functions remain (the path rule, the byte counter, the
  channel check). Three response guards came with it — `isProjectSnapshot`
  checks the root is a group, `isLibraryEditResult`, `isGitReport` field by
  field — and the renderer's stores refuse what fails them through
  `unwrapAs`, naming the payload in the code.
- **The preload `satisfies OperaIncertaBridge`.** A method added to the
  contract and forgotten there fails to compile; the menu listener's
  parameter had to become `MenuCommand` for it to.

**Verification.** `pnpm run check` green: **851 tests** — fifteen for the
classifier and `CodedError`, four for `failureResult`, three response-guard
suites in the contract; the git adapter's real-repository tests re-pinned
to the named codes. `pnpm run desktop:smoke` green across **thirty checks**,
twice: the panel still shows git's own words, because the words did not
change, only the code beside them.

Three falsifications: with the classifier reading "no configured push
destination" as a diverged history, exactly the two no-upstream cases
failed; with a stray error crossing with its words, exactly the
path-stripping test failed; with the report guard no longer checking
`merging`, exactly the field-by-field test failed.

**Lesson.** A duck-typed boundary is a boundary that lets through whatever
happens to quack. The one class cost twenty lines and made the bridge's
rule a type check rather than a convention — and the test that puts a home
directory into an error and watches it not come out is the one that says
what the rule is for.

---

## 2026-09-03 — the smoke waits for consequences, not for time

**What was open** (`TODO.md` §1.8 until this round). Ninety `setTimeout`
waits across the smoke's checks and helpers, thirty-six of them in source
control: after a click, 250 ms; after a commit, 1,200 ms; after a drag, 700
ms. Each one gave a fast machine and a slow one the same time, and was wrong
for one of them — and `TODO.md` §1.6 records the one run in which it was
wrong for this one.

**What changed.** Two primitives in `harness.ts`, and no third kind of wait:

- **`waitUntil(what, condition)`** polls until the condition holds and fails
  naming what it waited for. Every wait for a *consequence* — a file on
  disk, a row in a list, a dialog gone, a commit in the log, a box checked —
  is one of these now, and every one names its consequence. Four small
  readers came with it (`headerTitle`, `sheetTitles`, `selectedGroupName`,
  `rowShown`), and the source control checks got theirs (`allStaged`,
  `rowStaged`, `branchShown`, `stagedPaths`, `logIncludes`).
- **`rendered(window)`** lets the renderer take what it was just sent and
  paint it: a macrotask, then two frames. Every harness helper that sends an
  input event ends with it, and it is the wait before a screenshot.

Eighty-eight sleeps are gone. The two that remain, in the live-status check,
are the measurement itself — the watch must stay quiet for three seconds —
and say so. The five other `setTimeout` calls in the tree are the poll
intervals of the waits.

**What the first run without sleeps found.** Four times, a check that waited
for **git** to report a write done and then clicked again found its click
refused: the store re-reads the status after every write, behind the same
guard that refuses the next click while it runs, and git says "staged"
before that re-read has finished. The sleeps had been hiding it. The rule is
now in the README: wait for what the **panel** shows — a box checked, a row
gone, a branch named — and the guard is free by the time you click. One more
was a wait for `git log` before the first commit exists, where git fails
rather than answering with nothing; the condition reads that as "not yet".

**Verification.** `pnpm run check` green: **829 tests**, unchanged — nothing
outside the smoke was touched. `pnpm run desktop:smoke` green across
**thirty checks**, four runs in a row, each in about thirty seconds where the
sleeps had made it about a minute. Falsified by giving every `waitUntil` no
time at all: the run stopped at the first consequence that takes a bridge
round trip — "gave up waiting for the editor to load the other sheet" —
which is the wait doing its job, on the check where it is needed.

**Lesson.** A sleep is a guess about a duration written down as a fact, and
the guess is wrong exactly when it matters. Naming the consequence instead
costs a line and returns two things: a run that is as fast as the machine,
and a failure that says what never happened. And it found a class of race
the sleeps had been papering over from the first day — which is what a wait
that is too generous does: it makes every race look like it was won.

---

## 2026-09-03 — one git command at a time, and a machine without git

**What was open** (`TODO.md` §1.8 until this round). Every bridge handler
runs concurrently, so a status refresh racing a commit reached the author as
an `index.lock` error; and `systemGitRunner` turned the `ENOENT` of a machine
without git into exit code 1 with empty stderr, which `repositoryRoot`
swallowed into "this project is not inside a Git repository" — a message
about the wrong thing. Three smaller items sat beside them: `hasCommit`
twice, `defaultRemote` splitting `git remote -v` on a space, and `tracking`
running two commands.

**What changed.**

- **A queue per directory** in `ProcessGitService`: every command goes
  through one `#invoke`, which chains it behind the last command for that
  directory, succeed or fail, and lets other directories run alongside.
  Reads wait too, deliberately (`SPEC.md` §12): a status beside a push is a
  lock error, a status after it is merely late, and the renderer's separate
  guards already keep a slow read from swallowing a click.
- **`GitUnavailableError`**, code `git/not-installed`, thrown by the real
  runner when the executable itself is not found. It carries no message —
  there are no words of git's to pass on — so the code reaches the panel,
  which words it: git is not installed, or not on the path; source control
  needs it, everything else works without it. The panel shows a failure in
  its no-repository state now, where it used to show only the hint.
- **`tracking` is one command.** The branch header of
  `status --porcelain=v2 --branch` carries the upstream and the drift; a
  pure `parseTrackingHeader` in the core reads it, tested against recorded
  output, and the adapter stays a wrapper.
- **`defaultRemote` reads the configuration** (`config --get-regexp`), so a
  local path with a space in it arrives whole. `hasCommit` is one method.
  The unused `GitFailure` interface is gone.

**Verification.** `pnpm run check` green: **829 tests** — eight new in the
git adapter (two commands against one directory run one after the other; a
failed one does not block the next; two directories are not held up by each
other; a runner that cannot start reports `git/not-installed`, and so does
the real runner with an empty `PATH`; a remote path with a space; no remote;
the upstream from one status call), three in the core for the header parser,
one in the renderer for a failure without words. Every real-repository test
of the adapter, tracking and merging included, runs on the new
implementation unchanged. `pnpm run desktop:smoke` green across **thirty
checks**, twice.

Three falsifications: with the queue bypassed, exactly the two ordering
tests failed and the two-directories test stayed green; with `ENOENT`
mapped to exit code 1 again, exactly the empty-`PATH` test failed; with
ahead and behind swapped in the parser, exactly the header test failed.

**Lesson.** A failure that is turned into a "normal state" one layer down
cannot be told apart from that state one layer up. The runner had no way to
say "there is no git", so the service had no way to say it, so the panel
said something true about a different thing. The code had to exist at the
bottom before the words could exist at the top.

---

## 2026-09-03 — the renderer, second round: one dialog, one way in, rows from the model

**What was open.** The first round took the flows out of the shell; `TODO.md`
§1.7 listed what the review had found beyond that, in the order to take it.
This round took all of it but one line.

**What changed.**

- **One dialog shell.** `wi-dialog` draws the backdrop and the centred panel,
  handles Escape, and carries the ARIA role and name; the eight dialogs
  project their content into it. What the content shares — heading, header
  row, actions row, buttons, hint — is styled once in `styles.css` under
  `wi-dialog`, because projected content is outside a component's own
  encapsulated styles, and the few colours every part agrees on are custom
  properties there (`--wi-border`, `--wi-muted`, `--wi-danger`, …). The
  eight copies of the chrome had drifted in top offset, padding, and shadow;
  they are gone, and so are nineteen literal greys.
- **State is provided once and injected where it is read**
  (`workspace/providers.ts`). The stores, the layout, the drag, the overlay,
  and the two action classes are provided at the shell; the tree, the sheet
  list, and the source control panel inject what they read. The source
  control panel's fourteen inputs and eighteen outputs are gone, and its tag
  in the shell is `<wi-source-control />`. The drag state no longer travels
  through every level of the tree. `DESKTOP_BRIDGE`, an injection token
  nobody provided, is now the one place the bridge is resolved.
- **A library row names itself by kind and path only.** `describeRow` and
  `describeListEnd` in `library-drag.ts` read the rest — the index among the
  siblings, their names, the group above — from the library model, and are
  pure and tested. The five-attribute `data-` contract across three files is
  two attributes, and the document is no longer queried on every pointer
  move.
- **`linkedSignal` instead of `queueMicrotask`** in the four dialogs that
  seed a local copy from an input: synchronous on first paint, re-seeded
  when the input changes, and no comment needed to explain a tick.
- **`LauncherStore`** holds the welcome window's state and runs against the
  fake bridge in twelve tests; the component is thirty lines and renders.
- **`LayoutState`** exposes read-only signals like the stores; the three
  front matter switches persist like every other preference (they persisted
  only as a side effect of the next unrelated change); the activity bar is
  generic over its region's view union, so an unknown view is a compile
  error rather than a silently ignored call; the secondary sidebar's title
  is the label of its active entry rather than a second list of the same
  words; and the outline depth is read from the layout where it lives, no
  longer mirrored into the workspace store.
- **The CodeMirror adapter** builds its gutter per adapter with a closure
  instead of a module-level map from view to adapter, skips re-parsing the
  document for a selection change that stays on its line — which was every
  arrow key — and has its imports in three statements rather than six.

**What was left, and why.** The adapter keeps an `EditorState` per document
id for as long as it lives, deleted sheets included. Forgetting one needs a
word through the editor boundary in the core, which changes the contract
suite; it is the one item still in `TODO.md` §1.7.

**Verification.** `pnpm run check` green: **817 tests** — twelve for the
launcher store, five for the model-described rows, one for the persisting
switches, and every existing test unchanged and green; the layout test that
passed `'nonsense'` to the navigator lost that half, because it no longer
compiles. The Angular build type-checks every rewritten template. `pnpm run
desktop:smoke` green across **thirty checks**, the same lines: the smoke
selects dialogs by component tag and inner class, and both survived the
shell. The screenshots were looked at: the delete confirmation, the conflict
resolver, and the ignore editor sit centred with their chrome in place.

Three falsifications: with an unavailable project opened anyway, exactly the
launcher test for it failed; with a row's index one too high, the two
row-placement tests failed and no other; with the front matter switch no
longer stored, exactly the new persistence test failed.

**Lesson.** Encapsulated styles are the reason a shared dialog cannot style
its content, and the reason eight copies existed. The way out was not to
weaken the encapsulation but to put the shared rules where projected content
can be reached — the global sheet, namespaced under the shell's tag. And an
injection token that nobody provides is a decision that was never made; the
two ways of handing state around were the cost of not making it.

---

## 2026-09-03 — the shell renders, the flows decide

**What was found.** The architecture review's picture of the renderer: the
core-adapter split is real and the stores are tested, but `app.component.ts`
had become the place where every dialog and every flow lived — 1,054 lines,
eight independent overlay signals with nothing to stop two being open at
once, and some three hundred lines of flow logic (which menu an entry gets,
what a prompt says, what confirming does, when a branch switch stops to ask)
that no test reached, because the only way to reach it was to render the
component. Context menus went out as string ids and came back through a
`switch`. The workspace store carried three copies of "capture the editing
state, adopt the snapshot, select, restore", two copies of "put the editor
back to what was saved", and one line twice. Three files translated an
unknown error three different ways.

**What changed, and what did not.**

- **Two plain classes hold the flows**: `LibraryActions` (the group and
  sheet menus, the prompts they lead to, the delete confirmations with what
  goes along, the category manager) and `SourceControlActions` (discard,
  diff, merge, resolve, publish, branches with the save-first rule, amend
  with the last message, the ignore editor). They take the stores and an
  overlay host and hold no Angular. Every flow now runs in a unit test
  against the fake bridge, menu to prompt to store: **30 new tests**.
- **One overlay** (`shell/overlay.ts`): a value with a `kind`, replacing
  eight signals. Confirming or cancelling takes it down; opening another
  replaces it. The conflict prompt of §10.6 stays the store's own, because a
  re-read raises it, not a click.
- **Menu entries carry what choosing them does.** `{ label, run }`; the menu
  reports the entry and the shell runs it after the menu is gone. The string
  ids and the `switch` are gone.
- **One re-adopt in the workspace store** (`#readopt`), called by the
  explicit reload, saving the categories, and every library edit. `#adopt`
  no longer resets the selected group as a side effect; the two callers
  that want the root say so. `#dropEditing` replaces the two copies of the
  reset. The doubled line is gone.
- **One error translator** (`toBridgeFailure` in `bridge.ts`). The
  workspace store shows the code, source control prefers git's own words —
  that difference is intended (`SPEC.md` §12) and now sits on one function
  rather than three duck-typings. `SourceControlStore` gained the `#runRead`
  it was missing beside `#runWrite`; five reads that each carried the same
  seven lines are one line each.
- **The shell is 689 lines**, down from 1,054, and what remains is
  composition, the drag measurement, and three one-line handlers that hand
  an overlay's answer to its action.

**What did not change.** Any behaviour the smoke can see: thirty checks,
the same lines. The dialog components themselves — their chrome is copied
eight times, and that is the first item of the second round. So are the two
ways state reaches components, the drag's DOM protocol, the welcome
window's private store, and the layout state's inconsistencies; all in
`TODO.md` §1.7 with the review's notes, so the next round starts from a
list rather than a re-review.

**Verification.** `pnpm run check` green: **800 tests** (30 new, in
`library-actions.test.ts` and `source-control-actions.test.ts`; every
existing workspace and source-control test unchanged and green). The
Angular build type-checks the rewritten template. `pnpm run desktop:smoke`
green across **thirty checks**. Three falsifications: with the branch
switch no longer stopping for unsaved work, exactly the test for it failed;
with the root offered a delete entry, exactly the root-menu test failed;
with `#readopt` no longer restoring the editing state, **six** older
workspace-store tests failed — the fold preserved what they pin.

**Lesson.** A flow that lives in a component is a flow without a test, and
it stays that way for as long as the component is the only door to it. The
fix was not a component test — it was to put the flow where a test can
reach it and let the component render the result. The thirty tests written
this round took an hour; the flows had been untested since the day each was
built.

---

## 2026-09-03 — the smoke has an entry of its own, and a README

**What was found.** `apps/desktop/src/main.ts` was 4,113 lines, and 3,164 of
them were the smoke: sixty check functions, ninety `setTimeout` sleeps, a
hundred `executeJavaScript` strings — all bundled into `dist/main.cjs` and
shipped with the application, and all reachable only through one chain: each
check called the next at its last line, so the order of the run was spread
across thirty function tails and nowhere written down. The production
handlers branched on smoke variables in two places. A newcomer who wanted to
know what the smoke checked, or in what order, had to read the whole file.

**What changed.**

- **`shell.ts`** is the production main process, unchanged in behaviour,
  wrapped in one function: `startShell(options)`. The options are the five
  things a test needs to substitute — the directory chooser, the parent
  chooser for a new project, the trash, the user-data path, and a callback
  for the launcher window — and the handle it returns is the four things a
  test needs to see: both windows, the repository-watch count, and `exit`.
  Nothing in the file knows that a smoke exists. **`main.ts`** is now ten
  lines: it starts the shell with no options.
- **`smoke/`** holds the smoke: `main.ts` (the entry, and **the whole order
  of the run** in one function, top to bottom), `context.ts` (the one object
  every check receives), `harness.ts` (the helpers that do what a hand does),
  and `checks/` in six files by area — launcher, bridge, editor, panes,
  source control, library. Every check takes `smoke` first and `window`
  second; the three places where one check handed data to the next now
  **return** it instead of calling onward.
- The smoke is bundled to **`dist/smoke.cjs`**, separately, and run with
  `electron dist/smoke.cjs`. The environment variable is gone. The production
  check now fails if `dist/main.cjs` carries a harness string, a fixture
  path, or a `smoke ok`, and checks that `dist/smoke.cjs` starts the same
  sandboxed windows.
- **`smoke/README.md`** is written for someone who has never seen the code:
  how to run it, what is where, how a check is shaped and the six rules it
  follows, why the order is part of the check, the two kinds of waiting and
  why one is preferred, how to debug a failure in five steps, how to add a
  check in six, and the things that are easy to get wrong.

**What did not change.** Every check. The split was done by slicing the file
at function boundaries with a script, substituting the shell's globals with
the context object, deleting the chain calls, and letting the type checker
name every seam that was left: five, all expected. The thirty `smoke ok`
lines come out in the same order with the same words.

**Verification.** `pnpm run check` green: **770 tests**, unchanged; the
security-boundary test reads `shell.ts` now, and would fail against the
ten-line `main.ts`. `pnpm run desktop:smoke` green across **thirty checks**.
The
new production assertion was falsified twice, and the first attempt taught
something: a bare `import './smoke/harness.js'` in the production entry left
the check green, because esbuild drops an import nothing uses. With a check
function actually referenced from `main.ts`, the check failed on both
`executeJavaScript` and `smoke ok` — and the falsification itself is the
reason the assertion looks for strings the harness cannot avoid, rather than
for a file name.

**Lesson.** A test that lives inside the thing it tests cannot be read
without it, and cannot be left out of it. The split cost an afternoon; the
chain of tail calls had cost every reader before that. And the order of an
end-to-end run is a fact about the system — that committing needs the edit,
that the merge needs the remote — and a fact deserves a place where it is
written down, not thirty places where it is implied.

---

## 2026-09-03 — the codec refuses what it cannot read, instead of writing around it

**What was found.** The architecture review ran hand-picked inputs through
the front matter codec and found five ways it misread or damaged a file that
another tool, or a hand, had written — every one confirmed against the built
core before anything was changed:

- an owned field in a YAML shape the reader did not read — `keywords:` as a
  block sequence, `title: >` folded — was demoted to "unknown" and carried
  through verbatim, and on the next save the writer regenerated the field
  **beside** it. The file left with the same key twice in one mapping, which
  is not YAML for any reader. "Saving discards nothing" was honoured to the
  letter and broken in spirit;
- the double-quote unescaping ran three `replace`s in sequence, and each read
  the previous one's output: a written `"a: \\nb"` — a literal backslash and
  an `n` — came back as a real newline;
- the inline keyword list treated any quote as the start of a quoted item,
  while the writer quoted only items with a comma or a bracket; `[it's, fine,
  o'clock]` read back as one keyword;
- a block literal's content was sliced at a fixed two spaces past the key, so
  a hand-written block indented by three lost its first character per line;
  `|+` was read as `|`; `opera-incerta: {}` was refused as "not a mapping";
  a duplicated owned field silently last-won while a duplicated namespace was
  a hard error;
- a Markdown file beginning with a thematic break — `---`, a poem, `---` —
  was read as front matter, and the poem left the editor for the metadata
  area.

**The decision.** The codec keeps its stated shape — a reader for the schema
this project defines, no general YAML parser (`SPEC.md` §6.3) — and takes the
posture the namespace rules already had: **what it cannot read, it refuses
with a diagnostic and marks read-only**, and in that state it claims nothing
as owned, so even a mistaken write could not regenerate a field over the
original. Two new codes, `front-matter/field-unreadable` and
`front-matter/field-duplicated`, beside the three that existed. The reader's
schema is now written down in `SPEC.md` §6.2: a scalar on the line for the
single fields, an inline list *or a block sequence* for `keywords` (the shape
a hand most often writes, now read and written back inline), a scalar or a
literal block for `notes` with the content's indentation read from its first
line. Escapes are undone in one pass; a quote counts only at the start of a
list item, and the list item and the scalar share one quoting function;
`{}` is the empty mapping.

**What is a front matter block at all** got a rule of its own. A `---` on
line one opens one, as every tool agrees — but front matter is a mapping, and
a block with **no top-level key** in it is not one. A poem between two rules,
a heading under a rule, a lone rule with nothing to close it: all stay whole
in the body, writable, and gain an owned block in front on the first save
that needs one. The empty block stays front matter; a keyed block that is
never closed stays unterminated and read-only.

**What the generated test found.** `TESTING.md` §5 asked for generated
documents once the codec was stable; five hundred of them now run from a
seeded vocabulary of owned, foreign, malformed and stray fragments, and every
writable one must serialize to text that reads back to the same model,
serializes again to the same bytes, and carries no owned key twice. The first
run found a defect older than this round: a front matter whose **first lines
were indented** — continuation lines with no key of their own — had those
lines classified foreign, and the writer put the owned block in front of
them; on the next read they continued *it*, and a field was duplicated. The
writer now keeps such a leading run in front of the owned block (`SPEC.md`
§6.3, the one exception to "owned block first"). Two further failures were
the test itself scanning the body, and were fixed in the test.

**Verification.** `pnpm run check` green: **770 tests**, 36 of them new in
the codec suite — nine unreadable shapes each with its code on its line, the
duplicated field, the no-duplicate-key property asserted directly, the block
sequence, `{}`, six escape cases, quotes inside keywords, hand-indented and
blank-lined literals, the empty literal, five thematic-break cases, and the
generated documents. `pnpm run desktop:smoke` green across thirty checks,
twice. Three of the new checks were falsified against
their defect: with the escapes undone in sequence again, the backslash-`n`
case failed and nothing else; with the writer putting the owned block first
unconditionally, only the generated documents failed — the case no hand-picked
input covers; with an unreadable field demoted to unknown lines again, every
unreadable-shape case failed on the missing diagnostic.

**Lesson.** A rule that preserves bytes can still destroy a file, if the
bytes are put back where they mean something else. "Discard nothing" is
necessary, not sufficient; the writer also has to know what it is writing
*next to*. And the generated test earned its place in the first hour: it
found the one defect none of the hand-picked inputs had thought of.

---

## 2026-09-03 — one rule for every path a request carries

**What was found.** An architecture review of the whole repository turned up
one handler that trusted its input: `gitDiff` took a repository-relative path
from the renderer and, for an untracked file, ran `git diff --no-index --
/dev/null <path>` against it without checking that the path stayed inside the
repository. `git diff --no-index` takes any path at all, so a renderer could
read every file the author can — confirmed with `../outside/secret.txt` and
`/etc/hosts`, both returned as a "new file" diff. `gitVersions` and
`gitResolve` beside it did the check; `watchTargets` skipped it too, for a
notification-only watch. The contract's request guards were uneven in the same
way: one refused a leading `/`, another only an empty string, none a `..`.

**What changed.** The rule of `SPEC.md` §5.3 — a request that looks like
traversal is refused, not corrected, and containment is verified again after
resolution — now has one implementation per line of defense, so no request
type and no handler can leave it out (`CONVENTIONS.md` C-U7):

- **`isRelativeEntryPath`** in the contract, called by every request guard
  that carries a path: library edits, single paths, placements (both halves),
  watch targets, resolutions, and batches of git paths. It refuses an absolute
  path, a drive letter, a `..` segment, the percent-encoded spelling of a dot
  or a separator, a NUL byte, and an empty segment; it accepts `.` (whether a
  request may name the root is that request's decision) and one trailing
  separator, which is how git names an untracked directory.
- **`containedPath`** in the desktop shell, resolving a relative path against
  a root and refusing one that ends up outside. The session's six copies of
  the same four lines now call it; so do `gitResolve`, `gitVersions`, the
  repaired `gitDiff`, and `watchTargets`. The three git handlers share a
  `repositoryFile` helper and report `entry/outside-repository`, which is the
  boundary they actually check.

**Verification.** `pnpm run check` green: **734 tests** (12 new — the guard
against every kind of escape and against every request type that carries a
path; the helper against a climb and against a symlink inside the project that
points out of it). `pnpm run desktop:smoke` green across **thirty checks**: the
new one asks the real bridge from the real renderer to diff, version, resolve,
discard, watch, delete, create, and place a path out of the project, and
expects the contract's refusal on each — not a git error, because the request
must never reach git.

All three new checks were falsified. With the guard letting `..` through, seven
contract tests failed. With the helper never refusing, five session tests
failed, three of them older ones. With the `gitDiff` handler wired past the
contract guard, the smoke stopped at the second check with "a traversal on
diffUp reached a handler" — and the answer it reported was
`entry/outside-repository`, which is the second line of defense doing its job
on its own.

**The first run of the smoke failed** at staging: the guard refused
`part-1/` and `.opera-incerta/`, the trailing-separator form git uses for an
untracked directory, and the tri-state header's batch was rejected whole. A
rule written for traversal had been written stricter than traversal, and the
smoke — not the unit tests, which only asked about escapes — was what said so.

**Lesson.** A check that several handlers must apply is a check that one of
them will skip. The three git handlers were written in one round with the same
pattern; the fourth was written later and looked like the others from the
outside. Put the rule in one function and make the handlers unable to reach the
filesystem without it.

---

## 2026-09-03 — the documents stand on their own

**What changed.** This repository no longer refers to the two projects it drew
on: a native macOS writing application for *what* the product does, and a
TypeScript monorepo of the same shape for *how* it is built. Both were the
author's own work, both were passing out of reach, and every document here cited
them — `CONVENTIONS.md` alone carried 126 source citations, one per measure.

**What was done about it, in order.** First the gap check, because once the
sources are out of reach a gap can no longer be closed against them: the functional specification was read
end to end against `SPEC.md`, section by section, together with its open-work
list and the engineering documents. Nearly everything was already here, and in
several places in a better form than the original. Six things were not:

- **Creating a repository** for a project that has none. The panel says the
  project is not inside a Git repository and offers nothing to do about it.
- **The identity git needs.** Without `user.name` and `user.email` the first
  commit fails with a message written for programmers — and for an author who
  has never used git, that is the normal case, not an edge case. The decision
  is recorded with it: ask only when no global identity exists, write the
  answer repository-locally, never touch the author's global configuration.
- **Search** — finding inside the open sheet and searching the library are two
  features, and neither was written down.
- **Saved views (filters and favourites)** — named in the domain model since
  the first draft, specified nowhere.
- **Navigation history** — back and forward through the sheets that were open.
- **Reading the text aloud**, as a module.

All six are now in `SPEC.md`; the first two are also in `TODO.md` as the next
rounds, because they are small and their absence is felt. The concrete native
build contract — host-native packaging, the ABI trap when maker helpers are
built under a different Node, why Linux needs a DEB rather than an archive, and
the manual post-install pass — went into the `PLATFORMS.md` task, which would
otherwise have had to rediscover it.

**Then the references went.** Every citation was removed and every sentence
that leaned on one was rewritten to stand alone. That is more than deleting
text: a rule like "hand-built headers are a defect" was carried by *where it
came from*, and now has to carry itself, so what it says is what was seen —
each panel building its own header makes the separators sit at different
heights. Lessons kept their weight and lost their footnote. `CONVENTIONS.md`
was reflowed where the removal left ragged paragraphs.

**What was not done.** `DONE.md` is a log and was not rewritten; only the three
phrases that pointed outward were reworded. And no functionality was built this
round — the task was to make sure nothing is lost, not to build what was found.

**Verification.** `pnpm run check` green: **722 tests**. Beyond the gate, two
mechanical checks: no occurrence of either project name, or of "functional
template" / "technical template", survives anywhere in the repository outside
build output; and every `§`-reference in `SPEC.md` and every `C-` measure id
used in any document still resolves. The `CONVENTIONS.md` rewrap was checked to
be 80 columns in characters, not bytes — em dashes are three bytes and made a
byte count lie.

**Lesson.** The order matters and is not obvious: check for gaps *first*, while
the source is still there to check against. Removing the references is the easy
half and feels like the whole task; it is the half that cannot lose anything.

---

## 2026-09-03 — amending the last commit, and keeping files out of the repository

**What exists.** The last commit can be replaced: whatever is staged goes into
the commit that is already there, with the message from the panel. The field is
filled with the message that commit already carries, so amending to add a
forgotten file does not cost the author their wording. `.gitignore` is
reachable from an untracked row, which adds exactly that path, and as a plain
text editor for the list itself.

**Where the line is.** Amending is offered only while the commit has not been
pushed, and never during a merge. Once it is on the upstream it could only be
replaced there by a forced push, which this application does not do. The rule
is checked in both places that matter: the control is absent when it does not
apply, and the main process refuses the request whatever the interface shows.

**What the screenshot changed.** Two things that no test had asked about. The
change row read `.git...`: the three row controls are invisible until the row is
pointed at, but they still held their width, so in a narrow column the file name
was shortened for controls nobody could see. They now take width only when they
are visible. And the confirmation said the commit would take "the message
below" while covering the field it meant — it now quotes the wording it would
use, which is also the only way to notice a wrong one before confirming. Both
are now checked: the row's name must not be cut at rest, and the question must
name the message.

**The ignore rule is the file's, not ours.** A path already listed is not added
again, the line ending in use is kept, and nothing else in the file is touched.
Ignoring is not deleting: the file stays where it is and only leaves the change
list, which the smoke checks separately.

**Verification.** `pnpm run check` green: **722 tests**. The smoke writes an
untracked file, ignores it from its row, and reads `.gitignore` back from disk;
opens the list as text, adds a pattern, and reads it back again; commits,
amends, and confirms against `git log` and `git rev-list --count` that the
message was replaced and no commit was added; then pushes and finds the control
gone. Falsified four times, each aimed at one check: the ignore rule returning
the file unchanged ("the path was not written"), amend as a plain commit ("did
not replace the message"), amend as an empty commit with the new message
("added a commit: 7 became 8"), and the pushed gate widened to `ahead >= 0`
("still offered for amending"). The two screenshot findings were falsified as
well, by putting the width and the old wording back.

**Lesson.** The first amend falsification was too coarse: a plain `git commit`
with nothing staged fails, so HEAD did not move and the *message* check caught
it while the *count* check never ran. Only `--allow-empty` — which does change
the message and does add a commit — proved that second check. A falsification
that stops early proves less than it looks like it does.

---

## 2026-09-03 — branches, and the one rule git cannot enforce

**What exists.** The panel names the branch it is on and opens a list of them:
create, switch, delete. Creating starts at the current commit and switches at
once; deleting is the safe delete, so git refuses a branch whose work is not
merged and that refusal is the answer.

**The rule the application adds.** A switch is refused while the editor holds
unsaved work, offering to save first. Git knows nothing about a buffer, and an
author whose text sat under a file that has just become a different file has no
way to make sense of what happened. Saving is one click, and then the question
does not arise.

**What is deliberately left as git has it:** work that is saved but not
committed belongs to no branch and follows a switch. My first version of the
check asserted the opposite and failed, correctly — the assertion was wrong,
not the behaviour. Committing first makes the check say something true: the
committed change stays on its branch, and the working tree follows.

**A separator that is not a separator.** `git switch --create -- name` reads
`--` as the start of pathspecs and refuses the name; `--end-of-options` there
makes git look for a start point instead. Both were measured rather than
assumed. So switching and deleting pass `--end-of-options`, and creating passes
nothing — which is why the name is validated in the core before it ever reaches
git, and why that validation refuses anything beginning with `-`.

**Verification.** `pnpm run check` green: **709 tests**. The smoke lists the
branches, creates one and confirms with `git branch --show-current` that it was
switched to, types into the editor and finds the switch stopping to ask,
declines and finds the branch unchanged, commits and switches and finds the
work left behind, then tries to delete the unmerged branch and finds git's own
refusal in the panel. Falsified by removing the unsaved-work check: the switch
then happens without asking, and the smoke says so.

---

## 2026-09-03 — publishing a branch, and refusing an address that would run

**What exists.** A repository whose branch tracks nothing offers to publish it.
With a remote already recorded the address is known and the action is
confirmed, naming it — the moment a manuscript first leaves the machine
deserves to be said out loud. With no remote, the address is asked for and
recorded as `origin`.

**Why §12 excluded this, and what the exclusion was really about.** Not the
push: the address. Git's transports include `ext::`, which **runs a command**,
so a pasted address of that shape would execute it at the next fetch. An
address beginning with `-` is a second way in, because git would read it as an
option. So the accepted shapes are *named* rather than filtered — the ordinary
URL schemes, `user@host:path`, and an absolute path — and everything else is
refused with a reason. The `--` separator goes into the git invocation as well,
so that an address can never be read as an option even if the rule ever missed
one.

**What the falsification taught.** With the rule removed, the address still did
not run: recent git refuses the `ext::` transport itself. That makes this a
second line rather than the only one — worth knowing, and worth keeping, because
git's refusal depends on the machine's `protocol.*.allow` configuration and
this check does not. The check confirms both halves: no file was created, and
`git remote` lists nothing after the refusal.

**A one-off failure I could not reproduce**, and did not explain away: one
falsification run failed in an unrelated, much earlier check. Four runs
straight afterwards — two clean, two falsified — were green, and the
falsification then landed exactly where it was aimed. It is written down in
`TODO.md` with the suspicion to test first, because a flaky check is worse than
a missing one and pretending it did not happen is worse still.

**Verification.** `pnpm run check` green: **697 tests**. The smoke now creates
the remote for its later checks *through the interface*: it confirms the branch
is offered as unpublished, tries a command-running address and finds it refused
and unrecorded, then publishes for real and finds the manuscript in the remote
with `git ls-tree`.

---

## 2026-09-03 — merging, and deciding a conflict without ever showing a marker

**What exists.** Merge is a separate action, offered only where the two sides
have actually drifted apart, and confirmed before it runs. While it is
unfinished the panel says so and offers to abandon it. A conflicted file is
decided in a resolver that shows both versions side by side, with the words
that differ marked, and writes the file back with the chosen text.

**The two decisions this round rested on**, both of which I said needed making
before any code:

**Markers never reach the editor.** A merge writes both versions into the file
with `<<<<<<<` between them. A sheet in that state is shown and marked
read-only — the same mechanism a malformed front matter already used — because
an author typing around markers would save a file that is neither version.

**Per region, never per file.** This one changed my mind while thinking it
through. Choosing "keep mine" for a whole file sounds simpler, and it is
*worse than doing nothing*: git has already merged everything the two sides did
not both touch, and taking one side wholesale throws that away. So each region
is decided on its own, and a region left undecided keeps this copy's version —
silently preferring what came in would be a decision the author did not make.

**What the word comparison from the last round bought here.** Each region shows
its two versions with the differing words marked. Two paragraphs of prose that
differ in four words are otherwise indistinguishable at a glance, and this is
exactly the moment an author has to tell them apart.

**A falsification that failed to falsify, and what it showed.** Removing the
`writable` half of the read-only guard left the smoke green: the badge the
smoke looks at is driven by the *diagnostic*, and saving is refused by
`writable`. Two halves, one checked by the smoke and the other by a unit test,
and my falsification had aimed at the half the smoke does not see. Aimed at the
diagnostic instead, it fails as it should. The lesson is the one that keeps
recurring: a falsification proves the check, not the code, and it has to hit
the same thing the check does.

**Verification.** `pnpm run check` green: **690 tests**. The smoke makes a real
conflict by changing the same passage on both sides, confirms the merge, finds
the sheet read-only, opens the resolver and reads both versions out of it,
decides the one region, and confirms the written file carries the chosen text
and **no marker** — then commits and checks with `git rev-list --parents` that
what came out is a merge commit with two parents. Falsified twice: by dropping
the conflict diagnostic, and by writing the markers back out instead of the
decision.

**And once more the picture earned its place**: git labels the incoming side of
a pulled merge with a 40-character commit hash, which tells an author nothing.
Where the upstream's name is known it is shown instead — `origin/main` rather
than `82b5660f8108…`.

---

## 2026-09-03 — fetch, and a pull that cannot merge

**What exists.** The panel shows what the branch tracks and how far apart the
two are, and offers Fetch and Pull. Pull is offered only when there is
something to pull; a branch that tracks nothing shows none of it, because no
upstream is a normal state — this application still never creates one.

**Why this reverses part of §12, and how far.** §12 excluded pull and fetch
deliberately, and the reason stands two lines further down in the same section:
merge and conflict resolution are excluded too. A pull that merges can leave
conflict markers inside a manuscript, which is the worst outcome this
application could produce. So what is built is the half that cannot reach that
state: `--ff-only`. Where the histories have diverged git refuses, and its
refusal is what the author is shown. Fetching is unrestricted, because it
touches no file.

**Nothing special was needed for the files a pull brings in.** They arrive
behind the editor's back, the watchers notice, and the comparison rule of
§10.6 decides whether the author is told — machinery that was already there and
already tested.

**Verification.** `pnpm run check` green: **670 tests**. The service is checked
against a real remote with a second working copy as the other machine: after a
fetch, one commit behind and **no file** in the working tree; after a pull, the
commit is in. The smoke does the same through the interface, creating the
remote inside the check rather than in the fixture — an earlier check needs a
push to fail for want of one. Falsified where it matters: with `--ff-only`
replaced by an ordinary pull, the diverged-histories case merges instead of
refusing, and that test fails.

**The visual check earned its keep again.** In the narrow navigator the
upstream's name was truncated to `origi…`, which tells the author nothing. It
has its own line now, with the counts beside it and the buttons below.

---

## 2026-09-03 — a word-level diff for prose

**What exists.** A sheet's changes are shown **word by word**: the committed
text and the current one merged into one flowing text, with only what changed
marked. Git's line view is one click away and stays the default for everything
that is not a sheet — for a `structure.json` it is the useful one.

**Why it was worth an algorithm.** Git compares lines. Rewording four words in
a paragraph shows up as the whole paragraph removed and the whole paragraph
added, and the author has to find the change by reading both versions. That is
the wrong tool for a manuscript, and no arrangement of Git's output fixes it.

**Myers' shortest edit script over tokens, in the core, with no dependency.**
Words and the whitespace between them are tokens, so the text can be put back
together exactly. The common prefix and suffix are trimmed first — nearly all
of the work for a typical edit — and the search is bounded: beyond the bound
the middle is reported as replaced wholesale. Coarse, but correct, and bounded
work matters more than an ideal script for a file that was rewritten.

A library was considered and not taken (`DEPENDENCIES.md`): it would have
brought its own tokenizer, its own idea of a word and its own opinion about
whitespace, none of it smaller than the hundred lines it replaces, and all of
it to be understood before the result could be trusted.

**What makes it trustworthy is an invariant, not examples.** The kept and
removed parts put together must reproduce the committed text exactly, and the
kept and added parts the current one — nothing invented, nothing lost. It is
checked against two hundred generated pairs as well as the written cases.
Falsified twice: swapping the two edit kinds in the backtracking fails six
tests, and dropping the prefix trim fails two.

**One property, stated rather than hidden.** An inserted run carries the
whitespace that *follows* it, because the whitespace before it was already
there. That is minimal at the token level; writing it down as a test keeps it a
property instead of a surprise.

**Verification.** `pnpm run check` green: **661 tests**. The smoke opens a
sheet's diff and finds it in the word view with only `status: review` marked
and the rest of the file readable around it, switches to Git's view and finds
the header still read as a header. Falsified by never fetching the two
versions: the sheet then opens in the line view.

---

## 2026-09-03 — showing what changed

**What exists.** Each row in source control can show its diff: **Git's own
output**, unchanged, in a read-only viewer. Colour is the only thing added, and
colour is presentation — the words, the paths and the line numbers are Git's,
because this is tool output and is never localized (§14.2).

**Three decisions the specification left open, now written into it.** Against
the **last commit**, so one view answers "what would committing this change"
instead of making the author hold the index and the working tree apart in their
head. A file with nothing behind it is shown as entirely added, because that is
what it is — which also covers every file in a repository without a `HEAD`.
And reading a diff waits behind no write: it changes nothing, and a read that
queues behind a write presents as "the click did nothing" (C-F3).

**The rule worth having as a rule.** `--- a/scene.md` and `+++ b/scene.md`
begin with the same characters as a removed and an added line. Everything
before the first `@@` is a header, whatever it starts with — a pure function in
the core, so the viewer only paints what it is told.

**Verification.** `pnpm run check` green: **637 tests**. The smoke opens the
diff of a tracked file and finds the saved line marked added and its four
header lines marked header, then opens an untracked one and finds additions and
**no** removals at all. Falsified by removing the header rule: the untracked
file then appears to have removed lines, and two core tests fail as well. The
screenshot shows Git's text with the header grey, the hunk blue and the added
line green.

**What a writer would want instead** is recorded in `TODO.md`: a word-level
diff of prose rather than Git's line-based one. That is its own decision — it
needs an algorithm, and possibly a dependency.

---

## 2026-09-03 — discarding a change, confirmed first

**What exists.** Each row in source control can throw its change away, and
always asks first. The two kinds end differently and the confirmation says so:
a tracked file goes back to its last committed state; an untracked one has
nothing to go back to and goes to the **desktop trash** — never to `rm`, the
same rule as deleting a sheet (§6.7). In a repository without a commit every
tracked file is in that position too, because there is no `HEAD`.

**What each path is gets read from Git at the moment of discarding**, not taken
from the interface. This is destructive, and the interface's picture of the
working tree may be a second old.

**The editor's version goes with it.** Otherwise the next save would put the
discarded change straight back, and the conflict prompt of §10.6 would appear
in between, asking the author to decide again what they had just decided.

**Two defects, and one piece of speculative code caught in the act.**

The first was mine and macOS's: the affected paths came back **empty**, because
Git reports the repository as `/private/var/…` while the session knows the same
directory as `/var/…`. The relative path between the two forms points out of
the project, so every path was filtered away as external. Both are canonical
before they are compared now.

The second is a real race, and the story of how it was accepted is the point.
I added a guard against it on suspicion, wrote a test for it, and the test
passed — **with the guard and without it**. A test that cannot fail is worse
than no test, so the honest next step was to delete both. Aiming the test at
the actual interleaving instead — holding the *second* file read, so the
discard lands between reading the file and putting the editor's version back on
top — made it fail without the guard and pass with it. Only then had either
earned its place.

**Verification.** `pnpm run check` green: **626 tests**. The smoke's
twenty-fifth check refuses the confirmation first and finds both files
untouched, then discards an untracked file and finds it in the trash rather
than gone, then discards a tracked one and compares the result against
`git show HEAD:<path>` — with the editor's unsaved version gone and no prompt
about it. Falsified by making `forgetEdits` a no-op: the editor then still
holds what was discarded. The screenshot of the confirmation needed a frame's
wait before capturing; the element is in the DOM before the compositor has
drawn it, and the first picture was of an empty window.

---

## 2026-09-02 — the live watcher for source control

**What exists.** While the source control panel is on screen — and only then —
the repository root is watched recursively, and a change in the working tree
puts itself in the change list. The third and last watch target of §12.

**Set independently of the other two.** The selection moves constantly while
the panel's visibility rarely does, so the library targets and the repository
target release only what they replace. A single `dispose()` for everything
would have meant that every click in the tree stopped watching the repository.

**Two consumers, two channels.** The library notification ends in re-reading
the project; this one ends in reading `git status`. One channel would have
meant one of them doing the other's work.

**What the falsification showed, and it was not what I expected.** Removing the
`.git` filter does not first break the check written for it. It breaks an
*earlier* one: a failed push reports nothing, because the refresh storm
overwrites the message before anyone can read it. That is precisely the harm
`CONVENTIONS.md` C-F4 was written about, demonstrated more convincingly than
the check that was aiming at it.

**Verification.** `pnpm run check` green: **618 tests**. The smoke's
twenty-fourth check writes a file behind the application's back with the panel
open, watches it appear in the change list by itself, and then counts the
watch's reports over three quiet seconds: none. The file it writes is
deliberately not a sheet, so the fixture the later checks depend on is left
exactly as it was found — the first attempt used a `.md` file and broke a
deletion check four steps later.

---

## 2026-09-02 — the filesystem watcher, on `fs.watch` and nothing else

**What exists.** The main process watches the group whose sheet list is on
screen and the document in the editor, and tells the interface to look again.
Looking is where the comparison rule of §10.6 decides what the author sees:
nothing, a silent reload, or the prompt. With that, MVP criteria **§17.13 and
§17.14** are met — an external change is noticed without anyone asking.

**Measured before it was written.** Three properties of the platform decided
the adapter's shape, and each one is a rule in it:

- a watch on a **file** goes deaf the moment that file is replaced by a
  rename — which is exactly how this application saves. A file is therefore
  watched through its directory, filtered by name;
- one atomic save produced **seven** events, `rename` for ordinary writes among
  them, including two for directories that had not changed. The event type
  carries no information;
- `.git/index` shows up in a recursive watch, so the filter of §12 is not
  theoretical.

Two more surfaced while testing: a watch delivers a short **history**, so
changes made just before it started still arrive; and a non-recursive watch
reports activity in subdirectories too. Both mean more notifications than
asked for, never fewer.

**Why no library.** What `chokidar` mostly buys — coalescing, settling,
normalising quirks — this application already owns and tests. Taking it would
have meant two answers to the same questions. It stays recorded as the
replacement if the adapter ever needs to grow its own rescanning; it goes
behind the same port, and no rule moves.

**Three defects, and none of them in the watcher.** All three were latent, and
the watcher exposed them by doing what the refresh button had only ever done on
request:

- **the tree collapsed on every re-read.** Harmless when a re-read meant a
  button press; unusable once it follows every save. The expansion is kept now,
  minus whatever no longer exists;
- **the editor blanked for a moment on every re-read**, because adopting a
  project cleared the open sheet and the freshly read one arrived a bridge
  round trip later. A re-read of the *same* project keeps the document until
  its replacement is there;
- **closing a project told nobody**, so the watcher kept reporting a project
  that was no longer open.

Two of the three were found by checks about something else entirely — a drag
that could no longer find its row, a dirty marker that read `null` — which is
the argument for keeping the smoke as one long sequence rather than a set of
isolated cases.

**A note on my own tests.** Two of the watcher's cases passed at first for the
wrong reason and two failed for the wrong reason: the fixture's own writes were
still arriving when the watch started, so the tests measured the setup. They
now let the history drain before acting. A test that measures its own
preparation is worse than no test, because it reports confidence.

**Verification.** `pnpm run check` green: **612 tests**. The smoke's
twenty-third check writes a file behind the application's back and confirms
that it reaches the editor by itself, that it raises the prompt by itself over
unsaved work, and that a new sheet appears in the list — with nobody pressing
refresh. Falsified by stopping the notification: the check then reports that
the change never arrived.

---

## 2026-09-02 — Node 24, and a warning that had been right all along

**What changed.** The project now insists on Node 24 and refuses to run on
anything else. `engines` and `devEngines` both say `^24.15.0`, and
`devEngines.onFail` went from `warn` to `error`.

**Why 24 is not a preference.** Electron 44.0.0 carries Node **24.18.1** inside
it — measured with `ELECTRON_RUN_AS_NODE=1`, alongside Chrome 152 and V8 15.2.
That is the runtime the application runs on. Building and testing the toolchain
on a different major means checking against a runtime that is never shipped.

**How this came to light.** Every command in this checkout printed

    [WARN] This project requires Node.js 24.15.0. Your current Node.js is v26.4.0

and I read past it around forty times, because the machine's `node` on the PATH
is 26 and no version manager here reads `.node-version`. The three declarations
disagreed with each other as well: `.node-version` said 24, `devEngines` pinned
the exact 24.15.0, and `engines` allowed `>=26.0.0` outright — so the runtime I
happened to have was formally permitted.

**The warning was also broken in a way that guaranteed it would be ignored.**
Because `devEngines.version` was an exact version rather than a range, it fired
on Node **24** too: `requires 24.15.0 … your current is v24.20.0`. A warning
that is always there is a warning nobody reads. That is the lesson worth
keeping, and it is not about Node: a check that cannot be satisfied trains
people to skip it, and then it cannot warn about anything.

**Did it matter?** Measured rather than assumed: `pnpm run check` and the smoke
were run on both runtimes. Node 26.4.0 and Node 24.20.0 both give **592 tests
green and twenty-two smoke checks**, and the filesystem-watcher probe answers
identically on both. Nothing built so far is in question — but "nothing was
wrong this time" is not the same as "it was checked", and the difference is
exactly what the guard now enforces.

**Verification.** On Node 24: `pnpm run check` green with 592 tests, the smoke
green across twenty-two checks, and no warning line at all any more.
Falsified the other way round, which is the half that matters: on Node 26 the
same command now exits 1 with `[ERROR] This project requires Node.js ^24.15.0`.

---

## 2026-09-02 — four rounds towards the MVP, and the entries they should have had

Written after the fact, together: four rounds went in without their `DONE.md`
entry, which `AGENTS.md` asks for in the same round. The lapse is recorded here
rather than tidied away, because a rule kept only when convenient is not one.

### The conflict rule of §10.6, at every re-read

Re-reading a project replaced the open sheet with what was on disk, and what
the author had typed was not on disk. The rule §10.6 already specified now
decides: nothing when the file is unchanged, the file taken silently when
nothing was typed, and the prompt when both are true — with the author's
version held meanwhile, so the prompt asks rather than announcing a loss. A
library edit is not such a situation and carries the work across without
asking.

It uncovered two things. The editor was seeded from the *saved* body, so a
restored version lived in the store while the screen showed the file; the
editor document is now set deliberately at the three moments the text on screen
has to change. And taking the file needed a way to replace an open document's
content without pretending it is a different document, so the adapter port
gained `replace`, with a case in the contract suite both adapters run.

What is still missing is only the trigger — a watcher — which waits on the
dependency decision in `TODO.md` §2.2.

### The front matter area of §10.4

Two blocks between the header and the text, three persisted switches, and
read-only as a **different control**: a `<pre>`, readable and selectable, not a
disabled field. The owned block goes through the serializer that saves, so
display and file cannot drift apart.

The height rule is a pure function — the ten-line cap applied proportionally to
the *measured* height — and the measuring is where this round earned its
lessons. It was taken from whichever control was visible, and a text area
reports the height of its box rather than of its text; a dedicated hidden
element is measured now, through a `ResizeObserver`, because fonts arrive late.
Then the horizontal scrollbar that long values bring took its space out of the
last line. Both were found by **looking at the screenshot** — the second one
after a check that measured pixels had already passed. The check now asserts
the property instead: what is visible against what there is to see.

### Page categories, §6.6

Defined in a manager opened from the Inspector, assigned there, shown as a
badge whose text colour is computed from its background. They travel in the
project snapshot rather than through a channel of their own: read with the
project, refreshed with it, one source instead of two that can disagree.

The defect: a category assigned in the Inspector showed no badge until the
sheet was saved, because the badge came from the file. It is the same rule as
for a title being edited, so the two now share one core function — the library
as the interface shows it, carrying what the author has chosen.

A note to self from this round: `git checkout <file>` to undo a falsification
threw away uncommitted work in that file. A copy aside is the only safe undo
mid-round.

### The commit model of §12, against a real repository

The panel was built but never exercised: the smoke project was a copy in a
temporary directory, so it only ever reported "not inside a Git repository",
and every claim about staging and committing rested on unit tests over a
double. The fixture is a repository now, deliberately without a commit — the
state a freshly created project is in, and the one where unstaging cannot
resolve against `HEAD`.

Two defects. A failed Git action reported **nothing**: the store held the
failure and no one rendered it. And what it held was our code rather than Git's
message — `git/command-failed` where Git had said "fatal: No configured push
destination." `GitError` now carries what Git wrote, which is what its own doc
comment already claimed.

**Verification across the four.** `pnpm run check` green: **592 tests**, up
from 569. The smoke runs twenty-one checks. Each round was falsified: removing
the conflict prompt, dropping the scrollbar allowance, making the badge colour
constant, and — for the commit model — the check simply could not have run
before, which is why it was written.

---

## 2026-09-02 — placing: moving and ordering became one operation

**What exists.** A drag now says both things at once — which group an entry
ends up in, and where in it. Dropping between the children of *another* group
moves it there **and** puts it in that place (`SPEC.md` §6.8).

**Two operations became one, and that is the whole point.** `reorderEntry` and
`moveEntry` were separate: a drag into another group could not say where, and
doing both in two calls would let a failure leave an entry moved but unplaced.
They are one thing — reordering is placing an entry in the group it is already
in — so they are now one channel, one session method, one store method, one
drop shape. The contract version went to 2, which is what it is for.

**A claim the unification made true.** §6.8 already said an entry dropped into
another group "lands at the end". It did not: the destination's order was only
written where one already existed, so the arrival sorted alphabetically —
possibly into the middle. The destination's order is now written in full,
because that is what makes "at the end" mean the end.

**Two regressions the checks caught immediately**, both from the reveal path
now carrying a placed entry rather than only a created one:

- a placed sheet was **opened**. Revealing is not opening: the author was
  moving it, not choosing it. Only a created sheet opens itself.
- a placed group **took the selection with it**, so the sheet list switched to
  a group the author had not asked to see. A created group is selected
  outright; a moved one only gets the tree opened down to it.

Both showed up as the same symptom in the smoke — a sheet list that no longer
held what the next check looked for — which is worth noting: the checks that
found them were about something else entirely, three and four steps later.

**Verification.** `pnpm run check` green: **563 tests**. The smoke's
seventeenth check now drags across the columns three times: a sheet into a
group, that group into another, and a fourth group in front of an existing
child — reading the file from its new place, `structure.json` for the re-keyed
entry, the absence of the old one, *and* the recorded position, and the editor
for the same document it held before. Falsified by dropping the position on a
cross-group placement: the group then travels but arrives unplaced, and the
check says so.

---

## 2026-09-02 — moving between groups, and one owner for the whole drag

**What exists.** A sheet is dragged from the sheet list onto a group in the
tree; a group is dragged onto another group (`SPEC.md` §6.8). The middle half
of a group's row means the group itself, the quarter at each edge means between
the rows — so a reorder and a move are the same gesture aimed differently, and
hitting either does not demand precision.

**The drag changed owner, and that was the substance of this round.** Each
column used to own its own drag. That arrangement cannot express a drop in the
*other* column at all: a dragged row's siblings are not its ancestors, so the
pointer events during the drag never reach the column it started in. The shell
now owns the gesture — it is the one element containing both columns — and each
row merely *describes* itself in the DOM: what it is, where it sits, what it is
called. `elementFromPoint` does the rest. The decision logic stayed pure and
unit-tested; only the measuring touches the DOM.

**What travels with a path.** A moved group's own key in `structure.json`, and
every key beneath it, is re-keyed — otherwise the group arrives without its
display name and without the orders of everything inside it. The old
`moveChild` did none of that and would also have recorded an order of exactly
one name in a group that had none, which puts the arrival *first* in its new
group: the opposite of arriving. Both are now fixed and tested.

**The open sheet is followed, not closed** — whether it was the thing dragged
or sat inside a group that moved around it. It is the same document at a new
path, and what was unsaved in it belongs to it wherever it goes. The second
case is the one worth naming: the sheet was never the thing dragged, and its
path changed anyway.

**A name already taken gives the arrival a suffix.** Overwriting is out of the
question and refusing would block something the author plainly wants. It is the
one case where a file name changes after it was set, and it is invisible: the
title is untouched.

**Two defects the checks found, both mine, both geometric.** The first: an
index from the sheet list was compared against an index from the tree, which
are two different lists over the same group — a sheet dropped on the first
group row read as "already there". The second: the space *below* a list was not
a target at all, so a drop just past the last row did nothing. It now means the
end of that list, which is what that space looks like it means.

**Verification.** `pnpm run check` green: **559 tests**. The smoke's
seventeenth check drags a sheet out of one column and into the other with real
pointer events, then drags the group it landed in into a third — reading the
file from its new place on disk, `structure.json` for the re-keyed entry *and*
for the absence of the old one, and the editor for the same document it held
before. Falsified by widening the edge band so the middle of a row no longer
means the group: the move then fails. The screenshot taken while the pointer is
still down shows the destination outlined, the dragged row dimmed, and no
insertion line — because this drop is an into and not a between.

---

## 2026-09-02 — deleting into the desktop trash

**What exists.** A sheet or a group is deleted from its context menu, and
deleting means moving to the **desktop trash** (`SPEC.md` §6.7). The
application never removes a file itself: without a trash the operation is
refused rather than falling back to something irreversible — the same rule the
author's earlier writing application held to.

**Why the system trash and not one of our own.** It is the place the author
already knows how to restore from, and under Git the manuscript has a second,
independent net — a deleted file is in the history. A trash inside
`.opera-incerta/` would be a third place, sitting in the project, getting
committed, and needing its own retention rules.

**The trash first, the record second.** `structure.json` forgets the entry —
its name in the parent's order, its own entry and everything beneath it — only
after the move succeeded. The other order would leave a hole in the order and
the file still on disk.

**The confirmation says what the author cannot see**: the name, how much goes
along with a group, and — for the open sheet with unsaved changes — that those
are not in the trash afterwards, because they were never in the file. Return
cancels rather than deletes, like the default button of a system alert, and it
is bound outright instead of relying on where the focus landed: a rule about
not deleting things should not depend on that.

**Afterwards the author is left somewhere**: the sheet after the deleted one,
else the one before it; a deleted group hands the selection to its parent, and
the columns never show a place that is gone.

**The lesson of this round is about a check, not about the code.** The first
version of the smoke pressed Return on the confirmation and asserted the file
was still there. It passed — while the dialog was still open, because the
harness sends no character event and the focused button was never activated.
The check proved nothing: a confirmation that ignores every key would have
passed it just as well. It now asserts that the dialog **closed** as well, and
that is what caught it. A negative check has to say what *did* happen, not only
what did not.

**Verification.** `pnpm run check` green: **525 tests**. The smoke's sixteenth
check deletes a sheet and a group through the real context menus, and reads
both ends off the filesystem: gone from the project, **arrived** in the trash
with the group's sheet inside it, and struck from `structure.json`. Under the
smoke the trash is a directory of its own, so a run leaves nothing in the
author's own trash; that the destination is the desktop trash in the
application is one line of wiring, and a unit test proves the session removes
nothing itself — given a trash that does nothing, the file stays exactly where
it was. A screenshot of the confirmation shows the name, the warning, the
restore hint, and Cancel holding the keyboard.

---

## 2026-09-02 — reordering by drag, and the unsaved work it nearly cost

**What exists.** Sheets can be dragged into a new order in the sheet list, and
groups among their siblings in the tree (`SPEC.md` §6.4). The dragged row dims,
an insertion line shows where it would land, and the drop writes the group's
`order` to `structure.json`.

**Scope, deliberately.** An entry moves among its **siblings only**. Dragging a
sheet into another group is a file move — the path changes, and handles, the
open document, both orders and Git all have a stake in it — so it stays a
separate operation, still unbuilt. The core's `moveChild` already anticipates
it.

**Pointer events, not the drag-and-drop API.** The native API cannot be driven
by a synthetic pointer, and a gesture no check can drive is a gesture nothing
proves. The pointer also gives the insertion line the same feel the column
dividers already have. A press becomes a drag only after a few pixels of
travel, so an ordinary click stays a click — and the click that follows a real
drag is swallowed, because the author was moving the row, not choosing it.

**Two rules that keep the file honest.** The interface names the sibling to
land in front of, never a position: by the time the main process has re-read
the group, an index could point at something else. And the *whole* resolved
order is recorded, because a partial one would leave the rest to be appended
alphabetically — scrambling the arrangement just made.

**In the tree, a node owns the drag of its children, not of itself.** A dragged
node's siblings are not its ancestors, so pointer events during the drag would
never reach it; they do reach the one node that contains all of them. Pointer
capture would have been the alternative, and it is exactly what a synthetic
pointer may not support. It also makes "a group only moves among its siblings"
a property of the structure rather than a check.

**The defect this round found is the one that mattered.** Every library edit
re-reads the open sheet from disk — and silently threw away whatever was typed
but not saved. Renaming some *other* sheet was enough to lose a paragraph. The
editing state is now carried across the refresh and put back on top of the
freshly read file. It surfaced only because the new drag check ran after the
rename check and found the renamed title gone; the older checks had never
looked after a second edit. The explicit refresh still has this hole, recorded
in `TODO.md` where the §10.6 comparison rule belongs.

**Verification.** `pnpm run check` green: **506 tests**. The smoke's fifteenth
check drags a sheet past the row below it and a group past its sibling with
real pointer events, then reads both the shown order and `structure.json` from
the filesystem, and confirms that neither drag opened what it moved. Falsified
three ways: an unreachable drag threshold fails the smoke, a `reorderChild`
that returns its input fails nine unit tests across two packages, and removing
the carried-over editing state fails the unsaved-work test. A screenshot taken
**while the pointer is still down** shows the insertion line under the target
row and the dragged row dimmed — the line exists only during the drag, so no
check after it could have seen it.

---

## 2026-09-02 — creating and renaming sheets and groups

**What exists.** The context menus of `SPEC.md` §6.4 and §6.5. Right-clicking a
group in the tree offers a new sheet, a new group, and a rename; right-clicking
a sheet row offers a rename. A small prompt asks for the name and refuses an
empty one.

**What the rules protect.** Names on disk never move:

- a sheet's file name is fixed at creation from the slug of its title, and a
  rename rewrites only the front matter `title`;
- a group's directory name is fixed the same way, and a rename writes only
  `displayName` in `structure.json`;
- both operations append to a group's `order` **only when that group already
  has one** — recording an order for a group that never had one would freeze an
  arrangement the author never chose.

**Renaming the open sheet does not touch the file.** It goes into the editing
state and the sheet turns dirty, exactly as editing the title in the inspector
does, because it *is* that change. Writing the file behind the editor would
discard whatever is unsaved in it.

**The interface adopts, it does not patch.** Every edit is answered by the main
process with a freshly read project. A patched copy is how a tree starts
disagreeing with the disk.

**Two defects the checks found, both invisible to green unit tests.**

The first: after creating a sheet, the editor held it while the sheet list
still showed the group the author had been in — a sheet you can edit but cannot
see in the list beside it. The selection now follows what was created: a new
sheet reveals its group, a new group reveals itself, a rename moves nothing.
Creating a *group* must still leave the open sheet open, and that took a second
correction after the first fix closed the editor.

The second: renaming the open sheet changed the title everywhere except where
the author was looking. The tree, the sheet list, and the header all read the
saved name. They now read the edited one — a rename that nothing visibly
answers looks like a rename that failed — and the dirty marker is what says it
is not saved yet. The substitution is a pure function in the core
(`withSheetDisplayName`) that rebuilds only the branch down to that sheet and
otherwise returns the very same tree.

**A third defect, in the smoke's own exit.** `app.exit` emits no `before-quit`,
so the project window's close handler took the shutdown for an ordinary project
close and built a fresh launcher — the process never ended, and two runs looked
like hangs. The smoke now sets the terminating flag before it exits. The lesson
is older than this round: a guard that reads a flag is only as good as every
path that sets it.

**Verification.** `pnpm run check` green: **478 tests**. The smoke's fourteenth
check drives the real context menus with real right-clicks: it creates a sheet
and finds it on disk under its slug, renames a closed sheet and reads the new
`title` out of the file it was already in, renames the open one and confirms the
file did **not** change while the header shows the new name and a dirty marker,
then creates a group and renames it, reading `structure.json` from the
filesystem both times. Falsified: with `renameGroup` made a no-op the check
fails; with the reveal rule removed two store tests fail. The screenshot shows
both renamed sheets in the list, the new title in the header and the inspector.

---

## 2026-09-02 — draggable column dividers, and the preference record

**What exists.** The three resizable columns of `SPEC.md` §8.2 can be dragged,
and everything about the workbench's appearance now survives a restart.

The dividers needed persistence to be finished at all — "stored" is one of the
three properties the specification demands of a width — so this round also
built the installation-local preference record of §13:

- one versioned JSON document under a stable key, in the user-data directory;
- **a single malformed value costs that one setting, not the whole record.** An
  unreadable preference must not send the author back to defaults everywhere;
- widths are clamped on read as well as on write, so a changed constant cannot
  drag an old stored value into absurdity;
- unknown fields are discarded, and both sides validate — the renderer because
  it must not trust a file, the writer because a malformed record should never
  be written.

It carries the column widths, which view each region shows, whether the sidebar
is open, the sheet-list density, and the two display toggles. That closes the
layout-persistence item as a side effect of finishing the dividers.

**The divider itself** is 6 px to grab and 1 px to see. It reports pixels
moved; the width lives in the layout state, which is what keeps a view switch
from ever moving a column. The sidebar's divider sits to its left, so it is
told which side it belongs to — without that, dragging it would run backwards.
Double-clicking restores the ideal width.

**Verification.** `pnpm run check` green: **457 tests**. The smoke's thirteenth
check drags the navigator with real pointer events, switches views to confirm
the column does not move, and reads the width back out of the preference file.

**Three findings.**

1. **The measured width is not the applied width.** The check compared what the
   file stored against what the column occupied on screen and failed by one
   pixel — the divider overlaps its neighbours by design. It now compares the
   stored number against the applied one, which is the comparison that was
   meant: two numbers that must be identical, not two that happen to be close.
2. **A synthetic pointer may not be capturable.** `setPointerCapture` keeps a
   drag alive when the pointer leaves the 6 px strip, but a capture that cannot
   be taken must not stop the drag; it is now attempted and ignored on failure.
3. **`grep` in a pipe hid a running test.** Two runs looked hung because the
   filter buffered everything until the process ended. Writing the log to a
   file and waiting on its contents showed the run had been making progress the
   whole time — a reminder that "no output" is a statement about the pipe, not
   about the program.

---

## 2026-09-02 — naming a project when creating it

**What exists.** A dialog asking for a display name and a location, replacing
the directory chooser that derived the name from whatever folder was picked.

**Why not a save dialog**, which asks for a name and a place in one native
step: it would show the author typing a *folder* name, when what they type is
the display name and the folder gets a slug of it. The dialog would have looked
like it was doing one thing while doing another.

**It shows the folder it will create.** Typing "Die Nacht am Hafen" previews
`die-nacht-am-hafen` with a line saying the name can change later and the
folder cannot. Displaying the rule at the moment it applies is the difference
between a rule and a surprise.

The collision suffix is deliberately **not** previewed. Whether `-2` is needed
is decided against the real directory when the project is created, and the
renderer cannot know what is in it, so the dialog says the folder name it
derives rather than promising one it might not get.

A failed creation leaves the dialog open with what the author typed, rather
than making them start over.

**Verification.** `pnpm run check` green: **438 tests**. The smoke's twelfth
check drives the whole thing: open the dialog from the File menu, type a name
with spaces and a German article, confirm the preview reads
`die-nacht-am-hafen`, confirm Create is offered only with both a name and a
location, create it, and then read `project.json` from disk to confirm the
display name kept its spaces while the directory took the slug.

**Finding.** The shared test double caught the signature change immediately:
creating now returns a project rather than possibly nothing, because cancelling
happens in the separate location step. One type error, one place, naming
exactly what changed.

---

## 2026-09-02 — the native menu

**What exists.** A File menu with New Project (`Cmd/Ctrl+Shift+N`), Open
Project (`Cmd/Ctrl+O`), Save (`Cmd/Ctrl+S`), and Close Project
(`Cmd/Ctrl+Shift+W`), alongside the platform's own application, Edit, and
Window menus.

**The part that is easy to get wrong.** Installing an application menu
*replaces* the platform default, and with it Undo, Cut, Copy, Paste, and Select
All. A menu that adds four commands and silently removes copy and paste is a
bad trade, so the editing entries are re-declared — as platform **roles**, not
as commands of our own, because a hand-wired copy does not work inside a text
field while the role does. Both the unit test and the smoke assert every role
is present.

**Accelerators belong to the menu.** Once an item claims `Cmd+S`, the key never
reaches the page. The renderer's own key handler was therefore removed, and the
command arrives through a channel that carries the command string alone — never
an event object, which would hand the page a way back into IPC.

**Items are disabled when their command is impossible**, so the menu is rebuilt
whenever a project opens or closes. Close Project closes the window rather than
resetting state itself, which keeps it on the one path the red button and the
shortcut already take.

**Verification.** `pnpm run check` green: **438 tests**. The smoke runs eleven
checks and now drives saving and closing **through the menu items themselves**,
because a synthetic keystroke bypasses accelerators — which makes it the
honest test anyway: it is the path an author takes.

**Two findings.**

1. **Electron reports roles lower-cased**, whatever case the template used, so
   the check for `selectAll` failed on a role that was present. The comparison
   is now case-insensitive. Worth recording because the failure looked exactly
   like the defect it was watching for.
2. **The shared test double paid for itself immediately.** Adding the menu
   channel broke compilation in one place, with a message naming the missing
   method — the same change a day earlier would have broken two files with two
   confusing type errors.

---

## 2026-09-02 — the welcome window and the two-window model

**What exists.** The launcher of `SPEC.md` §8.5 and §8.6: recent projects with
their abbreviated paths, open, new, and the choreography between the two
windows.

- **One path per transition.** Every way of opening — the launcher's button, a
  recent entry, creating one — ends in the same function, which records the
  entry in the recent list and presents the workbench. No caller can forget
  either half.
- **Closing runs through the window's own close event**, so the red button, the
  shortcut, and a future menu command all reset the session and bring the
  launcher back through one path.
- **The quit guard.** A flag is set before any window begins closing, because
  quitting closes the project window and that close would otherwise re-open the
  launcher mid-shutdown — after which closing *that* would quit a second time.
- **One bundle, two windows.** Both load the same renderer and ask the main
  process which they are. The role does not come from a query string, which the
  page itself could change.
- **A missing project stays listed**, marked unavailable, and says so when
  clicked. Availability is checked when the list is shown rather than when it
  is stored, so removing an entry stays the author's decision.
- **The recent list lives in the user-data directory** — installation-local,
  never synchronized. A list that cannot be written is a lost convenience, not
  a reason to interrupt.

**Verification.** `pnpm run check` green: **430 tests** plus the desktop and
asset checks. The smoke now runs ten checks and follows the whole
choreography: it starts at the launcher, confirms an empty recent list, opens
the project, confirms the launcher gave way to the workbench, does everything
it did before, and finally closes the project to confirm the launcher returns
with that project listed and available. It runs against its own temporary
user-data directory, so a test never writes into the author's list.

**Three findings while building it.**

1. **Angular could not find its root element.** The launcher component had its
   own selector, and the document holds one. Both components now share
   `wi-root`, because only one is ever bootstrapped into it.
2. **`ready-to-show` fires before the renderer knows what it is.** It has to
   ask the main process and load a component first, so the smoke waits for the
   element rather than assuming it. That wait is now a helper, used at both
   window transitions.
3. **Every new bridge channel broke two test doubles at once.** Each test file
   carried its own complete fake. They now share one exhaustive base, so a
   forgotten channel fails to compile in one place instead of two — the
   shared-detail rule applies to test doubles as much as to panel headers
   (`CONVENTIONS.md` C-U7).

---

## 2026-09-02 — the remaining panes, and Material Symbols

**What exists.** Every pane of `SPEC.md` §8: the inspector, the outline, source
control, and both activity bars switching between them.

- **Inspector** — progress figures and the owned metadata fields. This is the
  only place they are edited, which is why the block beside the text is
  read-only. Editing a keyword marks the sheet dirty exactly as editing a
  paragraph does; the codec writes both back together.
- **Outline** — the headings with their levels, click to jump, and the
  H3-to-H6 toggle. The visibility rule is the core's pure function, not
  template logic.
- **Source control** — the established commit layout over the Git adapter,
  reached through five new bridge channels. Reads and writes have separate
  guards: one shared flag would let a background refresh swallow a click.
- **Activity bars** — a shared component. No entry toggles a region: that
  would name a position among names for contents. Activating the visible view
  collapses the sidebar, which is the region's rule.

**Material Symbols.** Six icons, packaged as unmodified Apache-2.0 SVGs with
their licence and a notice recording upstream, version, date, and which symbol
serves which entry. Drawn as CSS masks so one file works in light and dark, and
decorative throughout: every button carries its own accessible name.
`pnpm run check:assets` pins their bytes and rejects an SVG that could reach
out or execute — falsified before being trusted, with a changed byte and a
missing notice each failing it.

**Verification.** `pnpm run check` green: **421 tests** plus the desktop and
asset checks. The smoke now runs nine checks, ending with the panes: the
inspector shows the sheet's topic and its progress, editing a field marks the
sheet dirty, the outline lists the heading, activating the visible view
collapses the sidebar, and source control states plainly that the temporary
copy is not inside a repository.

**Two findings.**

1. **A failed write reported nothing.** After a Git action the panel re-reads,
   and a successful read cleared the failure the write had just set — in the
   same tick. The author would have seen a click do nothing. The write's
   outcome is now restored after the refresh, and the refresh still happens,
   because a failed push leaves a made commit behind and the panel must show
   that.
2. **A renderer error was invisible to the smoke.** It reported only "script
   failed to execute" and left the cause to guesswork; the actual fault was an
   escape sequence that became a real newline inside an injected script. The
   smoke now forwards renderer console errors, which turned a guessing game
   into one line of output.

---

## 2026-09-02 — documents, explorer, and sheet list: it can be written in

**What exists.** Opening a project, walking its tree, choosing a sheet, editing
it, and saving it — end to end, through the real bridge, to the real file.

- **The bridge** carries `openProject`, `reopenProject`, `closeProject`,
  `readSheet`, and `writeSheet`. Every privileged request validates its sender
  against the windows this process created and reports failures as results
  rather than as exceptions crossing the boundary.
- **`ProjectSession`** in the main process owns what the renderer must never
  hold: absolute paths and the authority to reach them. It mints one opaque
  handle per sheet at open time; a handle from a previous project, a forged
  one, or a path pretending to be one all fail a registry lookup.
- **The workspace store** holds the state and applies the core's rules. Its
  bridge is injected, so all of it is tested against a scripted double.
- **The explorer, the sheet list, and a shared panel header.** The header is
  the component `SPEC.md` §8.3 demands: fixed height, and the separator
  belongs to it, so no panel can misplace either.
- **Sheet-list previews** carry the actual formatting from the file, sized by
  the core's geometric formula, with the three density steps.

**Verification.** `pnpm run check` green: **397 tests** (core 250, project-node
58, desktop 36, workbench 25, git-node 19, contract 9). The smoke now runs
eight checks against a **copy** of a fixture project, ending with: type a
marker, press `Cmd+S`, and read the file from the filesystem — not through the
bridge — to confirm both the edit and the untouched front matter.

**The visual check caught the defect that mattered most.** The first working
version showed the front matter as raw text at the top of the editor:

```
---
opera-incerta:
  title: A Scene in Part One
---
The Second Bell
```

Every test was green. The store had handed the editor the whole file, and
nothing tested what the editor was *given* — only what it did with it. Two
things were wrong at once: `SPEC.md` §10.4 puts front matter in its own area,
deliberately outside the writing surface; and an author editing that text could
have broken their own metadata, or a foreign tool's, in a product whose central
promise is that this cannot happen.

The editor now receives the **body alone**, and the codec reassembles the file
on save. The protection is structural rather than careful: what is never shown
cannot be edited, and what the codec writes cannot lose a foreign key. A sheet
whose front matter carries a diagnostic is marked read-only in the header and
is not written back at all.

**Lesson.** Tests check what a unit does with its input. They do not ask
whether it should have received that input. The store's tests passed because
they asserted the round trip of exactly the string the store chose to pass on —
the mistake was one layer above every assertion. Looking at the running
application is not a formality at the end of a round; here it was the only
thing standing between a green suite and a product that could corrupt a
manuscript.

---

## 2026-09-02 — cutting a heading takes its prefix

**What changed.** A cut whose selection starts at the visible beginning of a
heading now removes the hidden prefix along with the text, leaving an ordinary
empty line.

**Why it was wrong before.** The clipboard half of the gesture already carried
Markdown, so the two halves of one action disagreed: the text arrived elsewhere
as a heading while an empty `## ` stayed behind — invisible, since the prefix
is hidden, so the author saw a blank line that was secretly still a heading.

**Deleting stays different, on purpose.** Clearing a heading's text with Delete
or Backspace leaves the level alone. Cut means "this moves elsewhere", so the
formatting travels with it; delete means "this text goes", and an author
clearing a title to retype it wants the heading to survive. Backspace at the
visible start remains the deliberate way to remove a level. The rule is now
written down rather than left to whichever behavior happened to fall out.

**Verification.** `pnpm run check` green at **354 tests**, `spike:editor` 7/7,
and the smoke types a fresh `.h2 Cut me`, selects the visible line, cuts, and
requires both halves: `## Cut me` on the system clipboard and an empty
non-heading line behind.

**Falsified before trusted.** With the filter commented out, the smoke failed
with `cut left something behind: {"text":"","heading":true}` — exactly the
invisible empty heading described above — and passed again once restored.

---

## 2026-09-02 — the cursor rules around hidden heading syntax

**Decision, then implementation.** The open question was whether the hidden
`# ` prefix should become an atomic range or whether Backspace should remove
the level. The two are not alternatives: atomicity is the foundation — without
it the caret reaches invisible text through arrow keys, `Home`, a click, or a
selection, and Backspace is only the loudest symptom — and the deletion
semantics are the separate question that atomicity then makes answerable.

**What was built.**

- Heading syntax is an atomic range: the caret cannot enter it by any route.
- `Home` and `Cmd/Ctrl+Left` go to the first visible character; the shift
  variants select to it.
- Backspace at the visible start removes the heading level and keeps the text;
  a second press merges with the line above, as in a word processor. It runs
  the same operation as the gutter menu, so both gestures undo as one thing.
- Copying a heading yields Markdown: the selection cannot start inside the
  prefix, so the prefix is put back on the way to the clipboard.

**Verification.** `pnpm run check` green: **354 tests**. `pnpm run
spike:editor` 7/7. The smoke drives all of it through real key events and the
real system clipboard: line-start shortcut, select to end, copy, and the
clipboard must read `##### Typed heading`; then Backspace removes the level and
a second Backspace merges.

**The smoke found a defect nobody would have reported.** The clipboard held
`#####  Typed heading` — two spaces. Tracing it back: the dot command fired on
`.h3` at the end of the line, one keystroke before the author typed the
separating space, and that space then landed inside the heading prefix. Every
heading created by typing carried a doubled space into the file. It renders
identically, so no reader would ever notice; the file would simply have
contained Markdown the author never wrote.

The fix is that the separator is now **required**: the command must be complete
before it fires. That also makes it easier to predict — `.h3` sits there
visibly until the space triggers it.

**Deliberately left alone.** Return in the middle of a heading still leaves the
second half an ordinary paragraph, because the prefix stays on the first line.
That is what the file says, and special handling would mean the editor inventing
Markdown. Cut at the visible start is genuinely unfinished and recorded as
`TODO.md` §1.4: copying puts the prefix back, but cut removes only the
selection and leaves an empty `##### ` behind.

---

## 2026-09-02 — dot commands and the gutter menu

**What exists.** Both ways of setting a heading level from `SPEC.md` §10.2:
typing `.h1`…`.h6` at the start of a line, and clicking the level label in the
gutter to pick from a menu.

**The dot command is a transaction filter, not a listener.** The conversion
joins the same edit step as the keystroke, so one undo takes the whole thing
back and no intermediate state is ever rendered. Its rules are a pure function
in the core: recognized against the *visible* text, so typing `.h2` in front of
an existing heading changes its level; the separating space consumed with the
command; `.h1x` left as ordinary text; and — the rule that matters most — it
applies to typing only. A file containing a line that starts with `.h1` opens
unchanged, because opening a document must never rewrite it.

**The menu is a view, not an adapter concern.** The adapter reports *what* was
activated and *where* on screen as plain numbers; the view decides what to show
there. One menu will therefore serve any adapter, and the adapter needs no DOM
vocabulary beyond the two coordinates.

**Verification.** `pnpm run check` green: **349 tests** (core 235).
`pnpm run spike:editor` 7/7. The smoke now drives both gestures with **real
input events** — key events for the dot command, mouse events for the marker
and the menu entry — because what was in doubt is exactly the path from a
keystroke or a click to the document. It types `.h3 Typed heading`, checks the
line became an H3 with the command text gone, clicks the marker, checks the
menu shows seven entries with `✓ Heading 3` marked, clicks `Heading 5`, and
checks the line changed and the menu closed. Visually confirmed in
`build/desktop/smoke.png`.

**The same mistake, a third time.** The transaction filter parsed the line it
was editing in isolation, so a `.h3` typed inside a fenced code block became a
heading. The gutter had made this exact mistake two days' work earlier, and
`applyDotCommand` even guards on a `verbatim` flag — but the caller computed
that flag from one line, where it is always false. Whether a line is verbatim
is a question about the document.

The fix is structural rather than another guard: `DisplayModel` now carries
`verbatimLines`, so there is one answer that every consumer reads instead of
each deriving its own. The core test names the reason in place, and the smoke
holds the end-to-end evidence.

---

## 2026-09-01 — the editor adapter, and an editor that renders

**What exists.** An `EditorAdapter` boundary in the portable core, a CodeMirror
implementation of it in `apps/workbench`, an Angular component hosting it, and
the editor visible in the workbench's editor region.

**The boundary carries no DOM type.** The component is chosen when the adapter
is constructed; from then on the application speaks about text, lines, and
heading levels. That is what let one contract suite — written without a test
framework — run in both worlds: under Vitest against an in-memory double, and
inside the real renderer against CodeMirror as criterion 7 of the spike. Both
pass all eleven cases (`CONVENTIONS.md` C-T11). The suite is itself falsified
by a test: a deliberately broken adapter must fail it, and does.

**New in the core.** `inline.ts` — pure inline markup detection for the
asterisk forms, strikethrough, and code spans, with escapes honored, code spans
shadowing emphasis, and underscores deliberately left alone because that
decision is still open (`SPEC.md` §10.3). `display-model.ts` — what the editor
shows: which lines are headings and which character ranges are hidden, in
document offsets. `DisplayLine` gained `verbatim`, so a fenced code block is
recognized as one.

**Verification.** `pnpm run check` green: **332 tests** across 6 projects (core
218). `pnpm run spike:editor` green at 7/7. `pnpm run desktop:smoke` green and
now measuring the editor itself: 19 laid-out lines, a heading at 51.2 px over
body text at 25.6 px, exactly 3 gutter markers, no visible `#` prefix, and the
fenced line shown verbatim. Visually inspected in `build/desktop/smoke.png`.

**Two defects, both found by evidence rather than by reading.**

1. **The smoke found a specification violation on its first run.** The heading
   line still showed its `# ` prefix. The display model computed heading
   *classes* and inline *delimiters*, and nobody had told it to hide the
   heading syntax itself — which `SPEC.md` §10.2 requires, and requires
   unconditionally: heading level is a static paragraph attribute, so unlike an
   inline delimiter there is no syntax for the author to edit in place. Hidden
   ranges now carry a `kind`, and the two rules are visibly different.
2. **The visual check found a `#` inside a fenced code block labelled H1 in the
   gutter.** The gutter asked line by line, and whether a `#` is a heading
   cannot be answered by one line — it needs the whole document. Gutter and
   decorations now read one shared display model held in editor state. The
   smoke asserts the marker count so the defect cannot return quietly.

**Lesson.** Both defects were in the wiring between two correct pieces. The
core knew about fences and the adapter knew about gutters; what was missing was
that the gutter asked the wrong question. Component tests would not have caught
either one — the first needed a rendered heading, the second needed a document
with a fence in it. This is what the smoke and the visual inspection are for,
and both earned their place today.

---

## 2026-09-01 — CodeMirror 6 accepted after the editor spike

**Question.** Can CodeMirror 6 carry the display model of `SPEC.md` §10 —
paragraph-level headings at different sizes, a gutter aligned to measured line
heights, and inline markers hidden except on the cursor's line? It was the
largest open technical decision, and every workbench view waited behind it.

**Method.** `spikes/editor-codemirror`, run in a real Chromium renderer through
Electron rather than a DOM stub. A stub reports zero for every height, which
would have turned three of the six criteria into tests that pass while proving
nothing. The six thresholds were written into `TESTING.md` §2.8 **before** the
spike ran (`CONVENTIONS.md` C-T14) and were not touched afterwards.

**Result: 6/6.**

| # | Criterion | Measurement |
| --- | --- | --- |
| 1 | Variable heading sizes | H1 45 px, H2 36 px, body 22.5 px; line blocks plus the 8 px content padding equal the content height exactly |
| 2 | Gutter alignment | Marker top matches its line to 0 px; a heading wrapped over 8 visual rows carries exactly one marker, at the first row |
| 3 | Inline markers | Unfocused line renders without `**`, focused line with them, switching in both directions; document text untouched |
| 4 | Undo per document | One undo reverted only the document it belonged to |
| 5 | Paste | A real `ClipboardEvent` with CRLF, a tab, and Markdown arrived intact and round-tripped |
| 6 | Typing latency | 112,020 characters, 200 keystrokes: median 5.8 ms, p95 6.6 ms against 16 ms |

**Decision.** CodeMirror 6 is accepted as the editing surface (`SPEC.md` §5.4)
behind an Opera-Incerta-owned `EditorAdapter` interface, with the full
dependency report in `DEPENDENCIES.md`. Monaco was ruled out on the criterion
that mattered most: it assumes a uniform
line height, and this product shows H1 at twice the body size in the same
document.

**Deliberately not done.** The component was not wired into `apps/workbench`.
A spike answers a question; turning it into production architecture in the same
step is the widening `AGENTS.md` forbids. The integration is `TODO.md` §1.4,
and the spike stays as evidence until that round carries its own tests.

**Lessons.**

1. **Three of the six criteria first passed or failed for the wrong reason.**
   Heights read before the first real frame are CodeMirror's *estimates*, all
   identical — the very "computed, not measured" mistake the gate exists to
   catch (`CONVENTIONS.md` C-U5), and it appeared inside the test for that
   rule. An unexplained 4 px marker offset was the content padding. And
   criterion 2 passed while proving nothing, because its wrapped line carried
   no marker at all; rewritten to wrap a heading, it then failed on a third
   measurement error — `getClientRects()` reports one rectangle for a block
   element however often its text wraps, so visual rows must be counted over a
   range of the text.
2. **The fix was always the measurement, never the threshold.** Each correction
   made the test stricter: the height difference must now be *explained* by the
   measured padding rather than tolerated, and the wrapped line must carry
   exactly one marker rather than none.
3. **The spike proved the portability invariant as a side effect.** Its browser
   bundle imports `@opera-incerta/core` for the heading transform, so the
   portable core ran unchanged inside a Chromium bundle — `SPEC.md` §5.2
   exercised rather than asserted.

---

## 2026-09-01 — licensed under Apache-2.0

**Decision.** Opera Incerta is licensed under the Apache License 2.0.

**What changed.** `LICENSE` at the repository root, and a `license` field in
all seven manifests. `SPEC.md` §1.1 and §5.1 record it, `SPEC.md` §19 no longer
lists it as open, and `README.md` and `DEPENDENCIES.md` point at the file.

**What it does not do.** The repository license does not relicense any
dependency: every package keeps its own license and notice obligations, and
those notices ship with the application (`CONVENTIONS.md` C-L5). That was
already the rule; it is now stated where a reader of `DEPENDENCIES.md` meets it
first.

**Verification.** `pnpm run check` green, unchanged at **293 tests**, plus the
desktop production check — the manifests are read by that check, so a malformed
edit would have failed it.

---

## 2026-09-01 — everything specified that needed no decision

**Scope.** Build out every open item whose behavior was already specified and
whose implementation required no pending decision. What remained afterwards is
listed in `TODO.md`, and each remaining item names the decision or the user
interface it waits on.

### Portable rules (`packages/core`)

| Module | Rule |
| --- | --- |
| `heading.ts` | Markdown ↔ display transform for H1–H6, outline extraction, the deeper-levels filter |
| `statistics.ts` | Characters, words, reading time — body only |
| `structure.ts` | `structure.json` semantics: order, stale entries, unlisted items, display names, moves |
| `recent-projects.ts` | Deduplication, ordering, the cap of ten |
| `preview.ts` | The three density steps and the geometric preview font formula |
| `block-height.ts` | Proportional capping of a measured height; dragging enlarges only |
| `git-status.ts` | `--porcelain=v1 -z` parsing, grouping, select-all state, the `.git` event filter |
| `refresh.ts` | Coalescing refreshes and a separate write guard |

### Adapters and shell

- `packages/project-node` — the Node implementation: folder inspection,
  project records, `structure.json`, atomic sheet writes, canonical path
  comparison, containment, and the recursive library scan that applies order,
  display names, and front matter titles.
- `packages/git-node` — the process adapter over the system `git`: root
  resolution, status, batch staging and unstaging, commit, push.
- `apps/desktop` — the renderer is served from the owned `opera-incerta://app/`
  scheme with path containment, replacing `loadFile`.
- `scripts/check-desktop-production.mjs` — a gate over the **built** artifacts:
  pinned dependencies, sandboxed window options, absence of `loadFile`, a
  preload limited to one global and to declared channels, and the renderer's
  content-security policy.
- `examples/` — four original fixture projects from the `TESTING.md` §3
  catalog, read by an integration test rather than left as sample content.

**Verification.** `pnpm run check` green: **293 tests** across 6 projects (core
179, project-node 58, desktop 22, git-node 19, desktop-contract 9, workbench 6),
plus the desktop production check. `pnpm run desktop:smoke` green: the shell
launches over the new protocol, the renderer renders, the bridge answers.

The production check was **falsified before being trusted**: with `sandbox:
true` flipped in the built bundle it failed with two findings, with `loadFile`
reintroduced it failed with one, and it passed again once restored. A check
that can only pass proves nothing.

**Specification updated in the same change** (`AGENTS.md`, change workflow):
the owned renderer scheme and its refusal-not-correction rule (§5.3), the
pinned collation for unordered items (§6.4), heading prefix preservation
(§10.2), atomic sheet writes (§10.6), the reading-speed constant (§11), and
unstaging before the first commit (§12).

**Lessons.**

1. **The URL class disarms a traversal, and that is not the same as refusing
   it.** `opera-incerta://app/../secret.txt` arrives at the handler as
   `/secret.txt`: contained, but a different file than the one requested. The
   attempt is now rejected against the raw request, before parsing, with
   containment kept as a second line of defense.
2. **A repository without a first commit has no `HEAD`.** `git restore
   --staged` fails there with exit 128 — and that is exactly the state of a
   freshly created project the moment its author stages the first chapter. The
   integration test against a real repository found it; the unit tests against
   a recorded runner never would have.
3. **Three tests were wrong before the code was.** An off-by-one line number, a
   miscounted line total, and a preview count that assumed more content than
   the fixture had. Writing the assertion from the specification rather than
   from the implementation is what surfaces them.
4. **A fixture found a specified behavior the test had not expected.** The
   Obsidian note keeps its owned block *after* the foreign keys, so the first
   save moves it to the front — specified in §6.3, and idempotent from then on.
   The test now asserts the reordering instead of demanding byte-identity, and
   the specified behavior gained its first real evidence.

---

## 2026-09-01 — front matter codec implemented

**What exists.** `packages/core/src/front-matter.ts`: `parseSheet` and
`serializeSheet`, the reader and writer for the head of every `.md` file
(`SPEC.md` §6.2, §6.3). 43 new tests against 534 lines of implementation.

**Shape of the solution.** Owned fields are parsed into a typed
`SheetMetadata`; everything foreign is held as unmodified raw lines; unknown
children of `opera-incerta:` are held the same way, so an older build cannot
delete a field a newer one wrote. A malformed namespace — duplicated, or
carrying a scalar or a sequence — yields a stable diagnostic and marks the
sheet **not writable**, and in that state every line stays classified as
foreign, so even a mistaken write could not claim anything as ours.

**No YAML parser, and the namespace is why.** Foreign YAML must be *preserved*,
not *understood* — raw lines suffice. Owned YAML follows a schema this project
defines, so it needs only a reader for that schema. The namespace decision made
the codec smaller, not larger: without it, the reader would have had to judge
per key whether a top-level `status` was ours, which is exactly the judgement
no code can make correctly.

**Verification.** `pnpm run check` green: **98 tests** across 6 projects, 71 of
them in the core. The suite covers every item of `TESTING.md` §2.2 —
round-trip losslessness across nested mappings, sequences, folded blocks,
comments and unkeyed lines; idempotence; namespace ownership including a
top-level foreign `title`, `status`, `topic`, `keywords`, `category`, and
`notes`; indentation ownership including a nested `opera-incerta:`; all three
malformed cases; the absent-block case; LF and CRLF; unknown owned fields; and
fifteen scalar-quoting cases from `2024` through emoji to the empty string.

**Not yet proven:** that the output is standard-conformant to an *independent*
parser. The tests prove that our reader accepts what our writer produces. The
cross-check needs the Markdown/YAML dependency that is not accepted yet, and it
is recorded as `TODO.md` §1.1 rather than quietly assumed.

**Lessons.**

1. **Quoting exists for other readers, not for ours.** Our reader treats every
   scalar as a string and would never misread a title of `2024`. Another tool,
   and a human, would read a number. The writer therefore quotes anything that
   could be taken for a number, a boolean, null, or a YAML indicator — a rule
   whose entire purpose lies outside this codebase.
2. **Two tests failed and both times the test was wrong** — an off-by-one line
   number and a miscounted line total. The second also exposed the weaker test:
   `toHaveLength(6)` says nothing about *which* lines survived. Asserting the
   actual lines is what the rule is about.
3. **Blank lines needed an owner.** A blank line between the owned block and a
   foreign key would be swallowed if it counted as ours, because the owned
   block is regenerated on write. It is assigned to the foreign side, so the
   round trip stays byte-exact.
4. **A `replace` without an assertion fails silently.** An earlier edit in this
   session left a TODO item pointing at a decision that no longer existed,
   because the pattern had not matched and nothing said so. Every scripted edit
   now asserts that its pattern was found exactly once.

---

## 2026-09-01 — front matter namespace accepted

**Decision.** Every field the application owns is nested under one top-level
key, `opera-incerta:`. Every other top-level key is foreign, regardless of its
name (`SPEC.md` §6.2, now Accepted).

**Why it matters more than it looks.** The round-trip rule of §6.3 protects
against *losing* foreign data. It cannot protect against *reinterpreting* it: a
Jekyll file's `status: published` would have been adopted as the sheet's
workflow state and then written back with a different meaning. Nothing is lost
in that scenario, so no round-trip test would have failed — which is precisely
why it needed a structural answer rather than a careful one.

**Consequences recorded.** A foreign top-level `title` is not the sheet title,
so an imported file shows its file name until its metadata is adopted
deliberately by the import module. A duplicated or non-mapping
`opera-incerta:` key marks the file read-only with a stable diagnostic instead
of the application guessing which occurrence it owns. A file without the block
is normal, and the block is created on the first save that needs it.

**Cost.** None. There are no existing files, no migration path to write, and no
released format. Deciding it after the first written manuscript would have cost
a migration for every file — the same window that closed for the identifier
alignment below.

**Verification.** Documentation only: `SPEC.md` §6.2/§6.3, the evidence list in
`TESTING.md` §2.2, and `TODO.md`. No code was written — the codec itself is the
next step and is now unblocked.

---

## 2026-09-01 — technical identifiers aligned to `opera-incerta`

**Decision.** By explicit instruction, the technical name was changed from
`writers-ide` to `opera-incerta`, so both names now share one word.

**What changed.** 22 files: package namespace `@writers-ide/*` →
`@opera-incerta/*`, project marker `.writers-ide/` → `.opera-incerta/`, bridge
global `writersIde` → `operaIncerta`, channel prefix `writers-ide:` →
`opera-incerta:`, document-handle kind, workspace and Angular project names, and
the smoke environment variable. Stale `dist/` and `build/` output was removed
before relinking, because the package names those artifacts were built under no
longer exist.

**Why it was allowed now, and why it is the last time.** The naming rule
(`CONVENTIONS.md` C-N1) exists to stop a product rename from reaching
identifiers that live in user files. Nothing had shipped: no release artifact,
no user project, no stored preference, no committed history. That is the only
condition under which aligning the two names is free, and it no longer holds
after the first written project. `SPEC.md` §1.1 records the decision and its
superseded predecessor.

**The checkout directory too.** `writers-ide/` was renamed to
`opera-incerta/`. It is the one name that is *not* part of the contract
(`SPEC.md` §5.2) — nothing in the repository refers to it — but leaving it
would have made every path in a report contradict the project it names. pnpm's
workspace symlinks are relative and survived the move untouched; the session's
working directory had to be moved explicitly, which is the only manual step.

**Verification.** `pnpm install` relinked all four workspace packages under the
new namespace; `pnpm run check` green (**55 tests**, unchanged count);
`pnpm run desktop:smoke` green under `OPERA_INCERTA_SMOKE`. Both were re-run
from the renamed directory: check green, smoke green, evidence written to
`build/desktop/smoke.png` under the new path.

**Lesson.** A repository-wide string replacement rewrote history: the previous
`DONE.md` entry recorded `writers-ide` as a deliberate decision, and the
replacement silently turned it into `opera-incerta`, making the entry claim the
opposite of what happened. Historical reasoning in `DONE.md` is a record, not
live text (`CONVENTIONS.md` C-D3) — a mechanical rename MUST skip it, and this
one had to be repaired by hand.

---

## 2026-09-01 — product named "Opera Incerta"

> **Superseded in part, same day.** The technical name was subsequently aligned
> to `opera-incerta` as well; see the entry above. The names below are the ones
> that were current when this decision was made, and are preserved as written.

**Decision.** The visible product name is **Opera Incerta** (`SPEC.md` §1.1,
accepted). Chrome, window titles, headings, and documentation titles use it.

**What deliberately did not change.** The technical name `writers-ide` stays:
package namespace `@writers-ide/*`, project marker `.writers-ide/`, bridge
global `writersIde`, channel prefix `writers-ide:`, and the smoke environment
variable. That separation is exactly why the rename touched 18 files and no
identifier a user's files could ever contain (`CONVENTIONS.md` C-N1).

**Verification.** `pnpm run check` green (55 tests, unchanged count);
`pnpm run desktop:smoke` green — the smoke check asserts the rendered heading,
so it would have failed had the renderer and the shell disagreed about the
name.

**Still open:** trademark clearance before public distribution, and the
application icon (`SPEC.md` §1.1, §19).

---

## 2026-09-01 — pnpm workspace scaffold

**What exists now.** A pnpm workspace with six projects, a green check gate, and
a desktop shell that launches, renders, and answers over its bridge.

```text
packages/core              portable rules: slug, layout clamp, category color
packages/desktop-contract  versioned bridge: channels, handles, runtime guards
packages/project-node      project/library ports (interfaces only so far)
packages/git-node          source-control ports (interfaces only so far)
apps/workbench             Angular renderer: the region skeleton
apps/desktop               Electron shell: window, preload bridge, smoke check
```

**Why these first.** The scaffold had to prove the boundaries that `SPEC.md`
§5.2 and §5.3 declare, not just describe them. The portable packages compile
with `"types": []`, so a host API cannot slip into them unnoticed. The renderer
consumes `@opera-incerta/core` and `@opera-incerta/desktop-contract`, which proves
the workspace wiring end to end. The shell is sandboxed with context isolation
from the first commit, because retrofitting a security boundary is how it ends
up incomplete.

**Content, not filler.** The three rules in `packages/core` (slug generation
with collision suffix, column-width clamping, computed category text color) and
the contract guards are all fully specified in `SPEC.md`, so they could be
implemented and tested rather than stubbed. Ports for the two Node adapters are
declared as interfaces only: public module interfaces come before their
implementation (`CONVENTIONS.md` C-A16), and inventing a filesystem
implementation ahead of its specification round would have been the widening
`AGENTS.md` forbids.

**Verification.**

- `pnpm run check` — build, test type-check, and tests across 6 projects:
  **55 tests passed** (core 28, desktop-contract 9, project-node 3, git-node 2,
  workbench 6, desktop 7).
- `pnpm run desktop:smoke` — the Electron shell launches, the renderer renders
  (`wi-root h1` reads "Opera Incerta"), the preload bridge answers
  `contractVersion()` with 1, and a screenshot is written to
  `build/desktop/smoke.png`.
- Visual inspection of that screenshot: the six regions of `SPEC.md` §8.2 appear
  in order with the specified widths — activity bar, navigator, sheet list, a
  dominant editor, secondary sidebar, activity bar.
- Not run: `desktop:package` and `desktop:make`. They are therefore not listed
  as approved commands anywhere (`CONVENTIONS.md` C-T19).

**Lessons — each one cost a failed run.**

1. **`TextEncoder` is a host global, not a language feature.** The contract
   package computes a UTF-8 byte length for its size limit and used
   `new TextEncoder()`. With `"types": []` and `lib: ES2023` the build failed —
   exactly as intended. The fix is a pure byte counter, not a wider `lib`. The
   invariant caught its first violation on the day it was written.
2. **`import.meta.url` is empty in a CommonJS bundle.** Electron loads the main
   process as CJS, and esbuild warned that `import.meta` would be empty; the
   preload and renderer paths would have been silently wrong. `__dirname` is
   correct in that output format.
3. **The Angular application builder writes to a `browser/` subdirectory.** The
   first smoke run failed with `ERR_FILE_NOT_FOUND` on
   `build/workbench/index.html`. The path is
   `build/workbench/browser/index.html`.
4. **A test and its implementation disagreed about `Infinity`.** The clamp
   returned the minimum for any non-finite value; the test expected the maximum
   for `+Infinity`. The test was right: an infinity is an out-of-range value and
   clamps to the bound it exceeds, while only `NaN` is orderless and falls back
   to the minimum. The rule is now stated in the function's own documentation.
5. **`@electron/rebuild` resolves `@electron/node-gyp` from Git,** which the
   workspace policy rejects. The published Electron fork
   (`10.2.0-electron.2`) is pinned as an override in `pnpm-workspace.yaml`.
6. **Electron's postinstall did not run under `allowBuilds`.** The 306 MB
   runtime was missing until `install.js` was executed directly in the store
   directory, where it completed instantly from the local Electron cache. A
   clean checkout currently needs that extra step — open item in `TODO.md` §1.7.

**Deliberately not done.** No `git init`, no commit: initializing a repository
was not requested (`CONVENTIONS.md` C-G3). Package names in this entry predate
the identifier alignment recorded above. No package carries a `license` field,
because the project license is still open.
