# Opera Incerta Specification

Status: Draft 0.4 — §6 to §14 are built and verified; §15, §18 and §19
hold what is not

Date: 2026-09-10

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
  be tidied away (`conventions.md` C-N1).

**Superseded note (2026-09-01).** An earlier version of this section kept
`writers-ide` as the technical name while the product became Opera Incerta,
which the naming rule expressly permits. The identifiers were then aligned by
explicit decision, because the project had no released artifact, no user file,
and no stored preference — the only moment at which such an alignment is free.
That window is now closed: the next product rename does not get to repeat it.

**License.** Opera Incerta is licensed under the Apache License 2.0.
Third-party dependencies keep their own
licenses and notices; the repository's license does not relicense them
(`conventions.md` C-L5).

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
- No mobile or tablet platform. Electron cannot deliver one, so the equivalent
  investment goes into Windows and Linux parity instead. A future mobile client
  would be a separate product sharing only the file format.
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

Part of the requirements comes from the author's own earlier work: a native
macOS writing application built in Swift and AppKit. Own prior work is a
legitimate requirements source, but that implementation is not portable and is
**not transliterated**. Each behaviour is re-derived here as a platform-neutral
requirement and implemented natively for the Electron/Angular stack. This
document is the requirement; there is no other document to consult.

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
runtime rather than silently downloading one (`conventions.md` C-P1).

### 5.2 Repository layout

**Status: Accepted, names draft.**

The checkout directory name is not part of the contract; only the identifiers
inside the repository are.

