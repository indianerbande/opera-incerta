# Opera Incerta Dependency Record

Status: Accepted toolchain, shell stack, editing surface, the test-time
standard oracle, and the Markdown parser for the GFM display (2026-09-04)

Date: 2026-09-01

This file records why each direct dependency exists, its license, its runtime
impact, the boundary that makes it replaceable, and the evidence required to
keep it (`AGENTS.md`, "Dependencies and licensing"; `conventions.md` C-L1).

Accepted dependencies and still-open candidates are listed separately. Passing
a spike alone is not permanent acceptance.

All versions are pinned exactly (`save-exact=true` in `.npmrc`). A version
change is a dependency decision, not a routine update.

The repository is licensed under the Apache License 2.0. That does not
relicense anything below: every package keeps its own license and notice
obligations, and those notices ship with the application
(`conventions.md` C-L5).

## Accepted — build and test toolchain

### TypeScript 6.0.3

- **Capability:** the implementation language, its type system, and declaration
  output for workspace packages.
- **Why external:** it is the language.
- **License:** Apache-2.0.
- **Impact:** build-time only; nothing reaches the installed application.
- **Offline behavior:** fully local after installation.
- **Boundary:** none needed; every package compiles through its own
  `tsconfig.json` extending `tsconfig.base.json`.
- **Evidence:** `pnpm run build` compiles every package; `pnpm run
  typecheck:tests` type-checks test code as well.

### Vitest 4.1.11

- **Capability:** unit and contract test runner.
- **Why external:** a test runner is infrastructure, not product logic.
- **License:** MIT.
- **Impact:** build-time only.
- **Offline behavior:** fully local.
- **Boundary:** tests import only from package entry points, so the runner can
  be replaced without touching the code under test.
- **Evidence:** `pnpm run test` runs the suites of all six workspace projects.

### esbuild 0.28.2

- **Capability:** bundles the Electron main process and preload script into the
  CommonJS files Electron loads.
- **Why external:** bundling is a solved, isolated build step.
- **License:** MIT.
- **Impact:** build-time only; the produced bundles ship, the bundler does not.
- **Offline behavior:** fully local; the platform binary is fetched once at
  installation.
- **Boundary:** used only by `apps/desktop`'s build script. Replacing it means
  changing one script line.
- **Evidence:** `pnpm run desktop:build` produces `dist/main.cjs` and
  `dist/preload.cjs`; `pnpm run desktop:smoke` launches them.

### @types/node 24.13.3

- **Capability:** type declarations for Node.js APIs in the main process and
  the Node adapters.
- **License:** MIT.
- **Impact:** build-time only.
- **Boundary:** deliberately **not** available to `packages/core` and
  `packages/desktop-contract`, whose `tsconfig.json` sets `"types": []`. That is
  how the portability invariant of `specification.md` §5.2 is enforced by the compiler
  rather than by discipline.
- **Evidence:** the portable packages compile with no ambient Node types; an
  attempt to use `TextEncoder` in `desktop-contract` failed the build and was
  replaced by a pure implementation.

## Accepted — renderer

### Angular 22.1.4 (`@angular/core`, `@angular/common`, `@angular/platform-browser`)

- **Capability:** the workbench user interface: components, templates,
  reactivity through Signals, and zoneless change detection.
- **Why external:** a mature component and rendering framework is far outside
  what this project should own.
- **License:** MIT.
- **Impact:** ships inside the packaged application. The scaffold bundle is
  about 104 kB raw / 31 kB transfer.
- **Offline behavior:** fully local; no runtime network access.
- **Boundary:** Angular owns UI composition only. Domain rules live in
  `packages/core` and never import Angular; the desktop bridge is reached
  through `packages/desktop-contract`.
- **Evidence:** `pnpm run workbench:build` produces the renderer bundle;
  `apps/workbench/test` covers the layout contract without a framework harness.

### `@angular/build` 22.1.6, `@angular/cli` 22.1.6, `@angular/compiler` 22.1.4, `@angular/compiler-cli` 22.1.4

- **Capability:** the application builder and ahead-of-time compiler.
- **License:** MIT.
- **Impact:** build-time only.
- **Boundary:** configured in `apps/workbench/angular.json`; output goes to
  `build/workbench/browser`, outside every source directory
  (`conventions.md` C-T18).
