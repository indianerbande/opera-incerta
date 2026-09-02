# Opera Incerta Specification

Status: Draft 0.1

Date: 2026-09-01

Product name: Opera Incerta

Technical name: `opera-incerta` (package namespace `@opera-incerta/*`, project
marker directory `.opera-incerta/`, bridge global `operaIncerta`)

This document defines the intended product and its architectural boundaries.
No source code exists yet; every section is a design commitment, not a
description of an implementation. Sections marked **Accepted** are the current
project direction. Sections marked **Draft** are open to change and MUST be
confirmed before code depends on them.

The terms MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY express requirement
strength in this specification.

Two repositories are referenced as templates and are never copied verbatim:
`thothpad` (functional template, native macOS/Swift) and `c4ml` / C4thedral
(technical template, Electron/Angular/pnpm monorepo). See `AGENTS.md`.

## 1. Product statement

**Status: Accepted.**

Opera Incerta is a local desktop application for **collecting and writing texts
and assembling them into a structured book manuscript**. It supports the whole
path from a first collected thought to a finished, structured manuscript, and
it is measured throughout against two criteria: **overview** and **practical
operability**.

It combines:

- a library whose structure *is* the folder structure on disk;
- plain Markdown files as the only source of truth;
- author metadata carried inside each file's YAML front matter;
- a writing editor that displays formatting instead of raw syntax while writing
  clean standard Markdown to disk;
- an IDE-like workbench shell with switchable side areas;
- read-only-first Git integration for synchronization across devices and
  platforms; and
- an extension model for export, import, and AI actions.

The three-column arrangement (project tree · sheet list · editor) takes Ulysses
as a starting point. Opera Incerta is expressly not a reimplementation of it:
scope, interaction, and architecture develop independently, and prior art is
consulted only as public capability evidence (§4).

### 1.1 Product and technical naming

**Status: Accepted (2026-09-01).**

The visible product name is **Opera Incerta**. Application chrome, window
titles, native menus, About copy, development wrappers, executables,
installers, and archives MUST use that exact spelling.

**`opera-incerta` is the technical name** of the package namespace
(`@opera-incerta/*`), the project marker directory (`.opera-incerta/`), the
bridge global (`operaIncerta`) and its channel prefix, diagnostic families,
storage keys, and every other compatibility-sensitive identifier.

The two names are separate concepts that currently share a word, and they MUST
NOT be treated as one. From this point on:

- a change to the visible product name MUST NOT touch any identifier above;
- existing projects, settings records, application data, and scripts MUST NOT
  require migration because the product was renamed; and
- a future divergence between the two names is normal, not an inconsistency to
  be tidied away (`CONVENTIONS.md` C-N1).

**Superseded note (2026-09-01).** An earlier version of this section kept
`writers-ide` as the technical name while the product became Opera Incerta,
which the naming rule expressly permits. The identifiers were then aligned by
explicit decision, because the project had no released artifact, no user file,
and no stored preference — the only moment at which such an alignment is free.
That window is now closed: the next product rename does not get to repeat it.

**License.** Opera Incerta is licensed under the Apache License 2.0, the same
license as the technical template. Third-party dependencies keep their own
licenses and notices; the repository's license does not relicense them
(`CONVENTIONS.md` C-L5).

Still open: trademark clearance for the name before public distribution, and
the application icon. The icon, when it exists, is installation chrome only; it
MUST NOT appear inside a manuscript or an exported document.

## 2. Goals

**Status: Accepted.**

1. The author's texts remain ordinary Markdown files that any other tool can
   read and edit without loss.
2. Metadata never separates from its text, including under external moves,
   renames, and Git merges.
3. The application never destroys content it does not own, including front
   matter written by other tools.
4. The user always knows where they are: a stable region layout, stable panel
   geometry, and no view switch that silently changes the workspace.
5. Writing is comfortable: the editor shows headings as sizes, inline markup as
   real emphasis, and keeps raw syntax available where the cursor is.
6. The application works fully offline. Nothing about normal operation requires
   a network, a service, or an account.
7. Synchronization across macOS, Windows, and Linux uses Git, which the author
   already controls, instead of a proprietary sync service.
8. New capabilities arrive as modules behind declared interfaces, without
   changes to the core.
9. Identical input produces identical output; every rule that can be a pure
   function is one, and is unit-tested.
10. The same product runs natively on macOS, Windows, and Linux with the same
    features and the same file format.

## 3. Non-goals for the first release

**Status: Accepted.**

- No reimplementation of Ulysses, Scrivener, or Obsidian, in scope or in code.
- No database, cloud service, or account as the primary data store.
- No multi-user collaboration or real-time co-editing.
- No CloudKit/iCloud/proprietary sync. Git is the synchronization mechanism.
- No web deployment. The Angular renderer is an Electron renderer, not a hosted
  web application; any development harness exists only for isolated testing.
- No mobile or tablet platform. The functional template plans an iPadOS/iOS
  port; Electron cannot deliver that, so the equivalent investment goes into
  Windows and Linux parity instead (§5.5). A future mobile client would be a
  separate product sharing only the file format.
- No WYSIWYG editing beyond the specified display model — the file format stays
  plain Markdown.
- No automatic AI action on the author's text without an explicit user request.
- No telemetry, and no transmission of manuscript content anywhere the author
  did not explicitly direct it.

## 4. Originality and prior-art policy

**Status: Accepted.**

Opera Incerta studies established writing tools and IDEs as sources of general
capability insight, not as material to copy. Provenance is deliberately
explicit: the three-column library arrangement is a common writing-application
pattern; activity bars, secondary sidebars, and a bottom panel are established
IDE shell concepts; front matter is a shared Markdown-ecosystem convention.
The exact object separation, display model, project format, settings contract,
and implementation are original to this project.

`thothpad` is the user's own prior work and its specification is a legitimate
requirements source. Its Swift/AppKit implementation is not portable and MUST
NOT be transliterated: each behavior is re-derived as a platform-neutral
requirement here and implemented natively for the Electron/Angular stack.

All fixtures, sample projects, and visual assets MUST be created for this
project. Real manuscript content MUST NOT be used as test data.

## 5. Platform and technology

### 5.1 Runtime stack

**Status: Accepted.**

| Aspect | Decision |
| --- | --- |
| Application type | Local desktop application, Electron shell |
| Target platforms | macOS, Windows, Linux — equal feature scope |
| Language | TypeScript, strict mode, ESM |
| Renderer UI | Angular (standalone components, Signals, zoneless change detection) |
| Main process | Node.js — filesystem, watching, Git, native dialogs, menus, packaging |
| Portable core | Runtime-neutral TypeScript, no DOM and no Node.js APIs |
| Workspace | pnpm workspace monorepo, `packages/*` plus `apps/*` |
| Build | `tsc` for packages, Angular CLI for the renderer, esbuild for main/preload bundles |
| Test runner | Vitest |
| Packaging | Electron Forge, host-native per platform |
| Text file format | Markdown (`.md`), UTF-8, one sheet is one file |
| Project metadata | JSON under `.opera-incerta/` in the project directory |
| Synchronization | Git, driven by the author; the application only reads and writes the working tree |
| License | Apache License 2.0 |

Node.js and pnpm versions are pinned in the root manifest once the workspace
exists, and the packaging path MUST fail early and clearly on an unsupported
runtime rather than silently downloading one (`CONVENTIONS.md` C-P1).

### 5.2 Repository layout

**Status: Accepted, names draft.**

The checkout directory name is not part of the contract; only the identifiers
inside the repository are.

```text
opera-incerta/
├── AGENTS.md            working process and invariants
├── SPEC.md              this document
├── TESTING.md           required validation evidence
├── CONVENTIONS.md       inherited design and handling measures
├── DEPENDENCIES.md      dependency purpose, license, boundary (from first dependency)
├── PLATFORMS.md         native build and verification matrix (from first packaging)
├── TODO.md / DONE.md    open and completed work (from first implementation round)
├── package.json         workspace root, pinned engines, check scripts
├── pnpm-workspace.yaml
├── apps/
│   ├── desktop/         Electron main process, preload bridges, packaging
│   └── workbench/       Angular renderer (the workbench UI)
├── packages/
│   ├── core/            portable domain: codec, transforms, pure rules
│   ├── desktop-contract/ versioned IPC contract shared by main and renderer
│   ├── project-node/    Node.js project/filesystem adapter
│   └── git-node/        Node.js Git adapter (process wrapper)
└── examples/            original fixture projects
```

`apps/desktop` owns native lifecycle, menus, dialogs, filesystem persistence,
watching, Git process invocation, and distribution artifacts. It MUST NOT own
document semantics. `packages/core` owns semantics and MUST NOT reach the
filesystem, the process table, the network, or the DOM.

### 5.3 Process and trust boundaries

**Status: Accepted.**

- The renderer runs with `contextIsolation: true`, `sandbox: true`, and Node.js
  integration disabled.
- The preload script exposes exactly one **versioned** Opera Incerta bridge. Every
  privileged request is validated in the main process at runtime, not merely
  typed at compile time.
- The renderer never receives filesystem paths as authority. Documents are
  addressed by **opaque handles** issued by the main process; the main process
  resolves them and enforces containment, size limits, and path-traversal
  rejection.