```text
opera-incerta/
├── AGENTS.md            working process and invariants
├── README.md, CONTRIBUTING.md, SECURITY.md   public entry points, each with a German pair
├── docs/
│   ├── en/, de/         user documentation, release notes, platform matrix (platforms.md)
│   └── engineering/
│       ├── specification.md   this document
│       ├── testing.md         required validation evidence
│       ├── conventions.md     inherited design and handling measures
│       ├── dependencies.md    dependency purpose, license, boundary
│       ├── roadmap.md         open work
│       └── completed-work.md  completed work, with its reasoning
├── package.json         workspace root, pinned engines, check scripts
├── pnpm-workspace.yaml
├── apps/
│   ├── desktop/         Electron main process, preload bridges, packaging
│   └── workbench/       Angular renderer (the workbench UI)
├── packages/
│   ├── core/            portable domain: codec, transforms, pure rules
│   ├── desktop-contract/ versioned IPC contract shared by main and renderer
│   ├── markdown/        markdown-it tokens translated into the core's block model
│   ├── export/          assembles the library into one document and renders it
│   ├── localization/    English and German catalogues
│   ├── project-node/    Node.js project/filesystem adapter
│   └── git-node/        Node.js Git adapter (process wrapper)
├── scripts/             repository checks run by `pnpm run check`
├── spikes/              the editor and parser spikes
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
- That rule applies to **every relative path a request carries** — a library
  entry, a watch target, a repository path for a diff, a resolution, a discard
  — not only to document handles. The contract applies it in one guard that
  every request type with a path calls, so no request type can leave it out;
  the main process resolves every such path through one containment check,
  so no handler can leave that out either. A handler that skipped the second
  check once let `git diff --no-index` read any file the author can.
- IPC from untrusted pages is rejected; external navigation, new windows,
  permission requests, and webviews are denied.
- A local content-security policy applies to all renderer content.
- Expensive work — full library scans, full-text search, large-document parsing
  — MUST run off the renderer UI thread (Web Worker in the renderer, or the
  main process behind the bridge).
- Any secret (an AI provider API key) is stored through Electron `safeStorage`,
  never in the plain preference record and never in the project directory.

### 5.4 Dependency decisions

**Status: The editing surface, the test-time standard oracle, and the
runtime Markdown parser are accepted; the remaining entries are draft and
each requires the report in `AGENTS.md` before acceptance.**

**CodeMirror 6 is the accepted editing surface (2026-09-01).** It passed all six
criteria of the spike gate in `testing.md` §2.8, measured in a real rendering
engine: heading lines at different sizes in one document, a gutter aligned to
measured line heights across a heading wrapping over eight visual rows, inline
markers hidden except on the cursor's line, per-document undo across document
switches, an intact paste, and a 6.6 ms p95 keystroke latency in a
112,000-character document against a 16 ms threshold. The evidence lives in
`spikes/editor-codemirror`.

| Capability | Candidate | Boundary that keeps it replaceable |
| --- | --- | --- |
| Text editing surface | CodeMirror 6 (**accepted**) | An Opera-Incerta-owned `EditorAdapter` interface; the display model stays in the core, and the component only renders it |
| Markdown parsing | commonmark.js and `yaml` as the test-time oracle (**accepted 2026-09-04**, tests only); markdown-it for the GFM display (**accepted 2026-09-04**, §10.7) | The parser's tokens are translated in `packages/markdown` into the core's own `BlockModel`; parser types MUST NOT become the public model, and the production check keeps its command-line dependency out of the bundle |
| Filesystem watching | Node.js `fs.watch` with a debouncing layer, or `chokidar` | One `LibraryWatcher` interface in the Node adapter |
| Git | The locally installed `git` executable via `child_process` | A `GitService` interface; no Git library dependency, no bundled Git |
| Front matter | Own line-preserving reader/writer (§6.3) | Not a general YAML parser; see the reasoning in §6.3 |

**The Markdown parser, measured 2026-09-04.** Four candidates ran against the
gate of `testing.md` §2.11 and none passed every criterion. What the
measurements say: markdown-it and commonmark.js are conformant (652 of 652
examples), marked is not (587), micromark nearly (648) but slow (164 ms) and
large (43 packages). The parser has two jobs that no single candidate fits:
the **test-time oracle** of `testing.md` §2.2 needs conformance, positions,
and a small footprint, and no GFM — commonmark.js, the reference
implementation, with `yaml` beside it for the front matter; the **GFM
display** of §18 needs tables, strikethrough, and task lists at runtime —
markdown-it, short of task list items and carrying one PSF-2.0 dependency.
Both need the gate read as two gates, which is a decision, not a
measurement — **taken on 2026-09-04**: the test oracle is accepted as two
development dependencies of the core, with the cross-check a fixed test of
the gate (`testing.md` §2.2); and markdown-it is accepted for the GFM
display (§10.7) the same day, its two deviations settled as recorded in
`dependencies.md` — task list items are the translation layer's rule, and
the PSF-2.0 command-line dependency is kept out of the bundle by the
production check. The cross-check paid before the decision: it found two fence
defects in the display transform and four in the codec, all fixed the same
day (`completed-work.md`).

Note on the editing surface: Monaco is the obvious alternative and is built for
source code. Opera Incerta displays headings at **different sizes in the same
document**, which a fixed-line-height code editor does not support well.
CodeMirror 6 supports variable line heights and decoration-based rendering,
and the spike confirmed every part of that in practice.

### 5.5 Where the platform decides

**Status: Accepted.** Several requirements have no platform-neutral answer:
the same behaviour needs a different mechanism here than a native macOS
application would use. These are the decisions, each stated once and referenced
from the section that owns it.

| Concern | Decision |
| --- | --- |
| Text editing surface | An editor adapter over a web text-editing component (§5.4) |
| Watching the library | One main-process watcher with debouncing and coalescing (§10.6) |
| Watching the repository | The same watcher, scoped to the repository root, with the `.git` filter (§12) |
| Preferences | One versioned JSON record in the Electron user-data directory (§13) |
| Secrets | Electron `safeStorage`, never a plain-text preference (§5.3) |
| Icons | Locally packaged, hash-pinned SVG with documented license — no icon font, no remote fetch |
| Running `git` | The renderer stays sandboxed; `git` runs in the main process only (§5.3) |
| Recent projects | Plain paths in the installation-local record (§7.2) |
| Modules | pnpm workspace packages, one per module (§5.2, §15) |
| Tests | Vitest plus a packaged Electron smoke test (`testing.md`) |

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

**What the reader reads, and what it refuses.** The owned block follows a
schema this project defines, and the reader reads exactly that schema: a plain
or quoted scalar on the line for `title`, `topic`, `status`, and `category`;
an inline list (`[a, b]`) or a block sequence (`- a` lines) for `keywords`; a
scalar or a literal block (`|`, `|-`, with the content's indentation read from
its first line) for `notes`. An owned field in any other YAML shape — a folded
block, a keep indicator (`|+`), an explicit indentation indicator, a mapping
under a scalar field — and an owned field that appears twice are **refused
with a diagnostic and the file is read-only**, exactly like a malformed
namespace. The alternative, carrying such a field as unknown lines, honoured
"saving discards nothing" to the letter and broke it in spirit: the writer
regenerated the field beside the original, and the file left with the same
key twice in one mapping, which is not YAML for any reader. A value the
reader cannot read is not preserved by writing around it.

**Why the namespace.** Front matter is a shared namespace with no owner: a file
may already carry keys from Jekyll, Hugo, Astro, Obsidian, Pandoc, or an
agent-instruction convention before Opera Incerta ever opens it. A bare `status`
or `title` there means whatever that other tool means by it. Without a
namespace, the application would silently adopt a foreign `status` as its
workflow state and write its own meaning back into it — a data error that no
round-trip rule can catch, because nothing is lost, only reinterpreted.

A namespace is cheap here and expensive later: introducing one once files exist
changes the format of every file already written. This project starts with no
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
parsed model (`testing.md` §4).

**An `opera-incerta:` key with no children is an empty mapping**, not a
malformed one: that is the state a freshly created block has. So is the
inline spelling, `opera-incerta: {}`.

**What is a front matter block at all.** A `---` on the first line opens one,
and the next `---` line closes it — the convention every front-matter-aware
tool shares. But front matter is a mapping, and a block with **no top-level
key in it** is not one: a poem between two rules, a heading under a rule, are
Markdown that happens to begin with a thematic break, and the whole file is
the body. Nothing is lost either way — the rule decides where the text is
*shown*, in the editor rather than in the front matter area — and a file
without front matter gains an owned block in front of its body on the first
save that needs one, like any other. The empty block, `---` directly over
`---`, stays a front matter block with nothing in it. A block that carries a
key and is never closed is unterminated and read-only, as before.

**Diagnostics.** The codec reports stable codes without display text
(§14.3): `front-matter/unterminated`, `front-matter/namespace-duplicated`,
`front-matter/namespace-not-a-mapping`, `front-matter/field-unreadable`, and
`front-matter/field-duplicated`. Every one of them marks the file read-only,
and in that state nothing is claimed as owned, so even a mistaken write could
not regenerate a field over the original.

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
verbatim in their original relative order — with one exception that the
indentation rule forces: foreign lines at the very head of the block that are
**indented** have no top-level key of their own, and written after the owned
block they would continue it and be read as owned fields on the next load. A
leading run of such lines, blank lines among them included, therefore keeps
its place in front, and the owned block goes before the first line that can
stand alone. The round trip MUST be idempotent: saving twice produces the same
bytes as saving once.

This rule exists because the obvious implementation loses every foreign key on
the first save: a reader that ignores unknown keys, paired with a writer that
rebuilds the block from the known fields, deletes them **silently** — nothing
is mangled, so nothing looks wrong. It is covered by mandatory tests
(`testing.md` §2.2).

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
  depend on the machine (`testing.md` §1.8);
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

Categories are **project data, not a setting** (§13 is installation-local), so
they are defined where a sheet is edited: the Inspector assigns one and opens
the manager that adds, renames, recolors and deletes them. The manager edits a
copy — closing it without saving leaves the project as it was.

A category the author has assigned but not yet **saved** is already shown as
the sheet's badge, for the same reason a title being edited is already shown as
its name (§6.4): an edit that nothing visibly answers looks like an edit that
failed.

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
nothing proves (`testing.md` §1.4). A press becomes a drag only after the
pointer has travelled a few pixels, so an ordinary click stays a click.

It is owned by the shell rather than by either library column: a drag that
starts in one and ends in the other belongs to neither. The columns describe
their rows in the DOM — what they are, where they sit, what they are called —
and the shell measures and decides.

## 7. Storage model

**Status: Accepted.**

**The port is the only way to the disk.** `packages/project-node` declares
one `ProjectFilesystem` port — records, sheets, directory listings with
their kinds, directories, moves — and every filesystem access of the shell
and the session goes through it; neither imports `node:fs`. Two
implementations exist, one over the disk and one in memory, and one contract
suite runs against both, so the double behaves like the real thing or the
suite says so. A record file that is **there and cannot be read** is a
failure, not an empty record: every edit re-reads and rewrites it, and an
empty record written back would replace the author's arrangement with
nothing. Only a missing file, or a malformed one, takes the documented
fallback. Records are written the way sheets are, atomically.

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

Documentation and code identifiers are both English (§14), and the mapping
above is normative wherever a region is named.

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

#### The regions are panels on a canvas

**Accepted 2026-09-09**, completing the visual system of §8.8 and §8.9.

The two activity bars are the window's **rails**: flush against its edges,
full height, on `--wi-navigation-bg`, with no corner of their own. They are
chrome, not content.

Everything between them is **canvas** (`--wi-canvas`), and the four regions
sit on it as **panels**: `--wi-panel`, `--wi-radius-panel`, a `--wi-line`
border, and `--wi-panel-shadow`. A panel clips its content, so a header meets
a rounded corner rather than running past it.

**The air is 8px** (`--wi-space-3`) — around the group and between the panels.
Between two panels **the gap is the divider**: the draggable strip of §8.2 is
exactly that air, so it is both the separation one sees and the thing one
grabs. It draws no line of its own, because the gap already separates; it
shows the resize cursor, and takes the accent while it is dragged or focused.

**What does not change.** A stored width is still the panel's own width, and
the table above still holds: the air is not part of a column, and dragging
still moves one number. At the minimum window width the panels, the rails and
the five gaps together take 1 038 px of 1 400, so the editor keeps well over
its 380 px.

**Why.** Three columns that meet edge to edge read as one surface divided by
lines; the same three with air around them read as three things, and the
manuscript reads as the thing in the middle. The other application in this
house is built that way, and this is the last piece that made the two look
unrelated.

### 8.3 Panel headers

**Status: Accepted.**

**Every panel has a header, and every header is the same shared component.**
Hand-built headers are a defect, not a matter of taste.

Reason: when each panel builds its own header, the height depends on the
*content* — a segmented control is taller than a text, a bordered button taller
than an icon button — so the separators of the columns sit at different heights
and the window looks unfinished. This has been built the other way round and
looked exactly like that.

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
fails a check rather than passing unnoticed (`conventions.md` C-L4).

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
| Settings… | `Cmd/Ctrl+,` | with a project open — the dialog lives in the workbench (§13); on macOS under the application menu, elsewhere under File |

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

Platform difference (`conventions.md` C-P4): closing all windows quits on
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
- an empty state with only the buttons and one explanatory line;
- at its foot, which build is running (§16).

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

**Status of the four: Implemented and validated (2026-09-09).**

Three of them are questions, not failures, and that is the rule the interface
follows: opening **reports what it found** rather than succeeding or throwing.
The main process classifies the folder and answers with one of five outcomes —
opened, cancelled, and the three questions — and the launcher decides what to
ask, in its own dialog. A folder that is not a project used to arrive in the
launcher as the diagnostic code `project/no-project`, which is the application
telling the author its own inner state instead of offering the obvious next
step.

What each question does with a yes:

- **adopt** — the folder keeps every file it has; the project adds only its
  record directory. The display name is the folder's own name, and the main
  process decides it: the renderer says *which* folder was meant, never what
  the project is called. Refused where the directory is not there or is
  already a project, because a path from the renderer is not a permission
  (§5.3);
- **the one subproject** — it opens by its own path, through the same handler
  a recent entry uses;
- **several** — nothing. There is no yes: the list names them and the author
  opens the one they mean. Guessing here opens the wrong manuscript.

The question is asked in the launcher's own dialog rather than in a native
message box, because what a click means is decided in the renderer's flows
(§8.7) and a native dialog would put a second, differently worded interface in
front of the same decision.

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


### 8.7 The shell renders; the flows decide

**Status: Accepted (2026-09-03).**

The workbench shell (`wi-root`) composes the regions and renders. What a
click **means** — which entries a context menu offers, what a prompt asks,
what confirming it does, which question a branch switch stops for — is
decided in plain classes that hold no Angular: one for the library
(`LibraryActions`), one for source control (`SourceControlActions`). They
take the stores and an overlay host, and every flow in them runs in a unit
test against the fake bridge, menu to prompt to store.

**At most one overlay at a time.** A menu, a prompt, a confirmation, the
branch list, the resolver, the diff, the ignore editor, and the category
manager are one value with a `kind`, not one signal each. Opening one
replaces another; confirming or cancelling takes it down. The conflict prompt
of §10.6 is the exception, deliberately: it is raised by a re-read rather
than by a click, so it belongs to the store and may stand beside whatever
the author had open.

**A menu entry carries what choosing it does.** Entries are `{ label, run }`;
the menu component reports the entry, and the shell runs it after the menu
is gone, so the entry may put up the next overlay. String identifiers that a
`switch` translated back into actions were one more place for the two to
drift apart.

**Why.** The shell had grown to a thousand lines, eight independent dialog
signals, and three hundred lines of flow logic that no test reached, because
the only way to reach it was to render the component. Nothing prevented two
dialogs at once. The flows are the part of the renderer most worth testing
and were the one part untested.

**One dialog shell.** Every dialog projects its content into `wi-dialog`,
which draws the backdrop and the centred panel, handles Escape, and carries
the ARIA role and name. What the content shares beyond that — heading,
header row, actions row, buttons, hint — is styled once, in the global
stylesheet under `wi-dialog`, because projected content is outside a
component's own styles. Eight dialogs used to carry their own copy of the
chrome, and the copies had drifted in offset, padding, and shadow.

**State is provided once and injected where it is read.** The stores, the
layout, the drag, the overlay, and the two action classes are provided at
the shell (`workspace/providers.ts`) and injected by the region that reads
them. A region's tag in the shell's template says only what the region is.
The alternative — every store value as an input, every action as an
output — had put fourteen inputs and eighteen outputs on the source control
panel and threaded the drag state through every level of the tree.

**A library row names itself by kind and path only.** Where it sits among
its siblings, what they are called, and which group holds it follow from
the library model, not from `data-` attributes; only the row's box needs
the DOM.

**A dialog's local copy of an input is a `linkedSignal`.** It seeds from the
input synchronously and re-seeds when the input changes, so a rename shows
the current name on first paint without a microtask.

### 8.8 The visual system

**Status: Accepted (2026-09-09), written before its implementation.**

Every colour, every face and every shadow in the workbench comes from a named
token, defined once in the renderer's global stylesheet. A component reads
`var(--wi-…)`; a colour literal in a component is a defect. Until this
section the workbench had five variables and a hundred and twenty-one
literals, most of them `rgba(128, 128, 128, …)` — a grey that belongs to no
palette and cannot be made dark.

**The values are the author's other application's.** Opera Incerta and C4ML
are two programs from one house and are meant to look like it: the ink, the
lines, the surfaces, the accent and its palettes are the same values, under
this project's own names. The values are recorded **here**, in this
repository, because the documents are self-contained (`AGENTS.md`): nothing
in the source or the specification refers to the other project to explain
what a colour is.

#### The tokens

| Token | Light | What it is |
| --- | --- | --- |
| `--wi-ink` | `#17263d` | text |
| `--wi-muted` | `#65758b` | secondary text, hints, disabled labels |
| `--wi-line` | `#d9e1ea` | separators inside a region |
| `--wi-line-strong` | `#c2ceda` | borders of controls and panels |
| `--wi-canvas` | `#eef3f8` | the ground the windows sit on |
| `--wi-panel` | `#ffffff` | a raised surface: editor, dialog, sheet list |
| `--wi-surface-subtle` | `#f8fafc` | a quiet band: headers, footers |
| `--wi-navigation-bg` | `#f3f6f9` | tree and list backgrounds |
| `--wi-control-bg` | `#ffffff` | a button's face |
| `--wi-control-ink` | `#40566b` | a button's label |
| `--wi-control-hover` | `#edf5f8` | a button under the pointer |
| `--wi-accent` | `#157ca3` | the one colour that means "this one" |
| `--wi-accent-strong` | `#126684` | the same, pressed |
| `--wi-accent-border` | `#b8d9e2` | an accented outline |
| `--wi-accent-soft` | `#dff3fa` | an accented fill |
| `--wi-focus-ring` | `rgba(21, 124, 163, 0.2)` | keyboard focus, never removed |
| `--wi-success` / `--wi-danger` / `--wi-warning` | `#187a62` / `#b53a4f` / `#9a6014` | the three states that mean something |

