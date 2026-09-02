# Opera Incerta — open work

**Purpose of this file: what is still open — nothing else.** Completed work
moves here out and into [`DONE.md`](DONE.md) **completely**, with its reasoning,
its verification result, and its lesson, in the same round (`AGENTS.md`,
"Working documents"). No ticked checkbox stays behind.

This file is not a source of truth. Those are `AGENTS.md` (process), `SPEC.md`
(product), `TESTING.md` (evidence), and `CONVENTIONS.md` (inherited measures).

**State 2026-09-02:** the library is complete — create, rename, place, delete —
as are the front matter area (§10.4), page categories (§6.6), the conflict rule
at every re-read (§10.6) and the committed slice of source control (§12).
`pnpm run check` green: 6 projects, **592 tests**, plus the desktop and asset
checks. `pnpm run desktop:smoke` green across twenty-one checks,
`pnpm run spike:editor` 7/7.

Of the sixteen MVP criteria in `SPEC.md` §17, what is left is **§17.13 and
§17.14** — an external change noticed *without being asked*, which is the
watcher in §2.2 below — and the parts of §12 and §15 that this stage
deliberately excludes. Everything else is built and checked.

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
3. **Filesystem watching** — the coordination rules exist and are tested
   (`RefreshCoordinator`, `ExclusiveTask` in the core); the watcher that drives
   them does not, because the mechanism is an open dependency question (§2.2).

## 2. To decide before code exists

### 2.1 Markdown parser dependency

The display transform and the outline are implemented without a parser, and the
front matter codec deliberately needs none (`SPEC.md` §6.3). Full GFM rendering
(`SPEC.md` §18, phase 2) does need one, and so does the independent
standard-conformance cross-check in §1.1. The candidate and its boundary are
recorded in `DEPENDENCIES.md`; the decision itself is open.

### 2.2 Filesystem watching mechanism

Node's own `fs.watch` with a debouncing layer may be enough, or `chokidar` may
be worth its weight — the difference shows up in recursive watching and in
platform behavior, not in the rules, which are already built and tested. Either
choice sits behind the `LibraryWatcher` port in `packages/project-node`, so it
is replaceable; the report in `AGENTS.md` decides it.

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
- **Source control beyond the committed slice** — the panel, the tri-state
  select-all, committing and pushing are built and checked against a real
  repository. What `SPEC.md` §12 lists as *not* goals of this stage is still
  open and each needs its own round: "show diff", the destructive "discard
  changes" with its prompt, pull and fetch, upstream creation, and branches.
  The live watcher of §12 waits on the dependency decision in §2.2.
- **A watcher to trigger the conflict rule** — the rule itself is built and
  runs on every re-read (`SPEC.md` §10.6): compare against the loaded baseline,
  reload silently when nothing was typed, ask when something was. What is
  missing is the mechanism that notices a change without being asked, and that
  waits on the dependency decision in §2.2.
- **`PLATFORMS.md` and the native build matrix** — written with the first
  packaging round (`CONVENTIONS.md` C-P5).
- **Import, export, AI provider, snapshots** — each needs its own decision
  round (`SPEC.md` §15, §19).