- Opening a project hands the renderer a snapshot: the project record, the
  library tree with **relative** paths, and one opaque handle per sheet. The
  renderer addresses a sheet by looking its handle up, never by sending a path
  back. Handles are minted per open, so one from a previous project resolves to
  nothing.
- The renderer is served from an **owned local scheme**,
  `opera-incerta://app/`, rooted at the built renderer directory. `file://`
  is not used: it would give the page an origin from which relative requests
  can reach the whole disk.
- A request that looks like traversal — a `..` segment, its percent-encoded
  spelling, an encoded separator, a NUL byte — is **refused**, not corrected.
  Silently resolving it would serve a different file than the one requested,
  which is contained but wrong. Containment is verified again after resolution,
  as a second line of defense.
- IPC from untrusted pages is rejected; external navigation, new windows,
  permission requests, and webviews are denied.
- A local content-security policy applies to all renderer content.
- Expensive work — full library scans, full-text search, large-document parsing
  — MUST run off the renderer UI thread (Web Worker in the renderer, or the
  main process behind the bridge).
- Any secret (an AI provider API key) is stored through Electron `safeStorage`,
  never in the plain preference record and never in the project directory.

### 5.4 Dependency decisions

**Status: The editing surface is accepted; the remaining entries are draft and
each requires the report in `AGENTS.md` before acceptance.**

**CodeMirror 6 is the accepted editing surface (2026-09-01).** It passed all six
criteria of the spike gate in `TESTING.md` §2.8, measured in a real rendering
engine: heading lines at different sizes in one document, a gutter aligned to
measured line heights across a heading wrapping over eight visual rows, inline
markers hidden except on the cursor's line, per-document undo across document
switches, an intact paste, and a 6.6 ms p95 keystroke latency in a
112,000-character document against a 16 ms threshold. The evidence lives in
`spikes/editor-codemirror`.

| Capability | Candidate | Boundary that keeps it replaceable |
| --- | --- | --- |
| Text editing surface | CodeMirror 6 (**accepted**) | An Opera-Incerta-owned `EditorAdapter` interface; the display model stays in the core, and the component only renders it |
| Markdown parsing | A CommonMark/GFM parser (e.g. `remark`/`micromark` family) | The parser produces a syntax representation that is translated into Opera-Incerta-owned domain types; parser AST types MUST NOT become the public model |
| Filesystem watching | Node.js `fs.watch` with a debouncing layer, or `chokidar` | One `LibraryWatcher` interface in the Node adapter |
| Git | The locally installed `git` executable via `child_process` | A `GitService` interface; no Git library dependency, no bundled Git |
| Front matter | Own line-preserving reader/writer (§6.3) | Not a general YAML parser; see the reasoning in §6.3 |

Note on the editing surface: the technical template uses Monaco because it
edits source code. Opera Incerta displays headings at **different sizes in the
same document**, which a fixed-line-height code editor does not support well.
CodeMirror 6 supports variable line heights and decoration-based rendering,
and the spike confirmed every part of that in practice.

### 5.5 Deviations from the functional template

**Status: Accepted.** These are the points where the ThothPad specification
cannot be carried over unchanged, with the replacement decision.

| ThothPad (Swift/AppKit) | Opera Incerta (Electron/Angular) |
| --- | --- |
| `NSTextView` editor | Editor adapter over a web text-editing component (§5.4) |
| `NSFilePresenter` + `DispatchSource` watching | Main-process watcher with debouncing and coalescing (§10.6) |
| `FSEventStream` for the Git repository | Same main-process watcher, scoped to the repository root, with the `.git` filter preserved (§12) |
| `UserDefaults` / `@AppStorage` | One versioned JSON preference record in the Electron user-data directory (§13) |
| macOS Keychain | Electron `safeStorage` (§5.3) |
| SF Symbols | Locally packaged, hash-pinned SVG icons with documented license |
| App Sandbox disabled to run `git` | Electron sandboxed renderer; `git` runs in the main process only |
| Security-scoped bookmarks not needed | Not applicable; recent projects store plain paths |
| Swift Packages per module | pnpm workspace packages per module |
| Swift Testing + XCUITest | Vitest plus a packaged Electron smoke test |
| iPadOS/iOS as a later target | Not a goal (§3); Windows and Linux parity instead |
| German as the base language, source strings as keys | English as the base language, symbolic keys, English/German catalogues (§14) |

## 6. Domain model

### 6.1 Project, group, sheet

**Status: Accepted.**

- **Project** — the root container, one book or undertaking. A directory is a
  Opera Incerta project exactly when it contains `.opera-incerta/project.json`.
  The application opens projects, never bare directories.
- **Group** — a directory. It may contain further groups and sheets, nested to
  any depth.
- **Sheet** — one Markdown text, persisted as one `.md` file. Its metadata
  lives in the YAML front matter of that same file.
- **Filter/favorite** — a saved view over the library; never a second copy of
  the data.

`project.json` contains:

- `id` — UUID, assigned once, never changed. It is the key for
  installation-local, project-bound state (§7.2).
- `displayName` — shown in the window title.
- `created` — ISO 8601 timestamp, written once, never changed.

Directory display names and child order do **not** live here; they live in
`.opera-incerta/structure.json` (§6.4). `project.json` stays deliberately minimal.

New project directories get a slug name: lowercase, spaces to `-`, umlauts
transliterated (ä→ae, ö→oe, ü→ue, ß→ss), other non-ASCII removed, maximum 40
characters, collision suffix `-2`, `-3`. The directory name is never changed
afterwards, even when `displayName` changes.

### 6.2 Front matter and the `opera-incerta:` namespace

**Status: Accepted (2026-09-01).**

Sheet metadata lives in a YAML front matter block at the head of the `.md` file,
between two `---` lines. **Every field Opera Incerta owns is nested under one
top-level key, `opera-incerta:`. Every other top-level key is foreign** and is
preserved verbatim (§6.3).

```markdown
---
opera-incerta:
  title: The First Scene
  topic: departure
  keywords: [draft, scene]
  status: draft
  category: 6f1d0a7e-6c2b-4a19-9a1e-2f3b4c5d6e7f
  notes: |
    Research on the harbour still open.
    Check the 1893 timetable.
layout: post
author: A. Author
tags: [novel, draft]
---

The first line of the actual text.
```

The owned fields, all nested under that key:

| Field | Type | Meaning |
| --- | --- | --- |
| `title` | string | Display name of the sheet. Renaming in the application changes **only** this (§6.4) |
| `topic` | string, optional | One short label (1–3 words): what this sheet is about at its core |
| `keywords` | string list, optional | Free, multi-valued tagging for filtering |
| `status` | string, optional | Workflow state |
| `category` | UUID string, optional | Page category assignment (§6.6) |
| `notes` | multi-line string, optional | Author notes about the sheet, independent of its body text |

`topic` and `keywords` are deliberately different: `topic` is the single main
classification, `keywords` is the open list. `topic` is also passed to AI
actions as compact per-sheet context so a model working across many sheets does
not need every full text (§15).

`notes` requires multi-line YAML (a block literal, `notes: |`, with indented
continuation lines). The reader MUST accept it and the writer MUST produce it;
line breaks are preserved.

**Why the namespace.** Front matter is a shared namespace with no owner: a file
may already carry keys from Jekyll, Hugo, Astro, Obsidian, Pandoc, or an
agent-instruction convention before Opera Incerta ever opens it. A bare `status`
or `title` there means whatever that other tool means by it. Without a
namespace, the application would silently adopt a foreign `status` as its
workflow state and write its own meaning back into it — a data error that no
round-trip rule can catch, because nothing is lost, only reinterpreted.

The functional template left this open because introducing a namespace would
have changed the format of every file already written. This project has no
files, so the namespace is adopted from the first release and there is no
migration path to build, now or later.

**Rules that follow:**

- exactly one top-level key, `opera-incerta:`, is owned. Its value MUST be a
  mapping;
- every other top-level key is foreign, without exception and regardless of its
  name;
- a file whose `opera-incerta:` value is not a mapping, or which carries that
  key more than once, is reported with a stable diagnostic and treated as
  **read-only** until the author resolves it. The application MUST NOT guess
  which occurrence it owns, and MUST NOT write over either (§16);
- a sheet with no `opera-incerta:` block is normal, not an error: it is a plain
  Markdown file, its display name falls back to the file name (§6.4), and the
  block is created on the first save that needs it — additive, never
  destructive; and
- a foreign key that happens to be named `title` is **not** the sheet title. An
  imported file therefore shows its file name until its metadata is adopted
  explicitly. Offering that adoption is a job for the import module (§15), not
  a silent behavior of the codec.

**Forward compatibility inside the block.** A child of `opera-incerta:` whose
key this build does not know is preserved verbatim and written back. An older
build MUST NOT delete a field a newer build wrote. This is the same
no-discarding rule as §6.3, applied one level deeper, and it is why the reader
keeps unknown owned lines as raw text instead of dropping them.

**What the writer regenerates, and what it copies.** Owned fields are written
in a fixed order (`title`, `topic`, `keywords`, `status`, `category`, `notes`,
then unknown owned lines), so identical metadata always produces identical
bytes. Formatting *inside* the owned block therefore belongs to the
application. Everything outside it — foreign lines, their order, their
comments, their blank lines — is copied byte-for-byte.

