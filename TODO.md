# Opera Incerta — open work

**Purpose of this file: what is still open — nothing else.** Completed work
moves here out and into [`DONE.md`](DONE.md) **completely**, with its reasoning,
its verification result, and its lesson, in the same round (`AGENTS.md`,
"Working documents"). No ticked checkbox stays behind.

This file is not a source of truth. Those are `AGENTS.md` (process), `SPEC.md`
(product), `TESTING.md` (evidence), and `CONVENTIONS.md` (inherited measures).

**State 2026-09-03:** the library is complete — create, rename, place, delete —
as are the front matter area (§10.4), page categories (§6.6), the conflict rule
of §10.6 with the watcher that triggers it, and source control (§12) up to and
including amend and `.gitignore`. `pnpm run check` green on **Node 24**: 6
projects, **800 tests**, plus the desktop and asset checks.
`pnpm run desktop:smoke` green across thirty checks,
`pnpm run spike:editor` 7/7.

All sixteen MVP criteria of `SPEC.md` §17 are built and checked. What remains
open are the two source-control items below (creating a repository, and the git
identity), the parts of §15 that this stage deliberately excludes, and the
decision in §2.1.

The documents are **self-contained** since 2026-09-03: every requirement,
measure and recorded defect stands in this repository, and no other repository
has to be consulted to build, verify or change the product.

---

## 1. Next — small enough to start immediately

1. **Independent parser cross-check for the codec** — `TESTING.md` §2.2 requires
   proof that written output is standard-conformant and readable by an
   independent Markdown/YAML parser. The codec's own tests cannot supply that,
   and no parser dependency is accepted yet (§2.1, `DEPENDENCIES.md`). Until
   then the honest claim is "round-trips through our own reader", not "verified
   standard-conformant".
2. **Electron binary installation** — `pnpm install` did not run Electron's
   postinstall despite `allowBuilds`, and the binary had to be fetched by
   running `install.js` in the store directory. Find the correct pnpm 11
   configuration so a clean checkout works in one step, then record it in
   `PLATFORMS.md`.

4. **Creating a repository for a project that has none** (`SPEC.md` §12). The
   panel says the project is not inside a Git repository and offers nothing.
   `git init -b main` in the project root plus an ordinary status read is the
   whole step; nothing is staged or committed by it.
5. **The identity git needs** (`SPEC.md` §12), the round after that. Without
   `user.name` and `user.email` the first commit fails with a message written
   for programmers, and for an author who has never used git that is the normal
   case. Ask only when no **global** identity exists, write the answer
   repository-locally, never touch the global configuration, and offer a place
   to supply it later for someone who declines.
6. **One unreproduced smoke failure**, seen once on 2026-09-03: the save check
   of `checkDocumentFlow` reported "the saved file does not contain the edit"
   in a run whose only change was in an unrelated core rule. Four runs
   immediately afterwards — two clean, two falsified — were green. Recorded
   rather than explained away: if it returns, the trail starts here, and the
   suspicion to test first is a race between the menu save and the
   watcher-driven re-read.

7. **Untangling the renderer, second round.** The first round (2026-09-03)
   took the flows out of the shell into `LibraryActions` and
   `SourceControlActions`, one overlay, one error translator, and one
   re-adopt choreography in the workspace store. What the review found and
   this round left, in the order to take them:
   - **a shared dialog shell.** Backdrop, Escape handling, centring, the
     button reset, and the `.hint` styling are copied into eight dialog
     components (`text-prompt`, `confirm-prompt`, `text-editor`, `branches`,
     `diff-view`, `conflict-resolver`, `category-manager`,
     `new-project-dialog`), which is the failure C-U7 names. One `wi-dialog`
     with a header slot and a handful of custom properties in `styles.css`
     would delete about four hundred lines; the smoke selects by component
     tag and inner class (`wi-confirm-prompt button`, `.warning`), so those
     must survive;
   - **one way to hand state to components.** `LibraryDrag` is passed whole
     as an input and threaded through every `wi-explorer-node`, while
     `SourceControlStore` is exploded into fourteen inputs and eighteen
     outputs. `DESKTOP_BRIDGE` is an injection token nobody provides or
     injects. Either provide the stores and the drag at the root and
     `inject()` them, or keep inputs everywhere — not both;
   - **`linkedSignal` instead of `queueMicrotask`** in `text-prompt`,
     `text-editor`, `category-manager`, and `diff-view`, which copy an input
     into a local signal a tick after construction;
   - **the drag's DOM protocol.** `data-drop`, `data-drop-list`,
     `data-parent`, `data-path`, `data-name` are a five-attribute contract
     across three files with no shared constant, and `#peers` queries the
     whole document on every pointer move. The siblings and the index come
     from the library model; only the bounding box needs the DOM;
   - **a `LauncherStore`** for the welcome window, which reimplements the
     bridge-running pattern inside a component;
   - **`LayoutState`**: writable signals where the stores expose read-only
     ones; the three front-matter toggles do not persist until an unrelated
     change does; `showDeeperOutline` is mirrored into the workspace store;
     and the view names are validated against lists that duplicate the
     union types;
   - **the CodeMirror adapter**: a module-level `WeakMap` where a closure
     parameter would do; the display model re-parsed on every selection
     change; an `EditorState` kept forever per document id.