- **Evidence:** the production build runs clean with `outputHashing: none` and a
  1 MB initial-bundle warning budget.

### rxjs 7.8.2, tslib 2.8.1

- **Capability:** required peer dependencies of the Angular runtime.
- **License:** Apache-2.0 (rxjs), 0BSD (tslib).
- **Impact:** ships with the renderer.
- **Boundary:** application code prefers Signals; RxJS is present because
  Angular requires it, not as an architectural choice.
- **Evidence:** covered by the renderer build.

## Accepted — editing surface

### CodeMirror 6 (`@codemirror/state` 6.5.2, `@codemirror/view` 6.38.1, `@codemirror/commands` 6.8.1)

- **Capability:** the text editing surface: a document model with transactions,
  decoration-based rendering, gutters, variable line heights, undo history, and
  the input handling a real editor needs.
- **Why external:** text editing is one of the few components where a
  self-built version is reliably worse than a mature one — input methods,
  selection, clipboard, accessibility, and bidirectional text each take years
  to get right, and getting them wrong shows up in the author's daily work.
- **License:** MIT.
- **Impact:** ships inside the packaged application; the spike bundle including
  all three packages is about 510 kB unminified. No runtime network access.
- **Offline behavior:** entirely local.
- **Boundary:** an Opera-Incerta-owned `EditorAdapter` interface. The display
  model — heading levels, inline spans, the marker gutter's content — is
  computed in `@opera-incerta/core` and handed to the component as decorations.
  The component renders and reports edits; it never owns Markdown semantics,
  and it never persists anything. Replacing it means reimplementing that
  interface, not rewriting the display model.
- **Evidence:** the spike gate of `testing.md` §2.8, all six criteria passed in
  a real rendering engine on 2026-09-01. Run it with `pnpm run spike:editor`;
  the measurements are recorded in `spikes/editor-codemirror/README.md`.

**Why not Monaco**, the obvious alternative: Monaco is built for
source code and assumes a uniform line height. Opera Incerta shows H1 at 45 px
next to body text at 22.5 px in the same document, which is the core of its
display model rather than a decoration on top of it.

## Accepted — the Markdown parser

### markdown-it 15.0.1

- **Capability:** the block structure of a document — quotes, lists and
  their nesting, code blocks, thematic breaks — for the GFM display of
  `specification.md` §10.7. Run in its CommonMark preset with HTML, linkify, and the
  typographer off.
  **Since 2026-09-11 it renders as well**, in `packages/export`: the export
  of §15.2 sets its PDF from HTML. That one runs the **full** preset, so a
  GFM table reaches the exported document as a table — the export hands the
  manuscript to someone else, unlike the editor, which shows what stands in
  the file. `html: false` stays, and linkify and the typographer stay off:
  an export may not improve the author's text, and a manuscript is data,
  never a page to be executed.
- **Why external:** the line-based rules of the core see no containers
  (§10.1); a conformant block parser is a mature algorithm, not a
  well-bounded implementation of our own.
- **License:** MIT. Dependencies: `mdurl`, `uc.micro`, `entities`
  (BSD-2-Clause), `linkify-it`, `punycode.js` — and `argparse`, **PSF-2.0**,
  which serves only markdown-it's command-line tool, is not imported by its
  module entry, and never reaches a bundle: `check:desktop-production`
  fails the build if the built renderer carries it. PSF-2.0 is OSI-approved
  and permissive; the gate of `testing.md` §2.11 did not list it, and this
  entry is where the deviation is recorded.
- **Impact:** 7 packages, 3 MB unpacked in development; the renderer bundle
  takes the module entry and its five imports. 15 ms for 112,854 characters
  in the spike; parsed once per change of the text, never per cursor move.
- **Offline behavior:** fully local.
- **Boundary:** `packages/markdown` translates the tokens into the core's
  own `BlockModel` and lets no token out (`conventions.md` C-A6). Task
  list items, which markdown-it does not know, are that translation's own
  rule — the second deviation the spike measured, settled here rather than
  by a third-party plugin.