**Value formatting.** A scalar is quoted whenever leaving it bare would change
its meaning for another reader: an empty value, leading or trailing spaces, a
leading YAML indicator, an embedded `: ` or ` #`, or a value that would
otherwise be read as a number, a boolean, or null. A title of `2024` is a
string and MUST come back as one. `notes` is written as a block literal, `|`
when the text ends in a newline and `|-` when it does not, so the value
round-trips exactly.

**Line endings are preserved.** The reader records whether the file used LF or
CRLF and the writer reproduces it. A line-ending difference MUST NOT change the
parsed model (`TESTING.md` §4).

**An `opera-incerta:` key with no children is an empty mapping**, not a
malformed one: that is the state a freshly created block has.

**Diagnostics.** The codec reports stable codes without display text
(§14.3): `front-matter/unterminated`, `front-matter/namespace-duplicated`, and
`front-matter/namespace-not-a-mapping`. The first two also mark the file
read-only, as does the third.

### 6.3 Foreign front matter — lossless round trip

**Status: Accepted. This is a data-safety rule, not a convenience.**

**Saving discards nothing.** Every front matter key the application does not
own MUST survive load and save unchanged, byte for byte.

Implementation: foreign front matter is kept as a list of **unmodified raw
lines**, not as a parsed structure. This is the decisive cut — to *preserve*
foreign YAML you do not have to *understand* it, and understanding it would
require a full YAML parser as a new dependency. Multi-line constructs (nested
mappings, sequences, block literals), comments, and lines without a colon are
carried through as consecutive lines.

**Indentation decides ownership.** Only non-indented lines are top-level keys.
This is what separates the owned block from the foreign ones: the
`opera-incerta:` block ends at the next non-indented line, and a nested key —
including a nested `opera-incerta:` under some foreign key — is never ours.
Without that check, a `title:` nested under a foreign mapping would be read as
the sheet title, a silent data error.

**On write** the `opera-incerta:` block comes first, then the foreign lines
verbatim in their original relative order. The round trip MUST be idempotent: saving twice
produces the same bytes as saving once.

This rule exists because the functional template lost every foreign key on the
first save until the defect was found. It is covered by mandatory tests
(`TESTING.md` §2.2).

### 6.4 Display names and explicit order

**Status: Accepted.**

The name shown in the tree and the sheet list MUST be decoupled from the actual
file or directory name, and the order of children within a group MUST be
exactly fixable rather than merely alphabetical.

- **Sheets**: the front matter `title` *is* the display name. Renaming in the
  application changes only `title`, never the file name. The file name remains
  a stable, technical, internal identifier.
- **Groups and order**: directory display names and each group's child order
  live centrally in `.opera-incerta/structure.json`, a flat map keyed by relative
  directory path (root is `"."`):

```json
{
  ".":            { "order": ["chapter-1", "chapter-2", "preface.md"] },
  "chapter-1":    { "displayName": "Part 1: Beginning",
                    "order": ["intro.md", "pre", "scene-2.md"] },
  "chapter-1/pre": { "order": ["note.md"] }
}
```

- `displayName` is optional; without it the real directory name is the fallback.
- `order` lists direct child **file names** (subdirectories and sheets), not
  display names. Because sheet file names are stable across renames, `order`
  stays correct when titles change.
- Numeric file-name prefixes (`01-chapter`) are explicitly **not** used:
  inserting in the middle would force cascading renames of every later file.

**The filesystem remains the source of truth for existence.**
`structure.json` only adds order and display name on top, and degrades
gracefully against external changes:

- entries in `order` that no longer exist on disk are silently ignored on read;
- items on disk that appear in no `order` are appended at the end, sorted
  among themselves with a **pinned collation**: locale `en`, case-insensitive,
  numeric, so that `chapter-2` precedes `chapter-10` and the result does not
  depend on the machine (`TESTING.md` §1.8);
- a missing file or a missing directory entry means: display name is the
  directory name, order is alphabetical. The entry is created only when the
  user first renames or reorders inside the application — additive, never
  destructive.

Accepted trade-off: a directory moved or renamed **outside** the application
leaves its path-keyed entry pointing nowhere, and that directory falls back to
default behavior. Under Git a real directory rename is safe and normal, and
inside the application the entry is carried along.

**Renaming**, from the context menu of a sheet row or a tree node:

- **A sheet** — only the front matter `title` is rewritten. The file keeps its
  name, so `order`, links, and Git history all stay valid.
- **The open sheet** — the new title goes into the **editing state**, not onto
  disk, and the sheet becomes dirty exactly as editing the title in the
  inspector does, because it is the same change. Writing the file behind the
  editor would discard whatever is unsaved in it.
- **A group** — only its `displayName` in `structure.json` changes. The
  directory keeps its name for the same reason a sheet keeps its file name.

While a title is being edited, the tree, the sheet list, and the editor header
all name the sheet the way the author just named it — a rename that nothing
visibly answers looks like a rename that failed. The dirty marker in the header
is what says it is not saved yet.

**Reordering** is dragging a row to a new place among its siblings. It is one
half of **placing** (§6.8): the half where the group does not change. The rules
it contributes:

- The interface names the sibling the entry lands **in front of**, or nothing
  for last — never a position. By the time the main process has re-read the
  group, an index could point at something else.
- The whole resolved order is then recorded for that group. A partial `order`
  would leave the unlisted children to be appended alphabetically, scrambling
  the very arrangement being made.
- The sheet list shows sheets and the tree shows groups, while one `order`
  holds both. Landing "in front of the next sheet" therefore leaves the
  subgroups between them where they are, which is what the author sees and
  means.
- A drop that changes nothing writes nothing, and dragging an entry never also
  opens it.

A drop is where a group without a recorded order first gets one — the same
moment a rename does, and for the same reason (above).

### 6.5 Creating sheets and groups

**Status: Accepted.**

New sheets and groups are created from a group's context menu in the project
explorer. A small dialog asks for the name; the create action is disabled for an
empty or whitespace-only one.

- **File name = slug(title)** with a `-2`/`-3` collision suffix against the
  `.md` files already in the target directory. The generator is a pure,
  unit-tested function. If the title yields no usable slug, the fallback base is
  `sheet`.
- The front matter `title` is set to the entered title; the body stays empty.
- The file name is permanent from then on; later renaming changes only `title`
  (§6.4).
- The sheet is always created in the directory of the group that was
  right-clicked. Afterwards it is visibly selected in both columns and open in
  the editor.

**Groups** are created the same way, in the directory of the group that was
right-clicked:

- **Directory name = slug(display name)**, with the same collision suffix
  against the entries already there.
- The display name is written to `structure.json` only when it differs from the
  directory name, so the file stays free of entries that say nothing.
- The new group is selected and revealed in the tree; its sheet list is empty.
  Creating a group does **not** close the open sheet — nothing about it changed.

**Where the selection lands** after any of these edits:

| What happened | Tree and sheet list show | Editor |
| --- | --- | --- |
| A sheet was created | the group holding it, sheet selected | the new sheet |
| A group was created | the new group, empty | unchanged |
| Something was renamed | unchanged | unchanged |

The interface never patches its own copy of the library: every edit is answered
by the main process with a freshly read project, and that is what the interface
adopts. A patched copy is how a tree starts disagreeing with the disk.

Both operations append the new entry to the group's `order` **only if that group
already has one** — recording an order for a group that never had one would
freeze an arrangement the author never chose (§6.4).

### 6.6 Page categories

**Status: Accepted.**

Each sheet may be assigned exactly one page category. Categories are
project-specific and serve visual classification in the sheet list (for example
"Draft", "Review", "Done"). At least 8 and at most 64 categories per project.

Definitions live in `.opera-incerta/categories.json` as their own file — not part
of `project.json` — so that category sets can be exchanged between projects.
Each entry has:

- `id` — UUID string, assigned once, never changed;
- `name` — display name, freely chosen;
- `color` — background color as `#RRGGBB`.

The **text color is computed, never stored**:
`luminance = 0.299·R + 0.587·G + 0.114·B` with R/G/B in 0…1;
text is black when `luminance > 0.5`, otherwise white.

A missing `categories.json` means no categories and is not an error. A sheet
whose `category` is absent or references an unknown UUID counts as
uncategorized and is not an error. Deleting a category does not rewrite sheets:
the UUID stays in the file and the sheet becomes uncategorized.

Category names are **user data** and are never localized (§14.2).

### 6.7 Deleting into the trash

**Status: Accepted.**

Sheets and groups are deleted from their context menu, and deleting means
**moving to the desktop trash** — the operating system's own, the one place the
author already knows how to restore from. The application never removes a file
itself:

- if no trash is available, the operation is **refused**; it never falls back
  to an irreversible delete;
- a group goes as a whole directory, with everything in it, so it comes back as
  a whole directory too;
- the trash first, the record second. `structure.json` forgets the entry — its
  name in the parent's order, its own entry and every entry beneath it — only
  after the move succeeded. Failing the other way round would leave a hole in
  the order and the file still on disk.

Under Git the manuscript has a second, independent net: a deleted file is in
the history. That is the reason not to invent a third one inside
`.opera-incerta/`, where deleted content would sit in the project, get
committed, and be one more place to look.

