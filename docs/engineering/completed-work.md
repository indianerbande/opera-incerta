# Opera Incerta — completed work

Newest entry first. Each entry records what was built, why it was built that
way, how it was verified, and what was learned (`AGENTS.md`, "Working
documents").

---

## 2026-09-14 — continuous integration fetches the tags

**What this was.** Both jobs of `check.yml` check out with `fetch-depth: 0`.
The build identity of the previous round is what `git describe` says, and
`actions/checkout` clones one commit without tags by default. `git describe`
needs the tag and the commits between it and the build to count the distance,
so fetching the tags alone would not have been enough.

**Evidence.** Locally, a clone with `--depth 1 --no-tags` describes the same
commit as `38c78a8`, a full clone as `v0.1.0-beta.1-7-g38c78a8`. On the pull
request, the CI log of the desktop job shows the build line with the tag, and
the launcher check compares it with `git describe` on the runner.

---

## 2026-09-14 — the application names the build it is

**What this was.** The beta number was not going to be raised on every push
(decided the same day: it would mean a release round per push and say little),
so a report needed another way to say which build it is about. The launcher's
foot and the settings dialog's footer now show `Build` and what
`git describe --tags --always --dirty` said in the checkout that was built.
The macOS About panel shows the workspace version with the revision as its
build number; it used to show `0.0.0`, the version of the unpublished desktop
package. The bug report template and both security policies ask for that line.

**How.** `apps/desktop/tools/write-build-identity.mjs` runs at the end of the
desktop build and writes `dist/build-identity.json` beside the bundle. The
main process reads it once, validates it with the contract's new
`isBuildIdentity`, and answers the new `buildIdentity` channel; a missing or
malformed record becomes an unknown build rather than a failed start. The
renderer's `wi-build-identity` asks the bridge, checks the answer, and shows
one selectable line that never wraps. Adding a channel is not a breaking
change, so the contract version stays 3.

**Decided without asking.** Where it shows: the launcher, because it is there
without a project, and the settings dialog, because an author looks there. The
first placement, under the settings categories, wrapped the revision inside
`-6-` at 150 pixels; a revision broken across two lines is copied wrongly, so
it moved into the footer and is `nowrap`. The script asks Git only when this
repository is the checkout root: in a copy placed inside another repository it
had taken that repository's tag.

**Falsified.** Three desktop checks each red for their own reason — a revision
the build altered, a line that cannot be selected, a settings dialog without
the line while the launcher kept it — and the guard, the fallback, and the
wording each broken once under their unit tests. The script was run inside
another repository, as its own checkout, and without `git` on the path.

**Evidence.** `pnpm run check` green, **1118 tests**; `desktop:smoke` green,
**47 checks**. Both screenshots looked at, in English and in German.

---

## 2026-09-14 — references to documents by their old names

**What this was.** Comments and engineering documents still named working
documents as they were called before they moved under `docs/`: `SPEC.md` in
the Forge configuration and six times in the workbench stylesheet,
`CONVENTIONS.md` in the Forge configuration, and `PLATFORMS.md` in four
places. None of them is a link, so the documentation check could not see them.

**What changed.** Each now names the current file. Two statements said the
platform matrix would be created with the first packaging round; it exists as
`docs/en/platforms.md`, so `conventions.md` C-P5 and the roadmap's packaging
item now say that the round records the first evidence in it. The repository
layout in `specification.md` §5.2 still showed every document at the root and
lacked three packages, `scripts/` and `spikes/`; it now shows the layout as it
is. This entry and the ones below keep the old names, because they record what
the files were called at the time.

**Evidence.** A search for the six old names outside this file finds nothing;
`pnpm run check` green, **1106 tests**.

---

## 2026-09-14 — the repository went public, and its alerts were answered

**What this was.** The repository became public. Private vulnerability
reporting, which `SECURITY.md` and the issue template link to, was off until
then because GitHub offers it only on public repositories. It is on now,
together with dependency alerts, secret scanning, and push protection. Secret
scanning found nothing.

**The dependency alerts found sixteen advisories**, all in packages that only
the packaging tools pull in. The production audit was and is clean.

- **tmp** is fixed. An override moves `external-editor` to tmp 0.2.7. The first
  choice, 0.2.6, turned out to carry an advisory of its own, which `pnpm audit`
  showed after the install; that is why the evidence is the audit and not the
  version number. The installed `external-editor` was then run against the new
  tmp with a no-op editor, and wrote, read back, and removed its file.
- **tar and extract-zip** are accepted and the alerts dismissed as a tolerable
  risk. Forge 7.11.2 is the current release and requires both. tar's fixed
  releases are a major version `@electron/rebuild` was not written for;
  extract-zip has no fixed release. `dependencies.md` records when each one
  runs: `@electron/rebuild` has no native module to compile in this
  application, and the packager opens only the Electron archive that
  `@electron/get` has checked against Electron's SHA-256 sums, which the Forge
  configuration does not switch off. The first is a reading of the code, not a
  measurement, and says so. The roadmap's packaging round now has to confirm
  both.

**Also.** A comment in `pnpm-workspace.yaml` still carried the project's
earlier working name, and was corrected.

**Evidence.** `pnpm audit` reports only the two accepted packages;
`security:audit-production` reports nothing; `pnpm run check` green,
**1106 tests**.

---

## 2026-09-14 — a moved entry was checked before its record was written

**What this was.** The desktop check failed once in continuous integration,
on the Angular 22.1.6 update, with "the record still holds the sheet in its
old group". The same commit was green locally, and the update had nothing to
do with it.

**The cause is in the check, not in the application.** `placeEntry` moves the
file first and writes `structure.json` after, as every operation does. The
check waited for the file to arrive and then read the record at once. The
wait for the editor that sat between them did not help: the sheet was open
before the drag, so that wait was already satisfied. On a slower runner the
check read the record between the two writes. The group move further down had
the same gap.

**The fix.** Both moves now also wait for the last thing the operation writes:
the destination group's order naming the entry. The assertions after it are
unchanged, so an application that forgot to update the old group would still
fail them.

**Falsified** with a 1.5-second pause inserted between the file move and the
record write. The old check failed with the message seen in continuous
integration. The corrected check passed all 45 checks with the pause in place.
With only the second wait removed, it failed on the group move with "the moved
group lost its display name". The pause was then removed.

**Evidence.** `pnpm run check` green, **1106 tests**; `desktop:smoke` green,
45 checks.

---

## 2026-09-12 — the record has to answer for itself now

**What this was.** The two holes the previous round exposed, closed.

**The editor contract runs in continuous integration.** `spike:editor` now
runs beside the desktop check under a virtual display. It is the only thing
that can speak for the editor after a CodeMirror update, and the rule asking
for it lived in `CONTRIBUTING.md`, where an automated pull request cannot read
it. Its sixth criterion is a 16 ms latency threshold on a shared runner; the
comment beside the step says that if it ever fails there while passing on a
developer's machine, the answer is to change the threshold and say so, not to
delete the criterion.

**The parser spike is not, and the previous entry overstated that.**
`spike:parser` returns zero only if some candidate passes **every** criterion,
and none does — that was the finding of the comparison, not a defect. Its exit
code is a verdict, not a pass or a fail, and it downloads the CommonMark
examples once before it can run at all. It is a measuring instrument. Putting
it in a gate would have meant either a permanently red job or quietly
weakening what it measures. `testing.md` now says which of the two spikes is a
gate and why the other cannot be.

**`check:dependencies` compares the record with reality.** A version standing
beside a package name in `dependencies.md` must be that package's installed
version — in a heading or in a sentence, backticked or bare; a heading naming
one version and several packages gives it to each. Every override in
`pnpm-workspace.yaml` must appear in the document, key and value on one line.
And the runtime the document attributes to Electron is checked by **running
the installed binary** with `ELECTRON_RUN_AS_NODE=1`, because that figure
exists in no manifest and is exactly the one that had drifted.

Prose names are resolved through an alias list holding a single entry, so that
`commonmark.js` can mean `commonmark`. The list is short on purpose: every
entry is a place where the match had to be loosened, and a long one would mean
the check is guessing rather than comparing.

**Falsified six ways**, each red for its own reason: a heading naming the
wrong version; a stale version in a body list; a single version covering
several packages, which named all three; an override recorded wrongly; the
runtime claim wrong — reporting the very drift found the day before; and the
runtime sentence deleted, which fails rather than passing silently, because a
check that a missing claim satisfies is not a check.

**What the check cannot do, stated in `testing.md` rather than left to be
discovered.** It proves that what the document says is true. It cannot prove
the document says everything worth saying. A version never mentioned is never
caught, and no check makes a record complete — only a person does.

**Evidence.** `pnpm run check` green, **1106 tests**; `desktop:smoke` 45
checks; `spike:editor` 7/7 locally and 7/7 on the runner, twice.

**And the reason one measurement is not a baseline.** The first CI run
reported a p95 of 9.9 ms against the 16 ms threshold, which was written down
as comfortable. The second run, on the same commit, reported **13 ms**. The
variance between two runs of identical code is larger than the gap between the
runner and a developer's machine (6.7 ms p95), so the criterion sits closer to
its threshold in CI than any local run suggests. Both figures are in the
spike's README, with the reassurance removed: if it ever fails on a runner
while passing locally, the threshold is raised for the runner and the reason
recorded — not the criterion deleted, and not the job re-run until it is
green. What the threshold protects is the author's typing, and the author does
not type on a shared runner.

---

## 2026-09-12 — the first grouped updates, and the record they would have aged

**What this was.** Five automated pull requests merged: `pnpm/action-setup`
6.1.0, `marked` 18.0.12, the Angular group (framework 22.1.5, build tooling
22.1.7), Electron 44.3.0, and the CodeMirror group (`state` 6.7.4, `view`
6.43.11, `commands` 6.11.0). The four single Angular pull requests that
existed before the guard were gone: the bot closed them itself and re-proposed
them as one group, which is what the grouping was for.

**The guard did its job, and it is only half the guard.** `pnpm run check`
passed on every one of them, which is the interesting part: the shapes the bot
now proposes are shapes our own `check:dependencies` accepts. But two things
it cannot see turned up in a single afternoon.

*No workflow runs `spike:editor` or `spike:parser`.* The CodeMirror update
moves `@codemirror/view` five minor releases in the component the author looks
at all day, and CI goes green without the editor's adapter contract executing
once. The rule that says to run it lives in `CONTRIBUTING.md`, where a bot
cannot read it. It was run by hand here — 7/7, typing latency 6.1 ms median
against a 16 ms threshold — and `roadmap.md` §1.3 now holds the omission.

*Nothing compares the versions in the prose with the versions in the
manifests.* `dependencies.md` names each dependency's version in its heading,
and a bot changes manifests only. Three of the five would have left the record
naming a version that is not installed, with every check green.

**What the record actually got wrong, once it was read.**

- Angular's entry claimed the renderer weighs *"about 104 kB raw / 31 kB
  transfer"*. That was the first scaffold. `pnpm run workbench:build` reports
  **303.79 kB raw / 96.75 kB transfer** for the initial bundle, plus a
  435.09 kB lazy chunk. The number had been decoration for months.
- None of the three Electron releases between 44.0.0 and 44.3.0 announced a
  Node.js change in its notes. `ELECTRON_RUN_AS_NODE=1` says the bundled Node
  went **24.18.1 → 24.20.0** regardless. The line is written as a measurement
  precisely so that reading cannot replace measuring; this time it mattered.
- The editor spike's README and the dependency record both still said *"all
  six criteria"* after the adapter contract joined the run as criterion 7.

**Dated measurements were not edited.** Both spike READMEs carry a result
table with a date on it. The re-runs are recorded beside them instead: a
measurement edited after the fact is no longer a measurement.

**Evidence.** `pnpm run check` green on each pull request and on `main`
afterwards — **1106 tests**; `desktop:smoke` **45 checks, exit 0** on macOS
against Electron 44.3.0 and again on the combined state; `spike:editor` 7/7
against the new CodeMirror; `pnpm audit --prod` clean; the smoke screenshots
looked at, with the gutter and the wrapped line checked under
`@codemirror/view` 6.43.11.

**What was learned.** The bot rebased the CodeMirror branch itself while the
others were merging, and its rebase produced a tree identical to the one made
here — so its commit was kept and the record commit set on top of it, rather
than overwriting equivalent work to keep authorship tidy. And the lesson
underneath the whole round: a gate that keeps the build from breaking does not
keep the written record from quietly ceasing to be true. That needs its own
check, and it is now written down as one.

---

## 2026-09-12 — an automated update cannot break Electron, Angular, or TypeScript

**What this was.** The first dependency-bot run opened five separate pull
requests for packages that are one Angular release. Merged one at a time they
would have left `@angular/core` and `@angular/common` at different versions,
and nothing in the gate would have noticed.

**The protection we thought we had was not one.** `@angular/compiler-cli`
accepts `typescript >=6.0 <6.1`, and a minor TypeScript update is exactly what
a bot proposes. `strict-peer-dependencies` was already set in `.npmrc` and
looked like the answer. It is not, and that was verified rather than assumed:
installing TypeScript 5.9.2 against that range **succeeded**, with a warning
that an install prints and a log swallows. `pnpm peers check` exits non-zero on
the same state, so the gate runs it.

**Three layers, holding whoever made the change.** `check:dependencies` proves
every dependency is pinned exactly in every package, that no package sits at
two versions in one workspace, that the Angular framework and its build tooling
each move as one release, and that a **major** cannot rise without a person
editing the accepted number — where the failure message explains that a major
is not a dependency update but a round of its own. `dependabot.yml` groups what
is one release into one pull request and does not propose majors for Electron,
Angular, TypeScript, Vitest, or `@types/node` at all; security advisories are
unaffected, because GitHub raises those separately.

**Falsified four ways:** an Angular package out of step with its family, a
caret in a range, an Electron major, a TypeScript major. Each red, each with a
message saying what to do.

**What was learned.** After the TypeScript experiment, `pnpm run check` failed
locally with a type error that does not exist on `main` — a polluted
`node_modules` that `--frozen-lockfile` does not clear. Only
`rm -rf node_modules` and a fresh install was honest. A local red can lie
exactly as a local green can.

---

## 2026-09-12 — the desktop check runs in CI, and CI runs where it helps

**What this was.** Three corrections to the workflow that went in with the
documentation round, each found by the first runs on Linux.

**The sandbox.** Chromium's SUID helper must be owned by root with mode 4755,
which an npm install cannot produce and Ubuntu 24.04 enforces. The workflow now
does what a package manager would, rather than passing `--no-sandbox`: the
check has to prove the behaviour that ships. The failure was exactly the one
our own platform matrix had written down in advance.

**Two macOS assumptions in the desktop check**, green for weeks because the
check had only ever run on macOS: a hard-coded `cmd` modifier in five places,
now one `COMMAND_MODIFIER`; and an export assertion that read a font name only
a Mac is certain to have. Removing the second surfaced a real product
boundary — the supplied export stylesheets name system fonts — which is now
stated in both project-status documents instead of being implied.

**The trigger.** Pull requests only. A push to `main` has already been through
the gate on the machine it came from.

**Evidence.** The source gate and all 45 desktop checks pass on ubuntu-24.04.
The platform matrix records that, and records that it is evidence for the
source build and not for a package or an installation.

---

## 2026-09-11 — the repository becomes something a stranger can read

**What this was.** Not product code. The software had been working for a
while; its documentation had not caught up, and the README still said **"Early
scaffold … the product itself is not implemented yet"** — which had been false
for weeks. This round brought the repository to the state a public release
needs.

**The documents moved.** The engineering sources — specification, testing,
dependencies, conventions, roadmap, completed work — are now in
`docs/engineering/`, English only, because a product contract must not be able
to diverge between two translations. That cost **659 references to `SPEC.md`
in source comments** plus about a hundred in prose, all rewritten
mechanically and then verified by a check rather than by reading.

**Public documentation, in both languages.** README, contributing, security,
a documentation index, project status, build-from-source, platform matrix, a
user guide, the AI statement, and release notes — ten pairs, English and
German, each linking to the other.

**Two new gates, and the reason they are gates.**

`check:documentation` proves every relative link resolves, every translated
pair exists, neither side is a stub, and each links to the other. Links inside
fenced code are skipped: the specification documents Markdown and shows
`[text](url)`, and following an example would be a fabricated failure.

`check:public-source` looks for what cannot be taken back once pushed — a
credential by file name, a token by shape, a real home directory. It searches
for **shapes rather than for a list of our own secrets**, because such a list
would have to contain them. Both run in `pnpm run check`: a check that runs
only on release day protects only release day.

**Honesty was the hard part, not the writing.** The platform matrix has five
rows and **every native cell says "not run"** — because `desktop:make` has
never been executed on any host. The project status lists import, the
assistant, and snapshots as specified and absent. The accessibility section
states the rule the project actually checks and explicitly declines to claim
WCAG conformance. A release document that softened any of those would have
been the first false thing in this repository.

**What went wrong.** Reading the reference project changed this session's
working directory, and two heredocs afterwards wrote into **it** rather than
here — overwriting two of its files. They were restored from its own history
within a minute, and the same content was rewritten here through absolute
paths. The lesson is narrow and worth keeping: a relative path is only as
good as the directory you think you are in, and a tool that changes that
directory silently will eventually be believed.

**Verification.** `pnpm run check` green, **1106 tests**, now including the
two new gates. `pnpm run desktop:smoke` green across **45 checks** after a
move that touched 170 files — which is the point of having it.
`pnpm run spike:editor` 7/7. `pnpm audit --prod` reports no known
vulnerabilities. Four falsifications for the new gates: a link pointed at
nothing, a translation reduced to a stub, a token shape planted in a scratch
file, and the licence removed. Each red for its own reason.

## 2026-09-11 — four stylesheets, and the author's own

**What was built.** The open half of the export round, and the reason the PDF
is set from HTML at all: `specification.md` §15.2 gained a section, written before the
code.

**Four supplied sheets**, which cannot be changed — a default one can edit
into uselessness is not a default. `manuscript` (a serif, a measure),
`typescript` (monospaced and double-spaced, the shape a manuscript is sent in
to be marked up), `reading` (larger, and **no page break between sheets** — a
break is a courtesy to a binder and an interruption to a reader), and `plain`
(sans-serif and close-set). What they share is one block of rules, kept apart
so that a difference between them is a difference that was meant.

**The author's own** come from **duplicating one under a new name**, never
from an empty file — a stylesheet written from nothing is an afternoon of
finding out which rules Chromium's printer honours. They live in
`.opera-incerta/styles/<name>.css`: by the rule applied twice before (§9.4,
§18), a set made for this book belongs to the book and travels with it.
**Which one was last used is installation-local**, because that is a habit
rather than a property of the manuscript — and a remembered name that names
nothing falls back to `manuscript` rather than failing.

The list, the duplication and the editing are **one dialog, shown when a PDF
is exported**. Not the settings: the choice belongs to the moment of use. Its
three modes are its own state rather than three overlays, because the shell
allows one overlay at a time (§8.7) and a prompt that replaced this dialog
would lose what the author had chosen in it.

**Two placements this round had to argue for.** The naming rule lives in the
**core**, not in the export module: the file store needs it too, and a
dependency from `project-node` to a module would turn the architecture around.
And the default's *name* is a literal in the core's preference record, because
the core knows no modules — with a test in the module holding the two
together, so they cannot drift.

**The character range, again.** Writing `[ -<>:"/\\|?*]` into a file put
**real control characters** into it — the same shape of mistake as the export
file name the day before. The naming rule is now a **list of characters** plus
a code-point test, with a comment saying why: a range written inline is how
`[ -<]` — space to `<`, which is every digit — gets into a file without
anyone seeing it.

**Verification.** `pnpm run check` green, **1106 tests** (22 new).
`pnpm run desktop:smoke` green across **45 checks**: the PDF's menu item opens
the dialog, which offers the four and none of the author's; the typescript is
duplicated as "Smoke Set"; the copy appears in the list **and** as a file in
the project carrying the CSS it came from; and that the choice reaches the
page is read **out of the PDF**, which names the fonts it uses — `Courier` in
the file, `Georgia` not. Two smoke falsifications, each red for its own
reason. The set page is kept as `build/desktop/smoke-export.pdf` and the
dialog as `smoke-export-stylesheet.png`.

## 2026-09-11 — export: the manuscript as one file, and as a set page

**What was built.** `specification.md` §15.2, specified in this round before any of it
was written — and it is the first **module** (§15.1), which is why
`packages/export` exists and why `testing.md` §2.9 is no longer entirely open.

**One assembly, two formats.** The library in its recorded order becomes one
document: **a group turns into a heading at its depth**, and the headings of
the sheets inside it move down under it, capped at six. A `#` inside a fenced
block is text and never moves — the shift reads the block structure for
exactly that reason. Front matter never appears, and not because it is
stripped: the module is handed **bodies**, which is what the codec of §6.3 has
been handing out since the beginning. Markdown and PDF are built from the same
list of parts, because a Markdown file and a PDF that disagreed about what the
document is would be two documents.

**From here** is the same assembly with a different starting point, on the
sheet's own context menu. The groups *above* that sheet come with it, so an
excerpt keeps its place in the book instead of beginning in mid-air; a `from`
that names nothing yields nothing, rather than the whole manuscript by
accident.

**The decision that changed, and why it is written down.** On 2026-09-10 he
chose PDF through LaTeX. On 2026-09-11, asked how the PDF should be set, he
answered: **with a CSS stylesheet, one to be chosen later, and this export is
not meant to produce a professional print file.** That supersedes LaTeX, and
§15.2 records the reversal rather than quietly replacing it. The consequence
is worth having: the PDF is set by the application itself out of HTML, so the
export has **no external dependency at all** — no TeX, no pandoc, nothing to
install, nothing to be absent. Setting a book for print stays what it was:
work done outside this application.

He also answered the other half of that question with "eigener Schreiber" —
against pandoc. Carried across to HTML, that is what was built: markdown-it,
already this project's parser, with `html: false`, `linkify` off and
`typographer` off. **The export hands the manuscript to someone else**, so a
GFM table arrives as a table — unlike the editor, which shows what stands in
the file. But nothing the author typed is improved on the way out.

**An exported manuscript cannot execute anything**, and that is claimed twice
over: the parser escapes markup, and the document's own content security
policy allows its style and nothing else. Either alone would be a sentence
resting on one line of code.

**Three things this round taught.**

A character class wrote itself wrong. `[ -<>:"/\\|?*]` reads as a **range**
from space to `<` — every digit and most punctuation — and a project called
"Book 2 of 3" would have been offered as "Book of". The test that caught it is
now the one that names it.

`assembleMarkdown` trusted its input to arrive trimmed, which it did, from the
one caller that existed. A test calling it directly found the second newline.
It trims for itself now.

And the first PDF was **looked at**, which is the only reason the third thing
was found: the lines ran to about ninety-five characters across the page. A
measure was set. Nothing in the suite would have said a word about it.

**Verification.** `pnpm run check` green, **1084 tests** (26 new: 15 in the
new module, 8 in the main process, 2 in the workbench, 1 on the contract
guard). `pnpm run desktop:smoke` green across **45 checks** — the new one
drives both exports through the **native menu items** and the sheet's own
context menu, then reads the files **off the disk**: no front matter though
both fixture sheets have it, the group standing as a heading above the sheet
whose own heading moved down, a PDF that begins with `%PDF-`, and an excerpt
that took the group above it and nothing before it. Five unit falsifications
and two smoke falsifications, each red for its own reason. The set page is
kept as `build/desktop/smoke-export.pdf`, because a page nobody can look at is
not evidence.

## 2026-09-11 — where you have been: back, forward, and what was saved last

**What was built.** The two ways back to a sheet of `specification.md` §9.4, which were
specified in the same round before any of it was written.

**Back and forward** is a linear history with a position in it, as a browser
has. It lives in `packages/core/src/navigation.ts` as pure functions — `visited`,
`stepped`, `canGoBack`, `canGoForward`, `withoutSheet` — so the rule is testable
without a window: opening the sheet that is already open records nothing (that
is not a journey), and opening anything else **truncates the forward branch**.
It is reached from a new **Go menu** with `Cmd/Ctrl+[` and `]`, because the
native menu owns accelerators (§8.5) and a command only a click can reach is a
defect (§8.10).

**Recently edited** is the last ten sheets that were **saved** — not typed in,
not created, not renamed. It is written into the project (`.opera-incerta/recent.json`),
which was his decision of 2026-09-10 and is the one that costs something: the
file changes on every save and travels through Git. So it is a convenience and
never a source of truth — a file a merge left with markers in it reads as an
empty list rather than as a failure to open the project. It hangs from a button
in the navigator's header.

**What the round taught, twice.** The first version of `step()` carried a loop
that dropped a vanished sheet and tried again. It read well and it could not
fail: `#adopt()` already drops every entry the re-read project no longer has,
so the loop's body was unreachable. The falsification proved it — the test
stayed green with the code deliberately broken. A check that cannot fail is
worse than none, because it tells the reader the case is handled somewhere it
is not; the loop is gone and the method says why it needs no guard. The test
that was meant to cover it now deletes a sheet **through the store**, which is
the path that actually exists.

The second was the menu's position. The first screenshot showed it hanging
from the pointer, over the header it was opened from — and opened from the
keyboard, which §8.10 requires, there is no pointer to hang it from at all. It
is anchored to the button's own rectangle now. **Looking at the screenshot is
the check**; no assertion in the smoke would have caught it.

**Verification.** `pnpm run check` green, **1058 tests** (17 new: 9 for the
core rules, 5 in the workspace store, 1 in the filesystem contract against
both implementations, 1 in the session, 1 on the contract guard, and the menu
accelerators). `pnpm run desktop:smoke` green across **44 checks** — the new
one drives back and forward **through the native menu items**, takes a step
past the end that must do nothing at all, and opens a sheet from the
navigator's menu. Both new smoke assertions were falsified: with `go/back`
unwired it gave up waiting for the step, and with the list emptied it reported
the menu offering nothing but "Nothing saved yet."

---

## 2026-09-10 — the decision round: everything open, gone through

**What this was.** Not code. He asked to go through everything open, question
by question, and decide it. Sixteen questions in four rounds; what follows is
what was decided and where it now stands, because a decision that lives only
in a conversation is a decision that will be made again.

**The next round**: navigation and history — back and forward through the
sheets that were opened, plus "recently edited", **stored in the project**
rather than installation-locally: it says something about the manuscript, and
after weeks away it should be where it is looked for, on whichever machine.
The same reasoning made **saved views** project-scoped (§18).

**The editor's context menu** is the application's own, not the platform's
filtered (§10.10). A system menu brings text-rewriting services that arrive
with an operating system update and know nothing of the display model;
filtering them means maintaining a list of what to remove and being wrong the
first time a new entry appears. The cost — the platform's services are not
reachable in the editor — is written down beside the decision.

**Accessibility** is a rule rather than a standard (§8.10): every action
reachable without a pointer, every focused thing visibly focused, every
control saying what it is. Checkable in the smoke, and claiming no more than
has been verified; WCAG 2.1 AA as a formal promise stays open in §19, where it
belongs until there are tests behind it.

**Export begins with PDF through LaTeX** — the way this author's books are
actually set — then DOCX and EPUB, with a single Markdown export as the
substrate they build on. **Import begins with a Markdown folder**, which
adoption (§8.6) already does half of. Where no TeX is installed the module is
absent rather than broken, which is the rule every module follows (§15).

**Snapshots are commits** (§11). No second history beside the one the project
already has, and the difference view is the prose diff §12 owns. The
consequence is stated: snapshots need a repository, and where there is none
the pane offers the one source control already offers.

**The AI assistant** is the decision with teeth. He chose **Anthropic's
provider first and preselected**, and a scope that may reach the whole
project. That is a deliberate exception to this application's own invariant —
normal operation needs no network — so the exception carries four rules with
it (§15): the key lives in the **system keychain** through `safeStorage`,
never in a preference record and never in the project; the wide scope is
confirmed **per request**, with the sheets and the character count named,
because a standing switch would make the tenth request look like the first;
**what goes out is shown before it goes**, the text included; and no action
runs unasked. `AGENTS.md`'s invariant now has one stated exception instead of
a quiet contradiction.

**Left open on purpose** (§19): trademark clearance, the distribution channel
and the update mechanism, and a formal accessibility target. None of them
binds a line of code before the packaging round, and the first two become due
together with it.

**Also decided**: the five list-shaped setting kinds are unified **with the
sixth**, so the refactor has an occasion; and all four small Phase 4 leftovers
— highlighting special files, opening with an external application, a terminal
panel, and reading aloud — are wanted.

**Verification.** `pnpm run check` green, **1041 tests**. The only code that
changed was a section reference: the context menu took §10.10, so finding in
the open sheet became §10.11 — renumbered in the specification, the testing
document, both working documents and twelve source files, because a reference
that points at the wrong section is the same defect as a stale status line,
one day older.

**Lesson.** Asking sixteen questions took less time than one of the rounds
they will produce, and three of the answers changed what I would have built:
the AI scope, where "recently edited" lives, and the export order. The
temptation in a project like this is to decide such things while implementing
them, in a commit message nobody reads again.

---

## 2026-09-10 — the documents say what is true again

**What was wrong.** Nothing in the code. Six claims across four documents had
outlived their truth, and in a project whose method is "decide it, record it,
then build it", a document that lies is worse than a missing test: it is the
thing every later round reads first.

What was corrected, and to what:

1. **`specification.md` §10.3** still read *"Draft — the mechanism needs its own
   round"*. That mechanism was built on 2026-09-04: `presentation()` in the
   core turns both models into instructions the adapter draws. It says so now.
2. **§10.1** said the editing component was still a draft decision. CodeMirror
   6 was accepted on 2026-09-01 (§5.4) — and the section's own rules never
   depended on which component renders them, which is now the sentence that
   stands there.
3. **§19** listed the **Markdown parser** and the **inline markup mechanism**
   as open. Both were settled on 2026-09-04. They are not deleted but moved
   into a "settled since this list was written" block, with dates and where
   the decision lives — a decision that vanishes is a decision that gets made
   a second time.
4. **§18 Phase 3** described three built things as future: dragging a sheet
   into another group, source control's diff and discard, and the two
   searches. Each now names what it became and when.
5. **`testing.md`** claimed a layer coverage from 2026-09-01, when four layers
   "awaited the code they cover". One does: §2.9, the module registry, which
   arrives with the first module. It also called its scripts "planned" while
   every one of them but the two packaging commands has run here; and §2.11
   introduced itself as a gate for a decision that has since been taken.
6. **`roadmap.md`** held a §2 whose only entry was a *decided* item, in a file
   whose first line says it holds open work and nothing else. It is gone from
   there and stands in `completed-work.md`, where it already was. The third smoke flake
   entry said what should be done "if it recurs" — it recurred and was done
   the same day; the entry says that now.

**Verification.** `pnpm run check` green, **1041 tests** — no code changed, and
that is the point: this round moved only what the documents assert. Every
correction was checked against the round that made it true, in `completed-work.md`.

**Lesson.** Stale documentation accumulates exactly where the work went well:
a feature gets built, its own section is updated, and the *other* sections
that mentioned it as future stay behind. The cheap defence is to grep for the
section number when a round closes — every `§10.3` in the repository, not just
§10.3 itself.

---

## 2026-09-10 — searching the library

**What was open** (`specification.md` §18, Phase 3, and the three questions §18 said
had to be answered first). He answered them: **only the text**, **results as a
list**, **transient — no saved view**. The rest follows from those three.

**What was decided first** (`specification.md` §9.3). It is the navigator's **third
view**, beside the explorer and source control, because a region holds
interchangeable views and this is one of them. Only the body is searched:
front matter is metadata, and filtering a library *by* metadata is the saved
views question of §18, with a different shape. One row per match — sheet, line
number, and the line itself with the match marked — in the library's own
order, because a manuscript has an order and no relevance. A row opens its
sheet and reveals its line. The search **runs when it is asked to**, not on
every keystroke: it reads every sheet in the project from disk. At most 200
matches come back, and the view says when there were more.

**What changed.** `lineMatches` in the core, beside the find of §10.11 — one
notion of a match for both searches. A channel that returns matches, never
paths the renderer could act on; the reading happens in the main process,
where every filesystem access lives. A store that holds the query and the
hits for the window's lifetime and nothing longer. A view, an activity bar
entry, and an eighth pinned icon with its provenance.

**Verification.** `pnpm run check` green: **1041 tests** — the rule with its
line numbers and its limit, and the store's six behaviours, among them "asks
only when it is run". `pnpm run desktop:smoke` green across **forty-three
checks**: switching the navigator to the search leaves the column width alone,
a word standing in two sheets is found in two sheets, every row marks what it
matched, and `Someone Else` — which stands in a sheet's front matter and
nowhere else — is **not** found, which is what proves that only the text is
searched. Then a row opens its sheet and lands on its line. Screenshot looked
at.

**Falsified three times**: an off-by-one line number fails the rule's test; a
store that searches while the query is typed fails its own; and a search that
reads the whole file instead of the body finds the front matter value and
fails the smoke, by name.

**What looking at the screenshot decided.** A row for a heading shows
`## The Second Bell`, with the markers the editor hides. That is the honest
consequence of searching the Markdown (§9.3) — the row shows the line as the
file has it, and a search for `##` finding something is then no surprise. It
is left as it is, deliberately.

**Lesson — a signal is not a render.** Opening a match set the sheet and then
revealed the line, and the cursor landed in the document that was on its way
out: the editor adopts a new document in an effect of its own, which had not
run yet. The reveal waits for the render now (`afterNextRender`). The same
shape has bitten this project before, in the front matter block's measurement
— anything that reads or moves the DOM after a state change has to wait for
the frame that shows it.

---

## 2026-09-10 — finding in the open sheet

**What was open** (`specification.md` §18, Phase 3). Two things are called search, and
§18 says they are regularly confused: finding a passage in the sheet that is
open, and querying the whole library. This is the first; the second keeps its
own round and nothing here anticipates it.

**What was decided first** (`specification.md` §10.11):

1. **A band, not a floater.** The bar sits between the editor's header and the
   text and pushes the writing surface down. A bar that covers the line one was
   looking for is a bar that has to be moved out of the way.
2. **It is opened from the menu.** The native menu owns its accelerators
   (§8.5), so `Cmd/Ctrl+F` is an Edit-menu item that sends a command to the
   renderer — exactly like Save. A key handler in the page would never see the
   keystroke.
3. **What is searched is the Markdown**, not the display of §10.2 and §10.7.
   Searching what is *visible* would make a find depend on where the cursor
   is, because the focus line shows the markers every other line hides.
4. **Case is ignored, always**, with no switch; and **replacing is not here**,
   because writing needs decisions that reading does not.

**What changed.** A pure rule in the core — `findMatches`, `matchAt`,
`stepMatch` — then four methods on the editor port (`search`, `stepSearch`,
`clearSearch`, `selectedText`) with **three new cases in the adapter
contract**, so the CodeMirror editor and the in-memory double answer alike. In
the editor, a state field holds the query and its matches and recomputes them
on every change; the current match is *selected*, not merely marked, so
Escape leaves the cursor where the author was looking. The bar itself reports
and asks, and decides nothing.

**Verification.** `pnpm run check` green: **1032 tests** — the rule at its
edges (case, hidden markers, an empty query, overlapping matches, both
directions, both wraps). `pnpm run spike:editor` 7/7, its contract case now
**19 cases** in a real rendering engine. `pnpm run desktop:smoke` green across
**forty-two checks**: opened from the menu item, seeded with the selection,
every match marked and counted with the marks and the count agreeing, the
find starting at the cursor, both wraps, and nothing left behind after Escape.
Screenshot looked at.

**Falsified three times**, and two of them were aimed at the checks I had just
written: a case-sensitive `findMatches` fails the rule's test; an adapter that
stops at the last match instead of wrapping fails the contract in the spike,
by name (`got 2, 3, 3, then 3`); and a find that is not seeded with the
selection fails the smoke.

**Lesson — twice the check was wrong, not the code.** The smoke first asked
for a query with two matches in a sheet that had one, and then insisted the
first match be current when the cursor sat past it — which is precisely what
§10.11 says must *not* happen. Both times the application was right. A check
written from memory of how editors behave is a check that has to be read
against the specification before it is believed.

---

## 2026-09-09 — the regions as panels on a canvas

**What was open** (`specification.md` §8.9, "what this section does not decide", and
`roadmap.md` §1 an hour later). The controls and the dialogs were one house; the
three columns still met edge to edge, separated by hairlines, reading as one
surface that had been divided rather than as three things.

**What was decided first** (`specification.md` §8.2, extended). The activity bars are
the window's **rails**: flush, full height, on the navigation ground, no
corner of their own — they are chrome. Everything between them is canvas, and
the four regions sit on it as panels with the panel radius, a line, and the
panel shadow. The air is 8px, around the group and between the panels.

**The decision worth keeping: between two panels, the gap is the divider.**
The draggable strip of §8.2 *is* that air — so what one sees as separation is
exactly what one grabs, and there is no hairline any more, because a gap
already separates. It draws a short grip under the pointer and takes the
accent while it is dragged. Widths keep their meaning: the stored number is
the panel's own width, the air belongs to nobody, and at the minimum window
size the panels, rails and five gaps take 1 038 px of 1 400.

**Verification.** `pnpm run check` green: **1022 tests**.
`pnpm run desktop:smoke` green across **forty-one checks**, the new one
measuring the layout rather than describing it: the leading rail flush against
the window, the first panel eight past it, all four panels eight from the top,
the same corner, border and lift on each, three dividers eight wide, eight of
air between the panels on either side of each, and a canvas that is not the
panels' colour.

**What looking found.** The screenshot showed the source control panel's
branch line running into the panel's new left border — its content had always
sat against the column's edge, and edge-to-edge columns had hidden it. It has
inner air now. This is the third time in two days that the rule "the
screenshot is looked at" has paid for itself, and each time the defect was one
no green check would ever have reported.

---

## 2026-09-09 — the shape of things

**What was open** (`specification.md` §8.8, "what this section does not decide", and
`roadmap.md` §1 the same evening). The colours and the face were one house; the
geometry was not — 4 and 5 and 6 pixel radii picked one at a time, buttons
that were a padding rather than a height, and eleven dialogs that each drew
their own idea of a heading and a row of actions.

**What was decided first** (`specification.md` §8.9). Three radii and a pill — control
7px, panel 10px, dialog 16px — and nothing else; one spacing scale (4, 6, 8,
12, 16, 20); a control that **has a height** (26px, and 18px inside the
status bar's 24px band, because a band cannot hold a control taller than
itself); two kinds of button, of which the accented one appears **at most
once** per dialog and last in its row; and one idiom for what is active,
`inset 3px 0 0 var(--wi-accent)`, in the activity bars, the settings
categories and a selected row alike.

**The one deliberate divergence** is focus. The other application draws it
with its 20 % ring; at these smaller controls that is too faint to find, so
focus here is a 2px accent outline. It is written down as a divergence rather
than left as a difference someone would later "fix" in either direction.

**The dialog is three bands** — header, body, actions — on two surfaces, and
this is the part worth remembering: the bands are made in the **global**
stylesheet, by letting the projected heading and actions row bleed to the
panel's edges. Eleven dialogs were not rebuilt around a header and a footer
element; they project what they always projected, and all eleven now look like
one dialog. §8.7 already said the chrome lives in one place; this is what that
buys.

**Verification.** `pnpm run check` green: **1022 tests**.
`pnpm run desktop:smoke` green across **forty checks**, with the geometry
measured on a dialog that is actually open — a 16px corner over a lifted
panel, a header and an actions row that are each their own surface with their
own line, an active category wearing the accent edge, a button 26px tall with
a 7px corner — and, at the folder question, the affirmative button's
background compared against the root's own `--wi-accent`. Dark and light
screenshotted and looked at. Falsified: the dialog radius set to 8px fails in
that measurement and nowhere else.

**Lesson.** A design system is cheap to *apply* and expensive to *decide*. The
whole implementation was tokens and a handful of rules; what took the time was
writing down which radius a menu has and what happens to a control that will
not fit its band. The values were already answered — they are the other
application's — and even then the geometry needed a page of prose before a
line of CSS.

---

## 2026-09-09 — the visual system: one face, one palette, two schemes

**What was open.** Nothing, in the specification's terms — and that was the
problem. The workbench had five CSS variables, four of them
`rgba(128, 128, 128, …)`, and **one hundred and twenty-one colour literals**
spread over twenty-two components. A grey like that belongs to no palette, and
a palette that does not exist cannot be made dark. The author's other
application, C4ML, has had a proper system for months; the two are meant to
look like two programs from one house, and did not.

**What was decided first** (`specification.md` §8.8, written before the code, after
three questions he answered): the same **values** as the other application
under this project's own names; IBM Plex **packaged**, not borrowed from the
system; and light, dark and the palettes **now** rather than later.

The four decisions worth keeping:

1. **A colour literal in a component is a defect.** Everything is a token,
   defined once.
2. **Dark is a complete second set of the same names**, never a filter over
   the first — and `system` is resolved in TypeScript rather than expressed as
   a second CSS block under `prefers-color-scheme`: twenty-five declarations
   twice would drift, and the resolution already had a shape in this codebase
   (`resolveLanguage`).
3. **A palette is five values and a rule.** The accent and its three
   companions are named; the surfaces follow from them with `color-mix`. The
   palette selectors name the *attribute*, not the root, so the swatches in
   the settings dialog show seven palettes that are not active — from the same
   definitions, not from a second copy of the values.
4. **The interface is sans, the manuscript is what the author writes in.**
   Plex Sans for the workbench; the editor keeps its configurable family
   (§13), serif by default, and the zoom of §10.9 scales it alone.

**What changed.** Eight WOFF2 files with their licence, notice and pinned
bytes (`dependencies.md`, `check:assets`, which now covers fonts as well as
icons); a token layer of some seventy declarations in `styles.css`; the two
preferences, their registry entries and their controls — three radio buttons
and eight swatches; the root element carrying `data-color-scheme` and
`data-color-palette`, in the launcher as much as in the workbench; and the
sweep: 121 literals to tokens, every `system-ui` and `ui-monospace` stack to
`--wi-sans` / `--wi-mono`, the editor's own theme included, so CodeMirror's
light defaults do not survive into a dark scheme.

**Verification.** `pnpm run check` green: **1022 tests**, among them the
resolution rule at both ends, the record refusing a scheme and a palette it
does not offer, and the layout state storing both. `pnpm run desktop:smoke`
green across **forty checks**. Both dialogs and the dark workbench
screenshotted and looked at.

**Falsified four times, and one of them found a defect in the check itself.**
Breaking the scheme resolution failed in its own test; a missing `SOURCE.md`
failed the asset check. But the smoke's font check —
`document.fonts.check('16px "IBM Plex Sans"')` — **stayed green with the
Regular face pointing at a file that does not exist**: a name-based question
cannot tell a loaded face from a fallback. It fetches all eight files over the
renderer's own protocol now and requires the `wOF2` signature, and it measures
a line of text against the same line in a family that does not exist.

The next break was aimed wrong and is worth writing down too: pointing *one
weight* at a missing file, the run stayed green — correctly, because the other
four faces still make the family, and the text really was set in Plex. The
break that matches the claim is dropping the asset rule that packages the
fonts, and with it all eight fetches fail by name in the appearance check and
nowhere else.

**Lessons.**

1. **A check that cannot fail is not evidence — and a break that misses tells
   you nothing about the check.** The font check was written, passed, and
   would have shipped a claim it could not support; the first break exposed
   it, the second was aimed at the wrong thing and proved only that the
   application was right. Falsification has to hit the sentence the check
   claims, or it is another green run.
2. **Colour was one round; shape is the next.** With the tokens in place the
   workbench is quiet and correct, and still square: radii, spacing, the
   anatomy of a dialog and the look of a control are a second round, and
   §8.8 says so rather than leaving it to taste.
3. **A face arrives after the first paint.** The front matter block measures
   itself and grows to what it measured, and the smoke read that height one
   frame too early — twice, once before the fonts existed. It waits for the
   height to settle now, which is what `roadmap.md` §1 had predicted the remedy
   would be.

---

## 2026-09-09 — the editor zoom

**What was open** (`specification.md` §18, Phase 2, and the promise §10.5 made when the
status bar was built: "the zoom slider to follow").

**What was decided first** (`specification.md` §10.9, written before the code). 50 % to
200 %, in whole percentage points, with a **detent at 100 %**: the three points
either side of the middle belong to it, so a drag past the middle lands on it.
The percentage beside the slider is itself the way back to 100 %, the way
double-clicking a divider restores a column's width. What scales: the editor's
text, its headings by their ratios, **and its gutters** — a line number left at
eleven pixels beside doubled text is a column that no longer belongs to its
lines. What does not: everything that is chrome.

The decision that shaped the code: **it is a display factor, not a setting.**
The configured base size is untouched by it, which is what makes the detent
unambiguous — at 100 % the editor shows the size the author configured,
whatever that is. So it is not in the settings registry but among the layout
preferences, remembered like a column width, and the adapter takes it through
a second call rather than as a fourth field of the typography. And it is **one
factor for the editor**, kept across sheets — deliberately unlike the wrap
switch of §10.5, which is a decision about reading this sheet now: a zoom set
because of someone's eyes must not be forgotten at the next sheet.

**What changed.** `clampEditorZoom` and `editorZoomFactor` in the core, with
the detent in the rule rather than in the slider — the record, the slider and
any later keyboard step pass the same gate. `editorZoom` in the preference
record and in `LAYOUT_PREFERENCE_KEYS`. The adapter's theme multiplies the
configured size and the gutters' own size by the factor. The status bar gained
the slider and the percentage button, and reports; it decides nothing.

**Verification.** `pnpm run check` green: **1017 tests** — the rule at its
bounds, at the detent and just past it, the record clamping a stored value,
and the layout state storing what the slider reports. `pnpm run desktop:smoke`
green across **thirty-nine checks**: at 150 % the text, the heading and the
gutter each measure exactly half again, while the sheet list and the status
bar do not move; the factor reaches the preference file; a drag to 102 % lands
on 100 %; the percentage takes it back, to the sizes it started from.
Screenshot looked at. Falsified twice: the detent removed from the rule (97
and 102 arriving unchanged), and the gutters left out of the scaled theme
(11 against 16.5, in the zoom check and nowhere else).

**Lesson.** "Only the editor scales" is the kind of sentence that is easy to
write and easy to half-implement: the text was scaling within minutes, and the
gutters were not. The check that measures **what must not move** — the sheet
list, the status bar — was as valuable as the one measuring what must.

---

## 2026-09-09 — the line-number gutter

**What was open** (`specification.md` §18, Phase 2). A second gutter column, left of
the heading markers, with one number per line — specified in the roadmap as a
sentence, and nothing else.

**What was decided first** (`specification.md` §10.8, written before the code). What is
numbered: the **logical** lines of the writing surface, from 1, which is the
same counting the status bar reports — front matter is not in the surface, so
the two can never disagree. A wrapped line keeps **one** number, at its first
visual line: a number per visual line would count something the file does not
have. Heights are measured, not computed (`conventions.md` C-U5) — a heading
is taller than body text, and that is exactly where a gutter drifts out of
step with its text. And: **off by default, with a switch** in Settings →
Editor. A manuscript is not source code; the numbers are for *talking about* a
text — "look at line 120" — which is occasional. The same reasoning the front
matter area was given (§10.4): the quieter surface is the harmless start.

**What changed.** `EditorTypography` is four settings now rather than three,
`editorLineNumbers` is in the preference record and in the settings registry,
and the adapter holds a third compartment. The gutter itself is CodeMirror's
own `lineNumbers()`: it already draws one number per logical line at that
line's first visual line and takes each line's height from the layout — the
two rules the specification names — and a gutter of our own would have had to
reimplement both. It is placed **first** in the extension list, because
gutters are laid out in the order their extensions appear. The three
compartments are reconfigured in one place now (`#reconfigured`); two copies
of that list had already grown apart by one entry when the third arrived.

**Verification.** `pnpm run check` green: **1011 tests**, the layout state
handing the editor all four settings as one value and the record carrying the
fourth. `pnpm run desktop:smoke` green across **thirty-eight checks**: absent
until the switch is turned on; then a number for every logical line, running
1 to the last, the whole column left of the heading markers; a line typed long
enough to wrap carries one number whose element is exactly as tall as the
wrapped line. Screenshot looked at — the status bar read `Ln 5, Col 223`
beside a gutter whose last number was 5, which is the agreement §10.8 asks
for. Falsified twice: the gutter placed after the marker gutter (461 against
409, in the right check), and the setting dropped on its way to the editor.

**Lesson.** The specification round took longer than the implementation and
decided the only two things that were actually open: what a wrapped line does,
and whether the column is there by default. The code that followed was one
compartment and a CSS rule.

---

## 2026-09-09 — a folder that is not a project, answered instead of refused

**What was wrong.** Choosing a folder without `.opera-incerta/` put
`Das Projekt ließ sich nicht öffnen (project/no-project)` in the launcher —
the application's own inner state, shown to the author, with no way forward.
`specification.md` §8.6 has specified four answers since it was written and only one
was built: `ProjectSession.open` threw `project/${inspection.kind}` for the
other three, the shell passed the code through, and the welcome window printed
it. The adapter could adopt a folder all along (`createProject` is documented
for exactly that, and `testing.md` §2.3 asks for its evidence); nothing above
it ever asked.

**What was decided first** (`specification.md` §8.6, now Implemented). Opening
**reports what it found** rather than succeeding or throwing: five outcomes —
opened, cancelled, and the three questions. Which question to ask and what a
yes does is the launcher's, in the renderer, because that is where a click's
meaning is decided (§8.7); a native message box would have been a second
interface in front of the same decision. Adoption keeps every file and adds
only the record directory, and the display name — the folder's own name — is
the main process's to decide: the renderer says *which* folder was meant,
never what the project is called. Several projects have no yes at all; the
list names them and the author opens the one they mean, because guessing
opens the wrong manuscript.

**What changed.** The contract grew `ProjectOpenOutcome` with its guard, and
`adoptProject`; `openRecentProject` became **`openProjectPath`**, named for
what it does rather than for the list it came from, now that a subproject
offer uses it too. Contract version 2 → 3. The shell classifies in one
function, `openOrReport`, and adoption checks the directory is there and is
not already a project before anything is written — `createProject` would
otherwise have created a whole missing tree for a path that named nothing.
The launcher holds the question as one signal and answers it; one dialog
asks all three, with Return left to the affirmative button because nothing
here is destructive. `WorkspaceStore.openProject` is **gone**: the workbench
never opened a project — the launcher does — and a second opening path kept
alive only by its own tests would have had to learn the new protocol for
nothing.

**Verification.** `pnpm run check` green: **1011 tests** across eight
projects — seven launcher cases, one per answer and per way of getting it
wrong, and the outcome guard by the kind it claims. `pnpm run desktop:smoke`
green across **thirty-seven checks**: a folder holding two Markdown files
raises the question, and until it is answered nothing is written and no
window opens; answering makes it a project named after itself whose library
is those two files, their bytes unchanged; the folder above then offers the
one project inside it; a second project beside it and both are named with no
way to say yes. Both dialogs screenshotted and looked at. Falsified four
times: the answer sent to the wrong channel, the several-case allowed a yes,
the guard let `opened` through without its snapshot, and adoption naming the
project something other than the folder — each failed in its own check and
nowhere else.

**Lessons.**

1. **A smoke that hangs is worse than one that fails.** `clickText` waits for
   the next frame, and the click that opens a project closes the window it
   waited in: `requestAnimationFrame` never ran, and the run sat there for
   twelve minutes with no output. Two checks had their own click for this
   reason without saying so. It is `clickAndLeave` now, and the reason is in
   its documentation.
2. **Loaded is not rendered.** `waitForLauncher` waited for `isLoading` to go
   false, but the renderer asks which window it is before it bootstraps the
   launcher, so the buttons arrive later. The wait is for the buttons.
3. **A diagnostic code in front of the author is an unfinished branch.** The
   code was correct and the message was honest; what was missing was the
   decision about what to offer instead. Reading `specification.md` §8.6 against the
   handler found three specified answers that no code had ever taken.

---

## 2026-09-04 — the GFM display, with markdown-it behind it

**What was open** (`specification.md` §18, `roadmap.md` §2.1). The editor hid heading
prefixes and inline delimiters and showed nothing else of Markdown: a quote
was a line beginning with `>`, a list a line beginning with `-`, a rule
three dashes. The runtime parser was decided but not taken.

**What was decided first.** `specification.md` §10.7, written before the code: the
pattern of §10.2 and §10.3 applied to the rest — hide the markers, show the
effect, except on the focus line — with a table saying, construct by
construct, what shows off the focus line and what on it. Links, images,
and tables stay out until their concept rounds.

**What changed.** A new package, `packages/markdown`, reads the block
structure with markdown-it in its CommonMark preset and translates the
tokens into the core's own `BlockModel` — quotes with depth, list items
with marker, order and nesting, code blocks, thematic breaks — and lets no
token out. Task list items are that translation's own rule, since the parser
has none. In the core, `presentation` turns text, display model, and block
model into instructions: a style on a line, a range hidden, a range replaced
by a glyph, a mark over a range. The adapter draws them one-to-one — a
second state field for the blocks, recomputed on a change of the text and
never on a cursor move, and a third for the presentation with the display
model's rhythm — with bullets, boxes, rules, and returns as widgets and the
inline effects as marks. The production check now fails the build if the
built renderer carries `argparse`, the parser's PSF-2.0 command-line
dependency; `dependencies.md` records both deviations the spike measured
and how each is settled.

**Verification.** `pnpm run check` green: **1001 tests** across eight
workspace projects — the translation over a sample of every construct, the
presentation rule by rule, nothing marked or hidden inside code, the marks
after a heading's hidden prefix. `pnpm run desktop:smoke` green across
**thirty-four checks**: the GFM check types the constructs in, measures the
quote's rule, the bullet, the ticked box, the kept ordered marker, the rule,
line-through, the monospace face and the weight with computed styles, clicks
into the quote and sees its marker back, and undoes it all. Screenshot looked
at. Falsified twice: the task box left as written failed the presentation
test, and an adapter drawing without the block model failed the smoke.

**Lesson.** The round had two halves, and the first was a page of prose:
what each construct looks like on and off the focus line. Once that table
stood, the parser was a translation and the editor a drawing; the rules sat
in one pure function with a test per row of the table. Deciding the
presentation before its implementation round, as the roadmap asked, was not
ceremony — it was the design.

---

## 2026-09-04 — the status bar: where the cursor is, and whether this sheet wraps

**What was open** (`specification.md` §10.5). Accepted, not built: a bar under the
text with the cursor position on the left and the wrap switch on the right,
the zoom slider to follow with §18.

**What changed.** The adapter port speaks of the cursor now: `cursor()`
gives line and column, `onCursorChange` reports every move — including the
one an `open` or a reveal makes, which is not an update the view's listener
sees and had to be told separately. The column counts the visible text, so
a heading's hidden prefix is not where the author is; the display model
already knew where a line's visible start lies. Two contract cases hold
every adapter to it, the in-memory one included. A small `EditorSession`
holds the last cursor and the wrap switch per sheet: an override of the
settings' default that lives with the window and never enters the record,
because a switch for reading one sheet is not a preference. The bar itself
is one component at a constant height beside the header's, with the border
inside the height — the first smoke run measured 25 px for a 24 px bar.

**Verification.** `pnpm run check` green: **982 tests** — the contract's
cursor after a reveal and the listener hearing it, the session flipping one
sheet at a time and following the default where nothing was flipped, the
constant below the header's. `pnpm run desktop:smoke` green across
**thirty-three checks**: the bar names the last line after a click, follows
a typed character by one column and a Backspace back, measures 24 px, and
its switch turns this sheet's wrapping off and on as the editor's own class
list says. Falsified twice: a fake adapter that stops telling about the
cursor fails the contract, a switch that sets what it found fails the
session test and the smoke.

**Lesson.** Two of the day's rounds met here: the wrap setting from the
morning wanted a per-sheet switch, and the switch wanted a place that is
not the preference record. Naming the place — a session, gone with the
window — was the whole design; the bar was forty lines after that.

---

## 2026-09-04 — the editor's font, size, and wrapping as settings

**What was open** (`specification.md` §13, Editor). The editor's typography was
three constants in the adapter's theme: Georgia at 16 px with the heading
sizes in `em` beside it, and line wrapping always on. The specification
had named them settings from the start, with one rule: heading sizes keep
fixed ratios to the base.

**What changed.** The rule moved into the core, `editor-typography.ts`: a
curated list of three families with the stacks behind them, the base size
bounded to 12–24 px and clamped on read like a width, the default for
wrapping, and the heading ratios as one table. The adapter's theme states
the ratios in `em` from that table and takes the base and the family from a
compartment, so a change reconfigures the view in place — document, history
and cursor stay — and every kept state of another sheet with it. Wrapping is
a second compartment. The record holds the three, the registry lists them
under a new *Editor* category with two new kinds — a family choice shown in
its own face, a bounded number — and the layout state hands them to the
editor as one typography.

**Verification.** `pnpm run check` green: **976 tests** — the clamp, the
ratios at three bases, the curated list, the record's read and clamp, the
registry complete, the layout state's setters. `pnpm run desktop:smoke`
green across thirty-two checks: the base size set to 20 in the dialog
reaches `.cm-content` as 20 px and H2 measures 32 px, the family reaches the
content as a monospace stack, wrapping leaves the content's class list, the
record holds all three, and Reset brings the editor back to 16 px and
wrapping. Screenshot looked at. Falsified by an H2 pinned to 26 px in the
theme: the smoke reports the ratio lost.

**Lesson.** The ratio was already right in the theme; what was missing was
a place where it *is* a rule rather than a coincidence of six numbers. Once
it was a table in the core with a test over three bases, the setting was a
compartment and an input — and the smoke could ask the editor, not the
theme, whether the rule holds.

---

## 2026-09-04 — the interface speaks German, and the menu with it

**What was open** (`roadmap.md` §3, `specification.md` §14). Accepted since the first
day, built nowhere: every word of the interface sat in its template, the
registry of the settings dialog carried English labels inside the
text-free core, and the group-deletion warning chose between "1 sheet" and
"sheets" with the very `count === 1` the specification forbids.

**What changed.** A new package, `packages/localization`, holds the
English and German catalogues and the rules that read them: `translate`
with `{name}` placeholders, `plural` by `Intl.PluralRules`, and the
resolution of the stored choice — `system`, `en`, `de` — against a
language tag. Every key is typed from the English catalogue; the German one
is typed against it, so a lost line is a compile error. The renderer's one
localization service exposes `t` and `n` over a signal, and every
component, every flow, and the launcher went through it: some two hundred
and twenty strings, none left behind, and the activity bars and the
settings registry now name keys rather than words. The language is the
first setting of the Appearance category. The main process resolves the
same choice against Electron's locale and rebuilds the native menu the
moment the preference record is written with another language; the
document's `lang` follows.

User data stayed where it was: the type of `t` takes a key, never a
string, and a test reads the source for a call whose first argument is
anything else. The settings dialog's one bridge from the registry's string
keys is the named exception.

**Verification.** `pnpm run check` green: **969 tests** — the catalogues
in step with each other, plural resolution for both languages over eight
counts, the fallback for a lost key, the choice resolved, every key the
interface uses present in both catalogues, no user data handed to the
service, and the service changing language on the layout state's word.
`pnpm run desktop:smoke` green across **thirty-two checks**: the interface
switched to German, and the dialog, the activity bar, the document's
`lang`, and the native menu item read German, then English again; the run
seeds English first, because the machine it ran on is German. Screenshot
looked at: the whole workbench in German, the project's own names
untouched. Falsified three ways: a key the catalogue lacks turned the scan
red; a sheet title handed to the service turned the user-data check red; a
German line deleted failed the build.

**Lesson.** The smoke had been reading English off the screen on a German
machine and never knew, because until today the application had no other
language to fall into. The first run after the build failed on
"Darstellung" where it looked for "Appearance". A test that assumes the
language of its subject is a test that will be surprised by localization;
the seed is one line, and the surprise was worth it.

---

## 2026-09-04 — a prompt about nothing, and a chain that stops

**What was open.** The previous entry's smoke was red once at the
discarding check — "discarding raised a prompt about the change it had
just discarded" — and the commit went out regardless, because the command
that ran gate, smoke, and commit in one line did not stop on the smoke's
result. One run in two showed it.

**What was found.** A race in the discard flow. The discard writes the
file through git, refreshes the status, and then forgets the editor's
version. The watcher reports the write after its debounce, and when that
re-read runs before the forgetting, it finds the sheet dirty — the typed
text — and the disk changed — the committed file — and raises the conflict
prompt, rightly by its rule. A moment later the discard forgets the edits,
and the prompt stays up, asking whether to keep a version that no longer
exists.

**What changed.** Dropping the editor's version on purpose takes down a
conflict prompt about that sheet: the prompt asks about the author's
version, and without one there is nothing to ask. One rule in
`#dropEditing`, which both the discard and "load the file" go through. The
smoke command chain stops on a red smoke before the commit.

**Verification.** `pnpm run check` green: **945 tests** — a conflict
raised, then the edits forgotten, the prompt gone. Falsified by removing
the rule: red. `pnpm run desktop:smoke` green three times in a row.

**Lesson.** Two lessons, one each. The prompt: a rule that fires correctly
at its moment can still be wrong a moment later, when the thing it asked
about is taken away by another flow; the taking-away has to know about the
asking. The chain: a verification whose result nothing reads is a
verification that did not happen. `&&` on every step, and the commit last.

---

## 2026-09-04 — a re-read that came too late, coalesced

**What was open** (`roadmap.md` §1, from the previous round). The merge check
once found no read-only notice within six seconds of the merge leaving
conflict markers in the open sheet, and the two runs after it were green.

**What was found.** `reloadProject` was neither serialised nor coalesced.
Two watch reports in quick succession — the smoke's own write of the sheet,
then the merge — started two overlapping re-reads, and the earlier one
could finish last with the older file: the editor then showed a sheet the
disk no longer had, without markers and without the notice. The source
control store had the coordinator for exactly this since the review rounds;
the workspace store had not taken it.

**What changed.** The re-read runs behind a `RefreshCoordinator`: a report
during a re-read schedules one follow-up, which reads after it and is
never overtaken by it. One line in the store, plus the constructor.

**Verification.** `pnpm run check` green: **944 tests** — a test with two
reloads in flight whose reads resolve newest first, ending on the newer
file. Falsified by calling the re-read directly again: the test ends on
the older file. `pnpm run desktop:smoke`: **red once**, at the discarding
check, with a prompt about the change it had just discarded — and the
commit went out before that result was read, because the command chain
did not stop on it. Recorded here as it happened; the fix-forward is the
next entry, and the chain now stops.

**Lesson.** A rule that exists in one store and not in its neighbour is a
rule that will be needed in the neighbour. The coordinator was written for
the source control panel with the words "coalesce, do not queue"; the
workspace store re-read the project on every watch report with no words at
all. The smoke could only show the gap once in three runs. The test shows
it every time.

---

## 2026-09-04 — a conflict prompt nobody asked for, and the smoke that now looks

**What was open** (`roadmap.md` §1, from the settings round's screenshot). Behind
the settings dialog stood "This sheet changed on disk while you were editing
it", up before the check began, and the title carried a dirty marker that
never went away.

**What was found.** Not the watcher, not the save. The inspector's output
was named `change` — the name of the DOM event that the fields inside it
raise, which bubbles up to the component's own element. Angular calls a
handler bound to `(change)` for both: once with the emitted
`{ status: 'review' }`, once with the native Event. The store spread the
Event into the metadata, and an Event has exactly one enumerable property:
`isTrusted`. From then on the sheet's metadata carried a seventh field no
file ever has, so the sheet was dirty for good, and the next re-read of the
file — any re-read — found the disk different from the baseline and asked
the author about a change nobody had made.

**What changed.** The output is `metadataChange`. The store takes no field
it does not own, so a template binding, untyped at runtime, cannot put an
object that is not metadata into the record again. And the smoke calls
`expectNoStrayDialog` after every check: a dialog up at a boundary fails
the run, naming the check before it. That guard is what found the check;
the dirty marker clearing after a save through the menu is what now proves
the cause is gone.

**Verification.** `pnpm run check` green: **943 tests** — the store's
own-fields rule, and the save-then-edit-then-reload sequence that does not
ask. `pnpm run desktop:smoke` green across **thirty-two checks** with the
boundary guard between each. Found by the guard at `panes:source-control`,
then by one line printed from the store — `metaBase` with `isTrusted` —
after two hypotheses about the watcher had failed to reproduce in a unit
test. Falsified by putting the old output name back with the store's guard
still in place: the run failed at the discarding check with a prompt
nobody asked for — the guard alone is not enough, the name matters. Two
flakes seen on the way, one keystroke too many and a merge re-read that
came too late, are in `roadmap.md` §1 with what they look like.

**Lesson.** The bug was in a *name*. Nothing in the type system objected,
because the second call arrives through a template binding, and nothing in
the behaviour looked wrong to a smoke that clicks through dialogs by script.
Two guards came out of it: one in the store, which refuses what it does not
own, and one in the smoke, which refuses a dialog it did not open. The
second is the more general one — it turns "nobody looked" into "something
looks", for every future round.

---

## 2026-09-04 — the settings dialog, for the settings that exist

**What was open** (`roadmap.md` §3, `specification.md` §13). The preference record
existed and persisted the workbench layout and a handful of switches, each
changed from wherever it happened to sit; there was no place that listed
them, no reset, no way in from the menu, and the identity question of §12
had promised "a settings entry" that did not exist.

**What changed.** A settings registry in the core — categories and, per
installation-local preference, one entry with a stable id, its record key,
its default — which a test holds complete: a preference that is not layout
and not registered fails the build. The dialog renders the registry: a
category list, one content region, a switch or the density steps per entry,
changes applied at once and stored like every other preference, and **Reset
all settings** restoring the complete default record. Two categories hold no
preference and are listed because an author looks there: *Page categories*
opens the manager of §6.6, *Source control* edits the commit identity in
place — the entry §12 promised — and writes it into this repository only.

Two ways in: `Settings…` in the native menu with `Cmd/Ctrl+,`, under the
application menu on macOS and under File elsewhere, enabled with a project
open because the dialog lives in the workbench; and one tool entry at the
foot of the leading activity bar, apart from the view entries because it
selects no view. Escape closes; Tab stays inside; focus returns to the entry
that opened it — told to the dialog, because a click does not focus a button
on macOS and the document cannot say what was clicked. The gear is the
seventh Material Symbol, from the same package version, hash-pinned beside
the others.

**Verification.** `pnpm run check` green: **941 tests** — the registry
complete and consistent, the layout state's switch by key and reset, the
menu's accelerator. `pnpm run desktop:smoke` green across **thirty-two
checks**: the dialog opened from the menu item and from the gear, a switch
reaching the preference file, Escape returning focus to the gear, the
fixture's identity shown, changed, and read back with `git config --local`,
Reset reaching the file. Screenshot looked at. Falsified by a dialog that
did not name its opener: the smoke reported focus returned to `body`.

**What the screenshot also showed** — a conflict prompt nobody asked for,
up before the check began, from the save two checks earlier. Recorded in
`roadmap.md` §1 with its likeliest cause; it is the next round.

**Lesson.** The first screenshot of the round was of the wrong thing: the
dialog not yet painted, and behind it a prompt that had been standing there
through twenty checks of every previous run. Looking at a picture found what
no assertion had asked about. The smoke should fail on a dialog it did not
expect; that is now on the list.

---

## 2026-09-04 — the standard oracle joins the gate, and finds a seventh thing

**What was decided** (`roadmap.md` §2.1, by the author the same day). The
parser gate is read as two: commonmark.js, the reference implementation of
CommonMark, and `yaml` are accepted as the test-time oracle, development
dependencies of `packages/core` only. The runtime parser for the GFM
display is decided in that round.

**What changed.** `test/standard-oracle.test.ts` makes the spike's
criterion 7 and criterion 3 permanent, without the fetched specification:
236 generated sheets are written by the codec and read by `yaml` to the
same strings, foreign lines of every shape stay readable across a round
trip; and 400 seeded documents built from heading, fence, indented-code and
text lines are read by the reference parser, which must mark the same
top-level ATX headings at the same level, put in code blocks exactly the
lines the transform shows verbatim, and read back a heading the author set
as that heading. The oracle's types stop at the file's edge
(`conventions.md` C-A6). `dependencies.md`, `specification.md` §5.4 and `testing.md`
§2.2 record the acceptance.

The generated documents found what the specification's examples had not:
the transform started indented code **after a blank line only**, while
CommonMark starts it wherever a paragraph is not running — after a heading,
a thematic break, a setext underline, a fence. `# Title` followed by four
spaces of code showed the code as a paragraph. The rule now tracks whether a
paragraph is running; setext headings themselves stay paragraphs to the
transform, and that limit is written into `specification.md` §10.1 beside the
others.

**Verification.** `pnpm run check` green: **934 tests** — the oracle's
three Markdown properties and two YAML properties, and five unit cases for
where indented code may start. Falsified against the oracle itself: the old
comment stripping put back turned the YAML property red, the old fence rule
put back turned the Markdown property red. `pnpm run spike:parser`
criterion 3 unchanged at the four recorded limits.

**Lesson.** Four hundred random documents found in a minute what 652
curated examples had missed, because the examples show each rule alone and
the random documents show the rules colliding. Both belong: the examples
name the rule that broke, the random documents find the collision. The
oracle now runs on every `pnpm run check`, so the next collision is found
before it is committed.

---

## 2026-09-04 — two fence rules the oracle found, and two limits written down

**What was open** (`roadmap.md` §1, from the parser spike). Criterion 3 of the
parser gate compared `markdownToDisplay` with three conformant parsers over
the specification's heading and code examples, and the parsers disagreed
with the core in the same eight places.

**What changed.** Two of them were defects, now fixed in `heading.ts`: a
backtick fence whose info string contains a backtick is not a fence —
`` ``` ``` `` and `` ``` aa ``` `` are code spans (examples 138, 145) — and
a closing fence may be followed by spaces only, where the core let
`` ``` aaa `` close one (example 147). A tilde fence may still carry a
backtick in its info string, as CommonMark allows. The fence pattern now
captures what follows the run, and both rules read from that.

The other four disagreements are limits of a transform that models no
containers, and they are written into `specification.md` §10.1 rather than fixed: an
indented line after a blank line inside a list item is that item's
paragraph to CommonMark and code to the core (examples 108, 109), which
needs container awareness — the GFM display's round; and a whitespace-only
line at the edge of an indented block is shown verbatim (example 117),
which changes nothing anyone can see.

**Verification.** `pnpm run check` green: **927 tests** — the two code-span
lines not opening a fence, an ordinary info string still opening one, a
tilde fence with a backtick, the closing line with text staying content,
trailing spaces after the run still closing. `pnpm run spike:parser`
criterion 3: **four disagreements left for every conformant parser, all
four the recorded limits.** Falsified by putting both old rules back: two
tests red.

**Lesson.** A conformance oracle draws a line between "wrong" and "not
modelled". Before it ran, both looked the same from inside the core: a
place where our rule and the standard part ways. After it, two were fixed
in an hour and two were written down with their example numbers, and the
next reader can tell which is which.

---

## 2026-09-04 — four codec defects the oracle found, fixed the same day

**What was open** (`roadmap.md` §1, from the parser spike). The front matter
the codec writes was read by an independent YAML parser for the first time,
and thirteen of 181 generated sheets came back wrong. Four causes.

**What changed.** The reader's comment stripping now respects quoted runs:
`keywords: ["a #comment", plain]`, which the writer itself produces, used to
read back as `["a` — a keyword lost on the next load of a file the
application had written. The writer's notion of "what another reader would
not take for a string" grew from decimal numbers and booleans to YAML 1.1's
whole zoo: hexadecimal, octal and binary, `.inf` and `.nan`, `.5` and `5.`,
underscored digits, sexagesimals like `1:20`, dates, and `y`/`n`. A scalar
ending in a colon is quoted, because bare it is not YAML. And `notes` fall
back to a quoted scalar with escaped newlines where a literal block cannot
carry the text — a first line beginning with whitespace, a line of spaces
only — since a block's indentation is read from its first line and an
indentation indicator is a shape the reader refuses by design.

**Verification.** `pnpm run check` green: **922 tests** — the keyword
with a space and a hash read back whole, real comments still dropped after
a list and after a quoted scalar, sixteen other-type spellings written
quoted and read back, a word with digits in it still bare, the trailing
colon, five awkward notes round-tripped exactly, ordinary notes still a
literal block. `pnpm run spike:parser` criterion 7: **181 generated sheets
and 3 fixtures, no problem.** Falsified twice: the old comment stripping put
back failed three tests; the notes fallback disabled failed five.

**Lesson.** The oracle found in one run what a year of the codec's own
tests would not have, because those tests can only check that the writer
and the reader agree with each other — and they did, on the wrong answer.
Agreement is not correctness. The independent reader is what turns a
round-trip test into a conformance test, which is why it goes into the
gate next.

---

## 2026-09-04 — the parser spike: measured, not accepted, and paid for already

**What was open** (`roadmap.md` §2.1). The Markdown parser was a candidate
since the first day, named as "the remark/micromark family" and never
measured. `testing.md` §2.2 asks for a cross-check of the codec against an
independent parser that the candidate would have to supply.

**What was done.** A gate of seven criteria with fixed thresholds
(`testing.md` §2.11) before any code ran; then `spikes/parser-markdown`,
which measures four parsers — markdown-it, marked, commonmark.js, micromark
with mdast — against the 652 examples of CommonMark 0.31.2, fetched by hash
and never committed, and `yaml` against the codec's own output.

**What was found.** No candidate passes every criterion. markdown-it and
commonmark.js are conformant; marked is not; micromark is nearly, but slow
and forty-three packages wide. The two jobs — a test oracle now, a GFM
display later — are best served by two packages, and whether the gate may be
read that way is the author's decision, put in `roadmap.md` §2.1 with a
recommendation.

The cross-check paid before any decision: two fence defects in the display
transform, and four in the codec — one of them a **data loss on read** of a
file the application itself wrote (`keywords: ["a #comment", plain]` comes
back as `["a`). All in `roadmap.md` §1, each with the example that shows it.

**Verification.** `pnpm run spike:parser` prints seven tables and exits
non-zero, which is the honest result. The spike measured itself wrong three
times before it measured the candidates: micromark sanitised raw HTML
(a rendering option, not a parsing failure), pnpm's listing keys packages by
name without repeating it, and the empty string after an example's final
newline is not a line of the document. Each was a spike defect, corrected
without touching a threshold. `pnpm run check` green: the spike builds with
the rest.

**Lesson.** The gate was written for one package doing two jobs, and the
measurements said no such package exists on these terms. That is a result,
not a failure of the gate: it turned a vague preference into two concrete
choices with numbers beside them. And the oracle proved its worth on the
first run, against our own code.

---

## 2026-09-03 — the Electron runtime arrives with the install

**What was open** (`roadmap.md` §2). A clean checkout did not get the Electron
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
`dependencies.md` say the same; the `PLATFORMS.md` bullet in `roadmap.md`
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

**What was open** (`roadmap.md` §5, decided in `specification.md` §12). Without
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

**What was open** (`roadmap.md` §1.4, specified in `specification.md` §12 since the
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

**What was open** (`roadmap.md` §1.7 until this round). The CodeMirror adapter
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

**What was open** (`roadmap.md` §1.8 until this round): eleven rules in the
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

**What was open** (`roadmap.md` §1.8 until this round). The `ProjectFilesystem`
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

**What was open** (`roadmap.md` §1.8 until this round). Four error classes of
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

**What was open** (`roadmap.md` §1.8 until this round). Ninety `setTimeout`
waits across the smoke's checks and helpers, thirty-six of them in source
control: after a click, 250 ms; after a commit, 1,200 ms; after a drag, 700
ms. Each one gave a fast machine and a slow one the same time, and was wrong
for one of them — and `roadmap.md` §1.6 records the one run in which it was
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

**What was open** (`roadmap.md` §1.8 until this round). Every bridge handler
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
  Reads wait too, deliberately (`specification.md` §12): a status beside a push is a
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

**What was open.** The first round took the flows out of the shell; `roadmap.md`
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
suite; it is the one item still in `roadmap.md` §1.7.

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
  that difference is intended (`specification.md` §12) and now sits on one function
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
`roadmap.md` §1.7 with the review's notes, so the next round starts from a
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
this project defines, no general YAML parser (`specification.md` §6.3) — and takes the
posture the namespace rules already had: **what it cannot read, it refuses
with a diagnostic and marks read-only**, and in that state it claims nothing
as owned, so even a mistaken write could not regenerate a field over the
original. Two new codes, `front-matter/field-unreadable` and
`front-matter/field-duplicated`, beside the three that existed. The reader's
schema is now written down in `specification.md` §6.2: a scalar on the line for the
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

**What the generated test found.** `testing.md` §5 asked for generated
documents once the codec was stable; five hundred of them now run from a
seeded vocabulary of owned, foreign, malformed and stray fragments, and every
writable one must serialize to text that reads back to the same model,
serializes again to the same bytes, and carries no owned key twice. The first
run found a defect older than this round: a front matter whose **first lines
were indented** — continuation lines with no key of their own — had those
lines classified foreign, and the writer put the owned block in front of
them; on the next read they continued *it*, and a field was duplicated. The
writer now keeps such a leading run in front of the owned block (`specification.md`
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

**What changed.** The rule of `specification.md` §5.3 — a request that looks like
traversal is refused, not corrected, and containment is verified again after
resolution — now has one implementation per line of defense, so no request
type and no handler can leave it out (`conventions.md` C-U7):

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
them — `conventions.md` alone carried 126 source citations, one per measure.

**What was done about it, in order.** First the gap check, because once the
sources are out of reach a gap can no longer be closed against them: the functional specification was read
end to end against `specification.md`, section by section, together with its open-work
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

All six are now in `specification.md`; the first two are also in `roadmap.md` as the next
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
heights. Lessons kept their weight and lost their footnote. `conventions.md`
was reflowed where the removal left ragged paragraphs.

**What was not done.** `completed-work.md` is a log and was not rewritten; only the three
phrases that pointed outward were reworded. And no functionality was built this
round — the task was to make sure nothing is lost, not to build what was found.

**Verification.** `pnpm run check` green: **722 tests**. Beyond the gate, two
mechanical checks: no occurrence of either project name, or of "functional
template" / "technical template", survives anywhere in the repository outside
build output; and every `§`-reference in `specification.md` and every `C-` measure id
used in any document still resolves. The `conventions.md` rewrap was checked to
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
`roadmap.md` with the suspicion to test first, because a flaky check is worse than
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

A library was considered and not taken (`dependencies.md`): it would have
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

**What a writer would want instead** is recorded in `roadmap.md`: a word-level
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
`conventions.md` C-F4 was written about, demonstrated more convincingly than
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

Written after the fact, together: four rounds went in without their `completed-work.md`
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
dependency decision in `roadmap.md` §2.2.

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
moves it there **and** puts it in that place (`specification.md` §6.8).

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
tree; a group is dragged onto another group (`specification.md` §6.8). The middle half
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
deleting means moving to the **desktop trash** (`specification.md` §6.7). The
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
groups among their siblings in the tree (`specification.md` §6.4). The dragged row dims,
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
in `roadmap.md` where the §10.6 comparison rule belongs.

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

**What exists.** The context menus of `specification.md` §6.4 and §6.5. Right-clicking a
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

**What exists.** The three resizable columns of `specification.md` §8.2 can be dragged,
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

**What exists.** The launcher of `specification.md` §8.5 and §8.6: recent projects with
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
   (`conventions.md` C-U7).

---

## 2026-09-02 — the remaining panes, and Material Symbols

**What exists.** Every pane of `specification.md` §8: the inspector, the outline, source
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
  the component `specification.md` §8.3 demands: fixed height, and the separator
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
things were wrong at once: `specification.md` §10.4 puts front matter in its own area,
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
`roadmap.md` §1.4: copying puts the prefix back, but cut removes only the
selection and leaves an empty `##### ` behind.

---

## 2026-09-02 — dot commands and the gutter menu

**What exists.** Both ways of setting a heading level from `specification.md` §10.2:
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
pass all eleven cases (`conventions.md` C-T11). The suite is itself falsified
by a test: a deliberately broken adapter must fail it, and does.

**New in the core.** `inline.ts` — pure inline markup detection for the
asterisk forms, strikethrough, and code spans, with escapes honored, code spans
shadowing emphasis, and underscores deliberately left alone because that
decision is still open (`specification.md` §10.3). `display-model.ts` — what the editor
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
   heading syntax itself — which `specification.md` §10.2 requires, and requires
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

**Question.** Can CodeMirror 6 carry the display model of `specification.md` §10 —
paragraph-level headings at different sizes, a gutter aligned to measured line
heights, and inline markers hidden except on the cursor's line? It was the
largest open technical decision, and every workbench view waited behind it.

**Method.** `spikes/editor-codemirror`, run in a real Chromium renderer through
Electron rather than a DOM stub. A stub reports zero for every height, which
would have turned three of the six criteria into tests that pass while proving
nothing. The six thresholds were written into `testing.md` §2.8 **before** the
spike ran (`conventions.md` C-T14) and were not touched afterwards.

**Result: 6/6.**

| # | Criterion | Measurement |
| --- | --- | --- |
| 1 | Variable heading sizes | H1 45 px, H2 36 px, body 22.5 px; line blocks plus the 8 px content padding equal the content height exactly |
| 2 | Gutter alignment | Marker top matches its line to 0 px; a heading wrapped over 8 visual rows carries exactly one marker, at the first row |
| 3 | Inline markers | Unfocused line renders without `**`, focused line with them, switching in both directions; document text untouched |
| 4 | Undo per document | One undo reverted only the document it belonged to |
| 5 | Paste | A real `ClipboardEvent` with CRLF, a tab, and Markdown arrived intact and round-tripped |
| 6 | Typing latency | 112,020 characters, 200 keystrokes: median 5.8 ms, p95 6.6 ms against 16 ms |

**Decision.** CodeMirror 6 is accepted as the editing surface (`specification.md` §5.4)
behind an Opera-Incerta-owned `EditorAdapter` interface, with the full
dependency report in `dependencies.md`. Monaco was ruled out on the criterion
that mattered most: it assumes a uniform
line height, and this product shows H1 at twice the body size in the same
document.

**Deliberately not done.** The component was not wired into `apps/workbench`.
A spike answers a question; turning it into production architecture in the same
step is the widening `AGENTS.md` forbids. The integration is `roadmap.md` §1.4,
and the spike stays as evidence until that round carries its own tests.

**Lessons.**

1. **Three of the six criteria first passed or failed for the wrong reason.**
   Heights read before the first real frame are CodeMirror's *estimates*, all
   identical — the very "computed, not measured" mistake the gate exists to
   catch (`conventions.md` C-U5), and it appeared inside the test for that
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
   portable core ran unchanged inside a Chromium bundle — `specification.md` §5.2
   exercised rather than asserted.

---

## 2026-09-01 — licensed under Apache-2.0

**Decision.** Opera Incerta is licensed under the Apache License 2.0.

**What changed.** `LICENSE` at the repository root, and a `license` field in
all seven manifests. `specification.md` §1.1 and §5.1 record it, `specification.md` §19 no longer
lists it as open, and `README.md` and `dependencies.md` point at the file.

**What it does not do.** The repository license does not relicense any
dependency: every package keeps its own license and notice obligations, and
those notices ship with the application (`conventions.md` C-L5). That was
already the rule; it is now stated where a reader of `dependencies.md` meets it
first.

**Verification.** `pnpm run check` green, unchanged at **293 tests**, plus the
desktop production check — the manifests are read by that check, so a malformed
edit would have failed it.

---

## 2026-09-01 — everything specified that needed no decision

**Scope.** Build out every open item whose behavior was already specified and
whose implementation required no pending decision. What remained afterwards is
listed in `roadmap.md`, and each remaining item names the decision or the user
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
- `examples/` — four original fixture projects from the `testing.md` §3
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
(`specification.md` §6.2, §6.3). 43 new tests against 534 lines of implementation.

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
them in the core. The suite covers every item of `testing.md` §2.2 —
round-trip losslessness across nested mappings, sequences, folded blocks,
comments and unkeyed lines; idempotence; namespace ownership including a
top-level foreign `title`, `status`, `topic`, `keywords`, `category`, and
`notes`; indentation ownership including a nested `opera-incerta:`; all three
malformed cases; the absent-block case; LF and CRLF; unknown owned fields; and
fifteen scalar-quoting cases from `2024` through emoji to the empty string.

**Not yet proven:** that the output is standard-conformant to an *independent*
parser. The tests prove that our reader accepts what our writer produces. The
cross-check needs the Markdown/YAML dependency that is not accepted yet, and it
is recorded as `roadmap.md` §1.1 rather than quietly assumed.

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
name (`specification.md` §6.2, now Accepted).

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

**Verification.** Documentation only: `specification.md` §6.2/§6.3, the evidence list in
`testing.md` §2.2, and `roadmap.md`. No code was written — the codec itself is the
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
(`conventions.md` C-N1) exists to stop a product rename from reaching
identifiers that live in user files. Nothing had shipped: no release artifact,
no user project, no stored preference, no committed history. That is the only
condition under which aligning the two names is free, and it no longer holds
after the first written project. `specification.md` §1.1 records the decision and its
superseded predecessor.

**The checkout directory too.** `writers-ide/` was renamed to
`opera-incerta/`. It is the one name that is *not* part of the contract
(`specification.md` §5.2) — nothing in the repository refers to it — but leaving it
would have made every path in a report contradict the project it names. pnpm's
workspace symlinks are relative and survived the move untouched; the session's
working directory had to be moved explicitly, which is the only manual step.

**Verification.** `pnpm install` relinked all four workspace packages under the
new namespace; `pnpm run check` green (**55 tests**, unchanged count);
`pnpm run desktop:smoke` green under `OPERA_INCERTA_SMOKE`. Both were re-run
from the renamed directory: check green, smoke green, evidence written to
`build/desktop/smoke.png` under the new path.

**Lesson.** A repository-wide string replacement rewrote history: the previous
`completed-work.md` entry recorded `writers-ide` as a deliberate decision, and the
replacement silently turned it into `opera-incerta`, making the entry claim the
opposite of what happened. Historical reasoning in `completed-work.md` is a record, not
live text (`conventions.md` C-D3) — a mechanical rename MUST skip it, and this
one had to be repaired by hand.

---

## 2026-09-01 — product named "Opera Incerta"

> **Superseded in part, same day.** The technical name was subsequently aligned
> to `opera-incerta` as well; see the entry above. The names below are the ones
> that were current when this decision was made, and are preserved as written.

**Decision.** The visible product name is **Opera Incerta** (`specification.md` §1.1,
accepted). Chrome, window titles, headings, and documentation titles use it.

**What deliberately did not change.** The technical name `writers-ide` stays:
package namespace `@writers-ide/*`, project marker `.writers-ide/`, bridge
global `writersIde`, channel prefix `writers-ide:`, and the smoke environment
variable. That separation is exactly why the rename touched 18 files and no
identifier a user's files could ever contain (`conventions.md` C-N1).

**Verification.** `pnpm run check` green (55 tests, unchanged count);
`pnpm run desktop:smoke` green — the smoke check asserts the rendered heading,
so it would have failed had the renderer and the shell disagreed about the
name.

**Still open:** trademark clearance before public distribution, and the
application icon (`specification.md` §1.1, §19).

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

**Why these first.** The scaffold had to prove the boundaries that `specification.md`
§5.2 and §5.3 declare, not just describe them. The portable packages compile
with `"types": []`, so a host API cannot slip into them unnoticed. The renderer
consumes `@opera-incerta/core` and `@opera-incerta/desktop-contract`, which proves
the workspace wiring end to end. The shell is sandboxed with context isolation
from the first commit, because retrofitting a security boundary is how it ends
up incomplete.

**Content, not filler.** The three rules in `packages/core` (slug generation
with collision suffix, column-width clamping, computed category text color) and
the contract guards are all fully specified in `specification.md`, so they could be
implemented and tested rather than stubbed. Ports for the two Node adapters are
declared as interfaces only: public module interfaces come before their
implementation (`conventions.md` C-A16), and inventing a filesystem
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
- Visual inspection of that screenshot: the six regions of `specification.md` §8.2 appear
  in order with the specified widths — activity bar, navigator, sheet list, a
  dominant editor, secondary sidebar, activity bar.
- Not run: `desktop:package` and `desktop:make`. They are therefore not listed
  as approved commands anywhere (`conventions.md` C-T19).

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
   clean checkout currently needs that extra step — open item in `roadmap.md` §1.7.

**Deliberately not done.** No `git init`, no commit: initializing a repository
was not requested (`conventions.md` C-G3). Package names in this entry predate
the identifier alignment recorded above. No package carries a `license` field,
because the project license is still open.
