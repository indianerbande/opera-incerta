# Opera Incerta project status

**English** | [Deutsch](../de/project-status.md)

Status: Public source beta

Current release: `v0.1.0-beta.1`

Updated: 2026-09-11

This document states the current product maturity and the boundaries of the
beta. It is not a development diary. Product requirements live in the
[specification](../engineering/specification.md), the evidence rules in
[testing](../engineering/testing.md), the completed work with its reasoning in
[completed work](../engineering/completed-work.md), and open engineering items
in the [roadmap](../engineering/roadmap.md).

## What beta means here

Opera Incerta is usable software. A manuscript can be created or adopted from
an existing folder, written, structured, categorised, searched, version-
controlled against Git, and exported. It is not a parser experiment or an
empty application shell.

The beta label makes two promises deliberately weaker than a stable release:

1. **There are no signed installers.** The source can produce native packages,
   but that has not been run on any host yet, and Apple Developer ID signing
   and notarisation and Windows publisher signing are outstanding. The beta is
   distributed as source.
2. **Named capabilities are specified but not built.** Import, the AI
   assistant, and snapshots have accepted specifications and no
   implementation. They are listed below rather than implied by silence.

The beta is suitable for evaluation, for local writing, for source builds, and
for contributions. It is not yet an officially signed binary distribution.

## What the evidence actually is

Claims in this document rest on gates that run in this checkout:

| Gate | What it does | Current result |
| --- | --- | --- |
| `pnpm run check` | Builds nine workspace projects, type-checks test code, runs every suite, verifies the packaged desktop boundary, the hash-pinned assets, and this documentation | green, **1106 tests** |
| `pnpm run desktop:smoke` | Launches the real Electron shell and drives the real renderer with real input events, reading results from disk and from Git | green, **45 checks** |
| `pnpm run spike:editor` | Runs the editor adapter contract in a real rendering engine | green, 7/7 |

The desktop check is the one that matters most for a claim about behaviour:
it does not ask the application whether it saved a file, it reads the file.

## Available in the current beta

### The library

- Markdown files on disk as the single source of truth — one text is one file,
  groups are directories, and what the file manager shows is what the
  application shows.
- Front matter owned under one namespace, with foreign keys from other tools
  preserved byte for byte across a load and save.
- Creating, renaming, reordering by a real drag, and deleting into the desktop
  trash. **Renaming changes a title, never a file name.**
- Page categories with colours, defined per project.
- Opening a folder that is not a project: it can become one, or one project
  inside it is offered, or several are named.
- A watcher: a file changed behind the application's back reaches the editor,
  and a change under unsaved work asks before anything is lost.

### The editor

- Formatting shown rather than spelled out: headings at their own size with
  the level in the gutter, quotes, lists, task boxes, code, thematic breaks,
  and inline emphasis — with markers revealed again on the cursor's line.
- Front matter in an area of its own, outside the writing surface, read-only
  until the author says otherwise.
- A line-number gutter, a zoom, per-sheet wrapping, and a status bar with the
  cursor position.
- Find in the open sheet, opened from the native menu.
- Font family, base size, and the heading ratios as settings.

### Structure, search, and navigation

- The outline of the open sheet, with H3–H6 foldable away.
- Search across the whole library, as the navigator's third view — the text
  only, deliberately not the front matter.
- Back and forward through the sheets that were opened, from a Go menu with
  its own shortcuts, and the ten sheets saved most recently.

### Source control

Against the project's own Git repository, with nothing hidden: status, stage,
unstage, commit, push, fetch, pull, merge with per-region conflict resolution,
branches, publishing a branch, amending the last commit, `.gitignore` editing,
and discarding. Changes are shown as a **prose diff** — word by word, with
Git's own line view one click away. There is deliberately no hidden checkout
or history rewrite.

### Export

- One Markdown file, or a PDF the application sets itself from HTML and a
  print stylesheet.
- The whole document, or from one sheet on — with the groups above that sheet
  carried along, so an excerpt keeps its place in the book.
- Groups become headings; the sheets inside them move down under them.
- Four supplied stylesheets, plus the author's own by duplicating one. An
  author's stylesheets live in the project and travel with it.
- Front matter never appears in an export.

### Interface

- English and German, in the workbench and in the native menu, switchable
  without a restart.
- Light and dark schemes, eight accent palettes, and a packaged typeface
  rather than one borrowed from the system.
- Four regions as panels on a canvas, with draggable dividers that are
  remembered.
- Every action reachable without a pointer.

## Not built yet

These are specified and deliberately absent, not forgotten:

- **Import** of a Markdown folder into an existing project. Adopting a folder
  as a *new* project works today; bringing texts into one that exists does
  not.
- **The AI assistant.** Its rules are decided in detail — the key in the
  system keychain, the project-wide scope confirmed per request, what goes out
  shown before it goes, and the plain rule that **without a connection it is
  unavailable and says so** while everything else keeps working. None of it is
  implemented.
- **Snapshots.** Decided to be commits, over the prose diff source control
  already owns.
- **DOCX and EPUB export**, in that order, over the assembly that exists.
- **Saved views**, the editor's own context menu, highlighting special files,
  opening with an external application, a terminal panel, and reading aloud.

## Native platform status

**No native package has been built on any host yet.** `desktop:package` and
`desktop:make` are configured and have not been run. All development and
verification so far happened on macOS arm64.

This is the largest gap between this beta and a binary release, and it is
recorded plainly in the [platform matrix](platforms.md) rather than softened.
What a packaging round has to establish — per-host sequence, signing,
Linux sandbox ownership, and the artifact manifest — is written down there in
advance, so that the first run follows a plan rather than discovering one.

## Accessibility

The target is stated as a rule rather than as a standard: **every action is
reachable without a pointer, every focused thing is visibly focused, and every
control says what it is.** That rule is checkable and is checked.

A formal WCAG 2.1 AA conformance claim is deliberately **not** made. It is a
promise about contrast ratios and screen-reader semantics that is only honest
with tests behind it, and those tests are a work strand of their own. The
formal target stays open, and nothing built so far works against it.

## Remaining work before a signed binary release

- Run the packaging round on macOS, Windows, and a Debian-family Linux, and
  record the evidence per host.
- Configure and validate Apple Developer ID signing and notarisation.
- Configure and validate Windows publisher signing.
- Publish only artifacts produced by the complete host-specific release gate.

## Status sources

- [Release notes](releases/0.1.0-beta.1.md) — what is in the current tag.
- [Platform matrix](platforms.md) — native evidence, including its absence.
- [Testing](../engineering/testing.md) — the evidence required for a claim.
- [Roadmap](../engineering/roadmap.md) — open work and deferred decisions.
- [Specification](../engineering/specification.md) — authoritative for product
  behaviour.
