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
- the computed category text color at and around the luminance threshold; and
- the editor typography rule (`SPEC.md` §13): a base size clamped into its
  bounds and to whole pixels, the heading ratios holding at every base, and
  the curated families each ending in a generic family;
- the block model and the presentation of `SPEC.md` §10.7: a quote marker
  hidden off the focus line and shown on it, the line styled by depth
  either way; a bullet in place of an unordered marker and an ordered one
  kept; a task box turned into a checkbox glyph; a nested item indented by
  its depth inside the list, not counting quotes; a thematic break as a
  rule off focus and as text on it; a hard break as a glyph, but not a
  trailing space on the last line; an escape's backslash hidden, a
  backslash before a letter kept; inline marks on every line, the focus
  line included, and after a heading's hidden prefix; nothing marked or
  hidden inside code. And `packages/markdown`'s translation: quotes with
  their depth, list items with marker, order and nesting, task items by
  the translation's own rule, fenced and indented code, a thematic break,
  every block inside the document, an unclosed quote reaching the end,
  and a table or raw HTML left as paragraphs.

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
- what the standard oracle found (§2.11) staying found: a quoted keyword
  with a space and a hash in it read back whole, a real comment after a
  list or a quoted scalar still dropped; a scalar another YAML reader would
  take for a number, a boolean, a sexagesimal or a date — `0x1F`, `.5`,
  `1:20`, `2019-04-02`, `y` — written quoted; a scalar ending in a colon
  written quoted; and notes a literal block cannot carry — a first line
  beginning with whitespace, a line of spaces only — written as a quoted
  scalar and read back exactly;
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
  treated as a heading — and the fence rules as CommonMark has them: a
  fence closes only on one at least as long and of the same character and
  followed by spaces only, a backtick fence whose info string contains a
  backtick is no fence at all, and four-space indented code is verbatim
  wherever a paragraph is not running — after a blank line, a heading, a
  thematic break, a setext underline, a fence — while an indented
  continuation of a paragraph is not;
- the flanking rule of emphasis: an asterisk followed by a space opens
  nothing, so `2 * 3 * 4` stays arithmetic, and one preceded by a space closes
  nothing;
- the two conflict rules agreeing: a start marker that never closes is text to
  the parser and to the marker check alike;
- a rename detected in the working tree (` R`) consuming its old path like an
  index rename does, rather than inventing a file from it;
- progress figures over the prose, not the file: heading hashes and emphasis
  delimiters are not words, a fenced block counts as written;
- slugs that keep accented letters as their base letter (`Café` → `cafe`)
  while the German umlauts keep their German spelling;
- a category colour stored as `#RRGGBB` whatever the file spelled;
- the refresh coordinator running the follow-up it coalesced even when the run
  before it failed, and the exclusive task saying explicitly whether it ran;
- **the standard oracle** (`test/standard-oracle.test.ts`, accepted
  2026-09-04 after the spike gate of §2.11): every generated sheet's front
  matter read by an independent YAML reader to the same strings the codec
  wrote, and foreign lines of every shape still readable after a round
  trip; and, over several hundred seeded documents built from heading,
  fence, indented-code and text lines, the display transform marking the
  same top-level ATX headings at the same level as the CommonMark reference
  parser, showing verbatim exactly the lines it puts in code blocks, and
  writing back Markdown the reference reads as the heading the author set.
  The oracle's types never reach the core: the test translates them to
  line numbers and plain values first; and
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
  directories otherwise compare unequal on macOS (`CONVENTIONS.md` C-F1);
- **the port's contract, against both implementations** (`SPEC.md` §7):
  creating and reading a project, subprojects one level down, the record
  fallbacks, round trips of structure, categories and sheets, entries listed
  with their kind, directories created with their parents, and a file and a
  directory moved with everything in it — the same suite over the disk and
  in memory;
- a record file that is there and cannot be read failing with
  `structure/unreadable` or `categories/unreadable` rather than reading as
  empty, and records written atomically with no temporary file left behind;
  and
- a sheet keeping its handle across a re-read of the same project, so a save
  in flight during a library edit still names its file.

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
- **one command at a time per repository** (`SPEC.md` §12): two commands
  issued at once against one directory run one after the other, a failed one
  does not block the next, and commands against different directories are
  not held up by each other;
- **git's failures named from its words** (`SPEC.md` §16): the classifier
  as a pure function over recorded stderr for every code it knows, the
  fallback for words it does not, and the adapter's errors carrying the
  classified code — a push without a remote as `git/no-upstream`, a diverged
  pull as `git/not-fast-forward`, a merge with a conflict as `git/conflict`,
  a refused branch deletion as `git/branch-not-merged`;
