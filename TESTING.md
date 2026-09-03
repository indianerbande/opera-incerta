# Opera Incerta Testing Strategy

Status: Draft 0.2 — normative for implementation; the source gate, the
desktop production check, and the shell smoke have run in this checkout

Date: 2026-09-01

This document defines how Opera Incerta behavior is verified. `SPEC.md` defines
the behavior; this document defines the **evidence** required to claim that the
behavior works. `AGENTS.md` defines the process around both.

Commands that have actually succeeded in this checkout are listed in
`AGENTS.md`; the rest of the command list below is still **planned**. A command
reaches the approved list only by succeeding here (`CONVENTIONS.md` C-T19).

Layer coverage as of 2026-09-01: §2.1 and §2.2 are implemented and green; §2.3
is implemented for the project adapter; §2.5 is implemented for the pure status
parser; §2.7 is implemented for the source boundary, the renderer protocol, and
the built artifacts. §2.4, §2.6, §2.9, and §2.10 await the code they cover.

## Planned tooling

| Layer | Tool | Note |
| --- | --- | --- |
| Portable core, adapters, contracts | Vitest | Fast, no Electron, no display |
| Angular workbench components | Vitest with the Angular testing utilities | Component behavior, not pixel snapshots |
| Electron shell | A launched packaged-application smoke test | Bridge, security boundary, real file round trip |
| Type safety | `tsc` over source and test projects | Test code is type-checked too |
| Packaging | Electron Forge per host platform | Host-native; see `SPEC.md` §5.1 |

Planned root scripts, one per gate:

- `build` — build every workspace package;
- `typecheck` — build sources and type-check test projects;
- `test` — run the unit, contract, and component suites;
- `check:desktop-production` — verify pinned Electron dependencies, the
  main/preload boundary, context isolation, sandboxing, the content-security
  policy, and required packaged resources;
- `check:assets` — verify hash-pinned icon and font assets, their licenses, and
  their notices;
- `desktop:start` — unpackaged development launch;
- `desktop:smoke` — build and smoke-test the packaged shell;
- `desktop:package` / `desktop:make` — host-native artifacts; and
- `check` — the complete gate: build, boundary checks, typecheck, tests.

All of these MUST run locally after dependency installation and MUST NOT
require network access.

## 1. Testing principles

1. Tests are written **with** the functionality, in the same step — never
   "pulled in later".
2. Test behavior at the lowest useful layer, and again at critical integration
   boundaries.
3. Treat data safety, behavioral correctness, and visual appearance as separate
   concerns with separate evidence.
4. Prefer structural assertions over large opaque snapshots.
5. Use visual golden tests for appearance, never as a substitute for
   invariants.
6. Every rule that can be a pure function is a pure function, lives in the
   portable core, and is unit-tested there rather than through the user
   interface.
7. Make all fixtures original to this project. Never use real manuscript
   content.
8. Make test output deterministic and independent of system fonts, locale,
   timezone, filesystem case sensitivity, and network access.
9. A golden file may change only after the difference has been reviewed and
   understood.
10. A defect that was found once gets a regression test that would have caught
    it, in the same change that fixes it.

## 2. Test layers

### 2.1 Portable core — pure rules

The core (`packages/core`) MUST be testable without Electron, without a DOM,
and without touching the filesystem. Tests MUST cover:

- the slug generator: lowercasing, space replacement, umlaut transliteration,
  removal of other non-ASCII characters, the 40-character cap, the collision
  suffix, and the fallback base for a title that yields no usable slug;
- the sheet file-name generator against an existing file set;
- the column-width clamp: values below minimum, above maximum, and stored
  values that fall outside changed constants;
- the outline visibility filter for every heading level with the deeper-levels
  toggle on and off;
- the recent-projects list: deduplication by path, ordering, and the cap at 10;
- the front matter block height rule, including proportional capping when
  content exceeds the visible-line limit;
- the sheet-list preview size formula for all three density steps, including
  the uniform-size behavior of the compact step;
- word, character, and reading-time counting, including multi-byte characters
  and the treatment of front matter, which MUST NOT be counted; and
- the computed category text color at and around the luminance threshold.

### 2.2 Markdown and front matter codec — data safety