## 2. To decide before code exists

### 2.1 Markdown parser dependency

The display transform and the outline are implemented without a parser, and the
front matter codec deliberately needs none (`SPEC.md` §6.3). Full GFM rendering
(`SPEC.md` §18, phase 2) does need one, and so does the independent
standard-conformance cross-check in §1.1. The candidate and its boundary are
recorded in `DEPENDENCIES.md`; the decision itself is open.

---

## 3. Larger, not yet touched

Everything here waits on a decision from §2, on a user interface, or on both.

- **The AI assistant and snapshots panes** — both are activity bar entries
  that say "not built yet". The AI panel is a docking point for the provider
  interface (`SPEC.md` §15); snapshots need their storage and diff decisions
  first (`SPEC.md` §11).
- **Reordering without a pointer** — the drag has no keyboard equivalent. A
  command that moves the selected entry up or down within its group would also
  give the operation a menu item and a shortcut (`SPEC.md` §8.5).
- **Restoring from the trash inside the application** — deleting moves an entry
  to the desktop trash (`SPEC.md` §6.7), which is where restoring happens
  today: in the file manager, by putting it back. An in-application list of
  what was deleted would need its own storage decision, and the desktop trash
  plus Git already cover the case.
- **The settings panel and localization** (`SPEC.md` §13, §14). The record
  exists and persists the workbench layout; what is missing is the category
  panel that lets the author change the rest of it, and the English/German
  catalogues.
- **Source control beyond this stage** — the panel, the tri-state select-all,
  committing, pushing, fetch and pull, merge with conflict resolution,
  branches, the upstream, amend and `.gitignore` are built and checked against
  a real repository. What stays out: rebasing, stashing, and anything that
  rewrites more than the last commit. Conflict resolution decides **per
  region**; deciding *within* a region — keeping half of each version — would
  need a merge editor, and is a separate question.
- **`PLATFORMS.md` and the native build matrix** — written with the first
  packaging round (`CONVENTIONS.md` C-P5, C-P6). What that round has to
  establish, so that it does not have to be rediscovered:
  - **Host-native, one clean checkout per host.** No cross-compilation is
    claimed. Install with the lockfile under the pinned Node 24 *before* the
    release gate: native maker helpers compiled under a different runtime
    produce an ABI mismatch that only shows up at packaging time, long after
    the source gate was green.
  - **One fixed sequence per host**: report the runtime versions, install,
    `check`, `desktop:smoke`, `desktop:make`, verify the artifact — and write a
    hash and size manifest per platform and architecture as the evidence.
  - **macOS**: `.app` plus DMG and ZIP. Development builds are ad-hoc signed;
    a release needs Developer ID signing and notarization. DMG creation may
    need the Xcode command line tools.
  - **Windows**: an application directory plus a Squirrel installer, built from
    native PowerShell or the command prompt, never from WSL; a release needs
    code signing. Node 24 belongs in an extracted ZIP invoked by full path —
    the MSI installers of different major versions replace one another and are
    useless for a side-by-side build runtime.
  - **Debian/Ubuntu**: a DEB, deliberately not a portable archive. Chromium's
    sandbox helper must be `root:root` with mode `4755`, which only a package
    manager can establish on systems that restrict unprivileged user
    namespaces. The sandbox is never disabled and the user is never asked to
    repair application files by hand. The build host needs `sudo`, `dpkg` and
    `fakeroot`.
  - **The manual post-install pass**, on a machine with no Node installed:
    install, launch, open/edit/save/close/reopen, export, exercise source
    control, confirm it works with no network, and uninstall without leaving
    project data behind. An artifact built on one operating system is evidence
    for that operating system only.
- **Import, export, AI provider, snapshots** — each needs its own decision
  round (`SPEC.md` §15, §19).