Three shadows — `--wi-panel-shadow`, `--wi-dialog-shadow`,
`--wi-app-bar-shadow` — and one `--wi-backdrop`, so a raised thing is raised
the same amount everywhere.

#### Light, dark, and the palettes

The root element carries `data-color-scheme` and `data-color-palette`.

- **Scheme**: `light`, `dark`, or the stored `system`, which follows the
  operating system and re-follows it when it changes. Dark is a **complete
  second set** of the same token names, not a filter over the first.
- **Palette**: `blue` (the default), `gray`, `yellow`, `green`, `violet`,
  `red`, `orange`, `turquoise`. A palette sets the four accent tokens and the
  focus ring; the surfaces are **derived** from the accent with `color-mix`
  rather than listed, so a palette is five values and a rule, not thirty.

Both are installation-local preferences (§7.2, §13) in the Appearance
category, beside the interface language: they say how this installation looks,
never what a manuscript contains, and they must not travel through Git.

#### Typography

**The interface speaks IBM Plex Sans**, packaged with the application in five
weights (400, 500, 600, 700, and italic) — never a system font: an interface
that looks different on every machine cannot be designed. IBM Plex Mono is
packaged for the places that are code rather than prose. The files are
unmodified upstream releases under the SIL Open Font License 1.1, documented
and byte-pinned like the icons (`conventions.md` C-L4, `dependencies.md`).

**The manuscript keeps its own face.** The editor's reading typography stays
what the author configured (§13) — serif by default — and the zoom of §10.9
scales it alone. The contrast is deliberate and is the oldest rule of this
kind of tool: the workbench is sans, the text is what the author writes in.

#### What this section does not decide

The **shape** of controls — radii, sizes, spacing, the anatomy of a dialog —
is the next round's; this one is colour and face. And a theme *interface* for
themes beyond these two schemes (§18, Phase 4) stays open: eight palettes
over two schemes are a decided set, not an extension point.

### 8.9 The shape of things

**Status: Accepted (2026-09-09), written before its implementation.**

§8.8 gave the workbench its colours and its face. This is its geometry: how
round a corner is, how much air a control has, and what a dialog is made of.
Like the colours, the values are the ones the author's other application uses,
so that the two look built by the same hand.

**Three radii and a pill**, as tokens, and nothing else:

| Token | Value | Used by |
| --- | --- | --- |
| `--wi-radius-control` | 7px | buttons, inputs, rows, badges, switches |
| `--wi-radius-panel` | 10px | menus, popovers, raised strips |
| `--wi-radius-dialog` | 16px | the dialog panel |
| `--wi-radius-pill` | 999px | a count or a state worn as a pill |

**One spacing scale**: 4, 6, 8, 12, 16, 20 — `--wi-space-1` to `--wi-space-6`.
A padding that is not on the scale is a decision that has to be argued.

**A control has a height**, not a padding that happens to make one:
`--wi-control-height` is 26px, with `0 9px` of side padding and a line height
of 1. Denser than the other application's 30px, because this workbench puts
three columns and two bars on the same screen; everything else about a control
is the same. An icon button is square at that height. Inside the status bar,
whose whole band is 24px (§10.5), controls take `--wi-control-height-compact`,
18px — a band cannot hold a control taller than itself.

**The two kinds of button.** The ordinary one is `--wi-control-bg` with a
`--wi-line-strong` border and `--wi-control-ink` text; under the pointer it
takes `--wi-accent-soft` and an accent border. The one that carries the action
— Create, Save, Open, Commit — is `--wi-accent` with `--wi-accent-strong` and
`--wi-accent-ink`. A dialog has **at most one** of the second kind, and it is
the last one in the row.

**What is active wears the accent on its edge**: `inset 3px 0 0
var(--wi-accent)`, in the activity bars, the settings categories, and the
selected row of a list. A selected row also takes `--wi-row-selected`; hover
takes `--wi-row-hover`.

**Focus is visible and is not the ring.** The other application draws focus
with `--wi-focus-ring`, a 20 % accent; at this application's smaller controls
that is too faint to find, so focus is a 2px `--wi-accent` outline with a 1px
offset. This is a deliberate divergence, and the only one.

**A dialog has three bands** (§8.7 keeps deciding what a dialog *does*; this is
what it looks like):

- a **header** on `--wi-surface-subtle`, closed by a line: the heading, and
  optionally an **eyebrow** above it — the section's name in the accent,
  uppercase, 10px, widely tracked;
- a **body** on `--wi-panel`, which is where the content lives; and
- a **footer** on `--wi-surface-subtle`, opened by a line, holding the actions
  at its trailing edge.

The panel is `--wi-radius-dialog`, bordered with `--wi-line-strong`, and lifted
with `--wi-dialog-shadow` over a blurred `--wi-backdrop`. A dialog that has
only a heading and a row of actions still has all three bands: that is what
makes eleven dialogs look like one dialog.

**What this section does not decide.** The region layout of §8.2 — the three
columns, their widths, and the dividers between them — is untouched: whether
the columns float as separate panels on the canvas with air between them is a
question about the workbench's anatomy, not about the shape of its controls,
and it would move measurements that §8.2 fixes.

### 8.10 Reachable without a pointer

**Status: Accepted (2026-09-10).**

The accessibility target of this application is stated as a rule rather than as
a standard: **every action is reachable without a pointer, every focused thing
is visibly focused, and every control says what it is.**

- A command that only a click can reach is a defect. Where a gesture is
  inherently a drag (§6.8), the same operation has a menu item and a shortcut.
- Focus is drawn, never removed (§8.9), and moves in the order things are read.
- Every button, switch and row carries its own accessible name, in the
  interface language (§14); an icon is decoration beside that name, never
  instead of it.
- A dialog holds focus while it is open and gives it back to what opened it
  (§8.7).

**Why not WCAG 2.1 AA as the promise.** That standard is a promise about
contrast ratios, screen-reader semantics and much else, and it is only honest
with tests to back it — a work strand of its own, not a line in a
specification. The rule above is the part that decides whether this
application can be used at all without a mouse, it is checkable in the smoke,
and it does not claim more than has been verified. The formal target stays
open (§19), and nothing here works against it later.

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
and expansion MUST survive that switch (`conventions.md` C-U2).

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
(`conventions.md` C-U3).

### 9.3 Searching the library

**Status: Accepted (2026-09-10), written before its implementation.**

The larger of the two searches (§10.11 is the other): finding a passage
anywhere in the project. It is a **third view of the navigator** (§8.1), with
its own entry in the leading activity bar — a region holds interchangeable
views, and this is one of them, beside the explorer and source control.

**Only the text is searched.** The body of every sheet, as it stands on disk.
Front matter is not searched — not the title, not the topic, not the keywords.
Filtering a library *by* its metadata is a different feature with a different
shape, and it belongs with the saved views of §18 rather than in a text
search.

**The results are a flat list, one row per match**: the sheet's display name,
the line number, and the line itself with the match marked. Ordered by the
library's own order, so the list reads in the order the manuscript does — not
by relevance, which a manuscript does not have. Activating a row opens that
sheet and reveals that line, which is the same path the outline already uses.

**A search is transient.** It is neither stored in the project nor in the
preference record: it lives with the window, like the wrap switch of §10.5.
Closing the project forgets it. Saving a search as a view is the §18 question
and stays open — deliberately, because a saved view is a query over the
library, and deciding where such a query lives is a storage decision, not a
search feature.

**It runs when it is asked to**, on Return or the button, not on every
keystroke: it reads every sheet in the project from disk, and a manuscript is
not a small directory. The reading happens in the main process, like every
other filesystem access (§5.3); the renderer receives matches, never paths it
could act on.

**Case is ignored**, by the same rule the editor's find uses — one rule, one
place, both searches.

**The cap.** At most 200 matches come back, and the view says when there were
more. A search that returns four thousand rows is not an answer; it is a sign
that the query was too short.

### 9.4 Where you have been

**Status: Accepted (2026-09-10), written before its implementation; built and
checked 2026-09-11.**

Two ways back to a sheet, and they are not the same thing.

#### Back and forward

A history of the sheets that were opened, with **back** and **forward** as an
editor offers for files: a linear list with a position in it. Opening a sheet
after going back **truncates what lay ahead** — the branch that was abandoned
is gone, which is the behaviour every browser and every IDE has taught.

- The history holds **sheets, not positions**. Where the cursor was is the
  editor's own memory (§6, per-document editing state), and going back to a
  sheet lands where it was left; keeping a second copy of that here would be a
  second truth about the same thing.
- A sheet that is **gone is skipped** — deleted, or moved to a new identity —
  and drops out of the history rather than reappearing as a failure.
- The history is **per project and transient**: it lives with the window, like
  the wrap switch of §10.5, and closing the project forgets it. What was
  opened is not knowledge about the manuscript.