This layer protects the product's central promise (`SPEC.md` §6.3) and its
tests are mandatory before any code writes a user file.

Tests MUST prove:

- **round-trip losslessness**: a file with foreign front matter keys from
  several conventions loads and saves byte-identically apart from the
  `opera-incerta:` block;
- **idempotence**: saving twice produces the same bytes as saving once;
- **namespace ownership** (`SPEC.md` §6.2): only the top-level
  `opera-incerta:` key is owned. A top-level foreign `title`, `status`,
  `topic`, `keywords`, `category`, or `notes` is preserved as foreign and never
  read as the sheet's own field, never overwritten, and never removed;
- **indentation ownership**: a key nested under a foreign mapping is foreign,
  including a nested `opera-incerta:`;
- **malformed namespace**: an `opera-incerta:` value that is not a mapping, and
  a file carrying that key twice, each produce a stable diagnostic and mark the
  file read-only. No write may occur in either case;
- **absent namespace**: a plain Markdown file with no front matter, and one
  with only foreign front matter, both load without error, fall back to the
  file name as display name, and gain an `opera-incerta:` block only on a save
  that needs one — appended without disturbing the foreign keys;
- preservation of multi-line foreign constructs — nested mappings, sequences,
  block literals, comments, and lines without a colon — as consecutive raw
  lines in their original relative order;
- correct reading and writing of the multi-line owned `notes` field as a block
  literal, with line breaks preserved — including content a hand indented by
  more than the writer does, and blank lines inside the block;
- **refusal of every owned-field shape the reader does not read** (`SPEC.md`
  §6.2): a folded block, a keep indicator, an explicit indentation indicator,
  a mapping under a scalar field, a bare block indicator on a single-line
  field, and an owned field that appears twice — each with its stable code on
  its line, the file read-only, and every line of the block still foreign.
  And the property those cases protect, asserted directly: an owned key is
  never written twice, whatever shape it was read from;
- `keywords` as a block sequence read and written back inline, stably;
- quoting read back exactly: a literal backslash before an `n`, a tab, a
  newline, a quote in the middle of a keyword, and a hand-written inline list
  with quotes inside its items;
- a file that begins with a thematic break — a keyless block between two
  rules, a heading under a rule, a lone rule with nothing to close it —
  staying whole in the body and writable, while a keyless block that carries
  a key is still unterminated;
- **generated documents** (§5): seeded, from a vocabulary of owned, foreign,
  malformed, and stray fragments, several hundred of them — none throws, a
  diagnostic and read-only always go together, and every writable one
  serializes to text that reads back to the same model, serializes again to
  the same bytes, carries no owned key twice, and contains every foreign line
  it came in with;
- a file with **no** front matter, with an **empty** front matter block, and
  with an unterminated block, each handled without data loss and without
  invention of fields;
- heading transformation in both directions for all six levels, including a
  line that merely begins with `#` inside a code fence, which MUST NOT be
  treated as a heading;
- that display-to-Markdown output is standard-conformant and readable by an
  independent Markdown parser; and
- that a read failure prevents any write to the same file (`SPEC.md` §16).

Negative tests MUST assert stable diagnostic codes, not message text.

### 2.3 Project and library adapter

Tests MUST cover:

- project detection: a valid project, a plain directory, a directory with
  exactly one subproject, a directory with several subprojects;
- project creation, including the slug directory name, the collision suffix,
  and a `project.json` whose `id` and `created` never change on reopen;
- adoption of an existing directory;
- library scanning: nested groups, the root as the first visible node, and
  files that are not `.md`;
- `structure.json` semantics: applied order, ignored entries for items that no
  longer exist, alphabetical appending of items in no `order`, a missing file,
  a missing directory entry, and a malformed file — each producing the
  documented fallback rather than a failure;
- writing `structure.json` on rename and reorder, with owned fields written and
  unknown fields preserved;
- category loading with a missing file, an unknown UUID on a sheet, and a
  deleted category; and
- path handling: a path that resolves outside the project is rejected, and
  comparisons use canonically resolved paths, because symlinked temporary
  directories otherwise compare unequal on macOS (`CONVENTIONS.md` C-F1).

