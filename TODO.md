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
projects, **896 tests**, plus the desktop and asset checks.
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

1. **The findings of the parser spike** (`spikes/parser-markdown/README.md`,
   2026-09-04), each a defect in the core, each small, each with the
   specification example that shows it:
   - **fences**: a backtick fence whose info string contains a backtick is
     not a fence (CommonMark examples 138, 145 — `` ``` ``` `` is a code
     span); and a closing fence may be followed by spaces only, while the
     core lets `` ``` aaa `` close one (example 147). `heading.ts`;
   - **codec, data loss on read**: the reader strips a ` #comment` from an
     inline keyword list before it splits the items, so
     `keywords: ["a #comment", plain]` — which the writer produces — reads
     back as `["a`. `front-matter.ts`, `stripComment`;
   - **codec, quoting**: `0x1F` is written bare and is the number 31 to any
     YAML reader (octal, binary, `.inf`, `.nan`, `5.` and `.5` likewise);
     `trailing colon:` is written bare and is not YAML at all;
   - **codec, notes**: a block literal cannot carry a text whose first
     non-empty line begins with a space or is indented deeper than a later
     line; the writer has to fall back to a quoted scalar there;
   - **display transform, recorded rather than fixed**: an indented line
     after a blank line inside a list item is that item's paragraph, not
     code (examples 108, 109) — the transform models no containers
     (`SPEC.md` §10.1), and the limit belongs in that section; a
     whitespace-only line at the edge of an indented code block is shown
     verbatim (example 117), which nobody can see.
2. **Independent parser cross-check for the codec** — `TESTING.md` §2.2 requires
   proof that written output is standard-conformant and readable by an
   independent Markdown/YAML parser. The spike of 2026-09-04 is that check,
   run by hand; making it a test needs the dependency decision in §2.1.
   Until then the honest claim stays "round-trips through our own reader".
3. **One unreproduced smoke failure**, seen once on 2026-09-03: the save check
   of `checkDocumentFlow` reported "the saved file does not contain the edit"
   in a run whose only change was in an unrelated core rule. Four runs
   immediately afterwards — two clean, two falsified — were green. Since the
   sleeps went (DONE.md, the same day) that check waits for the edit to reach
   the disk rather than for half a second, so the likeliest cause is gone;
   the entry stays until a few days of green runs have passed.

## 2. To decide before code exists

### 2.1 Markdown parser dependency

Measured on 2026-09-04 against the gate of `TESTING.md` §2.11
(`spikes/parser-markdown/README.md`): no candidate passes every criterion, so
none is accepted. The measurements show the parser has two jobs no single
package fits, and the decision is whether the gate is read as two:

- **For the test-time oracle** (`TESTING.md` §2.2): **commonmark.js** — the
  reference implementation, 652 of 652, source positions, 4 packages under
  BSD-2/MIT — together with **`yaml`** (ISC, no dependencies) for the front
  matter. As devDependencies of `packages/core` they reach no installed
  application. They fail criterion 4 (GFM), which a test oracle does not
  need. *Recommended.*
- **For the GFM display** (`SPEC.md` §18, a later round): **markdown-it** —
  652 of 652, positions, 15 ms, 7 packages — with two deviations to accept
  or refuse: task list items are not built in (a small rule in the
  translation layer, or a third-party plugin), and its `argparse` dependency
  is PSF-2.0, an OSI-approved permissive license outside the gate's list,
  used only by markdown-it's command-line tool. *Recommended when that round
  comes; not needed before.*
- Not recommended: marked (587 of 652 — cannot be an oracle), micromark
  (43 packages, 164 ms).

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