- It is reached from the **Go menu** and its shortcuts, because the native
  menu owns accelerators (§8.5) and because a command that only a click can
  reach is a defect (§8.10).

#### Recently edited

A short list of the sheets that were **saved**, newest first, capped at ten.

- **Saved**, not typed in: a keystroke is not an event worth recording, and a
  save is a fact the author caused. Creating and renaming do not enter it —
  they are library edits, and the sheet enters when its text is written.
- It is **project data** (`.opera-incerta/`, decided 2026-09-10): it says
  something about the manuscript rather than about this installation, and
  after weeks away it is where it is looked for, on whichever machine.
- **What that costs, stated plainly:** the file changes on every save and
  travels through Git, so it will appear in the change list and can conflict
  between two machines. It is therefore a **convenience, never a source of
  truth**: a malformed or conflicted file is discarded and the list starts
  empty, exactly as an unreadable preference record does (§13, §16). Nothing
  in the manuscript depends on it.
- It is reached from the navigator's header, as a menu of the last ten —
  choosing one opens it, which also puts it into the history above.

## 10. Editor

### 10.1 Display model

**Status: Accepted. The editing component it is built on — CodeMirror 6 — was
accepted on 2026-09-01 (§5.4); this section's own rules never depended on
which component renders them.**

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
contain. The fence rules are CommonMark's: a backtick fence whose info string
contains a backtick is not a fence, and a closing fence may be followed by
spaces only (measured against the specification's examples, `testing.md`
§2.11).

**Known limits of the line-based transform.** It models no containers, and
no setext headings: `Title` over `===` is two paragraph lines to it (the
underline counts only for where indented code may start). An
indented line after a blank line inside a list item is that item's paragraph
to CommonMark and indented code to this transform, which shows it verbatim
(specification examples 108 and 109); and a whitespace-only line at the edge
of an indented code block is shown verbatim although it is not part of the
block (example 117), which nobody can see. Both are recorded here rather than
fixed: the first needs container awareness, which is the GFM display's round
(§18), and the second changes nothing visible.

**The component sits behind an `EditorAdapter` boundary.** The portable core
computes the display model — which lines are headings, which character ranges
are hidden — and the adapter translates it into the component's own
decorations. The interface carries no DOM type, so one contract suite can run
against both the real implementation and a double (`testing.md` §2.6). The
application speaks to the editor about text, lines, and heading levels; never
about elements or key events.

### 10.2 Heading formatting and the marker gutter

**Status: Accepted.**

Heading level is a property of the **whole paragraph** (the line), never a
character inside the text flow. The alternative — an inline attachment, a
movable character like an emoji — was implemented once and proved wrong in
practice: such a character can be moved accidentally and behaves like a text
snippet rather than a format. That approach is rejected and MUST NOT return.

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
attribute into the following paragraph is a defect (`conventions.md` C-U4).

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

**Status: Accepted; built 2026-09-04 with the GFM display (§10.7).** The
mechanism this section asked for is `presentation()` in the core: it turns the
display model and the block model into instructions — a range hidden, a range
replaced, a mark over a range — which the adapter draws one to one. The
behaviour below is what it does.

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
means: readable and selectable, only not changeable (`conventions.md` C-U6).

Three switches in the editor header, persisted: "Show variables" (main switch,
default **off**), and below it "Writable" (default **off** — looking is the
harmless starting state) and "System" (default on). The two sub-switches appear
only when the display is on.

**Height: show everything, but at most 10 lines**, then scroll. Each block is
as tall as its content up to that cap.

**Compute with measured text height, not font metrics.** Two attempts at this
have failed — first a guessed constant, then a measured font metric — because
the layout engine applies its own line spacing. The rendered
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

**Status: Accepted; built 2026-09-04 — the cursor position and the wrap
switch; the zoom slider of §10.9 joined them on 2026-09-09.**

The status bar is divided: **information on the left, controls on the right**.

- Left: cursor position (line and column). This is a *different* datum from the
  line-number gutter (§10.8): the gutter numbers **all** lines, the status
  bar says **where the cursor is**. Established IDEs show both, and the gutter
  round therefore MUST NOT remove the cursor position.
- Right: word-wrap toggle and the zoom slider (§10.9).

The editor header (not the status bar) carries the document name and the save
action, plus the front matter switches from §10.4.

Progress figures (characters, words, reading time) belong to the Inspector
(§11), not to the status bar.

**The column counts the visible text.** A heading's hidden `#` prefix is not
where the author is, so the column starts after it; the adapter reports
line and column as one `EditorCursor`, and the contract suite of §2.6 holds
every adapter to it. **The wrap switch is for this sheet, now.** It overrides
the settings' default (§13) for one sheet and lives with the window, not in
the preference record: a switch for reading one sheet is not a preference,
and must not be smuggled into the record as one.

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

**Built on Node's own `fs.watch`**, with no watching library. What such a
library mostly provides — coalescing, settling, normalising platform quirks —
this application already owns and tests: the coordinator, the debounce, and
above all the comparison rule below. A second answer to those questions would
be a second place for them to be answered differently. Three properties of the
platform were measured before the choice and each one is a rule in the adapter:

- **a file is watched through its directory, never by its own path.** A watch
  on a path stops reporting the moment that path is replaced by a rename —
  which is exactly how this application saves.
- **the event type carries no information.** One atomic save produced seven
  events, `rename` for ordinary writes among them, including events for
  directories that had not changed. Only "something under here" is usable.
- **a watch delivers a short history**, so changes made just before it started
  still arrive, and a non-recursive watch reports activity in subdirectories
  too. Both mean more notifications than asked for, never fewer — the harmless
  direction, given that the consumer compares before acting.

**The notification carries nothing.** It says "look again"; looking is where
the comparison happens. A payload would invite acting on the message instead of
on the file.

**A re-read leaves the interface where it was**: the tree stays open where it
was open, and the editor keeps the document it holds until the freshly read one
replaces it. Neither is cosmetic once a watcher is running — a re-read then
follows every save, and a tree that folds itself up or an editor that blinks on
every save is not usable.

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
the disk state is identical, nothing happens (`conventions.md` C-F2).

**The rule applies to every re-read, not only to a watcher.** The explicit
"reload from disk" is the same situation with a different trigger, and it
follows the same three outcomes. What the watcher will add is the trigger, not
the rule. A library edit is *not* such a situation: it does not touch the open
sheet's file, so a difference found there is carried over rather than asked
about — the author's version is kept and no prompt appears.

**The prompt asks; it does not announce a loss.** While it is open the author's
version is what the editor holds and what a save would write. Taking the file
is the explicit, destructive choice, and Return and Escape both keep the
author's version (§6.7).

**Separate guards for reading and writing.** The status refresh (reading) and
user-triggered writes MUST have their own in-flight guards, not one shared
"busy" flag. A shared flag makes a background refresh swallow a user action,
which presents as "the click did nothing" (`conventions.md` C-F3).

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

### 10.7 GFM display

**Status: Decided and built 2026-09-04 for the constructs listed; links,
images, and tables wait for their own concept rounds.**

The pattern of §10.2 and §10.3, applied to the rest of GFM: **hide the
markers, show the effect — except on the line that holds the cursor**, where
every marker is shown as written so it can be edited, and the effect stays
so the author sees what the line is while editing what it says. Nothing is
ever rewritten on disk by any of this; the file stays plain Markdown (§10.1).

**Two models, one presentation.** The line-based display model of §10.1
keeps deciding headings, fences, and inline delimiters, and the standard
oracle of `testing.md` §2.2 keeps it honest. A parser — markdown-it, accepted
for this display after the gate of `testing.md` §2.11 — reads the block
structure the line-based rules cannot see: quotes, lists and their nesting,
code blocks, thematic breaks. Its tokens are translated in
`packages/markdown` into the core's own `BlockModel` and go no further
(`conventions.md` C-A6). One pure function in the core, `presentation`,
turns text, display model, and block model into instructions — a style on a
line, a range hidden, a range replaced by a glyph, a mark over a range — and
the editor adapter draws them one-to-one. The rules are therefore tested
without a rendering engine; the smoke measures the drawing.