### 2.4 Watching, saving, and conflicts

Tests MUST prove:

- a structural change in the watched group appears without a manual refresh;
- a content change to the open document while the buffer is unmodified reloads
  silently;
- a content change while the buffer is modified raises the conflict prompt;
- **the application's own save raises neither** — the handler compares actual
  disk content against the loaded baseline and does nothing when they match
  (`SPEC.md` §10.6);
- rapid successive changes are debounced and coalesced into the documented
  number of refreshes;
- a refresh requested during a running refresh schedules exactly one more, not
  a queue;
- read and write guards are independent: a background refresh does not swallow
  a user-triggered write; and
- move and deletion of the open document are reported and handled without data
  loss.

### 2.5 Source control adapter

Tests MUST cover:

- the status parser as a pure function over recorded `--porcelain=v1 -z`
  output: all status codes, renames, untracked files, conflicts counted as
  unstaged, and paths containing spaces and non-ASCII characters;
- repository-root resolution, and absolute paths built against the repository
  root rather than the project root, including a project inside a repository
  subdirectory;
- staging and unstaging individually and as one batch call, with the guard
  applying once per batch;
- commit and push behavior, including the case where the commit succeeds and
  the push fails: the commit stands, the message field clears, and only the
  push error is reported;
- absence of a remote or of credentials surfacing the Git error rather than
  crashing;
- the `.git` path filter: events confined to `.git` trigger no refresh
  (`SPEC.md` §12); and
- a project without a repository leaving the watcher off.

Process invocation is tested against a recorded-output adapter; at least one
integration test MUST run against a real temporary repository.

### 2.6 Workbench renderer

Component and state tests MUST cover:

- column widths: dragging, clamping, persistence, restoration, and — the
  regression that matters — **no width change when the view inside a region
  switches** (`CONVENTIONS.md` C-U1);
- expansion state of the tree surviving a Navigator view switch;
- activity bar behavior: switching views, and collapsing the secondary sidebar
  when its already active view is clicked again;
- panel headers: identical height and separator placement across every panel,
  asserted structurally rather than by screenshot;
- the front matter area: visibility and writability switches behaving
  independently, the owned block never accepting input **including keyboard
  input while focused**, selection and copying remaining possible, and dragging
  only enlarging;
- editor display: heading sizes per level, the gutter label per line, the
  gutter menu changing and removing levels, and Return after a heading starting
  a normal paragraph;
- sheet list: all three density steps, formatted previews, blank-line
  suppression, category badges, and correct row heights on first render after a
  rescan (`CONVENTIONS.md` C-U3);
- outline: listing, jumping, and the deeper-levels toggle;
- inspector: reading and writing owned metadata fields and computing progress
  figures; and
- rejection of stale asynchronous results: a slow scan or search that completes
  after a newer one MUST NOT overwrite the newer result; and
- **the flows** (`SPEC.md` §8.7), driven without a component: each context
  menu offers the entries its target gets and no others; choosing an entry
  puts up the prompt or confirmation with the words the author reads, and
  answering it reaches the bridge with the right request; deleting warns of
  unsaved work on the open sheet and of what a group carries; discarding
  words its warning by tracked or untracked and forgets the editor's version
  afterwards; a branch switch over unsaved work stops to ask and saves before
  switching on confirmation; publishing asks for an address only when no
  remote is recorded; amending fills the field from the last commit and
  quotes it; the diff, the resolver, and the ignore editor open on what was
  read and open nothing when the read failed.

**The editor adapter has one contract suite for every implementation**
(`CONVENTIONS.md` C-T11). It is written without a test framework so that the
same cases run in both places: under Vitest against an in-memory double, and
inside a real renderer against the CodeMirror implementation, as criterion 7 of
`pnpm run spike:editor`. The suite MUST cover opening and reading a document,
the focused line, revealing a line, applying and removing a heading level, a
heading never spreading to the next line, undo and redo, an undo history that
belongs to its document across switches, change notification and
unsubscription, and an idempotent destroy.

A suite that only one implementation can satisfy is describing that component
rather than a boundary, which is what the double exists to reveal. The suite is
itself falsified by a test: a deliberately broken adapter must fail it.

