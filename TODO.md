# Opera Incerta — open work

**Purpose of this file: what is still open — nothing else.** Completed work
moves here out and into [`DONE.md`](DONE.md) **completely**, with its reasoning,
its verification result, and its lesson, in the same round (`AGENTS.md`,
"Working documents"). No ticked checkbox stays behind.

This file is not a source of truth. Those are `AGENTS.md` (process), `SPEC.md`
(product), `TESTING.md` (evidence), and `CONVENTIONS.md` (inherited measures).

**State 2026-09-02:** the two-window model is complete — the launcher with its
recent projects, and the workbench with every pane of `SPEC.md` §8.
`pnpm run check` green: 6 projects, **457 tests**, plus the desktop and asset
checks. `pnpm run desktop:smoke` green across thirteen checks,
`pnpm run spike:editor` 7/7.

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
- **The front matter area** (`SPEC.md` §10.4) — the editor correctly never
  shows front matter, and the codec protects it. What is missing is the area
  that *displays* it: the owned block read-only, the foreign block with its
  visibility and writability switches.
- **Reordering without a pointer** — the drag has no keyboard equivalent. A
  command that moves the selected entry up or down within its group would also
  give the operation a menu item and a shortcut (`SPEC.md` §8.5).
- **Re-reading a project discards unsaved work** — a library edit no longer
  does (it carries the editing state across), but the explicit refresh in
  `reloadProject` still re-reads the open sheet from disk. What should happen
  is the comparison rule of `SPEC.md` §10.6, which is where the conflict prompt
  belongs; until then, refreshing with unsaved changes loses them.
- **Page categories in the interface** (`SPEC.md` §6.6, §17.12) — the core
  computes the badge text colour and tolerates unknown ids; defining,
  assigning, and showing categories is not built, and neither is deleting one.
- **Restoring from the trash inside the application** — deleting moves an entry
  to the desktop trash (`SPEC.md` §6.7), which is where restoring happens
  today: in the file manager, by putting it back. An in-application list of
  what was deleted would need its own storage decision, and the desktop trash
  plus Git already cover the case.
- **The settings panel and localization** (`SPEC.md` §13, §14). The record
  exists and persists the workbench layout; what is missing is the category
  panel that lets the author change the rest of it, and the English/German
  catalogues.
- **Source control interface** — the adapter is complete; the panel, the
  tri-state select-all, "show diff", and the destructive "discard changes" with
  its confirmation prompt are user interface (`SPEC.md` §12, §18).
- **Conflict handling in the editor** — the comparison rule is specified
  (`SPEC.md` §10.6) and the coordination is built; the part that reads the file
  and raises the prompt belongs to the editor.
- **`PLATFORMS.md` and the native build matrix** — written with the first
  packaging round (`CONVENTIONS.md` C-P5).
- **Import, export, AI provider, snapshots** — each needs its own decision
  round (`SPEC.md` §15, §19).
