# Opera Incerta — open work

**Purpose of this file: what is still open — nothing else.** Completed work
moves here out and into [`DONE.md`](DONE.md) **completely**, with its reasoning,
its verification result, and its lesson, in the same round (`AGENTS.md`,
"Working documents"). No ticked checkbox stays behind.

This file is not a source of truth. Those are `AGENTS.md` (process), `SPEC.md`
(product), `TESTING.md` (evidence), and `CONVENTIONS.md` (inherited measures).

**State 2026-09-02:** the portable rule set, the project and Git adapters, the
library scan, the owned renderer protocol, the production boundary check, and
the editor with both heading gestures. `pnpm run check` green: 6 projects,
**354 tests**. `pnpm run desktop:smoke` and `pnpm run spike:editor` green.

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
4. **Cut, at the visible start of a heading** — copying puts the prefix back,
   so the clipboard holds Markdown. Cut takes the same text but removes only
   the selection, leaving an empty `##### ` behind. Extending the deletion the
   way the copy is extended is the obvious answer; it needs its own round and
   its own evidence.

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

- **Workbench views** — explorer, sheet list with its three density steps,
  inspector, outline, panel headers as one shared component (`SPEC.md` §8.3,
  §9, §11). The rules they display are implemented and tested and the editor
  now exists; these are the remaining panes.
- **Connecting the editor to real documents** — it shows a placeholder. Opening
  a sheet through the bridge, saving it, and the dirty state belong to their
  own round together with the library view.
- **Settings record and localization catalogues** (`SPEC.md` §13, §14). The
  contract shape is accepted; the individual values are still draft.
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
- **Repository initialization** — this checkout is still not a Git repository,
  and nothing has been committed.