### 2.7 Desktop shell and packaging

The shell is checked by the desktop smoke: `apps/desktop/src/smoke/`, run
by `pnpm run desktop:smoke`. It starts the real shell through `startShell`
with a copy of the fixture in place of the directory chooser, a directory in
place of the desktop trash, and a temporary user-data directory, and drives
the real renderer with real input events. `apps/desktop/src/smoke/README.md`
says how a check is written, why the order of the run matters, and how a
failure is debugged; `main.ts` there holds the whole order, top to bottom.
The smoke is bundled to `dist/smoke.cjs`, separately from the production
entry, and the production check fails if any of it reaches `dist/main.cjs`.

Tests MUST cover:

- runtime validation of **every** privileged renderer request, not merely its
  compile-time type;
- rejection of IPC from untrusted pages, and denial of external navigation, new
  windows, permission requests, and webviews;
- context isolation, renderer sandboxing, disabled Node.js integration, and a
  preload surface limited to the versioned bridge;
- path-traversal rejection and containment for every document handle, and for
  **every relative path a request carries**: the contract guard is tested
  against each request type that has one, the containment helper against a
  symlink that leaves the project, and the smoke asks the real bridge to diff,
  version, resolve, discard, watch, delete, create, and place a path out of the
  project and expects the contract's refusal on each — not a git error, because
  the request must never reach git;
- opaque document handles and the configured source-size limit;
- the heading gestures of `SPEC.md` §10.2, driven by real input events rather
  than by calling the adapter: typing `.h3 ` converts the line and removes the
  command text; clicking a gutter marker opens a menu whose active level is
  marked, whose choice applies, and which closes afterwards;
- dragging a column divider with real pointer events: the column widens, a
  view switch afterwards leaves it exactly where it was, and the width that was
  applied is the width found in the preference file;
- creating a project from the launcher: the dialog previews the slug of the
  typed name, Create is offered only with both a name and a location, and the
  project that appears on disk carries the display name unchanged while its
  directory carries the slug;
- the native menu of `SPEC.md` §8.5: every declared command has an item with
  its specified accelerator, the items are enabled only when their command is
  possible, saving and closing are exercised **through the menu item** rather
  than through a synthetic keystroke — which bypasses accelerators — and the
  Edit menu still carries every platform editing role;
- the window choreography of `SPEC.md` §8.5: the application starts on the
  launcher, opening a project presents the workbench and dismisses the
  launcher, and closing the project brings the launcher back with that project
  listed as recent and available;
- the document round trip against a **copy** of the smoke fixture: opening a
  project populates the tree and the sheet list, selecting a sheet loads it,
  typing marks it dirty, `Cmd/Ctrl+S` writes it, and the file on disk carries
  both the edit and its untouched front matter — read from the filesystem
  rather than through the bridge, so what is checked is the manuscript and not
  the application's belief about it;
- that front matter never appears inside the writing surface;
- that switching group and sheet loads the other document and leaves nothing of
  the previous one behind;
- creating and renaming, through the real context menus (`SPEC.md` §6.4, §6.5):
  a sheet created from a group's menu appears on disk under the slug of its
  title, opens in the editor, and the sheet list beside it shows the group that
  holds it; renaming a **closed** sheet rewrites the file's `title` and leaves
  its file name alone; renaming the **open** one changes nothing on disk and
  shows the new name, marked dirty, in the header, the list, and the inspector;
  a created group takes the slug as its directory and its display name goes to
  `structure.json`; renaming it changes that entry and nothing else. The file
  and directory names on disk are read from the filesystem, so what is checked
  is that nothing moved;
- showing what changed (`SPEC.md` §12): a sheet opens **word by word**, with
  only the words that changed marked and the rest of the file readable around
  them, and Git's line view one click away; the line view carries the saved
  line as added and its four header lines as header — the case where `--- a/…`
  would otherwise read as a removal — while an untracked file shows additions
  and **no** removals at all;
- the word comparison itself, against its invariant rather than against
  examples: for two hundred generated pairs of prose, the kept and removed
  parts reproduce the first text exactly and the kept and added parts the
  second. Nothing invented, nothing lost. The bound is checked too: two texts
  with nothing in common are reported as one replacement rather than searched
  forever;