- **Evidence:** `packages/markdown/test`, the presentation tests of the
  core, the GFM check of the smoke (`testing.md` §2.7), and
  `packages/export/test` for the rendered document.

## Accepted — the standard oracle (tests only)

### commonmark.js 0.31.2 (with `@types/commonmark` 0.27.10)

- **Capability:** the reference implementation of CommonMark, used as the
  oracle the display transform is checked against (`testing.md` §2.2).
- **Why external:** a conformance check needs an implementation the core
  did not write; the core's own tests can only show that its writer and
  reader agree with each other.
- **License:** BSD-2-Clause; `entities` BSD-2-Clause, `mdurl` and `minimist`
  MIT. Four packages.
- **Impact:** a devDependency of `packages/core` only; nothing reaches the
  installed application. 652 of 652 specification examples, source
  positions, 9.5 ms for 112,854 characters (`spikes/parser-markdown`).
- **Offline behavior:** fully local; the test uses generated documents, not
  the fetched specification.
- **Boundary:** `test/standard-oracle.test.ts` translates its nodes into
  line numbers before comparing; no type of it appears outside that file.
- **Evidence:** the oracle test itself, and the spike gate of `testing.md`
  §2.11 read as two gates by decision of 2026-09-04: for a test oracle,
  criterion 4 (GFM) does not apply.

### yaml 2.9.0

- **Capability:** an independent YAML 1.2 reader for the front matter the
  codec writes.
- **Why external:** same reason; and the codec deliberately owns no YAML
  parser of its own (`specification.md` §6.3), so this is the only way to check its
  output against the standard.
- **License:** ISC. No dependencies.
- **Impact:** a devDependency of `packages/core` only.
- **Offline behavior:** fully local.
- **Boundary:** the test compares parsed plain values; nothing of the
  library's document model is kept.
- **Evidence:** the oracle test; on its first run in the spike it found four
  defects in the codec (`completed-work.md`, 2026-09-04).

## Accepted — desktop shell

### Electron 44.3.0

- **Capability:** the desktop application shell: native windows, lifecycle,
  menus, dialogs, and a Chromium renderer with a process boundary that can be
  locked down.
- **Why external:** a cross-platform desktop runtime is not something this
  project can own, and this one is proven in a comparable application.
- **License:** MIT (the bundled Chromium and Node.js carry their own licenses
  and notices, which ship with the application).
- **Impact:** large. The runtime is roughly 300 MB unpacked per platform and is
  the dominant part of every distributable. It requires macOS 13 or newer.
- **Offline behavior:** the installed application needs no network access. The
  binary download happens once at development installation time and uses the
  local Electron cache when present. The published package has no install
  script; the root `postinstall` runs its `install-electron` command
  (`README.md`), which is why `allowBuilds` alone did not fetch it.
- **Boundary:** `apps/desktop` owns native behavior only; it MUST NOT own
  document semantics (`specification.md` §5.2). The renderer reaches it exclusively
  through the versioned bridge in `packages/desktop-contract`.
- **Evidence:** `pnpm run desktop:smoke` launches the shell, verifies that the
  renderer rendered and that the bridge answers, and writes a screenshot to
  `build/desktop/smoke.png`. `apps/desktop/test` asserts the security
  boundary — context isolation, sandboxing, no Node integration, denied
  navigation and webviews, and a preload surface limited to declared channels.

### Electron Forge 7.11.2 (`@electron-forge/cli`, `@electron-forge/maker-zip`)

- **Capability:** packaging and distributable creation.
- **Why external:** packaging, code signing, and installer formats are
  platform-specific, moving targets.
- **License:** MIT.
- **Impact:** build-time only.
- **Offline behavior:** local after installation.
- **Boundary:** a replaceable packaging adapter configured in
  `apps/desktop/forge.config.cjs`. The ZIP maker is the starting point because
  it adds no platform-specific build tooling; native installers are accepted
  separately with `PLATFORMS.md` (`conventions.md` C-P9).
- **Evidence:** none yet — `pnpm run desktop:package` and `desktop:make` have
  not been run in this checkout, and no command may be reported as approved
  before it has succeeded here (`conventions.md` C-T19).

## Workspace resolution decisions