| Construct | Off the focus line | On the focus line |
| --- | --- | --- |
| Emphasis `*x*`, `**x**`, `***x***` | delimiters hidden; real italic, bold, both | delimiters shown; the weight stays |
| Strikethrough `~~x~~` | delimiters hidden; line-through | delimiters shown; line-through stays |
| Inline code `` `x` `` | backticks hidden; monospace with a faint ground | backticks shown; the face stays |
| Fenced and indented code | shown exactly as written (§10.1), the block on a faint ground in monospace; nothing inside it is a marker | the same — code has no focus rule |
| Block quote `>` | markers hidden; a rule at the left per depth, the text muted | markers shown; the rule stays |
| Unordered list `-`, `*`, `+` | the marker replaced by a bullet; hanging indent by depth | the marker shown |
| Ordered list `1.`, `2)` | the marker shown as written (its number is content); hanging indent | the same |
| Task list `- [ ]`, `- [x]` | the box replaced by an empty or a ticked checkbox glyph — a display, not yet a control | the box shown |
| Thematic break `---`, `***` | the line replaced by a rule | the text shown |
| Hard break: two trailing spaces or `\` | a faint return glyph at the line's end, so the invisible becomes visible | shown as written |
| Escape `\*` | the backslash hidden, the character shown | the backslash shown |
| Inline HTML | plain text, nothing hidden or styled | the same |

**Task list items are the translation's own rule**, not the parser's: an
item whose text begins with `[ ]` or `[x]` is a task. The parser was
measured without them and accepted with that noted (`dependencies.md`).
Ticking a box by clicking it is a control, and a later round.

**What is deliberately not here.** Links and images — the address, what a
click does, an image's size and source — and tables, whose editing is a
question of its own, each get a concept round before a line of display.
Emoji shortcodes are not a goal (§18).

### 10.8 The line-number gutter

**Status: Accepted (2026-09-09), written before its implementation.**

A second gutter column, **left of the marker gutter** of §10.2, showing the
number of each line.

**What is numbered.** The logical lines of the writing surface, from 1. That
is the same counting the status bar reports (§10.5), and the two must never
disagree: front matter is not in the writing surface (§10.4), so line 1 is the
first line of the body, in the editor and in the status bar alike.

**A wrapped line has one number.** It appears beside the line's **first**
visual line; the visual lines that follow carry none, and the next number is
the next logical line's. A number per visual line would count something the
file does not have.

**Heights are measured, not computed** (`conventions.md` C-U5). A heading is
larger than body text and a wrapped line is taller than one row: the gutter
takes each line's real height from the editor rather than multiplying a line
height, which is exactly where a gutter drifts out of step with its text.

**Off by default, with a switch** in Settings → Editor
(`editorLineNumbers`, installation-local, §13). A manuscript is not source
code: the numbers are for *talking about* a text — a note, a message, a
correction list that says "line 120" — which is occasional, not the working
state. The same reasoning as the front matter area's (§10.4): the quieter
surface is the harmless starting state, and turning it on is one click.

**What the numbers are not.** They are not addresses that survive editing:
inserting a line above renumbers everything below it, as in any editor. What
is stable about a sheet is its file and its front matter, never a line number.

### 10.9 The editor zoom

**Status: Accepted (2026-09-09), written before its implementation.**

A slider at the **right of the status bar** (§10.5), beside the wrap switch,
with the current factor as a percentage next to it.

**50 % to 200 %, with a detent at 100 %.** The slider moves in whole
percentage points, and the three points either side of 100 % belong to 100 %:
dragging past the middle lands on it. The percentage itself is a control —
activating it restores 100 %, the way double-clicking a column divider
restores that column's width (§8.2).

**Only the editor scales**, and inside it the text **and its gutters** (§10.2,
§10.8), so the numbers and the heading markers stay in proportion to the lines
they belong to. The project tree, the sheet list, the sidebar, the header and
the status bar itself are chrome and do not move: the zoom is for reading the
manuscript, not for resizing the workbench.

**It is a display factor, not a setting.** The configured base size (§13) is
untouched by it — which is exactly what makes the detent unambiguous: at
100 % the editor shows the size the author configured, whatever that is. The
heading ratios of §13 apply to the scaled base, so the whole hierarchy scales
together.

**One factor for the editor**, not one per sheet. It is remembered across
sheets and across sessions — deliberately unlike the wrap switch of §10.5,
which is a decision about reading *this* sheet *now*: a zoom the author set
because of their eyes or their screen must not be forgotten when they open the
next sheet.

**Stored installation-locally** (§7.2), never in `.opera-incerta/`: a viewing
preference must not travel through Git to another machine with another screen.
It is remembered like a column width rather than listed in the settings dialog
— the dialog holds what is configured, and this is set where it is used.
"Reset all settings" (§13) restores it to 100 % with the rest of the record.

**Deliberately not here.** Keyboard shortcuts and menu items for zooming in
and out: the native menu has no View menu yet, and adding one is a decision
about the whole menu rather than about this slider.

### 10.10 The editor's context menu

**Status: Accepted (2026-09-10), not yet built.**

The editor's context menu is the application's **own**, not the platform's
filtered. It offers what this application understands: cut, copy and paste,
the heading level of §10.2, and finding (§10.11).

Why not the platform's: a system menu brings text-rewriting services with it —
substitutions, transformations, "improve this" entries that arrive with an
operating system update. None of them know the display model, and a service
that rewrites what it takes for text can quietly rewrite Markdown into
something the file did not say. Filtering that list means maintaining a list of
what to remove, and being wrong the first time a new entry appears.

The cost is stated plainly: the platform's own services are not reachable in
the editor. They remain reachable everywhere else the operating system offers
them.

### 10.11 Finding in the open sheet

**Status: Accepted (2026-09-10), written before its implementation.**

Two different things are called search, and this is the smaller one: finding a
passage **in the sheet that is open**. Searching the library — across every
sheet, with the front matter as filters — is a query over the project and gets
its own round (§18); nothing here anticipates it.

**A band above the text.** The find bar appears between the editor's header
and the writing surface: it pushes the text down rather than floating over it,
because a bar that covers the line you were looking for is a bar that has to
be moved out of the way. It holds the field, how many matches there are and
which one is current, a step back and a step forward, and a close.

**It is opened from the menu.** Edit → Find… carries `Cmd/Ctrl+F`. The native
menu owns its accelerators (§8.5): a key handler in the page would never see
the keystroke, so Find is a menu command like Save, and the renderer acts on
it. Escape closes the bar and returns the cursor to the text. Return steps to
the next match, `Shift+Return` to the previous, and both wrap around.

**What is searched is the sheet's Markdown**, the text the editor holds — not
the display of §10.2 and §10.7. A word is found wherever it stands; a search
for a marker that the display hides (`##`, `**`) finds it too, because it is
in the file. The alternative — searching what is currently visible — would
make a find depend on where the cursor happens to be, since the focus line
shows its markers and every other line hides them.

**Case is ignored**, always, with no switch. An author looking for a word is
not thinking about its capitalisation; if that turns out to be wrong, a switch
is a later decision and not a default.

**What the bar reports**: `n of m`, or that there is nothing. The match the
author is on is drawn differently from the others — all of them are marked,
the current one is the one that is revealed and carries the accent.

**Opening it with a selection** seeds the field with that selection, which is
what every editor does and what makes "find the next one of these" one
gesture.

**Replacing is not here.** Find reads; replace writes, and writing needs its
own decisions — what a single replacement does to the undo history, what "all"
means when the matches straddle front matter, and whether it may run in a
sheet that is not open. Those decisions are a separate round (§19).

## 11. Secondary sidebar views

**Status: Inspector and Outline accepted and built; AI and Snapshots decided
(2026-09-10) and not yet built.**

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
  **Decided 2026-09-10: a snapshot is a commit.** There is no second history
  beside the one the project already has — taking a snapshot writes a commit
  (or tags one) in the project's repository, and the difference view is the
  prose diff §12 already owns, built once and used by both. What follows from
  that, and is binding: snapshots need a repository, and where there is none
  the pane says so and offers the one source control already offers (§12);
  restoring is destructive and asks first; and nothing is copied into
  `.opera-incerta/`, because a second store is a second history that drifts.

## 12. Source control

**Status: Accepted and built** — reading, staging, committing, pushing,
fetching, pulling, merging with conflict resolution, branches, the upstream,
amending, and `.gitignore`. Creating a repository and the identity question
below are specified but not built.

Git is the synchronization mechanism (§5.1). Source control is a view in the
Navigator, implemented as a module (§15) over the **locally installed `git`
executable**, invoked from the main process. No Git library dependency and no
bundled Git binary.

**Reading.** `git status --porcelain=v1 -z` is parsed by a pure function in the
core into staged / unstaged / untracked groups; conflicts count as unstaged.
Paths from `git status` are relative to the **repository root**, not the
project root, and can point outside the project directory. The service MUST
resolve and report the repository root and build absolute paths against it.

**One git command at a time per repository.** Every bridge handler runs
concurrently, and two git processes in one repository at once — a status
refresh racing a commit, a stage racing a push — fail on `index.lock` with a
message the author cannot act on. The service therefore queues its commands
per directory: a new one waits for the last to finish, succeed or fail. Reads
wait too, deliberately: a status that runs *beside* a push is a lock error,
a status that runs *after* it is merely late, and the renderer's separate
guards (`conventions.md` C-F3) already keep a slow read from swallowing a
click.

**Without git.** A machine without a `git` executable is a normal machine for
an author (`conventions.md` C-P10). It is reported as its own condition,
`git/not-installed`, distinct from "this project is not inside a repository":
the first is about the machine and says what to install, the second is about
the project and says what to create. Everything outside the source control
panel works without git; the panel words the code and offers nothing until
git is there.

**Live updates.** While the source control view is visible, a watcher observes
the resolved repository root recursively and refreshes the status debounced
(about 400 ms, coalescing). The watcher runs only while the panel is visible,
is re-established on project change, and stays off for projects without a
repository.

**`.git` filter against self-triggering.** The watcher MUST evaluate the changed
paths and refresh only when at least one event concerns the working tree (a
path with no `.git` component). `git status` opportunistically writes inside
`.git`; without this filter every refresh would re-trigger itself (`conventions.md` C-F4).

The harm is not merely wasted reads. With the filter removed, the first thing
that breaks is a *failed push reporting nothing*: the refresh storm overwrites
the message before the author can read it. The filter is what keeps the panel
able to say anything at all.

The three watches are set **independently** of one another: the selection moves
constantly while the panel's visibility rarely does, and one must not release
the other's handles.

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

**Branches** are listed with the one that is checked out marked, and can be
created, switched to and deleted.

- **Creating** starts at the current commit and switches to it at once. The
  name is checked before git sees it — a name beginning with `-` would be read
  as an option, and `git switch --create` accepts no separator that would
  prevent it — with git's own `check-ref-format` having the last word.
- **Switching is refused while the editor holds unsaved work**, and offers to
  save first. This is the application's rule, not git's: git knows nothing
  about a buffer, and an author whose text sat under a file that has just
  become a different file has no way to make sense of what happened. Work that
  is saved but not committed belongs to no branch and follows a switch, which
  is git's behaviour and is left alone.
- **Deleting** is the safe delete only. Git refuses a branch whose work is not
  merged anywhere, and that refusal is the answer the author gets: losing a
  chapter to a click is not something this application does.

**Publishing a branch** is offered where a repository has a branch that tracks
nothing, and only there. With a remote already recorded, the address is known
and the action is **confirmed**, naming it: this is the moment the manuscript
first leaves the machine. With no remote, the address is asked for and recorded
as `origin`.