- discarding a change (`SPEC.md` §12), in both kinds and with the confirmation
  refused first: cancelling keeps the file, an untracked file arrives in the
  trash rather than being removed, a tracked one is byte-identical to
  `git show HEAD:<path>` afterwards, and the editor's unsaved version of it is
  gone — with no conflict prompt about the change that was just discarded;
- a **real conflict**, made by changing the same passage on both sides
  (`SPEC.md` §12): the merge is confirmed, the panel reports it as in progress,
  the sheet full of markers is marked read-only in the editor, the resolver
  shows both versions with the differing words marked and counts what is left
  to decide, and applying a decision writes the file with the chosen text and
  **no marker** in it. Committing afterwards produces a commit with two
  parents, checked with `git rev-list --parents`;
- branches (`SPEC.md` §12): listed with the checked-out one marked, created and
  switched to, and an unmerged one refused deletion **in git's own words**. The
  rule the application adds is checked where git cannot help: with unsaved work
  in the editor a switch stops to ask, and declining leaves the branch as it
  was. That a *committed* change stays on its branch is checked by reading the
  file after switching — a change that is only saved belongs to no branch and
  follows, which is git's behaviour and not a defect;
- amending the last commit (`SPEC.md` §12): the panel commits, then amends, and
  the result is read from git — `git log -1` carries the new message and
  `git rev-list --count` is unchanged, so the commit was replaced rather than
  followed by another. The message the commit already had is offered in the
  field, and the question **quotes it**, because the field is behind the dialog.
  After a push the control is gone, which is the rule that a published commit is
  not rewritten;
- keeping files out of the repository (`SPEC.md` §12): an untracked file is
  ignored from its row, and `.gitignore` is read from disk to see the path
  arrive; the list opens as text, takes another pattern, and is read back again.
  The ignored file is still on disk afterwards — ignoring is not deleting — and
  its row is gone from the change list. The row's file name must be readable
  **at rest**: the invisible row controls take no width until the row is
  pointed at, checked by comparing the name's scroll width against its box;
- publishing a branch through the interface (`SPEC.md` §12), which is also how
  the remote in the checks below comes to exist: the panel offers it while the
  branch tracks nothing, an address of the command-running kind is **refused
  before git sees it** and recorded nowhere — checked by asking git what
  remotes it has — and the real address publishes, after which the upstream is
  reported and the manuscript is in the remote, read with `git ls-tree`;
- fetching and pulling against a **real remote** (`SPEC.md` §12), with a second
  working copy standing in for the other machine: after a fetch the panel says
  one commit behind and **no file has appeared** in the working tree; after a
  pull the commit is in and the panel says up to date. The remote is created
  inside that check rather than in the fixture, because an earlier check needs
  a push to fail for want of one. That a pull can never merge is checked where
  it is decided: with diverged histories, git refuses and nothing is written;
- the live status of `SPEC.md` §12: with the panel on screen, a file written
  behind the application's back appears in the change list without anyone
  asking — and then the watch **stays quiet for three seconds**, counted in the
  main process. That second half is the check for C-F4: `git status` writes
  inside `.git` on every read, and a watcher without the filter refreshes
  itself for as long as the panel stays open;
- the commit model of `SPEC.md` §12 against a **real repository**: the smoke
  project is `git init`-ed without a commit, which is the state a freshly
  created project is in. Everything is staged in one batch through the
  tri-state header, one file is unstaged where there is no `HEAD` to resolve
  against, the commit is read back with `git log` and its contents with
  `git show`, and a push without a remote is confirmed to keep the commit and
  to report **Git's own words** rather than a code. Identity and signing are
  configured locally in the fixture, so the check neither depends on nor trips
  over how the machine is set up;
- page categories end to end (`SPEC.md` §6.6): defined in the manager and
  found in `categories.json`, assigned in the Inspector, shown at once as a
  badge in the sheet list, and written into the sheet on save. The badge's text
  colour is read from the **computed style**, so the rule is checked where it
  lands rather than where it is written: a dark background must carry white
  text;
