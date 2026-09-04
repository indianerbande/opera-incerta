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
projects, **941 tests**, plus the desktop and asset checks.
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

1. **A conflict prompt that nobody asked for**, seen 2026-09-04 in the
   screenshot of the settings check: when the check begins, right after the
   page-categories check saved the sheet through the menu, the prompt "This
   sheet changed on disk while you were editing it" is already up, and the
   title carries the dirty marker. Nothing in the smoke dismisses it, and
   every later check clicks through it, so it stayed unseen. Likeliest cause:
   the watcher reports the application's own save, and the re-read races the
   save's own bookkeeping — `before.dirty` still true, the baseline still the
   pre-save one — so the comparison rule of `SPEC.md` §10.6 sees a foreign
   change. To be reproduced in a unit test of the store first, then fixed;
   and the smoke should fail on a prompt it did not expect.
2. **One unreproduced smoke failure**, seen once on 2026-09-03: the save check
   of `checkDocumentFlow` reported "the saved file does not contain the edit"
   in a run whose only change was in an unrelated core rule. Four runs
   immediately afterwards — two clean, two falsified — were green. Since the
   sleeps went (DONE.md, the same day) that check waits for the edit to reach
   the disk rather than for half a second, so the likeliest cause is gone;
   the entry stays until a few days of green runs have passed.

## 2. To decide before code exists

### 2.1 Markdown parser dependency

**Decided 2026-09-04**, on the measurements of `spikes/parser-markdown`
(`TESTING.md` §2.11): the gate is read as two. commonmark.js and `yaml` are
accepted as the test-time oracle, development dependencies of `packages/core`
only, with the cross-check a fixed test of the gate (`TESTING.md` §2.2). The
runtime parser for the GFM display is decided in that round (`SPEC.md` §18);
markdown-it leads — 652 of 652, positions, 15 ms, 7 packages — with two
deviations to weigh then: task list items are not built in, and its
`argparse` dependency is PSF-2.0. Not recommended: marked (587 of 652),
micromark (43 packages, 164 ms). Until that round, nothing here is open.

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
- **Localization** (`SPEC.md` §14) — the English/German catalogues and the
  language setting, which is the first entry of the settings dialog's
  *Appearance* category (§13, built 2026-09-04 for the categories that have
  settings).
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
    The Electron runtime arrives through the root `postinstall`, which runs
    the package's `install-electron` command (`README.md`); an install with
    `--ignore-scripts` leaves it out.
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
