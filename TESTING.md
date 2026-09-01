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

Planned root scripts, mirroring the technical template's gate structure:

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
  literal, with line breaks preserved;
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
  after a newer one MUST NOT overwrite the newer result.

### 2.7 Desktop shell and packaging

Tests MUST cover:

- runtime validation of **every** privileged renderer request, not merely its
  compile-time type;
- rejection of IPC from untrusted pages, and denial of external navigation, new
  windows, permission requests, and webviews;
- context isolation, renderer sandboxing, disabled Node.js integration, and a
  preload surface limited to the versioned bridge;
- path-traversal rejection and containment for every document handle;
- opaque document handles and the configured source-size limit;
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
(`SPEC.md` §5.4). Measured: H1 45 px against body 22.5 px with the line blocks
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