- the front matter area (`SPEC.md` §10.4): hidden until asked for, then a
  foreign and an own block carrying what the file carries; read-only presented
  as a **selectable** control rather than a disabled one, and only the foreign
  block turning writable. The height is checked as the property it is — what is
  visible against what there is to see — rather than as a number: a block whose
  last line sits under a horizontal scrollbar passes a check about pixels and
  fails this one;
- the same rule again with **nobody pressing anything** (`SPEC.md` §10.6, MVP
  §17.13 and §17.14): a file written behind the application's back reaches the
  editor by itself, raises the prompt by itself when work is unsaved, and a
  sheet appearing in the group on screen shows up in the list — all without a
  manual refresh. The watcher adapter is checked separately against the real
  filesystem, including the two cases that decided its shape: a file survives
  being replaced by a rename, and what Git writes about itself is ignored;
- the comparison rule of `SPEC.md` §10.6 at the explicit re-read: with unsaved
  work in the editor and the file changed underneath — written from the main
  process, behind the application's back — the reload asks instead of
  discarding, the author's text is still in the editor **while** it asks,
  Escape keeps it, and nothing of it reaches the file. With nothing unsaved the
  same change is taken silently. The negative half matters as much as the
  positive: a prompt that appeared after the work was gone would pass a check
  that only asks whether a prompt appeared;
- placing, by a real pointer drag from one library column into the other
  (`SPEC.md` §6.8): a sheet dragged from the sheet list onto a group in the
  tree, that group then dragged into a third, and a fourth dropped **between**
  the children of another group — after each, the file is read from its new
  place on disk, `structure.json` is checked for the re-keyed entry, for the
  absence of the old one *and* for the recorded position, and the editor is
  checked to be holding the same document it held before. A screenshot taken
  while the pointer is still down shows the destination highlighted and the
  dragged row dimmed;
- deleting into the trash (`SPEC.md` §6.7): a sheet and a group leave the
  project and **arrive** in the trash — the group with its sheet inside —
  `structure.json` forgets them, and the selection lands on what is left.
  Both negative cases are checked by proving the dialog **closed**: a
  confirmation that ignores a key would otherwise pass a check that only asks
  whether the file is still there. Under the smoke the trash is a directory of
  its own, so a check does not leave rubbish in the author's own trash on every
  run; that the destination is the desktop trash in the application is one line
  of wiring, and a unit test proves the session itself never removes a file;
- reordering by a **real pointer drag** (`SPEC.md` §6.4): a sheet dragged past
  the row below it and a group dragged past its sibling both change the order
  shown *and* the order recorded in `structure.json`, and neither drag opens or
  selects what it moved. A screenshot is taken while the pointer is still down,
  because the insertion line exists only during the drag — a check that never
  looks at it cannot say the author sees anything;
- the cursor rules around hidden heading syntax, through real keys and the real
  clipboard: the line-start shortcut lands on the first visible character,
  copying a heading yields Markdown with its prefix, cutting one removes the
  prefix along with the text and leaves an ordinary empty line, the first
  Backspace at that position removes the level while keeping the text, and a
  second merges with the line above;
- native open, save, save-as, cancellation, failure reporting, dirty titles,
  and unsaved-close protection;
- empty startup, context-sensitive close behavior returning to an empty
  workspace, and full clearing of derived state (`SPEC.md` §8.5);
- the quit guard: quitting the application does not re-open the welcome window,
  and closing the welcome window does not double-quit;
- platform window lifecycle: closing all windows quits on Windows and Linux,
  and keeps the application active on macOS;
- installation-local session state persisting only safe presentation values —
  never source, handles, or filesystem paths;
- packaging without development sources or an application `node_modules` tree;
- required fonts, icons, licenses, and notices present in the packaged
  application, with hash-pinned assets byte-identical;
- launch and a real file round trip from the **packaged** application; and
- installer or archive integrity, installation, launch, and uninstall on every
  supported release platform.

Automated tests MAY substitute adapters for native dialogs, but at least one
**manual** file round trip and close-protection check is required on each
supported platform before a release. Artifact evidence from one operating
system is evidence only for that operating system (`CONVENTIONS.md` C-P3).

### 2.8 Editor component spike gate