**The confirmation is always shown**, and it says what the author cannot see:

- the name of what goes;
- for a group, how much goes with it;
- for the open sheet with unsaved changes, that those are **not** in the trash
  afterwards, because they were never in the file.

**Return does not delete.** It cancels, like the default button of a system
alert, and so does Escape; the destructive button has to be aimed at with the
pointer. The rule is bound outright rather than left to wherever the focus
happens to be. There is no keyboard shortcut for deleting.

**Afterwards the author is left somewhere, not nowhere**: the sheet after the
deleted one opens, else the one before it; a deleted group hands the selection
to its parent. Nothing that no longer exists stays selected.

### 6.8 Placing: moving and ordering as one

**Status: Accepted.**

Dragging an entry says two things at once — **which group** it ends up in and
**where in it** — and both are carried out as a single operation. They were
briefly two, and that was wrong twice over: a drag into another group could not
say where at all, and two calls would let a failure leave an entry moved but
unplaced. Reordering (§6.4) is the case where the group does not change.

**Aiming.** The middle half of a group's row means the group itself, at its
end; the quarter at each edge means between the rows. The project root's row
has no siblings to be placed among, so all of it means "into the project". The
empty space below a list means the end of that list.

**The rules a change of group brings with it:**

- **A group is never placed inside itself or inside anything within it**, at
  any depth: the group and everything in it would end up unreachable.
- **A name already taken in the destination gives the arrival a suffix.**
  Overwriting is out of the question, and refusing over a technicality would
  block something the author plainly wants. This is the one case where a file
  name changes after it was set, and it is invisible: the title, which is the
  name the author sees, is untouched.
- **The record travels with the entry.** A moved group's own key in
  `structure.json` — and every key beneath it — is re-keyed to the new path, or
  it would arrive without its display name and without the orders of everything
  inside it. It leaves the source order where one exists, and the destination's
  order is written in full, because that is what makes "at the end" mean the
  end rather than wherever the alphabet puts it.
- The file first, the record second, as everywhere else.
- **The open sheet is followed, not closed**, whether it was the thing dragged
  or sat inside a group that moved around it. It is the same document at a new
  path, and what was unsaved in it belongs to it wherever it goes.

**What the columns show afterwards.** A placed *sheet* is revealed where it now
is — otherwise it would vanish from the column with no explanation — but it is
not opened: the author was moving it, not choosing it. A placed *group* does not
take the selection with it; the tree merely opens down to where it went. Only a
newly **created** entry is selected outright (§6.5).

Nothing is highlighted as a destination unless dropping there would do
something. A highlight that leads nowhere is a promise not kept.

**The gesture** is built on **pointer** events, not the drag-and-drop API: a
synthetic pointer can drive it, and a gesture no check can drive is a gesture
nothing proves (`TESTING.md` §1.4). A press becomes a drag only after the
pointer has travelled a few pixels, so an ordinary click stays a click.

It is owned by the shell rather than by either library column: a drag that
starts in one and ends in the other belongs to neither. The columns describe
their rows in the DOM — what they are, where they sit, what they are called —
and the shell measures and decides.

## 7. Storage model

**Status: Accepted.**

**Base rule:** everything belonging to the **project** lives in the project
directory and is shared through Git. Everything belonging only to a **device or
installation** lives in the Electron user-data directory and is never
synchronized. There is deliberately no third, project-local-but-unshared state
inside the project directory.

### 7.1 Shared — `.opera-incerta/` in the project root

Fully committed:

| File | Content |
| --- | --- |
| `project.json` | `id`, `displayName`, `created` (§6.1) |
| `categories.json` | Page category definitions (§6.6) |
| `structure.json` | Directory display names and child order, path-keyed (§6.4) |

The split into three files **by purpose** keeps diffs topically local: changing
categories touches only `categories.json`, reordering touches only
`structure.json`. The hidden directory is simultaneously the **project
marker** (§6.1). Sheets stay as plain `.md` files in the tree for
interoperability; only metadata about the project moves into `.opera-incerta/`.

### 7.2 Installation-local — Electron user data

Never synchronized:

| Kind | Examples | Location |
| --- | --- | --- |
| Preferences | Interface language, color scheme, editor font and size, panel toggles, sheet-list density | One versioned JSON record in `app.getPath('userData')` (§13) |
| Structure | Recently opened projects, workbench session state | Same directory, separate versioned records |
| Cache | Later search/preview index | `app.getPath('userData')` cache subdirectory — disposable, rebuildable at any time |
| Secrets | AI provider API keys | Electron `safeStorage`, never plain text (§5.3) |

