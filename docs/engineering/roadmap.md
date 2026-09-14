# Opera Incerta — open work

**Purpose of this file: what is still open — nothing else.** Completed work
moves here out and into [`completed-work.md`](completed-work.md) **completely**, with its reasoning,
its verification result, and its lesson, in the same round (`AGENTS.md`,
"Working documents"). No ticked checkbox stays behind.

This file is not a source of truth. Those are `AGENTS.md` (process), `specification.md`
(product), `testing.md` (evidence), and `conventions.md` (inherited measures).

**State 2026-09-11 (third round of the day):** the library is complete —
create, rename, place, delete — as are the front matter area (§10.4), page categories (§6.6), the conflict rule
of §10.6 with the watcher that triggers it, source control (§12) up to and
including amend and `.gitignore`, the GFM display (§10.7), all four answers
opening a folder can give (§8.6), the line-number gutter (§10.8), the
editor zoom (§10.9) and the visual system (§8.8) with its packaged face, its
two schemes and its eight palettes, its geometry (§8.9) and its regions as
panels on a canvas (§8.2), finding in the open sheet (§10.11), searching the
library (§9.3), where you have been (§9.4), and **export** (§15.2) — the
manuscript as one Markdown file or as a PDF the application sets itself, whole
or from a sheet on, set with one of four supplied stylesheets or one the
author duplicated into the project. `pnpm run check` green on **Node 24**: 9
projects, **1106 tests**, plus the desktop and asset checks.
`pnpm run desktop:smoke` green across forty-five checks,
`pnpm run spike:editor` 7/7.

All sixteen MVP criteria of `specification.md` §17 are built and checked. What remains
open are the parts of §15 that this stage deliberately excludes — import, the
assistant, DOCX and EPUB — and the items below.

The documents are **self-contained** since 2026-09-03: every requirement,
measure and recorded defect stands in this repository, and no other repository
has to be consulted to build, verify or change the product.

---

## 1. Next — small enough to start immediately

1. **One unreproduced smoke failure**, seen once on 2026-09-03: the save check
   of `checkDocumentFlow` reported "the saved file does not contain the edit"
   in a run whose only change was in an unrelated core rule. Four runs
   immediately afterwards — two clean, two falsified — were green. Since the
   sleeps went (completed-work.md, the same day) that check waits for the edit to reach
   the disk rather than for half a second, so the likeliest cause is gone;
   the entry stays until a few days of green runs have passed. A second
   kind, seen once on 2026-09-04: the heading-cursor check found the
   clipboard holding `##### Typed headingr` — one keystroke too many in a
   typed sequence — and the next run was green. Both look like input events
   delivered out of step with the renderer; if a third appears, the typing
   helper should wait for each character to land rather than for a frame.
   A third kind, seen twice on 2026-09-09: the front matter check measured the
   foreign block at 36px where it needed 43px — one line under a scrollbar.
   That one **has been dealt with**: the check waited two frames after a
   `rendered`, and the block measures itself and grows to what it measured,
   which a packaged face makes slower (§8.8). It waits for the settled height
   now, and the entry stays only as the record of what the other two might
   turn out to be.


2. **Five list-shaped setting kinds** (`packages/core/src/settings.ts`):
   `density`, `language`, `colorScheme`, `accentPalette` and `fontFamily` are
   the same shape — a key, a list of options, a default — with five interfaces
   and five branches in the dialog. They want one `choice` kind with a
   renderer hint. **Decided 2026-09-10: with the sixth**, so the unification
   has an occasion and pays for itself the moment it happens.


## 2. Small, and left open on purpose

- **The artifact upload in CI is not wired.** Uploading the desktop check's
  screenshots needs `actions/upload-artifact` pinned to a SHA, and no verified
  SHA was available offline. An unverified pin looks like diligence and is a
  guess, so the step is a comment in `.github/workflows/check.yml` until
  somebody verifies one.