### Override: `@electron/rebuild@3.7.2>@electron/node-gyp` → `10.2.0-electron.2`

`@electron/rebuild`, reached through the Forge CLI, resolves `@electron/node-gyp`
from a Git repository. The workspace policy rejects exotic subdependencies, and
the Electron fork is published to the registry under this version. Recorded in
`pnpm-workspace.yaml` with the same reasoning.

### Ignored native builds: `@parcel/watcher`, `lmdb`, `msgpackr-extract`

Optional native helpers of transitive packaging dependencies. Opera Incerta does
not use them, and building them would require a compiler toolchain in every
checkout. Set to `false` explicitly so the decision is visible rather than a
recurring installation prompt.

## Open candidates — not accepted

These are named in `specification.md` §5.4 and require the full report above, plus a
spike, before they may be added.

### Markdown parser for the GFM display (the other candidates, measured 2026-09-04)

markdown-it is accepted above; the measurements of every candidate stay
here as the record of the decision. Its AST MUST NOT become the public model
(`conventions.md` C-A6). Front matter handling is deliberately **not**
delegated to it: foreign keys are preserved as raw lines, which needs no YAML
parser at all (`specification.md` §6.3).

Measured against the gate of `testing.md` §2.11 in `spikes/parser-markdown`;
the thresholds were fixed before the run. None passed every criterion, and
the decision the outcome asks for is in `roadmap.md` §2.1.

- **markdown-it 15.0.1** — MIT. 652 of 652 examples; source positions; 15 ms
  for 112,854 characters; 7 packages, 3 MB unpacked. Tables and
  strikethrough built in, **no task list items**; its `argparse` dependency
  (used by its command-line tool only) is **PSF-2.0**, outside the gate's
  license list.
- **commonmark.js 0.31.2** — BSD-2-Clause, with `entities` (BSD-2) and
  `mdurl`, `minimist` (MIT). The reference implementation: 652 of 652;
  source positions; 9.5 ms; 4 packages, 1 MB. **No GFM.**
- **marked 18.0.12** — MIT, zero dependencies, full GFM, 11 ms. **592 of 652**:
  tabs, list tightness, and the finer link rules. A renderer, not a
  reference; it cannot be the oracle.
- **micromark 4.0.2 with mdast-util-from-markdown 2.0.3** — MIT. 648 of 652
  (link destinations with escapes and unusual schemes); source positions;
  full GFM through the author's extensions. **43 packages** and **164 ms**,
  twelve times the others.
- **yaml 2.9.0** — ISC, zero dependencies. Read the codec's front matter
  for criterion 7 and found four defects in it (`roadmap.md` §1); 165 of 181
  generated sheets and all three fixtures read back identically. The
  fitting oracle for the front matter half of the cross-check.

### Node — 24, because Electron says so

Electron 44.3.0 bundles Node **24.20.0** (Chrome 152.0.7977.78, V8 15.2),
measured with `ELECTRON_RUN_AS_NODE=1` on 2026-09-12. None of the three
releases from 44.0.0 announced a Node.js change in its notes; the runtime had
moved two minors regardless, which is why this number is measured and not
read. That is the runtime the application runs on, so it is
the runtime the toolchain is held to: `engines` and `devEngines` both say
`^24.15.0`, and `devEngines.onFail` is `error`, so a wrong runtime stops the
command instead of printing a line nobody reads.

### Filesystem watching — no dependency, decided

Node's own `fs.watch`, behind the `LibraryWatcher` port in
`packages/project-node`. What a watching library mostly buys — coalescing,
settling, normalising platform quirks — this application already owns and
tests, so taking one would mean two answers to the same questions. The platform
behaviour that decided the adapter's shape was measured first and is recorded
in `specification.md` §10.6.

`chokidar` remains the replacement if that adapter ever needs to grow its own
rescanning or event normalisation: it goes behind the same port, and no rule
moves.

### Comparing prose — no dependency

The word-level comparison of §12 is Myers' shortest edit script over tokens, in
the portable core. A diff library would have brought its own tokenizer, its own
idea of a word, and its own opinion about whitespace — none of which is more
than the hundred lines it replaces, and all of which would have to be
understood before the result could be trusted. What makes the result
trustworthy here is the invariant it is tested against, not the size of the
implementation.

