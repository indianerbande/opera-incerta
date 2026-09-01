# Opera Incerta — completed work

Newest entry first. Each entry records what was built, why it was built that
way, how it was verified, and what was learned (`AGENTS.md`, "Working
documents").

---

## 2026-09-01 — the editor adapter, and an editor that renders

**What exists.** An `EditorAdapter` boundary in the portable core, a CodeMirror
implementation of it in `apps/workbench`, an Angular component hosting it, and
the editor visible in the workbench's editor region.

**The boundary carries no DOM type.** The component is chosen when the adapter
is constructed; from then on the application speaks about text, lines, and
heading levels. That is what let one contract suite — written without a test
framework — run in both worlds: under Vitest against an in-memory double, and
inside the real renderer against CodeMirror as criterion 7 of the spike. Both
pass all eleven cases (`CONVENTIONS.md` C-T11). The suite is itself falsified
by a test: a deliberately broken adapter must fail it, and does.

**New in the core.** `inline.ts` — pure inline markup detection for the
asterisk forms, strikethrough, and code spans, with escapes honored, code spans
shadowing emphasis, and underscores deliberately left alone because that
decision is still open (`SPEC.md` §10.3). `display-model.ts` — what the editor
shows: which lines are headings and which character ranges are hidden, in
document offsets. `DisplayLine` gained `verbatim`, so a fenced code block is
recognized as one.

**Verification.** `pnpm run check` green: **332 tests** across 6 projects (core
218). `pnpm run spike:editor` green at 7/7. `pnpm run desktop:smoke` green and
now measuring the editor itself: 19 laid-out lines, a heading at 51.2 px over
body text at 25.6 px, exactly 3 gutter markers, no visible `#` prefix, and the
fenced line shown verbatim. Visually inspected in `build/desktop/smoke.png`.

**Two defects, both found by evidence rather than by reading.**

1. **The smoke found a specification violation on its first run.** The heading
   line still showed its `# ` prefix. The display model computed heading
   *classes* and inline *delimiters*, and nobody had told it to hide the
   heading syntax itself — which `SPEC.md` §10.2 requires, and requires
   unconditionally: heading level is a static paragraph attribute, so unlike an
   inline delimiter there is no syntax for the author to edit in place. Hidden
   ranges now carry a `kind`, and the two rules are visibly different.
2. **The visual check found a `#` inside a fenced code block labelled H1 in the
   gutter.** The gutter asked line by line, and whether a `#` is a heading
   cannot be answered by one line — it needs the whole document. Gutter and
   decorations now read one shared display model held in editor state. The
   smoke asserts the marker count so the defect cannot return quietly.

**Lesson.** Both defects were in the wiring between two correct pieces. The
core knew about fences and the adapter knew about gutters; what was missing was
that the gutter asked the wrong question. Component tests would not have caught
either one — the first needed a rendered heading, the second needed a document
with a fence in it. This is what the smoke and the visual inspection are for,
and both earned their place today.

---

## 2026-09-01 — CodeMirror 6 accepted after the editor spike

**Question.** Can CodeMirror 6 carry the display model of `SPEC.md` §10 —
paragraph-level headings at different sizes, a gutter aligned to measured line
heights, and inline markers hidden except on the cursor's line? It was the
largest open technical decision, and every workbench view waited behind it.

**Method.** `spikes/editor-codemirror`, run in a real Chromium renderer through
Electron rather than a DOM stub. A stub reports zero for every height, which
would have turned three of the six criteria into tests that pass while proving
nothing. The six thresholds were written into `TESTING.md` §2.8 **before** the
spike ran (`CONVENTIONS.md` C-T14) and were not touched afterwards.

**Result: 6/6.**

| # | Criterion | Measurement |
| --- | --- | --- |
| 1 | Variable heading sizes | H1 45 px, H2 36 px, body 22.5 px; line blocks plus the 8 px content padding equal the content height exactly |
| 2 | Gutter alignment | Marker top matches its line to 0 px; a heading wrapped over 8 visual rows carries exactly one marker, at the first row |
| 3 | Inline markers | Unfocused line renders without `**`, focused line with them, switching in both directions; document text untouched |
| 4 | Undo per document | One undo reverted only the document it belonged to |
| 5 | Paste | A real `ClipboardEvent` with CRLF, a tab, and Markdown arrived intact and round-tripped |
| 6 | Typing latency | 112,020 characters, 200 keystrokes: median 5.8 ms, p95 6.6 ms against 16 ms |

**Decision.** CodeMirror 6 is accepted as the editing surface (`SPEC.md` §5.4)
behind an Opera-Incerta-owned `EditorAdapter` interface, with the full
dependency report in `DEPENDENCIES.md`. Monaco, which the technical template
uses, was ruled out on the criterion that mattered most: it assumes a uniform
line height, and this product shows H1 at twice the body size in the same
document.

**Deliberately not done.** The component was not wired into `apps/workbench`.
A spike answers a question; turning it into production architecture in the same
step is the widening `AGENTS.md` forbids. The integration is `TODO.md` §1.4,
and the spike stays as evidence until that round carries its own tests.

**Lessons.**

1. **Three of the six criteria first passed or failed for the wrong reason.**
   Heights read before the first real frame are CodeMirror's *estimates*, all
   identical — the very "computed, not measured" mistake the gate exists to
   catch (`CONVENTIONS.md` C-U5), and it appeared inside the test for that
   rule. An unexplained 4 px marker offset was the content padding. And
   criterion 2 passed while proving nothing, because its wrapped line carried
   no marker at all; rewritten to wrap a heading, it then failed on a third
   measurement error — `getClientRects()` reports one rectangle for a block
   element however often its text wraps, so visual rows must be counted over a
   range of the text.
2. **The fix was always the measurement, never the threshold.** Each correction
   made the test stricter: the height difference must now be *explained* by the
   measured padding rather than tolerated, and the wrapped line must carry
   exactly one marker rather than none.
3. **The spike proved the portability invariant as a side effect.** Its browser
   bundle imports `@opera-incerta/core` for the heading transform, so the
   portable core ran unchanged inside a Chromium bundle — `SPEC.md` §5.2
   exercised rather than asserted.

---

## 2026-09-01 — licensed under Apache-2.0

**Decision.** Opera Incerta is licensed under the Apache License 2.0, the same
license as the technical template.

**What changed.** `LICENSE` at the repository root, and a `license` field in
all seven manifests. `SPEC.md` §1.1 and §5.1 record it, `SPEC.md` §19 no longer
lists it as open, and `README.md` and `DEPENDENCIES.md` point at the file.

**What it does not do.** The repository license does not relicense any
dependency: every package keeps its own license and notice obligations, and
those notices ship with the application (`CONVENTIONS.md` C-L5). That was
already the rule; it is now stated where a reader of `DEPENDENCIES.md` meets it
first.

**Verification.** `pnpm run check` green, unchanged at **293 tests**, plus the
desktop production check — the manifests are read by that check, so a malformed
edit would have failed it.

---

## 2026-09-01 — everything specified that needed no decision

**Scope.** Build out every open item whose behavior was already specified and
whose implementation required no pending decision. What remained afterwards is
listed in `TODO.md`, and each remaining item names the decision or the user
interface it waits on.

### Portable rules (`packages/core`)

| Module | Rule |
| --- | --- |
| `heading.ts` | Markdown ↔ display transform for H1–H6, outline extraction, the deeper-levels filter |
| `statistics.ts` | Characters, words, reading time — body only |
| `structure.ts` | `structure.json` semantics: order, stale entries, unlisted items, display names, moves |
| `recent-projects.ts` | Deduplication, ordering, the cap of ten |
| `preview.ts` | The three density steps and the geometric preview font formula |
| `block-height.ts` | Proportional capping of a measured height; dragging enlarges only |
| `git-status.ts` | `--porcelain=v1 -z` parsing, grouping, select-all state, the `.git` event filter |
| `refresh.ts` | Coalescing refreshes and a separate write guard |

### Adapters and shell

- `packages/project-node` — the Node implementation: folder inspection,
  project records, `structure.json`, atomic sheet writes, canonical path
  comparison, containment, and the recursive library scan that applies order,
  display names, and front matter titles.
- `packages/git-node` — the process adapter over the system `git`: root
  resolution, status, batch staging and unstaging, commit, push.
- `apps/desktop` — the renderer is served from the owned `opera-incerta://app/`
  scheme with path containment, replacing `loadFile`.
- `scripts/check-desktop-production.mjs` — a gate over the **built** artifacts:
  pinned dependencies, sandboxed window options, absence of `loadFile`, a
  preload limited to one global and to declared channels, and the renderer's
  content-security policy.
- `examples/` — four original fixture projects from the `TESTING.md` §3
  catalog, read by an integration test rather than left as sample content.

**Verification.** `pnpm run check` green: **293 tests** across 6 projects (core
179, project-node 58, desktop 22, git-node 19, desktop-contract 9, workbench 6),
plus the desktop production check. `pnpm run desktop:smoke` green: the shell
launches over the new protocol, the renderer renders, the bridge answers.

The production check was **falsified before being trusted**: with `sandbox:
true` flipped in the built bundle it failed with two findings, with `loadFile`
reintroduced it failed with one, and it passed again once restored. A check
that can only pass proves nothing.

**Specification updated in the same change** (`AGENTS.md`, change workflow):
the owned renderer scheme and its refusal-not-correction rule (§5.3), the
pinned collation for unordered items (§6.4), heading prefix preservation
(§10.2), atomic sheet writes (§10.6), the reading-speed constant (§11), and
unstaging before the first commit (§12).

**Lessons.**

1. **The URL class disarms a traversal, and that is not the same as refusing
   it.** `opera-incerta://app/../secret.txt` arrives at the handler as
   `/secret.txt`: contained, but a different file than the one requested. The
   attempt is now rejected against the raw request, before parsing, with
   containment kept as a second line of defense.
2. **A repository without a first commit has no `HEAD`.** `git restore
   --staged` fails there with exit 128 — and that is exactly the state of a
   freshly created project the moment its author stages the first chapter. The
   integration test against a real repository found it; the unit tests against
   a recorded runner never would have.
3. **Three tests were wrong before the code was.** An off-by-one line number, a
   miscounted line total, and a preview count that assumed more content than
   the fixture had. Writing the assertion from the specification rather than
   from the implementation is what surfaces them.
4. **A fixture found a specified behavior the test had not expected.** The
   Obsidian note keeps its owned block *after* the foreign keys, so the first
   save moves it to the front — specified in §6.3, and idempotent from then on.
   The test now asserts the reordering instead of demanding byte-identity, and
   the specified behavior gained its first real evidence.

---

## 2026-09-01 — front matter codec implemented

**What exists.** `packages/core/src/front-matter.ts`: `parseSheet` and
`serializeSheet`, the reader and writer for the head of every `.md` file
(`SPEC.md` §6.2, §6.3). 43 new tests against 534 lines of implementation.

**Shape of the solution.** Owned fields are parsed into a typed
`SheetMetadata`; everything foreign is held as unmodified raw lines; unknown
children of `opera-incerta:` are held the same way, so an older build cannot
delete a field a newer one wrote. A malformed namespace — duplicated, or
carrying a scalar or a sequence — yields a stable diagnostic and marks the
sheet **not writable**, and in that state every line stays classified as
foreign, so even a mistaken write could not claim anything as ours.

**No YAML parser, and the namespace is why.** Foreign YAML must be *preserved*,
not *understood* — raw lines suffice. Owned YAML follows a schema this project
defines, so it needs only a reader for that schema. The namespace decision made
the codec smaller, not larger: without it, the reader would have had to judge
per key whether a top-level `status` was ours, which is exactly the judgement
no code can make correctly.

**Verification.** `pnpm run check` green: **98 tests** across 6 projects, 71 of
them in the core. The suite covers every item of `TESTING.md` §2.2 —
round-trip losslessness across nested mappings, sequences, folded blocks,
comments and unkeyed lines; idempotence; namespace ownership including a
top-level foreign `title`, `status`, `topic`, `keywords`, `category`, and
`notes`; indentation ownership including a nested `opera-incerta:`; all three
malformed cases; the absent-block case; LF and CRLF; unknown owned fields; and
fifteen scalar-quoting cases from `2024` through emoji to the empty string.

**Not yet proven:** that the output is standard-conformant to an *independent*
parser. The tests prove that our reader accepts what our writer produces. The
cross-check needs the Markdown/YAML dependency that is not accepted yet, and it
is recorded as `TODO.md` §1.1 rather than quietly assumed.

**Lessons.**

1. **Quoting exists for other readers, not for ours.** Our reader treats every
   scalar as a string and would never misread a title of `2024`. Another tool,
   and a human, would read a number. The writer therefore quotes anything that
   could be taken for a number, a boolean, null, or a YAML indicator — a rule
   whose entire purpose lies outside this codebase.
2. **Two tests failed and both times the test was wrong** — an off-by-one line
   number and a miscounted line total. The second also exposed the weaker test:
   `toHaveLength(6)` says nothing about *which* lines survived. Asserting the
   actual lines is what the rule is about.
3. **Blank lines needed an owner.** A blank line between the owned block and a
   foreign key would be swallowed if it counted as ours, because the owned
   block is regenerated on write. It is assigned to the foreign side, so the
   round trip stays byte-exact.
4. **A `replace` without an assertion fails silently.** An earlier edit in this
   session left a TODO item pointing at a decision that no longer existed,
   because the pattern had not matched and nothing said so. Every scripted edit
   now asserts that its pattern was found exactly once.

---

## 2026-09-01 — front matter namespace accepted

**Decision.** Every field the application owns is nested under one top-level
key, `opera-incerta:`. Every other top-level key is foreign, regardless of its
name (`SPEC.md` §6.2, now Accepted).

**Why it matters more than it looks.** The round-trip rule of §6.3 protects
against *losing* foreign data. It cannot protect against *reinterpreting* it: a
Jekyll file's `status: published` would have been adopted as the sheet's
workflow state and then written back with a different meaning. Nothing is lost
in that scenario, so no round-trip test would have failed — which is precisely
why it needed a structural answer rather than a careful one.

**Consequences recorded.** A foreign top-level `title` is not the sheet title,
so an imported file shows its file name until its metadata is adopted
deliberately by the import module. A duplicated or non-mapping
`opera-incerta:` key marks the file read-only with a stable diagnostic instead
of the application guessing which occurrence it owns. A file without the block
is normal, and the block is created on the first save that needs it.

**Cost.** None. There are no existing files, no migration path to write, and no
released format. Deciding it after the first written manuscript would have cost
a migration for every file — the same window that closed for the identifier
alignment below.

**Verification.** Documentation only: `SPEC.md` §6.2/§6.3, the evidence list in
`TESTING.md` §2.2, and `TODO.md`. No code was written — the codec itself is the
next step and is now unblocked.

---

## 2026-09-01 — technical identifiers aligned to `opera-incerta`

**Decision.** By explicit instruction, the technical name was changed from
`writers-ide` to `opera-incerta`, so both names now share one word.

**What changed.** 22 files: package namespace `@writers-ide/*` →
`@opera-incerta/*`, project marker `.writers-ide/` → `.opera-incerta/`, bridge
global `writersIde` → `operaIncerta`, channel prefix `writers-ide:` →
`opera-incerta:`, document-handle kind, workspace and Angular project names, and
the smoke environment variable. Stale `dist/` and `build/` output was removed
before relinking, because the package names those artifacts were built under no
longer exist.

**Why it was allowed now, and why it is the last time.** The naming rule
(`CONVENTIONS.md` C-N1) exists to stop a product rename from reaching
identifiers that live in user files. Nothing had shipped: no release artifact,
no user project, no stored preference, no committed history. That is the only
condition under which aligning the two names is free, and it no longer holds
after the first written project. `SPEC.md` §1.1 records the decision and its
superseded predecessor.

**The checkout directory too.** `writers-ide/` was renamed to
`opera-incerta/`. It is the one name that is *not* part of the contract
(`SPEC.md` §5.2) — nothing in the repository refers to it — but leaving it
would have made every path in a report contradict the project it names. pnpm's
workspace symlinks are relative and survived the move untouched; the session's
working directory had to be moved explicitly, which is the only manual step.

**Verification.** `pnpm install` relinked all four workspace packages under the
new namespace; `pnpm run check` green (**55 tests**, unchanged count);
`pnpm run desktop:smoke` green under `OPERA_INCERTA_SMOKE`. Both were re-run
from the renamed directory: check green, smoke green, evidence written to
`build/desktop/smoke.png` under the new path.

**Lesson.** A repository-wide string replacement rewrote history: the previous
`DONE.md` entry recorded `writers-ide` as a deliberate decision, and the
replacement silently turned it into `opera-incerta`, making the entry claim the
opposite of what happened. Historical reasoning in `DONE.md` is a record, not
live text (`CONVENTIONS.md` C-D3) — a mechanical rename MUST skip it, and this
one had to be repaired by hand.

---

## 2026-09-01 — product named "Opera Incerta"

> **Superseded in part, same day.** The technical name was subsequently aligned
> to `opera-incerta` as well; see the entry above. The names below are the ones
> that were current when this decision was made, and are preserved as written.

**Decision.** The visible product name is **Opera Incerta** (`SPEC.md` §1.1,
accepted). Chrome, window titles, headings, and documentation titles use it.

**What deliberately did not change.** The technical name `writers-ide` stays:
package namespace `@writers-ide/*`, project marker `.writers-ide/`, bridge
global `writersIde`, channel prefix `writers-ide:`, and the smoke environment
variable. That separation is exactly why the rename touched 18 files and no
identifier a user's files could ever contain (`CONVENTIONS.md` C-N1).

**Verification.** `pnpm run check` green (55 tests, unchanged count);
`pnpm run desktop:smoke` green — the smoke check asserts the rendered heading,
so it would have failed had the renderer and the shell disagreed about the
name.

**Still open:** trademark clearance before public distribution, and the
application icon (`SPEC.md` §1.1, §19).

---

## 2026-09-01 — pnpm workspace scaffold

**What exists now.** A pnpm workspace with six projects, a green check gate, and
a desktop shell that launches, renders, and answers over its bridge.

```text
packages/core              portable rules: slug, layout clamp, category color
packages/desktop-contract  versioned bridge: channels, handles, runtime guards
packages/project-node      project/library ports (interfaces only so far)
packages/git-node          source-control ports (interfaces only so far)
apps/workbench             Angular renderer: the region skeleton
apps/desktop               Electron shell: window, preload bridge, smoke check
```

**Why these first.** The scaffold had to prove the boundaries that `SPEC.md`
§5.2 and §5.3 declare, not just describe them. The portable packages compile
with `"types": []`, so a host API cannot slip into them unnoticed. The renderer
consumes `@opera-incerta/core` and `@opera-incerta/desktop-contract`, which proves
the workspace wiring end to end. The shell is sandboxed with context isolation
from the first commit, because retrofitting a security boundary is how it ends
up incomplete.

**Content, not filler.** The three rules in `packages/core` (slug generation
with collision suffix, column-width clamping, computed category text color) and
the contract guards are all fully specified in `SPEC.md`, so they could be
implemented and tested rather than stubbed. Ports for the two Node adapters are
declared as interfaces only: public module interfaces come before their
implementation (`CONVENTIONS.md` C-A16), and inventing a filesystem
implementation ahead of its specification round would have been the widening
`AGENTS.md` forbids.

**Verification.**

- `pnpm run check` — build, test type-check, and tests across 6 projects:
  **55 tests passed** (core 28, desktop-contract 9, project-node 3, git-node 2,
  workbench 6, desktop 7).
- `pnpm run desktop:smoke` — the Electron shell launches, the renderer renders
  (`wi-root h1` reads "Opera Incerta"), the preload bridge answers
  `contractVersion()` with 1, and a screenshot is written to
  `build/desktop/smoke.png`.
- Visual inspection of that screenshot: the six regions of `SPEC.md` §8.2 appear
  in order with the specified widths — activity bar, navigator, sheet list, a
  dominant editor, secondary sidebar, activity bar.
- Not run: `desktop:package` and `desktop:make`. They are therefore not listed
  as approved commands anywhere (`CONVENTIONS.md` C-T19).

**Lessons — each one cost a failed run.**

1. **`TextEncoder` is a host global, not a language feature.** The contract
   package computes a UTF-8 byte length for its size limit and used
   `new TextEncoder()`. With `"types": []` and `lib: ES2023` the build failed —
   exactly as intended. The fix is a pure byte counter, not a wider `lib`. The
   invariant caught its first violation on the day it was written.
2. **`import.meta.url` is empty in a CommonJS bundle.** Electron loads the main
   process as CJS, and esbuild warned that `import.meta` would be empty; the
   preload and renderer paths would have been silently wrong. `__dirname` is
   correct in that output format.
3. **The Angular application builder writes to a `browser/` subdirectory.** The
   first smoke run failed with `ERR_FILE_NOT_FOUND` on
   `build/workbench/index.html`. The path is
   `build/workbench/browser/index.html`.
4. **A test and its implementation disagreed about `Infinity`.** The clamp
   returned the minimum for any non-finite value; the test expected the maximum
   for `+Infinity`. The test was right: an infinity is an out-of-range value and
   clamps to the bound it exceeds, while only `NaN` is orderless and falls back
   to the minimum. The rule is now stated in the function's own documentation.
5. **`@electron/rebuild` resolves `@electron/node-gyp` from Git,** which the
   workspace policy rejects. The published Electron fork
   (`10.2.0-electron.2`) is pinned as an override in `pnpm-workspace.yaml`.
6. **Electron's postinstall did not run under `allowBuilds`.** The 306 MB
   runtime was missing until `install.js` was executed directly in the store
   directory, where it completed instantly from the local Electron cache. A
   clean checkout currently needs that extra step — open item in `TODO.md` §1.7.

**Deliberately not done.** No `git init`, no commit: initializing a repository
was not requested (`CONVENTIONS.md` C-G3). Package names in this entry predate
the identifier alignment recorded above. No package carries a `license` field,
because the project license is still open.
