# Opera Incerta Agent Instructions

Status: Draft 0.3 — the MVP of `SPEC.md` §17 is built and verified

Date: 2026-09-03

This file defines **how** work happens in this repository. `SPEC.md` defines
**what** is built. `TESTING.md` defines the **evidence** required to claim that
it works. `CONVENTIONS.md` records the design and handling measures this
project works by.

## Project status

Opera Incerta is a young project with a working product. Six workspace projects
(`packages/core`, `packages/desktop-contract`, `packages/project-node`,
`packages/git-node`, `apps/workbench`, `apps/desktop`), a sandboxed Electron
shell, the versioned preload bridge with runtime guards, the workbench regions,
the library, the editor with its display model, and source control up to
merging and amending are built, tested and committed.

`DONE.md` is the record of what exists and why; `TODO.md` is what is open.
Neither is a summary — read the one that answers the question at hand.

Part of what this project knows comes from the author's earlier work — a native
macOS writing application, and a TypeScript monorepo of the same shape as this
one. **Both have been read out into this repository**: the product requirements
into `SPEC.md`, the engineering measures into `CONVENTIONS.md`, the evidence
rules into `TESTING.md`. Neither is a codebase to copy, neither is available to
consult, and nothing here may be written as though it were. If a requirement is
not in these documents, it does not exist yet — decide it, record it, and then
build it.

Accepted so far: the product intent (below), the runtime stack (Electron shell,
Node.js main process, Angular renderer, portable TypeScript core in a pnpm
workspace), and the documentation set. Everything else — product name, grammar
of the display model, editor component, dependency list, release channel — is
**draft** until recorded as accepted in `SPEC.md`.

The visible product name is **Opera Incerta**, accepted on 2026-09-01. The
technical name is `opera-incerta` (`@opera-incerta/*` packages, `.opera-incerta/`
project marker, `operaIncerta` bridge global). The two are separate concepts
that currently share a word: a later change to the product name MUST NOT touch
those identifiers, and a divergence between the two names is expected rather
than a defect (`SPEC.md` §1.1, `CONVENTIONS.md` C-N1).

## What the product is

Opera Incerta is a **local desktop tool for collecting and writing texts, and for
growing a structured book manuscript out of them**. It is deliberately more
than a Markdown editor: it accompanies the whole path from the first collected
thought to a finished, structured manuscript. Every display and editing
decision is measured against **overview** and **practical operability**.

The three-column operating concept (project tree · sheet list · editor plus a
secondary sidebar) takes Ulysses as a starting point but is expressly **not a
copy**; scope and interaction develop independently.

The guiding ideas are normative:

- **The author's files belong to the author.** Texts are real Markdown files
  (`.md`, UTF-8) on the filesystem. One text is one file (a *sheet*). No
  database, no proprietary container. Any other Markdown application can read
  them without loss.
- **Metadata stays with its content.** Title, topic, keywords, status,
  category, and notes live as YAML front matter in the head of the same file —
  never in a sidecar. Git synchronization and Finder/Explorer moves therefore
  cannot orphan metadata.
- **The folder structure *is* the library.** Groups are directories, sheets are
  files. What the user sees in the file manager is what the application shows.
- **Standard Markdown on disk, comfortable presentation in the editor.** The
  editor shows formatting (a heading as a size, not as `#`); the file on disk
  always contains clean, standard-conformant Markdown.
- **Saving never discards anything.** Front matter written by other tools
  survives a load/save round trip byte-for-byte.
- **Extensible through modules.** New capabilities (export formats, import
  sources, AI actions) are separate packages behind declared interfaces, added
  without touching the core.

The functional scope, its current-state slice, and its later phases are
specified in `SPEC.md` §6 to §18.

## Read first

Before making project changes:

1. confirm that the working directory is the intended Opera Incerta checkout;
2. read this file completely;
3. read `SPEC.md` completely;
4. read `TESTING.md` completely;
5. read `CONVENTIONS.md` for the inherited handling rules;
6. inspect the current repository state; and
7. distinguish draft decisions from accepted decisions.