The editing component (`SPEC.md` §5.4) is a draft decision. Before it is
accepted, a spike MUST demonstrate, in a real rendering engine rather than a
DOM stub, that the component can do the following. The thresholds are fixed
here **before** the spike runs, because a threshold chosen after a measurement
proves nothing (`CONVENTIONS.md` C-T14).

| # | Criterion | Threshold |
| --- | --- | --- |
| 1 | Different font sizes for heading lines in one document | An H1 line block is measurably taller than a body line; total content height equals the sum of the line blocks, so scrolling stays correct |
| 2 | A gutter column aligned to line heights, including wrapped lines, with heights **measured, not computed** (`CONVENTIONS.md` C-U5) | Every gutter marker's top edge is within 1 px of its line's top edge; a wrapped line carries exactly one marker, at its first visual row |
| 3 | Decoration-based hiding of inline markers, with the cursor's line exempt | The rendered text of an unfocused line contains no `**` delimiters; the focused line shows them; moving the cursor switches both within one update |
| 4 | An undo history per document that survives switching documents | After editing A, switching to B, and returning, one undo reverts only A's edit, and B is untouched |
| 5 | Paste from an external application without corrupting the display model | Pasted text containing CRLF, tabs, and Markdown syntax arrives in the document byte-for-byte, and the display transform round-trips it unchanged |
| 6 | Typing latency in a document of at least 100,000 characters | The 95th percentile of a single-keystroke transaction stays under 16 ms — one frame at 60 Hz |

A failing criterion means the component is not accepted. It does not mean the
criterion is relaxed.

**Outcome, 2026-09-01: CodeMirror 6 passed all six criteria** and is accepted
(`SPEC.md` §5.4). A seventh criterion was added when the adapter was built: the
real implementation runs the editor contract suite of §2.6 and passes all
eleven cases, the same ones the in-memory double passes. Measured: H1 45 px against body 22.5 px with the line blocks
plus padding accounting for the full content height; marker tops matching their
lines to 0 px, including a heading wrapped over eight visual rows carrying
exactly one marker; the focus exemption switching in both directions with the
document text untouched; one undo reverting only the document it belonged to; a
real `ClipboardEvent` arriving intact; and a 6.6 ms p95 keystroke latency in a
112,020-character document. Re-run with `pnpm run spike:editor`.

Two of the six initially failed, and both times the spike's measurement was
wrong rather than the component: heights read before the first real frame are
CodeMirror's estimates, and an unexplained 4 px offset turned out to be the
content padding. A third criterion passed while proving nothing — its wrapped
line carried no marker at all — and was rewritten to wrap a heading. The
thresholds above were not touched.

### 2.9 Modules and registry

Tests MUST prove:

- registration and resolution of modules through their interfaces;
- that a missing, failing, or slow module cannot crash the core;
- that export modules strip front matter from their output;
- that import modules honor the collision rules; and
- that an AI provider is addressed only through its interface, with request
  construction and response handling tested against recorded responses. The
  real external call is verified manually before a release, never in the
  automated suite.

### 2.10 Localization

Tests MUST prove:

- every key used by the interface exists in every shipped catalogue;
- plural resolution is correct for both languages and every documented count
  class — because a wrong key falls back **silently**, this MUST be asserted
  rather than assumed;
- user data (category names, titles, file names, Git output) is not passed
  through the localization service; and
- switching the language updates the workbench and the native menus without a
  restart.

## 3. Fixture catalog

All fixtures are original to this project and live under `examples/`.

The minimum catalog:

- **empty project** — `.opera-incerta/project.json` only;
- **flat project** — a handful of sheets in the root, no `structure.json`;
- **nested project** — several levels of groups, explicit `structure.json` with
  display names and order;
- **foreign front matter project** — sheets carrying keys from several
  conventions, including nested mappings, sequences, block literals, comments,
  and a nested key colliding with an owned key name;
- **stale structure project** — `structure.json` referencing removed items and
  omitting present ones;
- **broken metadata project** — malformed `project.json`, `categories.json`,
  and `structure.json`, each in its own variant;
- **unicode project** — file names, titles, and content with non-ASCII
  characters, combining marks, and emoji;
- **large project** — a generated project large enough to expose scan and
  search performance regressions; and