- **a machine without git** reported as `git/not-installed` rather than as a
  project outside a repository — from a runner that cannot start the
  process, and from the real runner with an empty `PATH`;
- a remote whose address is a local path with a space in it, read whole;
- the upstream and the drift read from the branch header of one
  `status --porcelain=v2 --branch`, as a pure parser over recorded output —
  ahead and behind the right way round, and null without an upstream;
- the `.git` path filter: events confined to `.git` trigger no refresh
  (`SPEC.md` §12);
- creating a repository: `git init` with `main` as the initial branch, in the
  directory it was asked for, leaving nothing staged and no commit;
- the identity commits are by (`SPEC.md` §12): read per scope and null when
  either half is missing; written with `--local` only, and in a real
  repository the global file named by `GIT_CONFIG_GLOBAL` stays empty; and
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
- the status bar (`SPEC.md` §10.5): the adapter contract's cursor after a
  reveal — line and first visible column — and a cursor listener hearing the
  move; the session flipping one sheet's wrapping at a time, keeping a
  flipped sheet where it was when the default changes, forgetting a sheet
  that is gone, and holding the last cursor;
- sheet list: all three density steps, formatted previews, blank-line
  suppression, category badges, and correct row heights on first render after a
  rescan (`CONVENTIONS.md` C-U3);
- outline: listing, jumping, and the deeper-levels toggle;
- inspector: reading and writing owned metadata fields and computing progress
  figures — and the store taking no field it does not own, so an object that
  is not metadata (a DOM Event, once) cannot dirty the sheet;
- the settings registry (`SPEC.md` §13): every preference of the record that
  is not layout registered exactly once, ids stable and unique, defaults
  taken from the record, the density steps exactly those of the preview,
  and the two entries that hold no preference marked by their scope; and
  the layout state's way in for the dialog — a switch set by key and
  stored, the editor's family, size and wrapping stored and handed to the
  editor as one, a size clamped, and a reset restoring the complete default
  record, layout included; and
- rejection of stale asynchronous results: a slow scan or search that completes
  after a newer one MUST NOT overwrite the newer result — and re-reads after
  an external change coalescing, so a change reported during a re-read is
  read after it and never overtaken by it; and
- **the flows** (`SPEC.md` §8.7), driven without a component: each context
  menu offers the entries its target gets and no others; choosing an entry
  puts up the prompt or confirmation with the words the author reads, and
  answering it reaches the bridge with the right request; deleting warns of
  unsaved work on the open sheet and of what a group carries; discarding
  words its warning by tracked or untracked and forgets the editor's version
  afterwards, taking down a conflict prompt about that version with it; a branch switch over unsaved work stops to ask and saves before
  switching on confirmation; publishing asks for an address only when no
  remote is recorded; amending fills the field from the last commit and
  quotes it; the diff, the resolver, and the ignore editor open on what was
  read and open nothing when the read failed;
- the launcher's state without its component: the recent list read and
  re-read after forgetting, an unavailable entry reported without asking the
  bridge, a cancelled chooser changing nothing, a failed creation keeping the
  dialog open with its code, and the menu driving the same actions as the
  buttons;
- **each answer opening a folder can give** (`SPEC.md` §8.6): a project opens
  with no question asked; a folder without one raises the adoption question
  and answering it adopts *that* folder, the display name left to the main
  process; one subproject is offered and opens by its own path; several are
  named and answering does nothing at all; a refused adoption reports its code
  with no question left standing; an outcome of an unknown shape is refused at
  the boundary; and the next open takes a standing question down;
- a drag row described from the model: a sheet placed among the sheets of
  its group by file name, a group among the subgroups of its parent with
  sheets not counted, the root as a destination without a parent, an
  unknown path as null, and the end of a list as one past its last row; and
- the layout state persisting the front matter switches, and typing the
  views it accepts so an unknown one is a compile error rather than a
  silently ignored call;
- the visual system's rule (`SPEC.md` §8.8): a chosen scheme resolving to
  itself and `system` to what the machine reports, the three schemes and eight
  palettes accepted and anything else refused, and both stored by the layout
  state;
- the four editor settings (`SPEC.md` §13, §10.8) handed to the editor as one
  value — family, base size, wrapping, line numbers — each reaching the
  preference record, with the gutter off in the defaults; and the zoom of
  §10.9 beside them: stored, clamped to its bounds, and snapped to 100 % by
  the core's rule wherever it arrives from.

