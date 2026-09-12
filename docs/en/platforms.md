# Native platform matrix

**English** | [Deutsch](../de/platforms.md)

Updated: 2026-09-12 · Release: `v0.1.0-beta.1`

This document records **what has actually been built and verified on which
operating system**. It is deliberately a record rather than an intention: an
artifact built on one operating system is evidence for that operating system
only.

## Current state, stated plainly

| Platform | Source gate | Desktop check | Native package | Installed and exercised |
| --- | --- | --- | --- | --- |
| macOS arm64 | green | green | **not run** | **not done** |
| macOS x64 | not run | not run | **not run** | **not done** |
| Windows x64 | not run | not run | **not run** | **not done** |
| Ubuntu 24.04 x64 | green (CI) | green (CI, 45 checks) | **not run** | **not done** |
| Ubuntu / Debian arm64 | not run | not run | **not run** | **not done** |

**No native package exists for any platform.** `pnpm run desktop:package` and
`pnpm run desktop:make` are configured through Electron Forge and have never
been executed.

The Ubuntu row is filled in from **continuous integration** (2026-09-12), not
from a person at a machine: the source gate and all 45 desktop checks pass on
`ubuntu-24.04` from a clean checkout. That is real evidence for the source
build and for the application's behaviour under X11, and it is not evidence
for a package, an installation, or the manual pass below. The distinction is
kept because it is the whole point of this table.

Its first run was worth having: it found two macOS assumptions that had been
green for weeks — a hard-coded `cmd` modifier in the desktop check, and an
export assertion that read a font name only a Mac was certain to have.

This is the honest state of a source beta, and it is the reason the beta is
distributed as source rather than as a download.

## Why one host cannot vouch for another

The application ships a Chromium runtime and uses the platform's own file
dialogs, menus, trash, and `git`. Each of those differs per operating system
in ways a test on a different host cannot observe:

- native maker helpers are compiled for the host's runtime and architecture;
- Chromium's sandbox needs different privileges on each system;
- path semantics, case sensitivity, and line endings differ;
- and the trash, the save dialog, and the menu are the platform's, not ours.

So the matrix has one row per platform **and** architecture, and a row is only
filled in by someone who ran the sequence on that machine.

## The sequence each host must run

One clean checkout per host. No cross-compilation is claimed.

```shell
node --version          # must be 24.15.0 or a newer 24.x
pnpm --version          # must be 11.24.0
pnpm install --frozen-lockfile
pnpm run check
pnpm run desktop:smoke
pnpm run desktop:make
```

Then verify the artifact, and write a manifest of file name, size, and SHA-256
per platform and architecture as the evidence.

**Install with the lockfile under the pinned Node 24 *before* the release
gate.** Native maker helpers compiled under a different runtime produce an ABI
mismatch that appears at packaging time, long after the source gate was green.

The Electron runtime arrives through the root `postinstall`, which runs the
desktop package's `install-electron` command. An install with
`--ignore-scripts` leaves it out; run it afterwards:

```shell
pnpm --filter @opera-incerta/desktop exec install-electron
```

## Per-platform requirements

### macOS

Produces a `.app` plus DMG and ZIP. Development builds are **ad-hoc signed
only**: they run on the machine that built them and are not distributable.
A public release needs Apple Developer ID signing and notarisation, neither of
which is configured yet. Creating a DMG may need the Xcode command line tools.

### Windows

Produces an application directory plus a Squirrel installer. Build from native
PowerShell or the command prompt, **never from WSL** — a WSL build produces
Linux binaries with Windows paths and fails in ways that waste an afternoon.

Node 24 belongs in an extracted ZIP invoked by its full path. The MSI
installers of different major versions replace one another and are useless as
a side-by-side build runtime.

A public installer needs a publisher signature, which is not configured yet.

### Debian and Ubuntu

Produces a DEB, deliberately rather than a portable archive. Chromium's
sandbox helper must be owned `root:root` with mode `4755`, and only a package
manager can establish that on systems that restrict unprivileged user
namespaces.

**The sandbox is never disabled**, and the user is never asked to repair
application files by hand. The build host needs `sudo`, `dpkg`, and
`fakeroot`.

The same requirement bites in continuous integration, where Electron comes
from an npm install rather than from a package manager: the workflow gives the
helper that ownership itself before running the desktop check. It does **not**
pass `--no-sandbox`, which would make the check run under conditions the
shipped application never has.

## The manual pass after installing

Automated checks end where the installer begins. On a machine with **no Node
installed**, each host must additionally:

1. install the package;
2. launch the application;
3. create a project, write, save, close, and reopen it;
4. export a PDF and a Markdown file;
5. exercise source control against a real repository;
6. **disconnect the network** and confirm that everything still works;
7. uninstall, and confirm that no project data was taken along.

Step 6 is not a formality: "normal operation requires no network" is a stated
invariant of this application, and an installed build is where it is worth
proving rather than assuming.

## What goes in the matrix afterwards

For each platform and architecture: the host operating-system version, the
Node and pnpm versions, the artifact names with their sizes and SHA-256
hashes, the date, and which of the seven manual steps passed. A row with a
missing step is written as missing, not as passed.