If project-bound but device-local state becomes necessary (for example "which
sheet was last open"), it MUST NOT move into the project directory. It is keyed
by the stable `project.id` — not by path, because paths change when a project
moves or is opened on another machine. That is exactly why `project.json`
carries an `id`.

## 8. Workbench shell

### 8.1 Region and view naming

**Status: Accepted. Binding.**

**Region is not view.** A **region** is a fixed place in the window and is never
renamed when new content arrives. A **view** is interchangeable content inside a
region and carries a content name. "Explorer", "Git", "Inspector", "Outline",
"AI" are views, not regions.

The scheme is deliberately mixed: the left side is named by content (that
region stays navigation permanently), the right side positionally (it becomes a
mixed tool area, where any content name would eventually be wrong).

| Region | Code identifier | Views inside |
| --- | --- | --- |
| Activity bar, left | `ActivityBar` (leading) | — |
| **Navigator** | `Navigator` | Explorer · Source control |
| **Sheet list** | `SheetList` | — (fixed) |
| **Editor** | `Editor` | — |
| **Secondary sidebar** | `SecondarySidebar` | Inspector · Outline · AI · Snapshots |
| Activity bar, right | `ActivityBar` (trailing) | — |
| Bottom panel | `BottomPanel` | Terminal (later) |

"Inspector" survives as a **view** name — metadata of the active sheet — and
MUST NOT be used for the right-hand region: once AI, outline, and snapshots
live there too, it would describe one of four contents.

Documentation and code identifiers are both English (§14). Where the
functional template used German region names, the mapping above is normative.

### 8.2 Zones and column widths

**Status: Accepted.**

```text
[ activity bar left (44 px) ]
[ Navigator | ‖ | Sheet list | ‖ | Editor | ‖ | Secondary sidebar ]
[ activity bar right (44 px) ]          ( ‖ = draggable resize divider )
```

Column widths are plain numbers in a layout state object, applied as an
explicit width. The editor has only a minimum width and fills the remainder.

| Column | min | ideal | max |
| --- | --- | --- | --- |
| Navigator | 140 | 160 | 240 |
| Sheet list | 190 | 200 | 380 |
| Editor | 380 | fills the rest | — |
| Secondary sidebar | 200 | 260 | 380 |

Requirements that follow and MUST hold:

- **Stable** — switching the view inside a region MUST NOT change any column
  width. Width belongs to the layout state, never to a layout container.
- **Draggable** — every column except the editor is draggable, through a narrow
  hit area (about 6 px) with a resize cursor.
- **Persisted** — the setter clamps to `min…max` and writes immediately, into
  the installation-local preference record (§13). On load the stored value is
  clamped again, so changed constants cannot drag an old stored value into
  absurdity. The clamp rule is a pure, unit-tested function.

Double-clicking a divider restores that column's ideal width, which is the way
back from a width dragged somewhere unhelpful.

The divider of the secondary sidebar sits to its **left** and MUST be
parameterized accordingly, or dragging runs backwards.

All these numbers — activity bar width, column widths, window size, header
height — live as named design constants in one module, never as literals in
components.

**Window size.** The project window opens at 1600 × 1000 px and has a minimum
of 1400 × 820 px. The minimum prevents a distorted layout; the sheet list stays
deliberately narrow so the editor remains the dominant column.

### 8.3 Panel headers

**Status: Accepted.**

**Every panel has a header, and every header is the same shared component.**
Hand-built headers are a defect, not a matter of taste.

Reason from the functional template: while each panel built its own header, the
height depended on the *content* — a segmented control is taller than a text, a
bordered button taller than an icon button — so the separators of the columns
sat at different heights and the window looked unfinished.

The shared component excludes that structurally:

- **fixed height** (36 px) instead of vertical padding, so content cannot
  influence height;
- **the separator belongs to the component** — it is delivered with it, never
  placed beside it, so a panel cannot misplace it;
- uniform horizontal padding across all panels.

The content stays free so that panels **without** a title (the sheet list,
which has only controls) use the same component. Titles use a shared title
component with two forms: a localized form for interface text and a verbatim
form for user data (project names, file names), which MUST never become a
translation key (§14.2).

### 8.4 Activity bars

**Status: Accepted.**

Both bars are narrow icon-only columns (44 px wide, vertically stacked, top
aligned), implemented as one reusable component driven by a list of items
(icon, label, active flag, action).

Icons are **Material Symbols Outlined**, packaged locally as unmodified SVG
files under the Apache License 2.0, with their licence and a source notice
shipped beside them. Their bytes are pinned and verified, so a replaced file
fails a check rather than passing unnoticed (`CONVENTIONS.md` C-L4).

They are drawn as CSS masks and take the button's colour, which is what makes
one file work in both light and dark themes without a second asset. They are
**decorative**: every button carries its own accessible name, and the icon
conveys nothing the name does not.

**Left bar** switches what the Navigator shows: Explorer (default), Source
control.

**Right bar** switches what the secondary sidebar shows and toggles its
visibility: clicking the already active, visible view collapses the sidebar.
Views: Inspector (default), Outline, AI, Snapshots.

The inspector icon MUST NOT be a "toggle sidebar" symbol: that describes a
position, not a content, and next to content icons it would be misleading — the
bar selects views, it does not collapse itself.

**Divider handling.** Horizontal dividers (which adjust a height) get a larger
hit area than vertical ones: vertical mouse control is less precise and the
divider moves with the drag. During a drag the cursor MUST NOT be re-set —
hover events fire continuously while the divider moves under the pointer, and
re-setting produced flicker. The measurement change itself runs without
animation, or the layout lags behind the mouse.

### 8.5 Window model

**Status: Accepted.**

Two separate windows, one project at a time:

1. **Welcome window** — the launcher: recent list, "Open…", "New…", and the
   one-time splash on first start. Compact, fixed size. It is the start window.
2. **Project window** — the workbench. Suppressed at launch and not restored,
   so neither start nor relaunch shows an empty project window.

Choreography — exactly one truth per transition:

- **Project opened** (every successful path: welcome button, recent item, menu,
  adoption, subproject, creation) opens the project window and dismisses the
  welcome window.
- **Project closed** runs through a single window-close path, so the close
  button, the keyboard shortcut, and the menu command all trigger the same
  code: reset state, then show the welcome window.
- **Welcome window closed** while no project is loaded quits the application.

Closing a project MUST fully reset shared state (library tree, selection,
preview cache, watchers stopped, open sheet closed, category store cleared,
project metadata cleared) so a subsequently opened project inherits nothing.

**Application-quit detection is a critical point.** Quitting the application
closes the project window too. Without a guard, that close would re-open the
welcome window during shutdown, and closing the welcome window would then
trigger a second quit. The main process MUST set a terminating flag *before*
windows begin closing, and the window handlers MUST check it and stay passive
during shutdown.

**Native menu.** The application installs its own menu with these commands:

| Command | Shortcut | Available |
| --- | --- | --- |
| New Project… | `Cmd/Ctrl+Shift+N` | always |
| Open Project… | `Cmd/Ctrl+O` | always |
| Save | `Cmd/Ctrl+S` | with a project open |
| Close Project | `Cmd/Ctrl+Shift+W` | with a project open |

Two rules govern it:

- **The editing roles MUST survive.** Installing an application menu replaces
  the platform default, and with it Undo, Redo, Cut, Copy, Paste, and Select
  All. They are re-declared as platform **roles** rather than as commands of
  our own, because a hand-wired copy command does not work inside a text field
  while the role does. A menu that adds four commands and removes copy is a bad
  trade.
- **The menu owns its accelerators.** Once an item claims `Cmd+S`, the key
  never reaches the page, so the renderer learns about the command through a
  channel instead of a key handler. That channel carries the command only —
  never an event object, which would hand the page a way back into IPC.

An item whose command is impossible is disabled rather than silently doing
nothing, so the menu is rebuilt whenever a project opens or closes. "Close
Project" closes the window, which is the same path as the red button, rather
than a second reset of its own.

**One bundle, two windows.** Both windows load the same renderer and ask the
main process which of the two they are. The role MUST NOT come from a query
string or any other value the page itself could change. Only one component is
bootstrapped, into the single root element the document provides.

Platform difference (`CONVENTIONS.md` C-P4): closing all windows quits on
Windows and Linux; on macOS the application stays active and recreates a window
on activation.

### 8.6 Welcome window and recent projects

**Status: Accepted.**

Whenever no project is loaded, the welcome window shows:

- the application name and logo;
- the **last 10 opened projects**, newest first, each with `displayName` and an
  abbreviated path. Clicking opens the project through the same code path as
  "Open…". A project whose directory no longer exists or is no longer valid is
  marked "not found"; clicking it offers "Remove from list" instead of failing
  hard;
- "Open…" and "New…" buttons;
- an empty state with only the buttons and one explanatory line.

The list updates on every successful open, create, or adopt through one shared
endpoint — recording the entry and presenting the window happen there rather
than in each caller, so no way of opening can forget either. It is persisted
installation-locally (§7.2), and a list that cannot be written is a lost
convenience rather than a reason to interrupt the author. The pure list logic —
deduplicate by path, ordering, cap at 10 — lives in the portable core and is
unit-tested.

Availability is checked when the list is shown, not when it is stored: an entry
whose directory is gone appears marked rather than disappearing, so removing it
stays the author's decision.

**Opening** presents a directory chooser and then inspects the chosen folder:

- valid project → load it;
- no project → confirmation to adopt the folder as a new project, creating
  `.opera-incerta/project.json` with `displayName` from the folder name;
- exactly one subproject → offer to open it;
- several subprojects → inform the user and list them by name, asking them to
  open the intended one directly.

**Creating** asks for a display name and a parent directory, in that order and
in one dialog, then creates the slug directory with
`.opera-incerta/project.json` inside it and opens the project immediately.

The dialog **shows the directory name it will create** before the project
exists. The display name is what the author writes and can change later; the
directory name is a slug of it and never changes again (§6.1). Showing it is
the difference between a rule and a surprise — an author who types
"Die Nacht am Hafen" sees `die-nacht-am-hafen` and knows why.

The collision suffix is not previewed: whether `-2` is needed is decided
against the real directory when the project is created, and the renderer cannot
know what is in it. The dialog says the folder name it derives, not the one it
will certainly get.

## 9. Library

### 9.1 Project explorer

**Status: Accepted.**

The Navigator's explorer view shows the group tree. The chosen root directory
is itself the top, always visible, selectable node — it appears as the first
element, not as an invisible container of its subdirectories. After opening a
project it is selected automatically, so its direct sheets appear immediately
in the sheet list.

Groups nest recursively. Expansion state is part of the layout state, not local
component state: the Navigator switches between Explorer and Source control,
and expansion MUST survive that switch (`CONVENTIONS.md` C-U2).

Context menu on a group: "New sheet…", "Rename…", and later "New group…".
Renaming a group writes `displayName` in `structure.json`; it does not rename
the directory.

### 9.2 Sheet list and preview density

**Status: Accepted.**

The sheet list shows the sheets of the selected group. Each row shows the title
plus a configurable number of preview lines rendered with the **actual
formatting from the file** — a heading line also appears larger in the preview
— scaled down to the small row height.

Three density steps, switchable from the sheet-list header and persisted:

- **Compact** — 3 lines total (title plus 2 preview lines), **uniform font size
  for all lines**. Heading size differences are deliberately not shown here;
  other attributes (bold, italic) remain.
- **Standard** (default) — 5 lines total (title plus 4 preview lines), actual
  formatting including different sizes per line.
- **Large** — 10 lines total (title plus 9 preview lines), like Standard.

Preview line sizes follow their **own geometric formula**, independent of the
real editor sizes: a configurable base size (guide value 12 px, corresponding
to H6 and body text in the preview) times a configurable step percentage (guide
value 105 %) per level upward to H1 (H1 ≈ base × 1.05⁵ ≈ 15.3 px at a 12 px
base). The goal is that differences stay visible without the smallest step
becoming unreadable. Both values are design constants first and settings later.

Preview lines are collected during the library scan, which reads each sheet
anyway to resolve its title. **Blank lines are kept in the scanned entry** and
removed at display time: whether to show them is the reader's choice, and a
scanner that dropped them would make the toggle impossible without a second
pass. They are hidden by default and shown through a toggle in the sheet-list
header.

A sheet with a page category shows its title badge in the category background
color with the computed text color (§6.6).

**Preview cache**: after a rescan, previews for newly appeared sheets MUST be
populated before the list measures its rows. Filling the cache asynchronously
after the first render leaves rows measured at placeholder height
(`CONVENTIONS.md` C-U3).

## 10. Editor

### 10.1 Display model

**Status: Accepted in principle; the component decision is draft (§5.4).**

**Base principle:** on disk there is always pure, standard-conformant Markdown
(`#`, `**text**`, `- item`, `> quote`, backticks, `[text](url)`). Any other
Markdown application can read the file without loss. Only the **presentation**
is transformed.

Two pure transformation stages own that translation and MUST be independently
unit-testable, free of the editor component:

- **Markdown to display** — on load: `# `…`###### ` at the start of a line
  becomes a paragraph-level heading attribute, and the prefix is removed from
  the visible text.
- **Display to Markdown** — on save: the paragraph attribute is turned back
  into the matching `#` prefix.

The editor core knows only the formatting model, never the concrete Markdown
target syntax. Round-tripping MUST be lossless and idempotent.

**Lines inside a fenced code block are shown exactly as written.** No heading is
recognized there and no delimiter is hidden: backticks mean "literally this",
and hiding a character inside them would display something the file does not
contain.

**The component sits behind an `EditorAdapter` boundary.** The portable core
computes the display model — which lines are headings, which character ranges
are hidden — and the adapter translates it into the component's own
decorations. The interface carries no DOM type, so one contract suite can run
against both the real implementation and a double (`TESTING.md` §2.6). The
application speaks to the editor about text, lines, and heading levels; never
about elements or key events.

### 10.2 Heading formatting and the marker gutter

**Status: Accepted.**

Heading level is a property of the **whole paragraph** (the line), never a
character inside the text flow. The functional template first implemented
headings as an inline attachment (a movable character, like an emoji) and found
that wrong in practice: such a character can be moved accidentally and behaves
like a text snippet rather than a format. That approach is rejected and MUST
NOT return.

The author types a dot command at the start of a line (`.h1` … `.h6`). Once
recognized, the command text disappears completely from the line, leaving two
visible effects:

1. the line is displayed at the font size of its level (H1 largest, H6
   smallest, like heading levels in a word processor); and
2. a short label ("H1" … "H6") appears at that line's height in a **separate
   column beside the writing area** (a gutter, comparable to a line-number
   column in a code editor). Lines without formatting show nothing there.

On disk the line remains exactly `# Text` … `###### Text`.

**The raw prefix travels with the line.** The display model carries the exact
Markdown that was removed from view — the leading spaces, the hashes, the
spacing after them, and any closing hashes. An unusual but valid spelling
therefore survives a round trip untouched, and re-levelling a line keeps its
spacing instead of silently reformatting it. Per CommonMark, four leading
spaces make a code block rather than a heading, and `#Text` without a space is
not a heading at all.

A heading applies to exactly one line: pressing Return at the end of a heading
line MUST start the next line as a normal paragraph. Carrying the heading
attribute into the following paragraph is a defect (`CONVENTIONS.md` C-U4).

**Rules of the dot command:**

- it is recognized at the start of the **visible** text, not of the raw line.
  A line that is already a heading shows its text without the `# ` prefix, so
  typing `.h2` in front of it changes the level — which is what the author sees
  themselves doing;
- **a space or tab after the digit is required**, and is consumed with the
  command. Firing on `.h3` alone converts one keystroke early, and the space
  the author types next lands inside the prefix — `###  Chapter`, Markdown
  nobody wrote. Waiting for the separator also makes the command visible until
  it triggers;
- anything else after the digit ends the command: `.h1x` is ordinary text;
- it never fires inside a fenced code block; and
- **it is applied to typing only, never while loading a file.** A document
  containing a line that begins with `.h1` MUST open unchanged. Converting it
  would mean that opening a file rewrites it, which is the rule of §6.3 one
  level up.

The conversion happens in the same edit step as the keystroke, so one undo
takes back the whole thing and no intermediate state is ever shown.

**The gutter menu.** Clicking a level label opens a menu listing "No heading"
and the six levels, with a checkmark on the active one. Choosing an entry
applies it and closes the menu; Escape and a click outside dismiss it without
a change. A line without a level has no marker, and therefore no menu.

**The hidden prefix is one unit for the cursor.** It MUST NOT be possible to
place the caret inside it — not with an arrow key, not with `Home`, not with a
click, and not by extending a selection. Otherwise the author types at a
position they cannot see. Consequently:

- `Home` and the platform's line-start shortcut go to the first **visible**
  character, and a shift-variant selects to it;
- **Backspace at the visible start of a heading removes the level**, leaving
  the text as an ordinary paragraph. A second press then merges with the line
  above, exactly as in a word processor. Deleting the prefix character by
  character would otherwise leave `##Chapter`, which no Markdown reader treats
  as a heading — a broken state produced by a keystroke whose target was
  invisible. The removal runs the same operation as the gutter menu, so both
  gestures undo as one thing; and
- **copying a heading yields Markdown.** A selection cannot begin inside the
  prefix, so it begins after it; the prefix is put back when the text reaches
  the clipboard, and pasting into another Markdown tool preserves the heading;
  and
- **cutting takes the prefix with it**, leaving an empty ordinary line. The
  clipboard half of the gesture already carries the heading, so removing only
  the visible text would leave the two halves disagreeing: the text arrives
  elsewhere as a heading while an empty `## ` stays behind.

**Deleting a selection is deliberately different from cutting.** Clearing the
text of a heading with Delete or Backspace leaves the level in place, because
the intent differs: cut means "this moves elsewhere", so the formatting travels
with it, while delete means "this text goes", and an author clearing a title to
retype it wants the heading to survive. Backspace at the visible start remains
the deliberate way to remove a level.

Return in the middle of a heading is deliberately left alone: the second half
becomes an ordinary paragraph, because the prefix stays on the first line. That
is what the file says, and any special handling would mean the editor invents
Markdown the author did not write.

The gutter is also an **input surface**: clicking a label opens a menu to
choose another level (with the active one marked) or to remove the heading
format from that line. The change writes immediately to the document model.
Clicking a line without a heading attribute opens no menu.

The mapping of input shortcut to Markdown syntax SHOULD become a user-editable
table later (§13). The **Markdown target syntax itself is fixed and not
configurable**; only the input shortcuts may be.

Scope of this stage: headings h1–h6 only. Bold, italic, lists, quotes, code,
and links are covered by §10.3 and the roadmap.

### 10.3 Inline markup and the focus line

**Status: Draft — the concept is decided, the mechanism needs its own round.**

Presentation follows the established "hide the markers, show the effect"
pattern: `*`/`_` and `**`/`__` delimiters are **fully hidden** in the display
and the enclosed text is shown in real italic or bold — **except in the line
that currently holds the cursor**, where the delimiters are shown as plain text
so they can be edited directly.

This is deliberately a different behavior type from §10.2: heading formatting is
line-wise and cursor-independent (a static paragraph attribute), while inline
display depends on cursor state and must change dynamically on every cursor
move.

The planned decomposition, each part a separate round:

1. pure detection/parsing of inline spans within a line, decoupled from the
   editor component and fully unit-testable;
2. the display transform for focused versus unfocused lines;
3. cursor-driven live switching of the affected line only — no full document
   reload, to avoid flicker and scroll jumps; and
4. the reverse transform for unfocused lines with hidden delimiters.

Open: the exact detection scope (incomplete or nested markers) and whether `*`
and `_` are treated identically.

### 10.4 Front matter block

**Status: Accepted.**

Front matter is shown in its **own area between the editor header and the
text**, deliberately **not** inside the text editing surface. Mixing read-only
and editable regions in one editing surface, writing edited lines back, and
interacting with the display transform of §10.2 would be markedly more
dangerous for the same purpose.

Two blocks, separated visually **and** in behavior:

| Block | Tint | Visible | Editable |
| --- | --- | --- | --- |
| **Foreign** (§6.3) | greenish | whenever the display is on | only with "writable" enabled |
| **Owned** (§6.2) | reddish | only with "system" enabled | **never** |

The owned block is **always** read-only so that the schema cannot be bypassed
through free text; those fields are edited in the Inspector.

For the foreign block the interface separates **visibility from writability**:
it appears as soon as the display is on and is changeable only with the
"writable" switch. An earlier version had the same switch control *visibility*,
which confused users, because "writable" names a property of the content, not
its visibility.

**Read-only MUST be enforced by presenting a different control, not by
disabling one.** Two obvious alternatives are rejected from experience:
suppressing pointer events blocks the mouse but **not the keyboard** — anyone
already focused in the field keeps typing; disabling the control removes focus
but greys the text out and prevents selecting it for copying. Read-only here
means: readable and selectable, only not changeable (`CONVENTIONS.md` C-U6).

Three switches in the editor header, persisted: "Show variables" (main switch,
default **off**), and below it "Writable" (default **off** — looking is the
harmless starting state) and "System" (default on). The two sub-switches appear
only when the display is on.

**Height: show everything, but at most 10 lines**, then scroll. Each block is
as tall as its content up to that cap.

**Compute with measured text height, not font metrics.** Two attempts in the
functional template failed — first a guessed constant, then a measured font
metric — because the layout engine applies its own line spacing. The rendered
height MUST be measured and the cap applied **proportionally**. The rule itself
lives in a pure, unit-tested function, not in the component.

Both blocks are draggable, each with its own divider, and dragging can only
**enlarge**: the effective height is the maximum of content height and dragged
height. Shrinking below the content would hide exactly what the feature exists
to show.

**The dragged height is deliberately not persisted.** It lives as component
state until the sheet changes. The area serves looking something up, not
extended editing; a stored size would make a one-time curiosity permanent. This
is the deliberate counter-case to the column widths (§8.2), which are a working
environment and do persist.

**The owned block MUST be produced by the same serializer used for saving**,
with the lines between the `---` markers extracted from it. Display and file
then cannot drift apart, and a newly added field appears automatically. An
earlier version rebuilt those lines by hand and showed a bare `|` for `notes`
while omitting several fields entirely.

### 10.5 Editor status bar

**Status: Accepted.**

The status bar is divided: **information on the left, controls on the right**.

- Left: cursor position (line and column). This is a *different* datum from the
  later line-number gutter (§18): the gutter numbers **all** lines, the status
  bar says **where the cursor is**. Established IDEs show both, and the gutter
  round therefore MUST NOT remove the cursor position.
- Right: word-wrap toggle, and later the zoom slider (§18).

The editor header (not the status bar) carries the document name and the save
action, plus the front matter switches from §10.4.

Progress figures (characters, words, reading time) belong to the Inspector
(§11), not to the status bar.

### 10.6 External changes, saving, and conflicts

**Status: Accepted. This section encodes hard-won rules; deviating from them
reintroduces known defects.**

Two independent mechanisms observe the filesystem:

- a **directory watcher** for the selected group, reacting to structural
  changes (files added, removed, moved); and
- a **file watcher** for the currently open document, reacting to content
  changes, moves, and deletion.

Both live in the main process and report through the versioned bridge. Both are
debounced and coalescing.

**No autosave.** The document is saved on explicit user action. An exception is
allowed only where the user's action itself implies a write (for example
"Open with an external application", §18), and that exception MUST be stated in
the specification, not improvised.