**The editor adapter has one contract suite for every implementation**
(`CONVENTIONS.md` C-T11). It is written without a test framework so that the
same cases run in both places: under Vitest against an in-memory double, and
inside a real renderer against the CodeMirror implementation, as criterion 7 of
`pnpm run spike:editor`. The suite MUST cover opening and reading a document,
the focused line, revealing a line, applying and removing a heading level, a
heading never spreading to the next line, undo and redo, an undo history that
belongs to its document across switches, forgetting a document so that its id
opens fresh afterwards, change notification and unsubscription, and an
idempotent destroy.

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
It waits for **consequences, never for time**: every wait after an action
names the file, row, dialog, or commit it waits for and fails naming it, and
the wait after an input event is one rendered frame. The only fixed waits are
the measurement in the live-status check, where the watch must stay quiet for
three seconds. A run takes about half a minute.

Tests MUST cover:

- runtime validation of **every** privileged renderer request, not merely its
  compile-time type — and of what comes back: the snapshot, the git report,
  and the edit result are refused by the renderer when their shape is wrong;
- that a failure crossing the bridge is a `CodedError` with its words, and
  that any other error crosses as `bridge/failed` with **no** words;
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
  directory carries the slug — and then, in that project, which has no
  repository, source control offers to create one (`SPEC.md` §12): after the
  click, `.git` is in the project root, `HEAD` names `main`, nothing is
  staged, there is no commit, and the panel lists the project as untracked
  (git reports an untracked directory as one entry) — and, the run having
  pointed `GIT_CONFIG_GLOBAL` at an empty file first, the identity question
  follows, its answer is read back with `git config --local`, and the global
  file is still empty;
- opening a folder that is not a project, all three answers through the real
  launcher (`SPEC.md` §8.6): a folder holding two Markdown files and no
  project raises the adoption question, and until it is answered nothing is
  written and no project window appears; answering it makes that folder a
  project named after itself, whose library is the two files it already had,
  their bytes unchanged; the folder above it then holds exactly one project
  and offers it by name; a second project beside it and both are listed with
  no way to say yes, and dismissing the list opens nothing;
- **no dialog nobody asked for**: between any two checks, no dialog is up —
  every check closes what it opens, so a prompt standing at a boundary is
  one the application raised on its own; and the dirty marker clearing when
  an inspector edit is saved through the menu;
- the status bar (`SPEC.md` §10.5): the last line named after a click, the
  column following one keystroke, the bar at its constant height, and the
  wrap switch turning this sheet's wrapping off and on, read off the
  editor's own class list;
- the GFM display (`SPEC.md` §10.7), typed in and measured with computed
  styles: a quote marker hidden and the line ruled at the left, a bullet in
  place of a dash, a ticked box in place of `[x]`, an ordered marker kept,
  a rule in place of `---`, strikethrough as line-through, inline code in a
  monospace face, bold as a heavier weight; the marker back as written on
  the focus line; and the typed markup undone afterwards;
- the line-number gutter (`SPEC.md` §10.8), measured in the real editor:
  absent until the switch in Settings → Editor is turned on; then a number for
  every logical line, running from 1 to the last, the whole column left of the
  heading markers; and, for a line typed long enough to wrap, one number
  whose element is exactly as tall as the wrapped line — the measured height,
  not a computed row. Turned off again, and the typed line undone;
- the visual system (`SPEC.md` §8.8), read as the browser computed it: each of
  the eight packaged files fetched over the renderer's own protocol and
  answering with the WOFF2 signature rather than with an error; the face
  proven to be **in use** by measuring a line of text against the same line in
  a family that does not exist — a declared face that never arrived falls back
  silently, and every name-based question still says yes (this is how the
  first version of this check passed with the file removed); the root carrying
  a resolved scheme and a palette; Dark changing the token set, the editor's
  surface with it, and reaching the preference file; a palette changing the
  accent; and both going back to where they started;
- the editor zoom (`SPEC.md` §10.9), measured with computed styles: the
  slider starting at 100 %; dragged to 150 % it scales the text, the heading
  by its ratio and the gutter by exactly half again, while the sheet list and
  the status bar beside them do not move; the factor reaching the preference
  file; a drag to 102 % landing on the detent at 100 %; and the percentage
  itself taking it back to 100 %, where the sizes are what they were;
- the settings dialog (`SPEC.md` §13): opened through the native menu item
  and through the tool entry of the activity bar; a switch changed in it
  reaching the preference file; Escape closing it with focus back on the
  entry that opened it; the repository's identity shown, changed, and read
  back with `git config --local`; the editor settings measured on the editor
  itself — the base size reaching `.cm-content`, H2 keeping its ratio to it,
  the family and the wrapping following, and the record holding all three;
  the interface language switched to German
  and the dialog, the activity bar, the document's `lang` and the native
  menu item read in German, then back; and Reset restoring the defaults in
  the preference file, with English put back explicitly because the machine
  may be German;
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