An explicit current user instruction can change project scope. Record material
design changes in the relevant document **in the same change**, never "later".

When a requirement contradicts or extends `SPEC.md`, update `SPEC.md` in the
same change rather than implementing against an outdated specification.

## Core product invariants

Preserve these boundaries unless the user explicitly approves a specification
change:

- Markdown files on disk are the single source of truth; every index, cache, or
  database is a rebuildable accelerator, never the primary store;
- one sheet is exactly one `.md` file, and its own metadata lives in that
  file's front matter;
- unknown front matter is preserved verbatim across a load/save round trip;
- a save never rewrites, reorders, or drops content the application does not
  own;
- display names are decoupled from filesystem names: renaming in the
  application changes metadata, never the file name;
- project-shared state lives in `.opera-incerta/` inside the project and is
  committed; installation-local state lives in the Electron user-data
  directory and is never synchronized;
- the portable core stays free of DOM, Electron, Node.js filesystem, process,
  and network dependencies;
- all filesystem, process, and Git access lives in the Electron main process
  behind a versioned bridge; the renderer receives opaque handles;
- the renderer runs sandboxed with context isolation and without Node.js
  integration;
- editor display transformation and Markdown persistence are separate,
  independently testable stages;
- the same core produces identical results in the renderer, in a worker, and in
  any Node.js-side tooling;
- identical effective input produces deterministic output;
- normal operation requires no network access and no local or remote service;
- user-visible preferences never modify a document, mark it dirty, or change
  file content; and
- extensibility points (export, import, AI provider, file badges) are declared
  interfaces, not core special cases.

## Originality and prior-art rules

Opera Incerta must be an original program, not a clone of an existing writing
application.

The author's own earlier work is a legitimate source for requirements,
decisions, and hard-won lessons, and it has been read into `SPEC.md`,
`TESTING.md` and `CONVENTIONS.md` in full. Everything else — Ulysses,
Scrivener, Obsidian, Typora, iA Writer, VS Code, JetBrains IDEs — is prior art
studied only through public documentation and observable behavior.

Do not copy, translate, adapt, or closely paraphrase third-party:

- source code;
- documentation;
- examples or fixtures;
- themes, icons, or other visual assets; or
- interface layouts.

When researching prior art:

1. use public primary documentation and observable behavior;
2. record the user problem or general capability, not a foreign implementation;
3. convert the observation into a tool-independent requirement;
4. design Opera Incerta behavior from `SPEC.md`; and
5. cite the source used for the capability analysis.

All sample projects, fixture manuscripts, and screenshots must be created
specifically for this project. Do not reuse another application's demonstration
content. Do not use real or sensitive book content as test data.

## Dependencies and licensing

Before adding a dependency, report:

- the capability it provides;
- why that capability belongs outside the Opera-Incerta-owned core;
- its license;
- runtime and installation impact;
- whether it works offline;
- the adapter boundary that permits replacement; and
- the test that will protect that boundary.

Record accepted dependencies and evaluated candidates in `DEPENDENCIES.md`. Preserve
each package's own license and notice obligations.

Do not add a package to avoid a small, well-bounded implementation. Conversely,
do not reimplement a mature third-party algorithm when a properly licensed,
isolated dependency is the safer engineering choice.

Fonts, icons, fixtures, and themes are dependencies too. Their origin and
redistribution terms MUST be documented before inclusion, and packaged binary
assets MUST be hash-pinned.

## Change workflow

For analysis, review, or diagnosis:

- inspect relevant files and report findings;
- do not implement changes unless requested; and
- separate confirmed facts, proposals, and open decisions.

For an approved change:

1. identify the authoritative specification section;
2. present scope and representative impact before a broad systematic rewrite;
3. make the smallest coherent change that is independently runnable — no
   intermediate state that leaves the application unusable;