- **repository project** — a project inside a Git repository subdirectory, for
  root-resolution tests.

No copied third-party example may become a fixture.

## 4. Determinism and stability

Every codec fixture MUST be processed repeatedly in fresh processes, comparing:

- the parsed sheet model;
- the serialized file bytes;
- the resolved library tree and its order; and
- the outline.

Metamorphic tests MUST confirm that these changes do **not** alter the parsed
model or the serialized owned fields:

- line-ending changes (LF and CRLF);
- trailing whitespace changes;
- reordering of foreign front matter keys, which MUST be preserved rather than
  normalized; and
- unrelated body edits.

Tests MUST fix locale, timezone, and any font used for measurement, and MUST
NOT depend on filesystem ordering.

## 5. Property-based and fuzz testing

Once the codec is stable, generated tests SHOULD create bounded, valid
documents and assert:

- parse-then-serialize equals the original for every generated input;
- serialize-then-parse yields an equal model;
- no generated input produces an exception rather than a diagnostic; and
- display transformation followed by its inverse is the identity.

Invalid-input fuzzing SHOULD target the front matter reader and the display
transform, and MUST enforce time and memory limits. Corrupt input must produce
a diagnostic, never a partial write.

## 6. Performance tests

Targets are set after the first spike. Benchmarks MUST separate:

- library scanning;
- front matter parsing across many files;
- preview generation for the sheet list;
- display transformation of one large document;
- typing latency in a large document; and
- full-text search.

The benchmark set MUST include a small realistic project and a deliberately
dense upper-bound project. Performance work MUST NOT trade away determinism or
data safety without an explicit specification change.

## 7. Dependency and license checks

Continuous validation MUST eventually include:

- lockfile integrity;
- a dependency license inventory;
- detection of prohibited or unknown licenses;
- vulnerability reporting;
- verification that no test makes a network request; and
- verification that bundled fonts and icons have documented redistribution
  rights, with hash-pinned bytes.

`pnpm run check:assets` implements the last of these for the packaged icons: it
verifies each file's SHA-256 against a pinned value, requires the licence and
the source notice beside them, and rejects an SVG containing a script, an
external reference, or a data URI — an asset that can reach out is not a
decorative asset. `check:desktop-production` additionally requires the icons
and both notices in the built renderer.

A release pipeline MUST additionally inventory the installer payload and verify
platform signatures and notarization where applicable.

## 8. Visual evidence and golden procedure

Visual goldens apply to the rendered workbench, not to file content. Anyone
updating one MUST:

1. state the specification change or defect that requires it;
2. inspect the structural difference first;
3. view and visually inspect every affected screen at its intended size;
4. confirm that unrelated views did not move;
5. include before/after evidence in the review when practical; and
6. update the golden only after the change is understood.

Bulk acceptance of new goldens without inspection is prohibited. A passing unit
test is never reported as visual validation (`AGENTS.md`, documentation
discipline).

## 9. Definition of done for implementation changes

An implementation change is complete only when:

- behavior matches `SPEC.md`;
- relevant unit and integration tests exist and pass;
- negative behavior has diagnostics tests;
- deterministic output has been checked;
- affected visual output has been inspected;
- the required commands pass;
- no undocumented dependency or asset was added; and
- the final report distinguishes implementation, automated validation, visual
  validation, commit, and push status.

## 10. MVP test gate

Before the MVP may be called complete:

- every acceptance criterion in `SPEC.md` §17 has a named test or a reviewed
  manual verification;
- the front matter round trip passes for every fixture in the catalog,
  including the deliberately hostile ones;
- no test writes outside its temporary directory;
- library, editor, inspector, outline, categories, and source control pass
  their layer suites;
- the watcher suite passes, including the own-save case;
- the security-boundary suite passes in the **packaged** application;
- open, save, dirty-state protection, packaged launch, and the native installer
  pass on macOS, Windows, and Linux, each verified natively;
- the editor component spike gate (§2.8) has passed and the component is
  recorded as accepted;
- no network access is required at any point;
- dependency and asset licenses are documented; and
- a human has used the packaged application to write, structure, and save a
  real chapter, and has reported the result.