### 2.11 Markdown parser spike gate

The Markdown parser (`SPEC.md` §5.4) is a draft decision. It is wanted for
two things: the standard-conformance cross-check that §2.2 requires and the
codec's own tests cannot supply, and the GFM rendering of the roadmap
(`SPEC.md` §18). Before a candidate is accepted, a spike MUST demonstrate the
following, in Node, against the published CommonMark specification examples
(version 0.31.2, 652 examples, fetched by hash into `build/` and never
committed — the specification is CC-BY-SA, the repository is not). The
thresholds are fixed here **before** the spike runs (`CONVENTIONS.md` C-T14).

| # | Criterion | Threshold |
| --- | --- | --- |
| 1 | CommonMark conformance | Every specification example renders to the specified HTML, compared after whitespace and self-closing-tag normalisation; a candidate below 100 % is listed with its failures and not accepted |
| 2 | Source positions | Every heading and code block the parser reports carries the one-based line it starts on, without the translation layer having to re-scan the text |
| 3 | Agreement with the core on headings and code | Over the examples of the sections *ATX headings*, *Fenced code blocks*, *Indented code blocks*, and *Setext headings*, the top-level ATX heading lines the parser reports are exactly the lines `markdownToDisplay` marks as headings, at the same level; and every line the core marks verbatim lies inside a top-level code block the parser reports. Top-level, because the display transform models no containers: a heading inside a block quote or a list item is outside its rule by design (`SPEC.md` §10.1). Zero disagreements — a disagreement is a defect in one of the two and is recorded either way |
| 4 | GFM | Tables, strikethrough, and task list items parse with the candidate's own or its author's extension, from the same package family |
| 5 | Footprint | At most 10 packages installed in total for the candidate, including transitives; no dependency from Git or a URL; every license MIT, BSD, ISC, or Apache-2.0 |
| 6 | Parse time | A document of at least 100,000 characters parses in under 50 ms median over 20 runs |
| 7 | The front matter the codec writes is YAML | For a set of sheets covering every owned field and the quoting cases of §2.2, the front matter that `serializeSheet` produces is read by an independent YAML parser to the same values the codec wrote, with every scalar a string; and the three fixtures of `examples/foreign-front-matter` remain readable after a round trip |

Criterion 7 is measured with a YAML parser that is a candidate in its own
right, on the same footprint and license terms. Criterion 3 is the
cross-check of §2.2 in the form it can take today: the display transform
against an implementation of the standard it claims to follow.

A failing criterion means the candidate is not accepted. It does not mean the
criterion is relaxed.

**Outcome, 2026-09-04: no candidate passed every criterion**, and none is
accepted. markdown-it and commonmark.js render all 652 examples; marked
renders 587, micromark 648. markdown-it has no task list items and carries a
PSF-2.0 dependency; commonmark.js has no GFM; micromark pulls 43 packages
and needs 164 ms for 112,854 characters. Criterion 3 turned out to measure
the core: the conformant parsers agree with each other and disagree with
`markdownToDisplay` in the same eight places, all recorded as findings in
`TODO.md` (two fence defects, one design limit, one cosmetic deviation).
Criterion 7 found four defects in the codec's writer and reader, also in
`TODO.md`; 165 of 181 generated sheets and all three fixtures read back
identically. The measurements and the reading of them are in
`spikes/parser-markdown/README.md`. The decision was taken the same day
(`TODO.md` §2.1): the gate read as two — commonmark.js and `yaml` as the
test oracle, markdown-it for the GFM display with its two deviations
recorded in `DEPENDENCIES.md`. Re-run with `pnpm run spike:parser`.

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

**Built 2026-09-04.** `packages/localization/test` proves the two
catalogues carry the same keys with the same placeholders and every plural
family in both forms, plural resolution for both languages over several
counts by the platform's rules, the fallback for a lost key, and the
resolution of the stored choice. `apps/workbench/test/localization.test.ts`
reads every key the interface uses off the source — `i18n.t('…')`,
`i18n.n('…')`, the bars' `labelKey` — and requires each in both catalogues;
it also refuses a call whose first argument is not a literal key, which is
how user data would get in. The service follows the layout state's choice
without a restart. The smoke (§2.7) switches to German and back and reads
the dialog, the activity bar, the document's `lang`, and the native menu
item.

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
