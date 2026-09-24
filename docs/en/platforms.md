# Native platform matrix

**English** | [Deutsch](../de/platforms.md)

Updated: 2026-09-24 · Release: `v0.1.0-beta.1`

This document records **what has actually been built and verified on which
operating system**. It is deliberately a record rather than an intention: an
artifact built on one operating system is evidence for that operating system
only.

## Evidence by operating system

The Windows results include the local corrections of 2026-09-24, not just
the unchanged beta tag. macOS and Linux have not been rerun for these changes.

| Platform | Date | Source gate | Development smoke | Native package | Installation acceptance |
| --- | --- | --- | --- | --- | --- |
| Windows 11 x64, build 26200 | 2026-09-24 | 1119 tests, editor 7/7 | 47/47 | application directory and ZIP; ASAR checked | not done |
| macOS arm64 | recorded by 2026-09-14 | green, historical | green, historical | not run | not done |
| macOS x64 | — | not run | not run | not run | not done |
| Ubuntu 24.04 x64 | 2026-09-14 | green, CI | 47/47, CI under X11 | not run | not done |
| Ubuntu / Debian arm64 | — | not run | not run | not run | not done |

Windows: Node 24.15.0, pnpm 11.24.0, native PowerShell. The desktop smoke
launches the development shell, not a Forge distribution. The package check
instead verifies the actual ASAR: main/preload, build identity, renderer,
fonts, icons, notices and project license must match the build. Smoke code
and unexpected files are forbidden; the version must match the workspace.
Output: `build/packages/`.

Four damaged copies falsify this check: missing renderer, changed main
bundle, leaked smoke code and wrong version. Each fails for the intended
reason; the unchanged artifact passes. Manual installation acceptance
remains open on every platform.
The packaged Windows application was launched with an isolated working
directory and fixture: renderer, project opening, editing and saving to
disk passed; the screenshot was inspected.

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
pnpm run spike:editor
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

### Windows

Build in native PowerShell or the command prompt, not WSL. Select Node 24
from an extracted ZIP or an existing version manager; keep other Node
installations separate. Bridge paths use `/`; native disk paths use Windows
syntax. Git fixtures set their own line-ending policy without changing
global Git configuration. The configured maker produces an unsigned
development ZIP. A Squirrel installer and publisher signing remain open.

### macOS

The configured maker targets an application bundle and ZIP. Native packaging
has not been verified here. DMG creation, Developer ID signing and
notarisation remain distribution work.

### Debian and Ubuntu

CI uses a virtual X11 display and prepares Electron's sandbox helper.
The sandbox is never disabled. The ZIP maker does not establish `root:root`
ownership and mode `4755` needed on systems that restrict unprivileged user
namespaces. A Linux ZIP is therefore not a supported end-user distribution.
A DEB maker and installation tests remain open; that round needs `sudo`,
`dpkg` and `fakeroot` on the build host.

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
