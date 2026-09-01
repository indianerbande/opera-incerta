# Opera Incerta — open work

**Purpose of this file: what is still open — nothing else.** Completed work
moves here out and into [`DONE.md`](DONE.md) **completely**, with its reasoning,
its verification result, and its lesson, in the same round (`AGENTS.md`,
"Working documents"). No ticked checkbox stays behind.

This file is not a source of truth. Those are `AGENTS.md` (process), `SPEC.md`
(product), `TESTING.md` (evidence), and `CONVENTIONS.md` (inherited measures).

**State 2026-09-01:** everything specified that needs no open decision is
built: the portable rule set, the project and Git adapters, the library scan,
the owned renderer protocol, and the production boundary check. `pnpm run
check` green: 6 projects, **293 tests**. `pnpm run desktop:smoke` green.

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
   them does not, because the mechanism is an open dependency question (§2.1).

## 2. To decide before code exists

### 2.1 Markdown parser dependency

The display transform and the outline are implemented without a parser, and the
front matter codec deliberately needs none (`SPEC.md` §6.3). Full GFM rendering
(`SPEC.md` §18, phase 2) does need one, and so does the independent
standard-conformance cross-check in §1.1. The candidate and its boundary are
recorded in `DEPENDENCIES.md`; the decision itself is open.

### 2.2 Editing component

`SPEC.md` §5.4 names CodeMirror 6 as the candidate and `TESTING.md` §2.8 defines
the spike gate. The spike is the next architectural step after the codec,
because the display model cannot be finished without knowing what the component
can do. A failing criterion means the component is not accepted, not that the
criterion is relaxed.

## 3. Larger, not yet touched

Everything here waits on a decision from §2, on a user interface, or on both.

- **Workbench views** — explorer, sheet list with its three density steps,
  editor, inspector, outline, panel headers as one shared component
  (`SPEC.md` §8.3, §9, §10, §11). The rules they display are all implemented
  and tested; what is missing is the editing surface, which waits on §2.1.
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
