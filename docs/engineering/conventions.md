# Opera Incerta Conventions

Status: Reference — the design and handling measures this project works by,
inherited from the author's earlier work and binding here in the form recorded
below

Date: 2026-09-01

This file collects the rules that govern **how the product is designed and how
work is handled**, as opposed to what the product does. Each entry states the
rule and says what it means for Opera Incerta. Every entry is written to stand
on its own: the documents these measures were first written down in are not
needed to apply them.

- **Part A** is the engineering inventory — working process, architecture,
  dependencies, testing, documentation, settings, platform and release.
- **Part B** is separate on purpose: the rules that were recorded **after** the
  corresponding defect had occurred. A rule that was paid for with a debugging
  session is worth more than a rule that was merely designed.

References without a repository prefix point to the documents of this
repository; there are no others.

Entries marked **adopted** are binding for this project. Entries marked
**adopted with change** are binding in the modified form given. Entries marked
**not applicable** are recorded so that the decision not to carry them over is
visible rather than accidental.

---

# Part A — engineering measures

## A.1 Working process

**C-W1 — Read before acting.** Before any change: confirm the checkout, read the
agent instructions completely, read the specification completely, read the
testing strategy completely, inspect the current repository state, and
distinguish draft from accepted decisions. **Adopted** (`AGENTS.md`, "Read
first"), extended by `conventions.md` itself.

**C-W2 — Three documents, three roles.** The specification defines product
behavior and architecture, the testing strategy defines the evidence required to
claim it works, and the agent instructions define the working process. A current
user instruction can change scope, but material design changes are recorded in
the owning document. **Adopted**, with `conventions.md` as a fourth,
non-normative reference.

**C-W3 — Analysis is not implementation.** For analysis, review, or diagnosis:
inspect and report, do not implement unless asked, and separate confirmed facts
from proposals and open decisions. **Adopted.**

**C-W4 — The approved-change sequence.** Identify the authoritative
specification section; present scope and representative impact before a broad
systematic rewrite; make the smallest coherent change; add the evidence required
by the testing strategy; run proportionate non-destructive validation; inspect
generated visual output when affected; and report implementation, automated
validation, visual validation, commit, and push as **separate** statuses.
**Adopted**, with "smallest coherent change" sharpened by C-W5.

**C-W5 — No silent widening.** Do not widen a task from documentation to
implementation, or from a technical spike to production architecture.
**Adopted.**

**C-W6 — Report separation.** Implementation status, automated validation,
visual validation, commit, and push are distinct claims and are never merged
into one "done". **Adopted.**

**C-W7 — Definition of done.** A task is complete only when the requested
artifact exists, the relevant checks pass, visual output has been inspected
where applicable, and all remaining open decisions or limitations are reported
clearly. **Adopted** (`AGENTS.md`, `testing.md` §9).

## A.2 Documentation discipline

**C-D1 — Five explicit status levels.** Draft, Accepted, Implemented,
Automatically validated, Visually validated. A draft is never described as
implemented, and a passing unit test is never reported as visual validation.
**Adopted** verbatim.

**C-D2 — Status and date header.** Every normative document carries a `Status:`
and `Date:` line under its title, and the status names the current maturity
rather than a version number alone. **Adopted** in all four documents of this
repository.

**C-D3 — Superseded, not erased.** When a design choice changes, update the
normative document and preserve useful historical reasoning as an explicitly
superseded note. **Adopted.** In practice the reason a rejected alternative was
rejected is part of the specification: it stops the alternative from returning
(`specification.md` §10.2, §10.4).

**C-D4 — Requirement-strength vocabulary.** MUST, MUST NOT, SHOULD, SHOULD NOT,
MAY carry defined strength in the specification. **Adopted** (`specification.md`
preamble).

**C-D5 — Non-normative examples stay marked.** Concrete syntax and interface
examples remain non-normative until the underlying design is reviewed and
accepted. **Adopted** for display-model and front matter examples.

**C-D6 — Open decisions are a section, not a silence.** The specification
carries an explicit list of deliberately open decisions, and accepted items are
moved out of it. **Adopted** (`specification.md` §19).

**C-D7 — Acceptance criteria are enumerated and testable.** The MVP is defined
by a numbered list of demonstrable criteria, each of which the testing document
must be able to point a test at. **Adopted** (`specification.md` §17, `testing.md` §10).

**C-D8 — A documentation index.** The README lists each document with one line
saying what it is authoritative for. **Adopted** — see `README.md`,
"Documentation".

**C-D9 — Planning placeholders are labelled as such.** Category names or feature
lists that are only planning placeholders say so explicitly, so they are not
mistaken for accepted scope. **Adopted** (`specification.md` §13, §18).

## A.3 Product and naming

**C-N1 — Visible product name separate from technical name.** The visible
product name governs application chrome, window titles, native menus,
executables, and installers. The technical name governs file extensions, package
namespaces, contract identifiers, diagnostic families, and storage keys.
Renaming the product MUST NOT force migration of documents, settings records, or
integrations. **Adopted** (`specification.md` §1.1). Both names are now `Opera Incerta` /
`opera-incerta`: the identifiers were aligned once, by explicit decision, while
the project still had no released artifact, no user file, and no stored
preference. The rule itself is unchanged and binding from here on — the next
product rename leaves every identifier alone.

**C-N2 — Application chrome is not content.** The product icon and workbench
imagery are installation chrome and MUST NOT leak into document content or
exported output. **Adopted with change**: icons and themes never alter Markdown
content or exported documents (`specification.md` §13).

## A.4 Originality and prior art

**C-O1 — Original system, not a clone.** The product must be an original system,
not a clone or source-compatible dialect of an existing tool. **Adopted**
(`AGENTS.md`, `specification.md` §4).

**C-O2 — The copy prohibition, itemized.** Do not copy, translate, adapt, or
closely paraphrase third-party source code, grammar or characteristic keyword
sets, documentation, examples or fixtures, themes, icons, other visual assets,
or interface layouts. **Adopted**; "grammar and keyword sets" maps to Markdown
display conventions and shortcut syntax.

**C-O3 — The five-step prior-art procedure.** Use public primary documentation
and observable behavior; record the user problem or general capability rather
than foreign syntax; convert the observation into a tool-independent
requirement; design from the specification; cite the source used. **Adopted**
verbatim (`AGENTS.md`).

**C-O4 — Do not read an implementation in order to recreate it.** If a task
genuinely requires implementation-level compatibility or source review, stop and
ask the user to authorize that expanded scope. **Adopted.**

**C-O5 — Original fixtures only.** All sample content and golden material is
created for this project; common demonstration content from another tool is not
reused. **Adopted and strengthened**: real manuscript content is additionally
forbidden as test data (`testing.md` §1, §3).

**C-O6 — Explicit provenance and respect for related projects.** State plainly
which concepts come from an established field and which are this project's own
synthesis; do not present the survey as criticism of the surveyed projects.
**Adopted** (`specification.md` §4).

## A.5 Dependencies, assets, and licensing

**C-L1 — The seven-point dependency report.** Before adding a dependency,
report: capability provided; why it belongs outside the owned core; license;
runtime and installation impact; offline behavior; the adapter boundary that
permits replacement; and the test that protects that boundary. **Adopted**
verbatim (`AGENTS.md`).

**C-L2 — A dependency record with fixed fields.** Accepted dependencies and open
candidates are recorded separately, with capability, rationale, license, impact,
offline behavior, boundary, and evidence. Passing a spike is not permanent
acceptance. **Adopted**: `dependencies.md` records the accepted toolchain, shell
stack, and still-open candidates.

**C-L3 — Neither reflex.** Do not add a package merely to avoid a small,
well-bounded implementation; do not reimplement a mature third-party algorithm
when a properly licensed, isolated dependency is the safer choice. **Adopted.**

**C-L4 — Assets are dependencies.** Fonts, icons, fixtures, and themes have
documented origin and redistribution terms before inclusion. **Adopted and
strengthened**: packaged binary assets are hash-pinned and verified
byte-identical in the packaged application (`testing.md` §2.7, §7).

**C-L5 — Repository license does not relicense dependencies.** Each package
keeps its own license and notice obligations, and those notices ship with the
application. **Adopted.**

**C-L6 — Third-party notices are verified, not assumed.** A check verifies that
required upstream licenses and notices are present in the built artifact.
**Adopted** as a planned `check:assets` gate (`testing.md`, "Planned tooling").

## A.6 Architecture and design

**C-A1 — Layer separation is an invariant, not a preference.** Semantic core,
adapters, and presentation are separate layers, and the boundaries are listed
explicitly as product invariants that may not be crossed without an approved
specification change. **Adopted** (`AGENTS.md`, "Core product invariants").

**C-A2 — A portable core free of host APIs.** The core carries no DOM, no
filesystem, no process, and no network dependency, and runs unchanged in every
frontend. **Adopted** (`specification.md` §5.2).

**C-A3 — Frontend adapters own host behavior.** Node.js, renderer, filesystem,
and UI behavior live behind adapters; the CLI/main boundary isolates filesystem,
process, and environment access. **Adopted** (`specification.md` §5.2, §5.3).

**C-A4 — Heavy work leaves the UI thread.** Language and compilation work runs
in a worker; the interface stays responsive. **Adopted with change**: library
scans, search, and large-document parsing run off the UI thread (`specification.md`
§5.3).

**C-A5 — Reject stale results, retain the last valid state.** Superseded
asynchronous results are discarded, and the last valid view is retained while
the current input is invalid. **Adopted** (`specification.md` §5.3, `testing.md` §2.6).

**C-A6 — Parser output is translated, never adopted.** The domain model stays
independent of parser-generated AST types; parser output is translated into
explicit, validated domain types. **Adopted** (`specification.md` §5.4, `AGENTS.md`).

**C-A7 — Adapter data does not leak into the public model.** Adapter-specific
identifiers, units, and coordinates are normalized at the boundary. **Adopted
with change**: editor-component identifiers and geometry stay inside the editor
adapter.

**C-A8 — Traceable identity through every stage.** Source ranges and stable
identities are carried through the pipeline, because diagnostics and navigation
depend on them. **Adopted with change**: outline, sheet list, and diagnostics
navigate through carried identities and ranges (`AGENTS.md`, "Source and
architecture guidance").

**C-A9 — Randomness is explicit and seeded, or absent.** **Adopted.**

**C-A10 — Stable diagnostic codes.** User-visible failures carry stable codes,
and negative tests assert the code, not the message text. **Adopted** (`specification.md`
§16, `testing.md` §2.2).

**C-A11 — Prefer pure transformations where tests must be deterministic.**
**Adopted and strengthened**: every rule that can be a pure function is one and
is tested in the core rather than through the interface (`testing.md` §1.6).

**C-A12 — Determinism is a product property.** Identical effective input
produces identical output. **Adopted** (`specification.md` §2.9, `testing.md` §4).

**C-A13 — Offline by construction.** Normal operation requires no network
access, no browser, and no local or remote service. **Adopted** (`specification.md` §2.6,
§17.19).

**C-A14 — Final state is inspectable before serialization.** Do not make the
serialized output the only representation of a computed result; the intermediate
state must be inspectable and testable. **Adopted with change**: the display
model and the serialized Markdown are separately inspectable stages (`specification.md`
§10.1).

**C-A15 — No second implementation.** Do not introduce a duplicate
implementation or frontend-specific semantic behavior without an approved
specification change; a future native or alternative module stays a replaceable
adapter behind a tested interface. **Adopted** (`AGENTS.md`).

**C-A16 — Extension points are declared interfaces.** New capability arrives
behind an interface with a registry, not as a core special case. **Adopted**
(`specification.md` §15).

**C-A17 — Preferences never touch content.** A workbench preference MUST NOT
modify a document, make it dirty, or change deterministic output. **Adopted**
verbatim (`specification.md` §13).

## A.7 Security and process boundaries

**C-S1 — Sandboxed renderer, context isolation, no Node integration.** The
renderer is sandboxed with context isolation, Node.js integration disabled, and
a preload surface limited to one versioned bridge. **Adopted** (`specification.md` §5.3).

**C-S2 — Validate every privileged request at runtime.** Compile-time typing of
the bridge is not validation; the main process validates each request when it
arrives. **Adopted** (`specification.md` §5.3, `testing.md` §2.7).

**C-S3 — Opaque handles instead of paths.** The renderer addresses documents by
opaque handles; the main process resolves them and enforces containment,
path-traversal rejection, and size limits. **Adopted** (`specification.md` §5.3).

**C-S4 — Deny navigation, new windows, permissions, and webviews.** IPC from
untrusted pages is rejected and a local content-security policy applies.
**Adopted** (`specification.md` §5.3).

**C-S5 — A secondary window receives a projection, not authority.** A detached
window gets a versioned, source-neutral projection with no compiler, document,
save, export, or filesystem authority. **Recorded, not yet applicable** — Opera
Incerta has no detached window in the MVP. If one is added (a distraction-free
writing view), this rule governs it.

**C-S6 — Session state stores presentation only.** Persisted session state
carries only safe presentation values, never source, document handles, or
filesystem paths. **Adopted** (`specification.md` §7.2, `testing.md` §2.7).

**C-S7 — Secrets never enter the plain preference record.** **Adopted and made
concrete**: API credentials go to the platform secure store (`specification.md` §5.3,
§15).

## A.8 Settings contract

**C-S8 — Category registry, not toolbar accretion.** Settings use a category
list and one focused content region; new settings extend the registry rather
than adding unrelated controls elsewhere. **Adopted** (`specification.md` §13).

**C-S9 — Five properties per setting.** Every setting has a stable identifier,
one owner, a bounded value type, a default, and an explicit scope. **Adopted**
(`specification.md` §13).

**C-S10 — Orthogonal dimensions stay orthogonal.** Independent preference
dimensions (for example brightness and accent, or interface font and document
font) are separate settings and do not overwrite each other. **Adopted**
(`specification.md` §13).

**C-S11 — Scope stated per setting, and never smuggled.** Settings needing
workspace, project, document, or view scope require their own design and MUST
NOT be added to the installation-local record. **Adopted** (`specification.md` §13).

**C-S12 — Versioned record, validated at the boundary, migrated explicitly.**
Storage is one versioned JSON record under a stable key; unknown fields are
discarded; components never parse storage directly; an incompatible schema needs
an explicit migration or a new key. **Adopted** (`specification.md` §13).

**C-S13 — Fail safe, never block.** Unsupported versions, malformed values, and
unavailable storage fall back safely without blocking the editor. **Adopted**
(`specification.md` §13, §16).

**C-S14 — One service owns validation and persistence; consumers get values.**
The preferences service owns validation, persistence, system-theme observation,
and reactive values; consumers receive only what they need; the core depends on
none of it. **Adopted** (`specification.md` §13).

**C-S15 — Modal focus behavior is specified, not left to the framework.** Escape
and an explicit close dismiss the dialog; focus stays inside while open and
returns to the invoking control afterwards. **Adopted** (`specification.md` §13).

**C-S16 — Interface language never translates user content.** Language selection
changes the interface, accessibility labels, command names, and native menus and
dialogs — never authored content, source, tool output, or exported artifacts.
**Adopted** (`specification.md` §14.2).

## A.9 Project and resource model

**C-J1 — Name the units.** State explicitly what the compilation unit, the
editing unit, and the output unit are. **Adopted with change**: the project is
the library unit, a sheet is the editing unit, a manuscript export is the output
unit (`specification.md` §6.1).

**C-J2 — The simple case needs no manifest.** A single file or a directory with
an unambiguous single entry point works without a manifest; explicit
configuration is required only for the ambiguous case. **Adopted with change**:
a project without `structure.json` or `categories.json` works fully with
documented defaults; the files appear only when the user first needs them
(`specification.md` §6.4, §6.6).

**C-J3 — Merged semantically, not concatenated; order does not carry meaning.**
Files are combined by meaning; their order does not control semantics; a stable
identifier stays valid when a declaration moves to another file; a duplicate is
an error rather than a silent override. **Adopted with change**: sheet identity
is the file, order is explicit data in `structure.json`, and stale or duplicate
order entries degrade by documented rule rather than silently reordering
(`specification.md` §6.4).

**C-J4 — Typed resources with independent contracts.** Each additional project
resource (theme, glossary, publication profile) is a separately typed resource
with its own version-one contract, and one resource may not change another's
semantics. **Adopted**: `project.json`, `structure.json`, and `categories.json`
are separate typed resources split by purpose so that diffs stay topically local
(`specification.md` §7.1).

**C-J5 — Read-only resources stay read-only.** A resource the editor does not
own is loaded and reported but never rewritten by a save. **Adopted with
change**: foreign front matter is preserved verbatim and never rewritten
(`specification.md` §6.3).

**C-J6 — Passive content only, with verified integrity.** Referenced assets are
passive formats with recorded purpose, media type, checksum, license, and
attribution; active and binary formats are excluded; loaders verify containment
and integrity before content enters the transport. **Adopted with change**:
imported and embedded content is validated at the boundary, and no project
resource may execute (`specification.md` §5.3, §16).

**C-J7 — Workbench preferences stay out of the project.** Installation-local
preferences never enter the project directory. **Adopted** (`specification.md` §7).

**C-J8 — Normalized relative references in shared files; native paths stay in
the adapter.** **Adopted**: `structure.json` keys are normalized forward-slash
relative paths (`specification.md` §6.4).

**C-J9 — Per-document editing state.** Each open document keeps its own buffer,
undo history, cursor, and scroll position while the project stays open; a
save-all processes documents in a defined order, and a failure part-way leaves
the remaining documents visibly dirty. **Adopted** (`specification.md` §10, `testing.md`
§2.8).

## A.10 Testing measures

**C-T1 — The specification defines behavior; the testing document defines the
evidence.** **Adopted** (`testing.md` opening).

**C-T2 — Test at the lowest useful layer, then at critical boundaries.**
**Adopted** (`testing.md` §1.2).

**C-T3 — Separate concerns, separate evidence.** Semantic correctness, geometric
correctness, and visual appearance are distinct and are not proven by one
another. **Adopted with change**: data safety, behavioral correctness, and
visual appearance (`testing.md` §1.3).

**C-T4 — Structural assertions over opaque snapshots.** **Adopted**
(`testing.md` §1.4).

**C-T5 — Goldens prove appearance, never invariants.** **Adopted** (`testing.md`
§1.5).

**C-T6 — Original fixtures only.** **Adopted** (`testing.md` §1.7, §3).

**C-T7 — Control the environment.** Test output is independent of system fonts,
locale, timezone, and network access. **Adopted and extended** with filesystem
case sensitivity and directory ordering (`testing.md` §1.8, §4).

**C-T8 — A golden changes only after review.** **Adopted** (`testing.md` §1.9,
§8).

**C-T9 — The six-step golden-update procedure.** State the specification or
defect requiring the change; inspect the structural difference; render and
inspect every affected image; confirm unrelated fixtures did not move; include
before/after evidence when practical; update only after understanding. Bulk
acceptance is prohibited. **Adopted** (`testing.md` §8).

**C-T10 — Negative tests assert codes and locations, not message text.**
**Adopted** (`testing.md` §2.2).

**C-T11 — Every adapter of a kind passes the same contract suite.** The suite
verifies that adapter-specific identifiers and units do not leak and that
unsupported capabilities fail explicitly rather than being ignored. **Adopted
with change**: the editor adapter and any future alternative pass one shared
contract suite (`testing.md` §2.8).

**C-T12 — Repeat in fresh processes and compare normalized stages.** **Adopted**
(`testing.md` §4).

**C-T13 — Metamorphic tests for changes that must not matter.** Whitespace,
comments, line endings, and semantically unordered movement must not change
output. **Adopted with change**: line endings, trailing whitespace, foreign-key
order, and unrelated body edits (`testing.md` §4).

**C-T14 — Thresholds are fixed in advance, never retroactively.** An acceptance
threshold must not be chosen after the fact to make a failing implementation
pass. **Adopted** — stated here as the governing rule for every performance and
stability threshold (`testing.md` §6).

**C-T15 — Property-based and fuzz testing with resource limits.** Generated
tests assert structural invariants; invalid-input fuzzing targets the parser and
recovery paths and enforces time and memory limits. **Adopted** (`testing.md`
§5).

**C-T16 — Benchmarks separate the stages.** Performance is measured per stage,
with a small realistic fixture and a deliberately dense upper-bound fixture, and
performance work never trades away determinism or diagnostics without an
approved specification change. **Adopted** (`testing.md` §6).

**C-T17 — Continuous dependency and license validation.** Lockfile integrity,
license inventory, prohibited-license detection, vulnerability reporting, proof
that tests make no network request, and documented redistribution rights for
bundled assets. **Adopted** (`testing.md` §7).

**C-T18 — Generated output stays out of source directories.** **Adopted**
(`AGENTS.md`).

**C-T19 — A command is listed only after it has succeeded here.** No command is
recorded as approved until it has actually run successfully in this checkout.
**Adopted** — this is why `testing.md` labels its command list as planned.

**C-T20 — A named test or reviewed manual verification per acceptance
criterion.** **Adopted** (`testing.md` §10).

**C-T21 — Manual verification is named where automation cannot reach.** At least
one manual round trip per platform, and a human review of the complete result at
its intended size, are part of the gate rather than an afterthought. **Adopted**
(`testing.md` §2.7, §10).

## A.11 Platform, packaging, and release

**C-P1 — Pin the build runtime and fail early outside it.** The package manager
warns rather than downloading a different runtime, and the packaging path fails
early with a useful message outside the accepted runtime line. **Adopted**
(`specification.md` §5.1).

**C-P2 — Build on the target operating system.** Packaging is host-native; no
cross-compilation is claimed. **Adopted** (`specification.md` §5.1).

**C-P3 — Artifact evidence is per-operating-system.** Creating an artifact on
one operating system is evidence only for that operating system; no host
satisfies another host's launch or filesystem evidence. **Adopted**
(`testing.md` §2.7, §10).

**C-P4 — Name the platform differences the product owns.** Window lifecycle on
close, platform modifier keys, startup handling, and path normalization are
listed explicitly rather than discovered per bug report. **Adopted** (`specification.md`
§8.5).

**C-P5 — A fixed native verification sequence plus recorded evidence.** Each
target host runs the same command sequence after a clean checkout, and the
release step writes a host-local hash and size manifest. **Adopted as a task**:
`PLATFORMS.md` is created with the first packaging round.

**C-P6 — A manual post-install checklist.** Install, launch, open/edit/save/
close/reopen, export, exercise external tooling, confirm offline operation, and
uninstall without leaving project data behind. **Adopted** (`testing.md` §2.7,
§10).

**C-P7 — Development launch is not a release path.** The unpackaged development
launch is deliberately exempt from the packaging runtime guard, and package,
smoke, and make retain it. **Adopted** (`testing.md`, "Planned tooling").

**C-P8 — Development signing is not release signing.** Ad-hoc signed builds are
local development evidence only; release identities and notarization are
verified separately. **Adopted** (`testing.md` §2.7).

**C-P9 — Distribution format choices are justified and revisable.** Choosing a
dependency-free archive over distro-native installers is recorded with its
reason, and a richer format can be accepted later without changing the
application. **Adopted as guidance** for the first release decision (`specification.md`
§19).

**C-P10 — External tooling is a documented runtime requirement.** Where a
feature needs a locally installed external executable, that requirement is
stated in the platform document and the feature degrades cleanly without it.
**Adopted** (`specification.md` §12).

**C-P11 — The installed application needs no development toolchain.** The
shipped application requires no runtime installation of the build toolchain and
no network service. **Adopted** (`specification.md` §2.6, `testing.md` §2.7).

**C-P12 — Packaging excludes development sources and module trees.** **Adopted**
(`testing.md` §2.7).

## A.12 Repository hygiene

**C-G1 — Preserve unrelated user changes.** **Adopted.**

**C-G2 — Narrowly scoped commits.** **Adopted.**

**C-G3 — Do not commit, push, tag, publish, or initialize remote services unless
asked.** **Adopted.**

**C-G4 — Do not bulk-format unrelated files.** **Adopted.**

**C-G5 — Do not delete drafts or prior design material without explicit
approval.** **Adopted.**

**C-G6 — Whitespace and diff checks before hand-off.** **Adopted** once the
repository is initialized.

## A.13 Design-review questions

**C-Q1 — Keep a standing list of review questions for the core design.** The
questions the measure came with were asked of a source format: can it be read
without knowing hidden defaults; are the different concerns visibly different;
are stable identifiers easy to preserve during graphical editing; can a
formatter reproduce the document without changing meaning; can incomplete input
produce useful located diagnostics; are automatic and exact manual control both
expressible; can future edits remain small, explicit, and undoable?
**Adopted with change** — the equivalent standing questions for Opera Incerta
are:

1. Can the file be read and edited by another Markdown tool without knowing
   anything about Opera Incerta?
2. Are content, metadata, project structure, and installation preference
   visibly different things, in the file layout as well as in the interface?
3. Does the stable identifier (the file name) survive every rename the user can
   perform?
4. Can the display model be reversed to the exact original bytes?
5. Does incomplete or foreign input produce a useful, located diagnostic rather
   than a loss?
6. Are automatic behavior (ordering, scanning) and exact manual control
   (explicit order, pinned names) both expressible?
7. Does every editing action remain small, explicit, and undoable?

---

# Part B — lessons paid for by a defect

These are the platform-neutral rules recorded **after** the corresponding defect
had occurred. They were learned on a different technology stack and remain true
on this one, which is why they are kept apart from Part A rather than mixed
into it.

## B.1 Layout and interface

**C-U1 — A view switch must never move a column.** Column width belongs to
explicit layout state, not to a layout container. A container that owns divider
positions will reset them whenever the set of panes changes or a pane changes
type, and no amount of content-side counter-measure fixes it, because the cause
is elsewhere. **Adopted** (`specification.md` §8.2, `testing.md` §2.6).

**C-U2 — State that must survive a view switch does not live in the view.** Tree
expansion, selection, and similar state belong to the shared layout state: a
region that switches between two views destroys component-local state on every
switch. **Adopted** (`specification.md` §9.1).

**C-U3 — Fill a list's measurement cache before first render.** A virtualized or
measuring list that renders rows before their content is available measures
placeholder heights and does not correct them when the content arrives
asynchronously. **Adopted** (`specification.md` §9.2, `testing.md` §2.6).

**C-U4 — Formatting must not carry over across a paragraph break.** Pressing
Return at the end of a heading starts a normal paragraph; the typing attributes
of the previous line are reset explicitly. **Adopted** (`specification.md` §10.2).

**C-U5 — Measure rendered heights; do not compute them from font metrics.** Two
attempts failed in the template — a guessed constant and a metric-derived value
— because the layout engine applies its own line spacing. **Adopted** (`specification.md`
§10.4, §18; `testing.md` §2.8).

**C-U6 — Read-only means a different control, not a disabled one.** Suppressing
pointer events blocks the mouse but not the keyboard, and disabling greys out
the text and prevents copying. Present a different control instead. **Adopted**
(`specification.md` §10.4, `testing.md` §2.6).

**C-U7 — The shared-detail rule: what several places must get right belongs in
one component.** Panel separators sat at different heights for as long as each
panel built its own header. Once the shared header delivered the separator
itself, a panel could no longer misplace it. Generalized: a rule that several
call sites must apply consistently is moved into one unit rather than repeated.
**Adopted** (`specification.md` §8.3, `AGENTS.md`).

**C-U8 — Flows live in plain classes; the shell only renders.** What a click
means — the menu it opens, the question it asks, what the answer does — is
decided in a class that holds no framework, takes the stores and an overlay
host, and runs in a unit test against the fake bridge. The shell renders
whatever overlay is up, one at a time. The workbench shell had reached a
thousand lines with three hundred lines of untested flow logic before this
was done; the flows were untested only because they could not be reached
without rendering. **Adopted** (`specification.md` §8.7, `testing.md` §2.6).

## B.2 Filesystem and data

**C-F1 — Compare canonically resolved paths.** Temporary directories and
symlinked system paths resolve differently depending on how the path was
obtained, and a naive comparison silently fails. Resolve canonically, or thread
relative paths through the recursion instead of recomputing them from absolute
URLs. **Adopted** (`testing.md` §2.3).

**C-F2 — A change notification is not evidence of a change.** The watcher also
reports the application's own write, asynchronously. Read the actual content and
compare it against the loaded baseline before treating it as an external change.
**Adopted** (`specification.md` §10.6, `testing.md` §2.4).

**C-F3 — Separate guards for reading and writing, and coalesce rather than
queue.** One shared busy flag lets a background refresh swallow a user action,
which presents as "the click did nothing". A refresh requested during a running
refresh schedules exactly one more. **Adopted** (`specification.md` §10.6, §12).

**C-F4 — Filter the watcher against its own side effects.** Status commands
write inside the repository metadata directory; without a filter every refresh
re-triggers itself. **Adopted** (`specification.md` §12).

## B.3 User data

**C-N3 — A stored key is user data and is not renamed with the concept.**
Renaming a persisted preference key silently resets that preference for every
user. Where the key no longer matches current terminology, document the
divergence in code instead of "fixing" it. **Adopted** (`specification.md` §13).

**C-N4 — Not every visible string is interface.** Category names, file names,
titles, keywords, notes, and tool output are user data and are never localized;
the code path for them must be structurally incapable of becoming a translation
key. **Adopted** (`specification.md` §8.3, §14.2, `testing.md` §2.10).

**C-N5 — A task list is worth only what gets read.** Open and completed work
live in separate documents, and a finished item moves over completely — with its
reasoning, its verification result, and its lesson — in the same round.
**Adopted** (`AGENTS.md`, "Working documents").

---

## Coverage note

Part A covers the whole ground it was drawn from: working process (read first,
invariants, originality, dependencies, change workflow, architecture guidance,
testing, documentation discipline, Git hygiene, definition of done),
specification conventions (status vocabulary, requirement strength, the naming
split, acceptance criteria, open decisions), the testing strategy (principles,
layer contracts, determinism, fuzzing, performance, licensing, the golden
procedure, done criteria, the MVP gate), the settings contract, the platform
build contract, the project and resource model, the dependency record schema,
and the design-review questions.

Rules bound to the subject matter of the work these came from — diagram layout,
routing, scene graphs, image determinism — were deliberately **not** carried
over as content. Where such a rule expressed a general measure (adapter
contracts, deterministic pipelines, golden review), that general measure appears
above.