**An address is checked before git sees it.** Git's transports include `ext::`,
which *runs a command* — a pasted address of that shape would execute it at the
next fetch — and an address beginning with `-` would be read as an option. The
accepted shapes are therefore named rather than filtered: `https`, `http`,
`ssh`, `git` and `file` URLs, the `user@host:path` form, and an absolute local
path. Everything else is refused with a reason. Recent git refuses the `ext::`
transport itself, which is a second line rather than a substitute: it depends
on the machine's configuration, and this check does not.

**Push** runs against the resolved repository root using the system Git
credentials. A missing remote or failed
authentication surfaces the Git error message; it never crashes. If the commit
succeeds and the push fails, the commit stands, the message field is cleared
(it was committed), and only the push error is shown.

**Fetch and pull, with pull restricted to a fast-forward.** `git pull --ff-only`
cannot leave the manuscript in a state anyone has to sort out: where the
histories have diverged git refuses, and its refusal is what the author is
shown. Fetching is unrestricted because it touches no file in the working tree.

**Merging is a separate action, asked for and confirmed.** It is offered only
where the two have actually drifted apart — the case a fast-forward refuses —
and it is the one operation here that can leave work to be done. A merge can be
**abandoned** at any point, putting everything back as it was.

**Conflict markers never reach the editor.** A merge writes both versions into
the file with markers between them; a sheet in that state is shown and marked
**read-only**, and is never written back. An author typing around markers would
save a file that is neither version.

**Conflicts are decided per region, never per file.** Git has already merged
everything the two sides did not both touch. Taking one version of the whole
file would throw that away and leave the author worse off than git left them.
Each region is shown with both versions and the difference between them word by
word (as in the prose comparison above), because two paragraphs differing in
four words are otherwise indistinguishable at a glance. A region with no
decision keeps *this* copy's version: silently preferring what came in would be
a decision the author did not make.

Applying a decision writes the file — atomically, like every other write — with
the chosen text and **no marker left**, and stages it. Committing then finishes
the merge in the ordinary way.

Reading and resolving the markers is a pure, unit-tested rule. A marker that
never closes is treated as ordinary text: inventing a region out of a broken
file would be a guess, and the file is the author's.

The panel shows what the branch tracks and how far apart the two are, read with
the status so that the two are never a moment out of step. Pull is offered only
when there is something to pull. A branch that tracks nothing shows none of
this: no upstream is a normal state, because this application never creates
one.

A pull changes files behind the editor's back, and nothing special is needed
for that: the watchers of §10.6 notice, and the comparison rule decides whether
the author is told.

Git output is tool output and is never localized (§14.2).

**Showing what changed** is offered per file, from its row: **Git's own diff**,
shown unchanged in a read-only viewer. It is tool output and is never localized
(§14.2); the only thing the application adds is colour, which is presentation.
The comparison is against the **last commit**, so one view answers "what would
committing this file change" rather than making the author reason about the
index and the working tree separately. A file with nothing behind it — an
untracked one, or any file in a repository without a `HEAD` — is shown as
entirely added, because that is what it is.

**Two readings, and a sheet opens in the second.** Git compares lines, which is
right for a structure file and wrong for a manuscript: rewording four words in
a paragraph shows up as the whole paragraph removed and the whole paragraph
added, and the author has to find the change by reading both. A **word-level**
comparison of the committed text against the current one shows the change
itself, in one flowing text. `.md` files open in it; everything else opens in
Git's, and either is one click away.

The word comparison is Myers' shortest edit script over tokens — words and the
whitespace between them — in the portable core, with no dependency. The common
prefix and suffix are trimmed first, which is nearly all of the work for a
typical edit, and the search is **bounded**: beyond the bound the middle is
reported as replaced wholesale, which is coarse but correct. Bounded work
matters more than an ideal script on a file that was rewritten from scratch.

**The invariant it is held to**: the kept and removed parts put together
reproduce the committed text exactly, and the kept and added parts reproduce
the current one. Nothing invented, nothing lost. An inserted run carries the
whitespace that *follows* it, because the whitespace before it was already
there — minimal at the token level, and stated so that it is a property rather
than a surprise.

Reading a diff is deliberately **not** guarded against a running write: it
changes nothing, and making it wait behind one presents as "the click did
nothing" (§12, separate guards).

The classification of a diff line into added, removed, hunk, header and context
is a pure, unit-tested rule. `--- a/…` and `+++ b/…` start with the same
characters as a change and are not one; everything before the first `@@` is a
header, whatever it begins with.

**Discarding a change** is offered per file, from its row, and is always
confirmed. What the confirmation says differs, because the two cases end
differently:

- **a tracked file** goes back to its last committed state, index and working
  tree together. Half a restore would leave it looking unchanged while the
  index still carried the change.
- **an untracked file** has no earlier state to go back to: its whole existence
  is the change. It goes to the **desktop trash**, never to `rm` — the same
  rule as deleting a sheet (§6.7). In a repository without a commit every
  tracked file is in this position too, because there is no `HEAD` to restore
  against.

What each path *is* is read from Git at the moment of discarding, not taken
from the interface: this is destructive, and the interface's picture of the
working tree may be a second old.

**The editor's version goes with it.** Discarding while the editor holds
unsaved changes to that sheet drops them as well; leaving them would put the
discarded change back on the next save, and would raise the conflict prompt of
§10.6 in between — asking the author to decide again what they have just
decided. A re-read that was already in flight must not put them back either.

**Amending the last commit** replaces it: whatever is staged goes into the
commit that is already there, with the message from the panel. The field is
filled with the message the commit already carries, so that amending to add a
forgotten file does not cost the author their wording, and the question names
the wording it would use — the field is behind the dialog and cannot be typed
into while it is open.

It is offered only while the commit has **not been pushed**, and never during a
merge. A commit that is already on the upstream can only be replaced there by a
forced push, which this application does not do; refusing it here is cheaper
than explaining afterwards why the remote and the working copy disagree. The
rule is checked twice: the control is absent when it does not apply, and the
main process refuses the request in any case (§12, separate guards).

**Keeping files out of the repository** is `.gitignore`, and it is reachable
two ways. An untracked row carries a control that adds exactly that path, and
the list itself opens as plain text. The file is the author's: a path that is
already listed is not added a second time, the line ending in use is kept, and
nothing else in the file is touched. Ignoring is not deleting — the file stays
where it is and only leaves the change list.

`.gitignore` is edited as text rather than in the writing surface. It belongs to
the project but not to the manuscript, and the editor's rules about headings and
front matter have nothing to say about a list of patterns.

**Creating a repository.** *Status: built (2026-09-03).* A project without a
repository is a normal starting point, and the panel says so plainly and
offers the one thing that fits: **Create repository**. That is `git init`
with `main` as the initial branch in the **project root** — never a parent,
because the manuscript is what gets a history — followed by the ordinary
status read, which turns the notice into a list of untracked files. Nothing
is committed and nothing is staged by that step — what goes into the first
commit stays the author's decision. The main process refuses the request
where the project is already inside a repository (`git/already-a-repository`),
because `git init` there would reinitialise, which is not what the button
says.

**The identity git needs.** *Status: built (2026-09-03).* `git commit` fails
with "Author identity unknown" when `user.name` and `user.email` are unset. For
a writing application that is the **normal case**, not an edge case: an author
who has never used git has no global configuration, so creating and staging
work and only the first commit fails, with a message written for programmers.

- On creating a repository the application checks whether a **global** identity
  exists. If it does, nothing is asked.
- If it does not, it asks for a name and an e-mail address and writes them
  **repository-locally**, into that project's `.git/config`. The author's
  global configuration is never touched — the same line this application draws
  everywhere: nothing outside the project is changed.
- Declining the question still creates the repository. It is useful without an
  identity, and the answer can be supplied later; a settings entry MUST offer
  that, otherwise the refusal is a dead end. That place is the *Source
  control* category of the settings dialog (§13), where the identity is
  edited in place; the source control panel additionally shows a row while
  neither scope has an identity, whose button opens the same question.
- The e-mail address is written into every commit and travels with the
  manuscript to whatever remote it is pushed to. The question says so.

**Not goals of this stage:** rebasing, stashing, and anything that rewrites
more than the last commit.

## 13. Settings contract

**Status: Accepted structure, built 2026-09-04 for the categories that have
settings; the categories below whose settings do not exist yet arrive with
their features.**

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

**What the dialog holds today** (`packages/core/src/settings.ts`, the
registry the dialog renders): *Appearance* — the interface language (§14);
*Editor* — the font family from a curated list of three, the base size within
12 and 24 pixels, and whether long lines wrap (the default; the status bar
of §10.5 switches it per sheet); *Sheet list* — preview size and blank
lines;
*Outline* — the deeper levels; *Front matter* — the three switches of §10.4;
*Page categories* — a way into the manager of §6.6, because an author looks
here for it, marked as project data; *Source control* — the commit identity
of §12, edited in place and written into this repository only. The footer
beside Reset names the running build (§16); it is information, not a
preference, and has no place in the registry. Every
installation-local preference that is not workbench layout MUST be in the
registry, and a test enforces it, so a preference cannot appear without a
place in the dialog. The registry names the keys of its words, never the
words (§14.3). Markup and Privacy are listed in the table above and arrive
with §10.2 and §15.

Heading sizes H1–H6 scale proportionally with the editor base size, keeping
fixed ratios to the base hierarchy. The ratios are a rule of the core
(`editor-typography.ts`), and the editor's theme states them in `em` so that
the base size the author sets scales the whole hierarchy and never one level
alone (built 2026-09-04).

**Behavior.** Changes apply immediately and are stored installation-locally.
Unsupported versions, malformed values, and unavailable storage MUST fall back
safely without blocking the editor. Reset restores the complete default record.
The settings dialog is reachable from the workbench — the one tool entry at
the foot of the leading activity bar, apart from the view entries because it
selects no view (§8.4) — and from the native `Settings…` item with
`Cmd/Ctrl+,` (§8.5). Escape and an explicit close dismiss it; keyboard focus
stays inside the modal and returns to the invoking control. A click does not
focus a button on macOS, so the dialog is told what opened it rather than
reading it from the document.

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
code rather than "fixed" (`conventions.md` C-N3).