**Conflict dialog only on a real content difference.** The file watcher also
reports the application's **own** save as a change, asynchronously, possibly
after the user has typed on or switched documents. A change notification is
therefore never sufficient evidence: the handler MUST first read the actual
content from disk and compare it (body plus metadata equality) against the
loaded baseline. Only on a real difference does it either show the conflict
prompt (when the buffer is modified) or silently reload (when it is not). If
the disk state is identical, nothing happens (`CONVENTIONS.md` C-F2).

**Separate guards for reading and writing.** The status refresh (reading) and
user-triggered writes MUST have their own in-flight guards, not one shared
"busy" flag. A shared flag makes a background refresh swallow a user action,
which presents as "the click did nothing" (`CONVENTIONS.md` C-F3).

**Coalescing, not queueing.** If a refresh is requested while one is running,
exactly **one** further refresh is scheduled afterwards. This makes a change
that occurs after the running read started reliably visible without double
firing.

**The editor holds the body, and the codec puts the file back together.**
What the writing surface receives is the body alone; front matter never enters
it (§10.4). On save the codec reassembles owned fields, foreign lines, and the
edited body into the file. This is what makes §6.3 hold in practice: an author
editing prose cannot damage front matter they were never shown, and foreign
keys survive an edit that had nothing to do with them.