### Git — no dependency

Source control uses the locally installed `git` executable through
`child_process`. No Git library is planned, and no Git binary is bundled
(`specification.md` §12, `conventions.md` C-P10).

## Asset status

### Material Symbols Outlined — six icons

- **Capability:** the activity bar symbols of `specification.md` §8.4.
- **Why external:** drawing six icons by hand would produce worse ones and buy
  nothing; these are a maintained, widely recognised set.
- **License:** Apache-2.0. `apps/workbench/src/assets/material-symbols/LICENSE`
  is an unchanged copy of the upstream licence, and `SOURCE.md` beside it
  records the upstream project, the package version the files came from, the
  retrieval date, and which symbol serves which entry.
- **Impact:** six SVG files, 3.5 kB in total, copied into the built renderer
  along with their licence and notice. No dependency is installed for them: the
  files are in the repository, so the build needs nothing at runtime.
- **Offline behavior:** local files.
- **Boundary:** decorative presentation only. They are drawn as CSS masks so
  they take the button colour, never appear in a manuscript or an export, and
  every button carries its own accessible name — replacing them changes how the
  workbench looks and nothing else.
- **Evidence:** `pnpm run check:assets` verifies each file's SHA-256, requires
  the licence and the notice, and rejects an SVG containing a script, a
  reference, or a data URI. `check:desktop-production` additionally requires
  all eight files in the built renderer. The check was falsified before being
  trusted: a single changed byte and a missing notice each fail it.

### IBM Plex — the interface face

- **Capability:** the typography of the visual system (`specification.md` §8.8): IBM
  Plex Sans in five weights for the workbench, IBM Plex Mono in three for what
  is code rather than prose.
- **Why external:** a face is not something to draw, and a face taken from the
  system is a different face on every machine — which makes an interface
  impossible to design and a screenshot impossible to compare. The
  application's other half, the manuscript, keeps a configurable family
  (§13); this is the chrome around it.
- **License:** SIL Open Font License 1.1.
  `apps/workbench/src/assets/ibm-plex/LICENSE` is an unchanged copy of the
  upstream licence, and `SOURCE.md` beside it records the upstream release
  (`v6.4.2`, commit `242c4cccd37e87985a5337815c99b960ef13c65c`), the retrieval
  date, and what each file is for.
- **Impact:** eight WOFF2 files, 470 kB in total, copied into the built
  renderer with their licence and notice. No dependency is installed for them:
  the files are in the repository, so the build needs nothing at run time and
  nothing is fetched — the renderer's own protocol serves them, and its
  content security policy allows fonts from itself only.
- **Offline behavior:** local files.
- **Boundary:** presentation only, behind two tokens (`--wi-sans`,
  `--wi-mono`). Replacing the face is replacing two `@font-face` blocks and
  the two values; nothing else names a family.
- **Evidence:** `pnpm run check:assets` verifies each file's SHA-256 and
  requires the licence and the notice; the smoke reads
  `document.fonts.check('16px "IBM Plex Sans"')` in the running application,
  which is what proves the packaged bytes actually arrive over the renderer
  protocol rather than merely sitting in the build.

## Automated updates

Dependency updates arrive weekly through a bot, and are shaped so that it
cannot propose something the gate would have to reject
(`.github/dependabot.yml`):

- **Packages that are one release come as one pull request** — all of
  `@angular/*`, all of Electron and its packaging tools, all of CodeMirror,
  and TypeScript together with the `@types` that follow it.
- **Major versions are not proposed at all** for Electron, Angular,
  TypeScript, Vitest, and `@types/node`. A major moves an API or a runtime and
  needs a round of its own. Security advisories are unaffected: GitHub raises
  those separately and this filter does not touch them.

`pnpm run check:dependencies` enforces the same rules from the other side, so
they hold whoever made the change — bot, contributor, or maintainer. What it
proves, and how it was falsified, is in `testing.md` §2.13.

**No update is merged because its version number is newer.** The pull request
has to pass the gate, and a change that touches the editor, the export, or the
packaging needs the evidence its own round would need.