4. add or update the evidence required by `TESTING.md` in the same step, not
   "later";
5. run proportionate non-destructive validation;
6. inspect the rendered result when the user interface is affected; and
7. report implementation, automated validation, visual validation, commit, and
   push as separate statuses.

Do not silently widen a task from documentation to implementation, or from a
technical spike to production architecture.

Ambiguous requirements: choose the most sensible interpretation, name the
assumption briefly, and continue — **except** when the decision concerns
fundamental architecture (file format, module interfaces, process boundaries,
platform support). Those are settled before structural work begins.

## Working documents

The separation between `TODO.md` and `DONE.md` is binding:

| File | Content |
| --- | --- |
| `TODO.md` | **open work only** — what still has to be done |
| `DONE.md` | **completed work only** — with all associated information |

When an item is finished it moves **completely, in the same round**, from
`TODO.md` to `DONE.md`: not only the heading, but the reasoning, the
verification result (test counts, visual inspection), and the lesson learned.
Nothing completed stays in `TODO.md` — no ticked checkbox, no "done on …".
For multi-stage work plans this applies per stage.

New `DONE.md` entries go on **top** (newest first). The reason for this rule:
a `TODO.md` that was both lists at once once grew past 1,200 lines, at which
point the actual task list was unreadable. A task list is only worth as much as
its likelihood of being read.

## Source and architecture guidance

When implementation is authorized:

- keep the portable core (`packages/core`) free of DOM, Electron, Node.js
  filesystem, process, and network dependencies;
- place Node.js, Electron, filesystem, Git, and UI behavior behind adapters;
- run expensive work — library scans, full-text search, large-document parsing
  — outside the renderer UI thread;
- keep the display model independent of the Markdown parser's AST types, and
  translate parser output into explicit validated domain types;
- keep the Markdown-to-display and display-to-Markdown transformations pure and
  separately testable;
- attach stable identities and source ranges through every stage that feeds
  navigation (outline, diagnostics, sheet list);
- reject stale asynchronous results and retain the last valid view while an
  operation is in flight;
- isolate filesystem, process, and environment access at the main-process
  boundary;
- make randomness explicit and seeded, or eliminate it;
- provide stable diagnostic codes for user-visible failures;
- prefer pure transformations for any stage that needs deterministic tests;
- keep views thin — presentation only, with logic in services and state
  containers;
- put any rule that several call sites must apply consistently into one shared
  unit, not into each call site (see `CONVENTIONS.md`, "shared detail" rule);
  and
- do not force-unwrap, non-null-assert, or silently coerce data that came from
  a user file, an AI response, or a Git process.

Do not introduce a second editing pipeline, a duplicated Markdown
implementation, or renderer-specific persistence behavior without an approved
specification change.

## Testing and generated artifacts

Follow `TESTING.md`. In particular:

- tests are written with the functionality, in the same step;
- assert behavioral and structural invariants before relying on snapshots;
- use only original project fixtures, never real manuscript content;
- control fonts, locale, timezone, and randomness;
- never update a visual golden blindly;
- visually inspect every intentional user-interface change; and
- keep generated output out of source directories.

**Node 24, and nothing else.** Electron 44 carries Node 24.18.1 inside it, so
24 is the runtime the application actually runs on; building and testing on
anything else means checking against a runtime that is never shipped. All three
declarations say so — `.node-version`, `engines`, and `devEngines` with
`onFail: "error"` — and pnpm refuses to run on anything else rather than
warning about it. An earlier version warned, on *every* Node 24 as well because
the version was pinned exactly, and a warning that is always there is a warning
nobody reads: forty runs of this project happened on Node 26 before anyone
looked.

This machine has no version manager, so nothing reads `.node-version` by
itself. Homebrew keeps the runtimes side by side, and the one to use is
selected per shell:

```
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

No command may be listed as approved in this file until it has actually
succeeded in this checkout. The following have:

- `pnpm install` installs the pinned workspace dependency graph;
- `pnpm run build` builds every package and both applications;
- `pnpm run typecheck:tests` type-checks source and test code;
- `pnpm run test` runs the suites of all seven workspace projects;
- `pnpm run check` runs the complete current gate (build, type-check, test,
  desktop production boundary);
- `pnpm run check:assets` verifies the pinned icon bytes, their licence and
  notice, and that no packaged SVG can reach out or execute;
- `pnpm run check:desktop-production` verifies the built desktop artifacts:
  pinned dependencies, the sandboxed window options, the absence of `loadFile`,
  a production bundle that carries nothing of the smoke, a smoke bundle that
  starts the same sandboxed shell, a preload limited to one global and to
  declared channels, and the renderer document's content-security policy;
- `pnpm run workbench:build` produces the Angular renderer bundle under
  `build/workbench/browser/`;
- `pnpm run desktop:build` builds the renderer and bundles the Electron main and
  preload files;
- `pnpm run desktop:smoke` launches the shell through its smoke entry
  (`apps/desktop/src/smoke/`, see the `README.md` there), drives the real
  renderer through thirty-three checks, and writes `build/desktop/smoke*.png`;
- `pnpm run spike:editor` runs the editor spike gate of `TESTING.md` §2.8 in a
  real rendering engine and exits non-zero on any failed criterion;
- `pnpm run spike:parser` runs the parser spike gate of `TESTING.md` §2.11
  against the fetched, hash-verified CommonMark examples and exits non-zero
  when no candidate passes every criterion — which, as of 2026-09-04, is the
  case.

Not yet run here, and therefore not approved: `pnpm run desktop:start`,
`desktop:package`, and `desktop:make`.

## Documentation discipline

Keep status explicit:

- **Draft**: proposed and still open to design change.
- **Accepted**: approved as the current project direction.
- **Implemented**: present in source code.
- **Automatically validated**: relevant automated checks pass.
- **Visually validated**: the rendered result was inspected.

Do not describe a draft as implemented, or a passing unit test as visual
validation.

When a design choice changes, update the normative document and preserve useful
historical reasoning as an explicitly superseded note rather than silently
erasing it. The reason a rejected alternative was rejected is part of the
specification; it prevents the alternative from returning.

Every normative document carries a `Status:` and a `Date:` line under its title.

## Git and repository hygiene

- Preserve unrelated user changes.
- Keep commits narrowly scoped to the requested work.
- Do not commit, push, tag, publish, or initialize remote services unless
  asked.
- Do not bulk-format unrelated files.
- Do not delete drafts or prior design material without explicit approval.
- Run whitespace and diff checks before handing off a completed change once the
  repository is initialized.

## Definition of done

Do not call a task complete until the requested artifact exists, the relevant
checks have passed, the visual result has been inspected where applicable, and
all remaining open decisions or limitations are reported clearly.

Three parts of that are easy to skip and are therefore named:

- **Every new check is falsified.** Break the thing the check watches, see the
  check fail, and put it back. A green check proves nothing until it has been
  seen to go red for the right reason. Aim the falsification at the one check
  it is meant to prove: a break that stops the run early proves only the check
  it stopped at.
- **The screenshot is looked at.** Capturing evidence is not inspecting it.
  Every defect found by looking this far — front matter in the wrong place, a
  blank editor after a re-read, a name truncated to `.git...` — was invisible
  to a green suite.
- **`SPEC.md`, `TESTING.md`, `TODO.md` and `DONE.md` are updated in the same
  round as the code**, then the round is committed with a message that says
  what was decided and why, and pushed.

**Undoing a change mid-round is done with a copy, never with `git checkout`.**
A checkout takes uncommitted work with it. This cost a round's work once.

## Growth of this document

This file grows with the project. Changes to it are expressly welcome, and
every hard-won lesson — especially one that cost a debugging session — belongs
here or in `CONVENTIONS.md` rather than in a commit message nobody reads again.