**Component pattern.** One preferences service owns validation, persistence,
system-theme observation, and reactive values. One localization service owns
the catalogues. The settings panel owns presentation and category navigation.
Consumers receive only the values they need; the portable core depends on none
of this.

## 14. Localization

**Status: Accepted; built 2026-09-04 — English and German catalogues, the
language setting, the native menu following it.**

### 14.1 Model

Base language is **English**. The first release ships English and German
interface catalogues. Keys are **symbolic**, never the source text: a
catalogue keyed by English sentences produces a new key — and translation
debris — every time the wording is polished.

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

**Where it lives.** The catalogues and the rules that read them are the
package `packages/localization`, portable like the core and separate from
it because two processes need the same words: the renderer for the
workbench and the launcher, the main process for the native menu. Every key
is typed from the English catalogue and the German one is typed against it,
so a missing key is a compile error. The renderer's one localization service
resolves the stored choice — `system`, `en`, or `de` — against the system's
language tag and exposes `t` for a message and `n` for a count; both read a
signal, so changing the language re-renders every template without a
restart. The main process resolves the same choice against Electron's locale
and rebuilds the menu whenever the preference record is written with a
different language. The document's `lang` attribute follows too.

**Not goals of this stage:** right-to-left languages, localized help, and
translation of the project documents, which remain English.

## 15. Module concept and extension boundaries

### 15.1 Modules

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

**Every format is its own module; export modules MUST strip front matter from
the output.**

### 15.2 Export

**Status: Accepted (2026-09-11), written before its implementation.**

**What is exported** is the manuscript as the library orders it (§6.1) — not
the file tree, the recorded order. Two extents, and they are the same
assembly with a different starting point:

- **the whole document**, from the first sheet to the last; and
- **from here**: the sheet the author right-clicked and everything after it.
  The groups **above** that sheet come with it as headings, so an excerpt
  keeps its place in the book instead of beginning in mid-air.

**How it is assembled** (decided 2026-09-11):

- **A group becomes a heading** at the depth it sits at, and the headings of
  the sheets inside it move down by that depth, capped at six. The library's
  structure becomes the document's structure. A `#` inside a code block is
  text and is never moved — which is why the shift reads the block structure
  rather than the lines.
- **Front matter never appears.** That is §15.1's rule for every export
  module, and it is the reason the sheet codec (§6.3) hands out a body
  separate from its metadata.
- Nothing is renumbered, rewritten or reflowed. What the author typed is what
  leaves, apart from the heading shift above.

**PDF is set by the application itself**, out of HTML and a print stylesheet.

> **This supersedes the decision of 2026-09-10**, which named LaTeX. Recorded
> rather than removed, so it is not decided twice: the author revised it on
> 2026-09-11 on the ground that **this export is not meant to produce a
> professional print file**, and that the appearance should later be governed
> by a **stylesheet the author chooses**. A CSS stylesheet is the means for
> that; LaTeX is not. Setting a book for print stays what it was — work done
> outside this application, with the author's own typesetting.

The consequences, stated plainly:

- **No external dependency.** No TeX, no pandoc, nothing to install. The
  export is always there. §15.1's rule that a module is *absent rather than
  broken* keeps its force for modules that do depend on something; this one
  gives it no occasion.
- **The HTML carries no script and reaches nothing.** A content security
  policy in the document allows its own style and nothing else, the author's
  text is inserted as text and never as markup, and the window that sets it
  runs without Node and without a preload. A manuscript is data, not a page
  to be executed.
- **The stylesheets are plain**: a serif from what the system has, a readable
  measure, page numbers. No title page, no running heads, no print geometry —
  those are decisions a print file needs and this one does not.

#### The stylesheet is chosen, and may be the author's own

**Status: Accepted (2026-09-11), written before its implementation.**

Four are **supplied with the application** and cannot be changed, because a
default one can edit into uselessness is not a default:

| id | What it is for |
| --- | --- |
| `manuscript` | The default. A serif, a measure of about 34em, each sheet on a new page. |
| `typescript` | A publisher's typescript for editing: monospaced, double-spaced, wide margins to write in. |
| `reading` | For reading on a screen: larger, flowing, **no page break between sheets**. |
| `plain` | Sans-serif and close-set, for a working print of the whole thing. |

Beside them, the author's own. The way to one is to **duplicate a supplied
sheet under a new name and edit it** — never to start from an empty file,
because a stylesheet written from nothing is a afternoon of finding out which
rules Chromium's printer honours.

- **An author's stylesheet lives in the project**, in
  `.opera-incerta/styles/<name>.css`. The rule this follows is the one
  already applied twice (§9.4, §18): does it say something about *this
  manuscript*, or about *this installation*? A set made for this book belongs
  to the book, and is the same on every machine and for everyone working on
  it.
- **Which one was last used is installation-local** (§13), because it is a
  habit rather than a property of the manuscript. A remembered name that
  names nothing — the project changed, the file was deleted — **falls back to
  `manuscript`**, exactly as an unreadable preference does (§16). It is never
  a failure to export.
- The list, the duplication and the editing are all in **one dialog, shown
  when a PDF is exported**. Not in the settings: the choice belongs to the
  moment of use, and an author who wants a different set this once should not
  have to go looking for a preference. Markdown carries no stylesheet and
  therefore opens no dialog.
- A stylesheet is **CSS and nothing else** — no script, no import, nothing
  fetched. It is inserted into the document's own `<style>`, under the same
  content security policy as everything else there, so a rule that tried to
  load something simply does not load it.

**Two things a stylesheet cannot decide**, because Chromium's printer owns
them and a rule would silently do nothing: the **page margins**, which
`printToPDF`'s own option overrides, and the **page numbers**, which would
need `@page` margin boxes it does not implement.

**Markdown is the substrate**: one file, the same assembly, front matter
stripped. It is what the other formats are built from and is offered in its
own right, because a single Markdown file is what every other tool can read.

**Both formats are assembled once.** A Markdown file and a PDF that disagreed
about what the document is would be two documents; the registry of §15.1
declares only what a format can know about itself — an id and an extension.
What a format is *called* is not a module's business: the interface has two
languages (§14.2), and a portable module cannot hold catalogue keys for a
surface it never sees.

**Named limits of the first version**, so they are not mistaken for defects:
task boxes (`[ ]`, `[x]`) reach the output as the characters they are — the
parser knows no task lists and the application's own rule for them serves the
display (§10.7), not the export. DOCX and EPUB follow in that order, for the
exchange with editors and for reading.

### 15.3 Import

**Status: Accepted.**

Import begins with a **Markdown folder**: a directory of `.md` files becomes
groups and sheets, with the collision rules of §6.5 and the folder structure as
the library's own. Adoption (§8.6) already does half of this for a folder that
is to *become* the project; import is the other half, for texts that come into
one that exists.

### 15.4 The assistant

**Status: Accepted.**

**AI integration.** Concrete AI actions never address a vendor directly; they
address an `AIProvider` interface (input: text or structure plus action type;
output: suggestion or revised text). Vendors are interchangeable
implementations selected in settings.

**Decided 2026-09-10.** The first implementation is **Anthropic's**, and it is
the preselected one. That is a deliberate exception to the invariant that this
application needs no network (`AGENTS.md`): **using the assistant is not
normal operation.** Everything else about the application keeps working with
the network unplugged, and the assistant says what it is before it does
anything. Four rules make that exception carry its own weight:

1. **The key lives in the system's keychain**, through Electron's
   `safeStorage` in the user-data directory — never in a preference record in
   plain text, never in the project, never in a commit.
2. **The scope may reach the whole project**, but the wide scope is granted
   **per request**: an action that would send more than the selection says
   which sheets and how much text, and is confirmed once, each time. A
   standing switch is refused deliberately — the tenth request would look like
   the first, and a project that is shared would leave the machine unnoticed.
3. **What goes out is shown before it goes**: the provider, the sheets, the
   number of characters, and the text itself, readable. A tool that sends text
   somewhere without showing it is not a tool.
4. **No action runs unasked**, and the answer is a suggestion the author
   accepts, never an edit that has already happened.

**And the rule that bounds all four (2026-09-10): the assistant needs the
network. No connection, no assistant.**

- Without a connection the assistant is **unavailable and says so**, in one
  sentence, where the panel is. Not "failed", not a spinner, not a retry that
  keeps trying: a plain statement that this one capability needs something
  that is not there.
- **Everything else keeps working.** The library, the editor, saving, the
  search, source control against a local repository — none of them so much as
  slows down. That is the invariant of `AGENTS.md` intact: the assistant is
  the one named exception, and an exception that took the rest of the
  application with it would not be one.
- **Nothing is probed.** The application does not test the connection to find
  out, does not poll, and reaches the network only inside a request the author
  asked for. "No connection" is what a request reports back, not a state the
  application maintains.
- A request that is cut off changes **nothing**: the answer was a suggestion
  waiting to be accepted, so an interrupted one leaves the manuscript exactly
  as it was.

Planned action shapes:

- pass the **full text** of one sheet for revision, shortening, or style work;
- pass **structure only** — the outline of several chapters — to improve
  arrangement without transmitting the full text (a privacy advantage for
  sensitive content);
- pass `topic` (§6.2) as compact per-sheet context for actions spanning many
  sheets.

API credentials go to `safeStorage` (§5.3), never into a plain preference
record and never into the project directory. What leaves the machine is
controlled by the rules above and by the privacy settings (§13).

## 16. Diagnostics and failure behavior

**Status: Accepted.**

- Every user-visible failure carries a **stable diagnostic code** and a source
  reference where one exists (file, and line where meaningful).
