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
projects, **851 tests**, plus the desktop and asset checks.
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
   immediately afterwards — two clean, two falsified — were green. Since the
   sleeps went (DONE.md, the same day) that check waits for the edit to reach
   the disk rather than for half a second, so the likeliest cause is gone;
   the entry stays until a few days of green runs have passed.

7. **The CodeMirror adapter keeps an `EditorState` per document id for as
   long as the adapter lives** (`codemirror-editor-adapter.ts`, `#states`),
   deleted sheets included. Forgetting one needs a way to say so through the
   editor boundary (`EditorAdapter` in the core), which changes the contract
   suite; the rest of the review's adapter findings are done. Small, and a
   memory question only for a very long session.

8. **The project adapter's port and its error handling**
    (`packages/project-node`, `apps/desktop/src/project-session.ts`). The
    `ProjectFilesystem` port exists "so tests run against an in-memory
    double", and no double exists — session and shell reach past it to
    `node:fs`. Either the port gains `rename`, `mkdir`, `stat` and one
    in-memory implementation, or it goes and `node-filesystem.ts` exports
    functions. In the same place: `library.ts` reads every non-Markdown file
    to decide whether it is a directory, though `readdir` already said;
    `readStructure` and `readCategories` turn every error into an empty
    record and the next edit writes `{}` over the author's arrangement, so
    only `ENOENT` may degrade and `writeJson` needs the atomic write
    `writeSheet` has; `placeEntry` reopens the project twice per drag and
    re-mints every handle, while the comment on `reopen` says handles are
    kept; and `inspectFolder` reads `project.json` fully to test existence.
9. **Core rules the review found wrong or loose**, one tidy-up round:
    - `hasConflictMarkers` is true for a bare `<<<<<<< HEAD` line while
      `parseConflicts` reports no conflict, so the store locks a sheet the
      resolver has nothing to resolve in (`conflict.ts`);
    - `parseGitStatus` consumes the rename's second field only for an index
      rename, so a worktree rename (` R`, git ≥ 2.18) yields an invented
      entry (`git-status.ts`);
    - emphasis has no flanking rule: `2 * 3 * 4` hides the asterisks and
      italicises ` 3 ` (`inline.ts`);
    - a shorter closing fence ends a longer one, and four-space indented code
      is not marked verbatim (`heading.ts`);
    - `OutlineEntry.line` is zero-based while every other line number is
      one-based, paid for with `+ 1` in the outline component;
    - `previewLines` takes strings while the library carries `PreviewLine`,
      and the sheet list matches levels back by text;
    - `editor-adapter-contract.ts` is a test framework exported from the
      production core; `HeadingMarkerActivation` carries viewport
      coordinates through the core boundary; the layout and preference
      constants describe one frontend's chrome;
    - `textStatistics` counts Markdown syntax as words; `slugify` deletes
      every accented letter but the German umlauts, and a test enshrines
      `caf-nave`; `readCategories` accepts a colour without `#`;
    - `RefreshCoordinator` drops a request coalesced into a run that then
      fails, and its comment describes a case that does not occur;
      `ExclusiveTask.run` uses `null` for "refused", ambiguous for a `T`
      that includes it;
    - `block-height.ts` is a dead duplicate of `front-matter-view.ts`.

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