**A sheet with a front matter diagnostic is not written back.** It is shown,
and marked read-only in the editor header. Saving it would mean guessing what a
malformed block meant (§6.2).

**Writes are atomic.** A sheet is written to a temporary file in the same
directory and renamed into place. A rename within one directory is atomic on
every supported platform, so an interrupted save cannot leave a half-written
manuscript behind, and a failed write removes its temporary file.

## 11. Secondary sidebar views

**Status: Inspector and Outline accepted; AI and Snapshots draft.**

- **Inspector** — metadata of the active sheet: progress (characters, words,
  reading time), topic, keywords, status, category, and notes. Progress counts
  the body only: front matter is metadata, and counting it would make the
  figures jump when a keyword is added. Reading time uses 200 words per minute,
  a conventional value held as one constant so it can become a setting without
  changing the rule. This is the only
  place where owned front matter fields are edited (§10.4).
- **Outline** — the heading outline of the current text; clicking a heading
  jumps to its line. Visibility rule: H1 and H2 always, H3–H6 only with the
  deeper-levels toggle enabled. That rule is a pure, unit-tested function, not
  component logic. The outline is its own view, not a section of the Inspector:
  the Inspector shows metadata only.
- **AI assistant** — a docking point for the provider interface (§15), not a
  full assistant in the first release.
- **Snapshots** — per-sheet snapshots with a difference view and restore.
  **Draft**: both the storage location (inside `.opera-incerta/`, visible to Git,
  versus installation-local and not portable) and the difference engine (own
  line diff in the core versus a dependency) are open, and restore is
  destructive and therefore requires a confirmation prompt. The difference
  presentation SHOULD be built once and used by both Snapshots and source
  control (§12).

## 12. Source control

**Status: Accepted for the read-only and staged-commit slice.**

Git is the synchronization mechanism (§5.1). Source control is a view in the
Navigator, implemented as a module (§15) over the **locally installed `git`
executable**, invoked from the main process. No Git library dependency and no
bundled Git binary.

**Reading.** `git status --porcelain=v1 -z` is parsed by a pure function in the
core into staged / unstaged / untracked groups; conflicts count as unstaged.
Paths from `git status` are relative to the **repository root**, not the
project root, and can point outside the project directory. The service MUST
resolve and report the repository root and build absolute paths against it.

**Live updates.** While the source control view is visible, a watcher observes
the resolved repository root recursively and refreshes the status debounced
(about 400 ms, coalescing). The watcher runs only while the panel is visible,
is re-established on project change, and stays off for projects without a
repository.

**`.git` filter against self-triggering.** The watcher MUST evaluate the changed
paths and refresh only when at least one event concerns the working tree (a
path with no `.git` component). `git status` opportunistically writes inside
`.git`; without this filter every refresh would re-trigger itself (`CONVENTIONS.md` C-F4).

**Writing — the commit model.** The panel follows the established commit
pattern, top to bottom: a small toolbar with refresh; a flat list of all
changes with **one checkbox per file** (checked means staged); a header showing
the change count with a tri-state select-all checkbox (all / none / partial)
that stages or unstages everything in **one** batch call, so the in-flight
guard applies once to the whole action; a commit message field; and the
stacked "Commit" and "Commit and push" actions, both enabled only with staged
changes and a non-empty message.

**Unstaging before the first commit.** `git restore --staged` resolves against
`HEAD`, which does not exist in a repository without a commit — the state a
freshly created project is in. There the path is removed from the index
instead, which is the same outcome for content that was never committed.

**Push** runs against the resolved repository root using the system Git
credentials. Deliberately **no** upstream creation, **no** pull or fetch. A
missing remote or failed authentication surfaces the Git error message; it
never crashes. If the commit succeeds and the push fails, the commit stands,
the message field is cleared (it was committed), and only the push error is
shown.

Git output is tool output and is never localized (§14.2).

**Not goals of this stage:** pull/fetch, upstream creation, branches,
merge and conflict resolution, amend, discarding changes (destructive, needs
its own round with a confirmation prompt), and editing `.gitignore`.

## 13. Settings contract

**Status: Accepted structure; individual values draft.**

Settings use a category list and one focused content region. Every setting has a
stable identifier, one owner, a bounded value type, a default, and an explicit
scope. New settings extend the category registry; they do not add unrelated
controls to a toolbar.

**A workbench preference MUST NOT modify a Markdown file, mark a document
dirty, or change file content.**

| Category | Purpose | First settings |
| --- | --- | --- |
| Appearance | Local workbench presentation | interface language, color scheme, interface font size |
| Editor | Writing readability | editor font family (curated list, not a full system font picker), editor base font size, word wrap default |
| Sheet list | Library overview | density step, show blank lines in preview |
| Page categories | Project classification | add, rename, recolor, delete (§6.6) — project data, not a preference |
| Markup | Input shortcuts (§10.2) | editable shortcut table; Markdown target syntax fixed |
| Privacy | What may leave the machine | AI provider selection and per-action consent (§15) |

Later, deliberately unimplemented categories: backup, styles, keyboard,
accessibility, updates.

Heading sizes H1–H6 scale proportionally with the editor base size, keeping
fixed ratios to the base hierarchy.

**Behavior.** Changes apply immediately and are stored installation-locally.
Unsupported versions, malformed values, and unavailable storage MUST fall back
safely without blocking the editor. Reset restores the complete default record.
The settings dialog is reachable from the workbench and from the native
`Cmd/Ctrl+,` menu shortcut. Escape and an explicit close dismiss it; keyboard
focus stays inside the modal and returns to the invoking control.

**Persistence and evolution.** The record is one versioned JSON document under a
stable key, validated at the application boundary. Unknown fields are
discarded, and **a single malformed value costs that one setting rather than
the whole record** — an unreadable preference must not send the author back to
defaults everywhere. Both sides validate: the renderer because it must not
trust a file, and the writer because a malformed record should never be
written at all. An incompatible schema requires an explicit migration or a new
versioned key; components MUST NOT parse storage directly. Settings needing
project, document, or view scope require their own design and MUST NOT be
smuggled into the installation-local record. Secrets never enter it (§5.3).

**Stored keys are user data.** A key is not renamed when the concept it names is
renamed: renaming it would silently reset every user's setting. Where a key
name no longer matches current terminology, the divergence is documented in
code rather than "fixed" (`CONVENTIONS.md` C-N3).

**Component pattern.** One preferences service owns validation, persistence,
system-theme observation, and reactive values. One localization service owns
the catalogues. The settings panel owns presentation and category navigation.
Consumers receive only the values they need; the portable core depends on none
of this.

## 14. Localization

**Status: Accepted.**

### 14.1 Model

Base language is **English**. The first release ships English and German
interface catalogues. This differs from the functional template, whose base
language is German with source strings as keys; the catalogue approach is
chosen here because the renderer is Angular and because symbolic keys survive
text changes without producing translation debris.

Keys are **symbolic and stable** (for example `panel.outline.title`), never the
literal interface text. Plurals MUST use the platform plural rules, never a
hand-written two-form conditional: other languages have more than two plural
forms. Because a wrong key falls back **silently**, plural resolution MUST be
unit-tested.

The interface language also drives the application-owned native menus and
dialogs through the validated bridge. Changing it applies without a restart.

### 14.2 Data is not interface

Not every visible text is interface. **Never localized:**