- **Continuous integration runs on pull requests only** (decided
  2026-09-12). A push to `main` has already been through the gate on the
  machine it came from; what the workflow protects is a change arriving from
  somewhere else. If the project ever gains a second committer, this is the
  first line to revisit.
- **The website is not linked** from the documentation. The address was not
  settled when the public documentation was written; adding it is one line per
  place.
- **A preview of what a stylesheet does**, before the PDF is set — and whether
  a project may name an export stylesheet as its own default, rather than only
  the installation remembering one (§15.2).


## 3. Decided, waiting for their round

These need no further decision from him — `specification.md` says what they are:

- **The editor's own context menu** (§10.10).
- **Export**: DOCX and EPUB, in that order, over the assembly §15.2 already
  has. PDF, Markdown and the chosen stylesheet were built 2026-09-11.
  **Import**: a Markdown folder.
- **The AI assistant** (§15): Anthropic's provider first and preselected, the
  key in the system keychain, the wide scope confirmed per request, and what
  goes out shown before it goes. Using it is explicitly not normal operation.
- **Snapshots** (§11): a snapshot is a commit, and the difference view is the
  prose diff source control already owns.
- **Saved views** (§18), stored in the project.
- Highlighting special files, opening with an external application, a terminal
  panel, and reading aloud (§18) — all four wanted.

---

## 4. Larger, still to weigh

Everything here waits on a decision from him, on a user interface, or on both.
The decisions themselves are listed in `specification.md` §19; this is the work that
follows them.

- **The AI assistant and snapshots panes** — both are activity bar entries
  that say "not built yet". The AI panel is a docking point for the provider
  interface (`specification.md` §15); snapshots need their storage and diff decisions
  first (`specification.md` §11).
- **Reordering without a pointer** — the drag has no keyboard equivalent. A
  command that moves the selected entry up or down within its group would also
  give the operation a menu item and a shortcut (`specification.md` §8.5).
- **Restoring from the trash inside the application** — deleting moves an entry
  to the desktop trash (`specification.md` §6.7), which is where restoring happens
  today: in the file manager, by putting it back. An in-application list of
  what was deleted would need its own storage decision, and the desktop trash
  plus Git already cover the case.

- **Source control beyond this stage** — the panel, the tri-state select-all,
  committing, pushing, fetch and pull, merge with conflict resolution,
  branches, the upstream, amend and `.gitignore` are built and checked against
  a real repository. What stays out: rebasing, stashing, and anything that
  rewrites more than the last commit. Conflict resolution decides **per
  region**; deciding *within* a region — keeping half of each version — would
  need a merge editor, and is a separate question.
- **The first packaging round, and the evidence for the platform matrix** —
  the matrix exists ([`docs/en/platforms.md`](../en/platforms.md)) and has no
  native row filled in yet (`conventions.md` C-P5, C-P6). What that round has
  to establish, so that it does not have to be rediscovered:
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
  - **Build from a checkout with its tags.** The build identity
    (`specification.md` §16) is what `git describe` says in the checkout that
    was built. A shallow clone without tags gives the bare commit, which is
    still exact but no longer names the release. Continuous integration
    fetches the whole history since 2026-09-14; a packaging checkout has to do
    the same. On Windows and Linux the menu has no About item; the identity is
    in the launcher and the settings dialog there.
  - **The advisories accepted for the packaging tools** (`dependencies.md`,
    "Advisories accepted for the packaging tools"): confirm that
    `@electron/rebuild` extracts nothing for this application and that the
    packager opens only the checksum-verified Electron archive, and check
    whether a Forge release has left tar 6 and extract-zip behind. Dismissed
    alerts stay dismissed until someone does.
  - **The manual post-install pass**, on a machine with no Node installed:
    install, launch, open/edit/save/close/reopen, export, exercise source
    control, confirm it works with no network, and uninstall without leaving
    project data behind. An artifact built on one operating system is evidence
    for that operating system only.
- **What §19 still leaves open**: trademark clearance, the distribution
  channel and update mechanism, and a formal accessibility target beyond the
  rule of §8.10. The first two become due with the packaging round.