- **One shape for a failure, everywhere.** A failure is a code and a message
  (`CodedError` in the core), and every adapter's error is one of these: the
  project adapter's carries a path for the log, git's carries the exit code
  and git's own words. The bridge lets only a failure of this shape cross with
  its message; any other error — Node's `ENOENT` with an absolute path in it —
  is logged in the main process and crosses as `bridge/failed` with no words.
  A message that was never meant for the author must not reach them.
- **Git's failures are named, not only quoted.** The words git wrote are what
  the author reads (§12), and the code beside them is what the interface acts
  on: `git/no-upstream`, `git/not-fast-forward`, `git/conflict`,
  `git/authentication`, `git/branch-not-merged`, `git/nothing-to-commit`,
  `git/index-locked`, `git/no-identity`, `git/not-a-repository`, and
  `git/command-failed` for what no rule recognises. Read from stderr by one
  pure function in the core, tested against recorded output.
- **Both sides check what crosses.** Every request is validated in the main
  process by a guard built from one small set of combinators, and the renderer
  checks the shape of what comes back — a snapshot, a git report, an edit
  result — before it enters a store. The contract names the types it
  transports with the core's own types, so neither side casts.
- The preload is typed against the contract with `satisfies`, so a method
  added to the interface and forgotten there fails to compile.
- A failure to read one sheet MUST NOT abort a library scan; the affected item
  is marked and the scan continues.
- A malformed `structure.json`, `categories.json`, or `project.json` falls back
  to the documented default behavior (§6.4, §6.6) and reports the problem; it
  never blocks opening the project.
- Destructive actions (restore a snapshot, discard changes, delete a category)
  require an explicit confirmation naming what will be lost.
- The application MUST NOT write to a file it failed to fully read.
- **The build names itself** (built 2026-09-14). A report is only useful when
  it says which build it is about, and a version number cannot say that
  between releases: every push to `main` would otherwise need a new one. The
  desktop build therefore records what `git describe --tags --always --dirty`
  says in the checkout it builds — the last tag, the commits since, the
  commit, and `-dirty` for uncommitted changes — beside the bundle, together
  with the workspace version. The main process reads that record once; the
  launcher's foot and the settings dialog's footer show it as one selectable
  line, `Build v0.1.0-beta.1-7-g0381bfe`, and the macOS About panel shows the
  version with the revision as its build number. The desktop package's own
  version stays `0.0.0`, which the About panel used to show.
  - It is written at build time because an installed application has no
    checkout to ask.
  - Git is asked about **this** repository only. A source archive unpacked
    inside another repository would otherwise be given that repository's
    commit; such a build, and one made without Git, records no revision and
    the line says `Version 0.1.0-beta.1, built outside a Git checkout`.
  - A record that is missing or malformed does not stop the application. The
    main process validates it with the contract's guard, and an unreadable
    one reads `Build unknown`.

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
    (`testing.md` §2.7).
21. Every acceptance criterion above has a named test or a reviewed manual
    verification in `testing.md`.

## 18. Roadmap after the MVP

**Status: Draft — order and scope open.** Each item needs its own round and its
own specification update before implementation.

**Phase 2 — editing comfort**

- **Line-number gutter** — specified as §10.8 and built 2026-09-09: a second
  column left of the marker gutter, one number per logical line at its first
  visual line, heights measured rather than computed, off by default with a
  switch in Settings → Editor. The status bar kept its cursor position
  (§10.5).
- **Editor zoom slider** — specified as §10.9 and built 2026-09-09: in the
  status bar at the editor's bottom edge, 50 % to 200 % with a detent at
  100 %, scaling the editor's text and gutters and nothing else, stored
  installation-locally.
- **Inline markup rendering** (§10.3), staged as specified.
- **Full GFM display** — built 2026-09-04 as §10.7: strikethrough, inline
  code, code blocks, block quotes, ordered and unordered lists, task lists,
  horizontal rules, hard breaks, and escapes, each with its presentation
  decided there. Links, images, and tables are explicitly delicate and each
  get their own concept round. Inline HTML passes through as plain text;
  emoji shortcodes are not a goal.

**Phase 3 — library and workflow**

- **Drag a sheet into another group** — built 2026-09-04: always a move, the
  drop target deciding the position, the file moved and both `order` entries
  rewritten in one write, a collision renamed on arrival, a drop onto its own
  group a no-op. Multi-selection stayed out.
- **Source control "show diff" and "discard changes"** — built 2026-09-04,
  the destructive one behind a confirmation that words itself by what it will
  do, and opening a file from the change list.
- **Recently edited sheets**, per project rather than globally — and stored
  **in the project** (`.opera-incerta/`, decided 2026-09-10): it says something
  about the manuscript, not about the installation, and after weeks away it is
  where it is looked for, on whichever machine.
- **Search** — both halves built, and they are two features, as this entry
  always said: finding in the open sheet is §10.11 (2026-09-10), searching the
  library is §9.3 (2026-09-10). The three questions this entry left open were
  answered there: the body only, a flat list of matches, and a transient
  search rather than a saved view. The local index of Phase 4 remains a later
  performance cache and never the source of truth.
- **Saved views (filters and favourites).** The domain model names them (§6.1)
  and nothing implements them. A saved view is a query over the library, never
  a second copy of the data. **Decided 2026-09-10: they live in the project**
  (`.opera-incerta/`, versioned) — a view like "everything in revision"
  belongs to the manuscript and is the same on every machine and for everyone
  working on it. What a view stores and how it appears beside the project tree
  is the round's own to decide.
- ~~**Navigation history.**~~ **Built 2026-09-11** — specified as §9.4 and
  implemented with it: back and forward through the sheets that were opened,
  per project and transient, a deleted sheet dropped rather than reopened, and
  a "recently edited" list of ten in the project beside it.
- Markdown import as a module, including collision and folder-structure rules.
- **Highlighting of special files** (project governance and agent-instruction
  files) in the tree and sheet list — wanted (2026-09-10). This requires a **deliberate scanner
  extension** — hidden files and non-`.md` files are not scanned today — and a
  configurable matcher list, not merely styling.
- **"Open with an external application"** — wanted (2026-09-10) — using the operating system's registered
  application list, storing the choice by bundle or application identifier
  rather than by path, and saving before handing the file over.

**Phase 4 — extension**

- ~~Export modules (PDF, DOCX, EPUB)~~ — **PDF and Markdown built 2026-09-11**
  as `packages/export` (§15.2). **DOCX and EPUB** remain, in that order, over
  the same assembly.
- ~~**A stylesheet of one's own for the export**~~ — **built 2026-09-11**:
  four supplied sheets, and the author's own by duplicating one, kept in the
  project (§15.2). What stays open beside it: **a preview** of what a
  stylesheet does before the PDF is set, and whether a project may name a
  **default** of its own rather than only the installation remembering one.
- **Task boxes in the export.** They reach the output as `[ ]` and `[x]`
  today (§15.2): the parser knows no task lists and the display rule of §10.7
  is the application's own. Worth a small rule of its own when the export
  next gets attention.
- **Reading the text aloud** — wanted (2026-09-10) — as a module over the
  platform's speech synthesis:
  the manuscript is read, never sent anywhere, and the module is absent rather
  than degraded where no voice is installed.
- The AI assistant panel over the provider interface (§15).
- **A terminal panel** in the bottom region, working directory at the project
  root — wanted (2026-09-10).
- Snapshots with a shared difference view (§11).
- Themes behind a theme **interface**. The two schemes and the eight palettes
  of §8.8 arrived on 2026-09-09 as a decided set; what stays open is whether a
  theme can come from outside the application at all, which is an extension
  point and not a colour.
- A local search index as a **performance cache** only, introduced when
  file scanning becomes noticeably slow — installation-local, rebuildable, and
  never the source of truth.

## 19. Open design decisions

The following are deliberately open and MUST be decided before the code that
depends on them:

- **trademark clearance** for the accepted product name before public
  distribution;
- the **distribution channel and update mechanism**; and
- the **formal accessibility target**, beyond the rule §8.10 now states and
  checks.

All three were weighed on 2026-09-10 and deliberately left standing: none of
them binds a line of code before the packaging round, and the first two become
due together with it.

**Settled since this list was written**, kept here so that a decision is not
made twice:

- **the Markdown parser** (§5.4) — decided 2026-09-04: commonmark.js and
  `yaml` are the test-time oracle, markdown-it the runtime parser behind the
  GFM display (§10.7), its two deviations recorded in `dependencies.md`;
- **the mechanism for non-line-wise markup** (§10.3) — decided and built the
  same day: `presentation()` in the core turns both models into instructions
  the adapter draws, which is what made §10.7 a translation rather than a
  second editor;
- **the editor's context menu** — decided 2026-09-10 as the application's own
  rather than the platform's filtered (§10.10);
- **the accessibility rule** — decided 2026-09-10: reachable without a pointer
  (§8.10). The formal standard stays open above;
- **the import and export order** — decided 2026-09-10: PDF through LaTeX
  first, DOCX and EPUB after it, a single Markdown export as their substrate;
  import begins with a Markdown folder (§15);
- **the first `AIProvider`** — decided 2026-09-10: Anthropic's, preselected,
  with the key in the system keychain, the wide scope confirmed per request,
  and what goes out shown before it goes (§15). Using the assistant is
  explicitly not normal operation;
- **snapshot storage and difference engine** — decided 2026-09-10: a snapshot
  is a commit, and the difference is the prose diff §12 already owns (§11).

## 20. Sources consulted

Requirements and lessons in this document derive from the author's own earlier
work on a native macOS writing application — re-derived as platform-neutral
requirements, never transliterated (§4) — and from public documentation of the
platform technologies named in §5. The engineering measures adopted from that
earlier work are recorded in `conventions.md`.

**This document is self-contained.** Every requirement, decision and recorded
defect stands here; no other repository has to be consulted to build, verify or
change the product.

No third-party source code, grammar, documentation, fixture, or visual asset
was copied into this specification.
