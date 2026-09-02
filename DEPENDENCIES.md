# Opera Incerta Dependency Record

Status: Accepted toolchain, shell stack, and editing surface; the Markdown
parser remains an open candidate

Date: 2026-09-01

This file records why each direct dependency exists, its license, its runtime
impact, the boundary that makes it replaceable, and the evidence required to
keep it (`AGENTS.md`, "Dependencies and licensing"; `CONVENTIONS.md` C-L1).

Accepted dependencies and still-open candidates are listed separately. Passing
a spike alone is not permanent acceptance.

All versions are pinned exactly (`save-exact=true` in `.npmrc`). A version
change is a dependency decision, not a routine update.

The repository is licensed under the Apache License 2.0. That does not
relicense anything below: every package keeps its own license and notice
obligations, and those notices ship with the application
(`CONVENTIONS.md` C-L5).

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
  how the portability invariant of `SPEC.md` §5.2 is enforced by the compiler
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
  (`CONVENTIONS.md` C-T18).
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
- **Evidence:** the spike gate of `TESTING.md` §2.8, all six criteria passed in
  a real rendering engine on 2026-09-01. Run it with `pnpm run spike:editor`;
  the measurements are recorded in `spikes/editor-codemirror/README.md`.

**Why not Monaco**, which the technical template uses: Monaco is built for
source code and assumes a uniform line height. Opera Incerta shows H1 at 45 px
next to body text at 22.5 px in the same document, which is the core of its
display model rather than a decoration on top of it.

## Accepted — desktop shell

### Electron 44.0.0

- **Capability:** the desktop application shell: native windows, lifecycle,
  menus, dialogs, and a Chromium renderer with a process boundary that can be
  locked down.
- **Why external:** a cross-platform desktop runtime is not something this
  project can own, and it is the stack the technical template already validates.
- **License:** MIT (the bundled Chromium and Node.js carry their own licenses
  and notices, which ship with the application).
- **Impact:** large. The runtime is roughly 300 MB unpacked per platform and is
  the dominant part of every distributable. It requires macOS 13 or newer.
- **Offline behavior:** the installed application needs no network access. The
  binary download happens once at development installation time and uses the
  local Electron cache when present.
- **Boundary:** `apps/desktop` owns native behavior only; it MUST NOT own
  document semantics (`SPEC.md` §5.2). The renderer reaches it exclusively
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
  separately with `PLATFORMS.md` (`CONVENTIONS.md` C-P9).
- **Evidence:** none yet — `pnpm run desktop:package` and `desktop:make` have
  not been run in this checkout, and no command may be reported as approved
  before it has succeeded here (`CONVENTIONS.md` C-T19).

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

These are named in `SPEC.md` §5.4 and require the full report above, plus a
spike, before they may be added.

### Markdown parser — CommonMark/GFM family (candidate)

Required for the display transform and the outline. Its AST MUST NOT become the
public model (`CONVENTIONS.md` C-A6). Front matter handling is deliberately
**not** delegated to it: foreign keys are preserved as raw lines, which needs no
YAML parser at all (`SPEC.md` §6.3).

### Filesystem watching — `chokidar` (candidate)

Node's own `fs.watch` plus a debouncing layer may be sufficient. Whichever wins
sits behind the `LibraryWatcher` port in `packages/project-node`.

### Git — no dependency

Source control uses the locally installed `git` executable through
`child_process`. No Git library is planned, and no Git binary is bundled
(`SPEC.md` §12, `CONVENTIONS.md` C-P10).

## Asset status

### Material Symbols Outlined — six icons

- **Capability:** the activity bar symbols of `SPEC.md` §8.4.
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

No fonts have been added yet. When they are, the same applies
(`CONVENTIONS.md` C-L4, `TESTING.md` §7).
