# Build Opera Incerta from source

**English** | [Deutsch](../de/build-from-source.md)

The beta is distributed as source. This page takes you from a clean machine to
a running application, and then to a verified one.

## Prerequisites

- **Node.js 24.15.0** or a newer 24.x release. The repository pins the line
  in `package.json` and `.node-version`.
- **pnpm 11.24.0**, installed separately under Node 24.
- **Git**, for cloning and because the application's source-control features
  call the system `git`.
- Roughly 1.5 GB of disk for dependencies and the Electron runtime.

No compiler toolchain, Python, or native build environment is needed to run
the application from source. Packaging it natively needs more; see the
[platform matrix](platforms.md).

## Select the runtime for your operating system

- **Windows / PowerShell:** extract the Node 24 ZIP and select it for this
  session: `$env:PATH = "C:\tools\node-v24.15.0-win-x64;$env:PATH"`.
  Replace the example path with the actual extraction path. Do not build in WSL.
- **macOS / Homebrew:** `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`
  on Apple Silicon; use the actual path for other installations.
- **Linux:** select Node 24 with the host's runtime management.
  Desktop checks require a display (Xvfb in CI) and a working Chromium
  sandbox; see the [platform matrix](platforms.md).

Then check `node --version` (24.x) and `pnpm --version` (11.24.0).
`.node-version` alone does not switch the runtime.

## Clone and install

```shell
git clone https://github.com/indianerbande/opera-incerta.git
cd opera-incerta
npm install --global pnpm@11.24.0
pnpm install --frozen-lockfile
```

`--frozen-lockfile` is deliberate: it installs exactly what the lockfile
records and fails rather than resolving something newer.

### About the Electron runtime

The Electron binary is fetched by the root `postinstall` script, which runs
the desktop package's own `install-electron` command. The published Electron
package has no install script of its own, so no pnpm build setting brings it
in — the explicit command is how it arrives. It is idempotent and skips when
`dist/` already holds the right version.

If you installed with `--ignore-scripts`, the runtime is missing. Fetch it:

```shell
pnpm --filter @opera-incerta/desktop exec install-electron
```

## Run it

```shell
pnpm run desktop:start
```

This builds the renderer and the Electron main and preload bundles, then opens
the application on its launcher. Create a project, or point it at a folder of
Markdown files you already have: it will offer to adopt the folder, which adds
a `.opera-incerta/` directory and changes nothing else.

To work on the renderer alone, in a browser and without the shell:

```shell
pnpm run workbench:start
```

The workbench then runs without a bridge and shows no project — useful for
layout work, not for anything that touches a file.

## Verify it

One command runs the complete source gate:

```shell
pnpm run check
```

It builds every workspace package, type-checks the test projects, runs every
suite, verifies the packaged desktop boundary (pinned dependencies, sandboxed
window options, the preload's channel inventory, the content-security policy),
checks the hash-pinned icon and font assets with their licences, and validates
this documentation.

Two further gates drive real software rather than modules:

```shell
pnpm run desktop:smoke
pnpm run spike:editor
```

`desktop:smoke` launches the real Electron shell against a copy of a fixture
project and drives the real renderer with real input events — clicking,
typing, dragging, and using the native menu — then reads the results from the
disk and from Git rather than from the application's own belief about them. It
writes screenshots to `build/desktop/`, which are worth looking at.

`spike:editor` runs the editor adapter's contract suite inside a real
rendering engine, so the display model is proven where it actually runs.

All of these run offline. None of them needs a network.

## Build a native package

```shell
pnpm run desktop:package   # an application directory
pnpm run desktop:make      # a distributable installer or archive
```

**Application directory and ZIP succeeded on Windows x64 on 2026-09-24.** Read the [platform
matrix](platforms.md) before you start: it records the per-host sequence, the
prerequisites, and the manual pass afterwards. A package must be built on the
platform it is for.

## A source ZIP works too

The build and the complete source gate do **not** require a `.git` directory,
so a downloaded source archive builds and verifies. The only part that needs
Git is the application's source-control feature, which acts on *your* project
rather than on this repository.

## Where the application keeps things

- **Your project** holds the manuscript, plus a `.opera-incerta/` directory
  with the project record, the group structure, the categories, the recently
  edited list, and any export stylesheets you made. All of it belongs in your
  version control.
- **Installation-local state** — the recent projects list and your preferences
  — lives in the Electron user-data directory for your operating system and is
  never written into a project.

## If something goes wrong

- **`electron: not found` or the window never appears.** The runtime is
  missing; run the `install-electron` command above.
- **The smoke check hangs.** It drives a real application; if a dialog is
  waiting for an answer that never comes, the run stalls. The console output
  names the check it was in.
- **A test fails right after a dependency change.** Build first — several
  packages resolve each other through `dist/`, so a stale build reports as a
  type error in a file you did not touch:

  ```shell
  pnpm run build
  ```