- **category names** — written into `categories.json` at project creation and
  user data from then on, renameable. A project created in German shows them in
  German in an English interface, because that is what the file says. Like a
  folder name.
- **file names, sheet titles, keywords, notes, topics** — user content.
- **Git output** — tool output, shown as produced.
- **project and document names** in headers — see the verbatim title form
  (§8.3).

This distinction MUST be visible in the code: interface text goes through the
localization service, user data goes through a verbatim path that cannot become
a translation key.

### 14.3 The core is text-free

`packages/core` contains **no** user-visible messages. Failures are typed cases
without display text; the mapping from case to localized text happens in the
renderer. The data layer must know nothing about interface or language.
Failures the application does not produce itself (filesystem, Git) fall back to
the underlying message.

**Not goals of this stage:** right-to-left languages, localized help, and
translation of the project documents, which remain English.

## 15. Module concept and extension boundaries

**Status: Accepted.**

Core requirement: **functionality must be extensible without touching the
core.**

- Each capability (an export format, an import source, an AI action, a file
  badge rule) is its own workspace package with a declared interface.
- The core knows only the interfaces, never the concrete modules.
- Modules register in one registry and provide their own entry points (menu
  items, toolbar actions, sidebar views).
- A missing or failing module MUST NOT crash the core.
- When it is unclear whether something is core or module, start as a module —
  that is the safer default.

**Import and export.** Candidates for export: Markdown (raw), PDF, DOCX, EPUB,
plain text. For import: Markdown, DOCX (text extraction), plain text. Every
format is its own module; export modules MUST strip front matter from the
output. The concrete list and its order are open (§19).

**AI integration.** Concrete AI actions never address a vendor directly; they
address an `AIProvider` interface (input: text or structure plus action type;
output: suggestion or revised text). Vendors are interchangeable
implementations selected in settings. Planned action shapes:

- pass the **full text** of one sheet for revision, shortening, or style work;
- pass **structure only** — the outline of several chapters — to improve
  arrangement without transmitting the full text (a privacy advantage for
  sensitive content);
- pass `topic` (§6.2) as compact per-sheet context for actions spanning many
  sheets.

API credentials go to `safeStorage` (§5.3), never into a plain preference
record and never into the project directory. No AI action runs without an
explicit user request, and what leaves the machine is controlled by the privacy
settings (§13).

## 16. Diagnostics and failure behavior

**Status: Accepted.**

- Every user-visible failure carries a **stable diagnostic code** and a source
  reference where one exists (file, and line where meaningful).
- A failure to read one sheet MUST NOT abort a library scan; the affected item
  is marked and the scan continues.
- A malformed `structure.json`, `categories.json`, or `project.json` falls back
  to the documented default behavior (§6.4, §6.6) and reports the problem; it
  never blocks opening the project.
- Destructive actions (restore a snapshot, discard changes, delete a category)
  require an explicit confirmation naming what will be lost.
- The application MUST NOT write to a file it failed to fully read.

## 17. MVP acceptance criteria

**Status: Accepted.**

The MVP is accepted only when all of the following are demonstrated with
original fixtures:

1. A directory containing `.opera-incerta/project.json` opens as a project; a
   plain directory can be adopted; a directory containing subprojects gives the
   specified guidance.
2. The three-column library shows the tree, the sheet list with its three
   density steps and formatted previews, and the editor.
3. A sheet is created from the group context menu with a slugged file name, a
   `title` in front matter, and an empty body, and is selected afterwards.
4. Renaming a sheet changes only its front matter title; the file name is
   unchanged.
5. Reordering and renaming groups writes `structure.json` and degrades
   gracefully when the file is absent or stale.
6. A file carrying foreign front matter survives open and save byte-identically
   except for the application's own fields, and a second save changes nothing.
7. Typing `.h1`…`.h6` produces heading display plus a gutter label, writes
   `#`…`######` to disk, and does not carry the format into the next paragraph.
8. The gutter menu changes and removes heading levels.
9. The front matter area shows owned and foreign blocks with the specified
   visibility, writability, height, and read-only behavior.
10. The Inspector shows and edits topic, keywords, status, and notes, and shows
    progress figures.
11. The outline lists headings, jumps to lines, and honors the deeper-levels
    toggle.
12. Page categories are defined, assigned, shown as badges with computed text
    color, and tolerate unknown or deleted UUIDs.
13. An external change to the open file reloads it when unmodified and prompts
    when modified — and the application's own save triggers neither.
14. An external structural change to the current group appears without a manual
    refresh.
15. Source control lists changes, stages and unstages individually and as a
    batch, commits, and pushes, with errors surfaced and no self-triggering
    refresh loop.
16. Column widths are draggable, clamped, persisted, and unaffected by view
    switches in either region.
17. Every panel header has identical height and separator placement.
18. Settings change interface language, color scheme, and editor font
    reactively, and no setting modifies a document.
19. The application runs with no network access at any point.
20. Open, save, save-as, dirty-state protection, secure bridge behavior,
    packaged launch, and the native installer pass on every supported platform
    (`TESTING.md` §2.7).
21. Every acceptance criterion above has a named test or a reviewed manual
    verification in `TESTING.md`.

## 18. Roadmap after the MVP

**Status: Draft — order and scope open.** Derived from the functional
template's open work; each item needs its own round and its own specification
update before implementation.

**Phase 2 — editing comfort**

- **Line-number gutter** as a second column left of the marker gutter. On a
  wrapped line the number appears only at the first visual line; the next
  number appears at the next logical line. The gutter scales with the zoom
  factor, and line heights are **measured, not computed** (`CONVENTIONS.md`
  C-U5). The status bar is untouched (§10.5).
- **Editor zoom slider** at the bottom edge of the editor: 50 % minimum, 200 %
  maximum, a distinct detent at 100 %. **Only the editor scales** — its text
  and its gutters; library, tree, and sidebar are unaffected. It is a pure
  display factor: the configured base size stays untouched, which is exactly
  why the detent at 100 % is unambiguous. Stored installation-locally, never in
  `.opera-incerta/` — a viewing preference must not travel through Git.
- **Inline markup rendering** (§10.3), staged as specified.
- **Full GFM display**: strikethrough, inline code, code blocks, block quotes,
  ordered and unordered lists, task lists, horizontal rules, hard breaks, and
  escapes. Each attribute's presentation is decided **before** its
  implementation round. Links, images, and tables are explicitly delicate and
  each get their own concept round. Inline HTML passes through as plain text;
  emoji shortcodes are not a goal.

**Phase 3 — library and workflow**

- Drag a sheet into another group: always move, never copy; the drop target
  determines the position (appended at the end of that group's order). The file
  moves physically and both `order` entries are rewritten in one write. Open
  questions before implementation: name collision in the target directory
  (a suffix would change the stable technical identifier, which otherwise never
  happens), the sheet being open in the editor, dropping onto its own group
  (a no-op), and whether multi-selection is in scope.
- Source control "show diff" and "discard changes" (destructive, confirmation
  required), and opening a file from the change list (only `.md`, resolved
  against the repository root).
- Recently edited sheets, per project rather than globally.
- Markdown import as a module, including collision and folder-structure rules.
- Highlighting of special files (project governance and agent-instruction
  files) in the tree and sheet list. This requires a **deliberate scanner
  extension** — hidden files and non-`.md` files are not scanned today — and a
  configurable matcher list, not merely styling.
- "Open with an external application" using the operating system's registered
  application list, storing the choice by bundle or application identifier
  rather than by path, and saving before handing the file over.

**Phase 4 — extension**

- Export modules (PDF, DOCX, EPUB), each independently testable.
- The AI assistant panel over the provider interface (§15).
- A terminal panel in the bottom region, working directory at the project root.
- Snapshots with a shared difference view (§11).
- Colour schemes and themes behind a theme interface.
- A local search index as a **performance cache** only, introduced when
  file scanning becomes noticeably slow — installation-local, rebuildable, and
  never the source of truth.

## 19. Open design decisions

The following are deliberately open and MUST be decided before the code that
depends on them:

- trademark clearance for the accepted product name before public
  distribution;
- the Markdown parser (§5.4), needed for full GFM rendering and for the
  independent conformance cross-check of the front matter codec;
- the mechanism for non-line-wise markup elements (§10.3);
- the concrete import and export format list and its order;
- which `AIProvider` implementations ship first and which is preselected;
- the snapshot storage location and difference engine (§11);
- whether the editor's context menu is filtered or fully owned — the platform
  menu may offer text-rewriting actions that do not respect the display model;
- the accessibility target for the workbench; and
- the distribution channel and update mechanism.

## 20. Sources consulted

Requirements and lessons in this document derive from:

- `thothpad/SPEC.md`, `thothpad/AGENTS.md`, `thothpad/TODO.md`, and
  `thothpad/README.md` — the functional template, including its recorded
  defects and their causes;
- `c4ml/AGENTS.md`, `c4ml/SPEC.md`, `c4ml/TESTING.md`, `c4ml/SETTINGS.md`,
  `c4ml/PLATFORMS.md`, `c4ml/PROJECTS.md`, and `c4ml/DEPENDENCIES.md` — the
  technical template, whose measures are extracted in `CONVENTIONS.md`; and
- public documentation of the platform technologies named in §5.

No third-party source code, grammar, documentation, fixture, or visual asset
was copied into this specification.
