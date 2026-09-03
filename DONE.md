# Opera Incerta — completed work

Newest entry first. Each entry records what was built, why it was built that
way, how it was verified, and what was learned (`AGENTS.md`, "Working
documents").

---

## 2026-09-02 — the filesystem watcher, on `fs.watch` and nothing else

**What exists.** The main process watches the group whose sheet list is on
screen and the document in the editor, and tells the interface to look again.
Looking is where the comparison rule of §10.6 decides what the author sees:
nothing, a silent reload, or the prompt. With that, MVP criteria **§17.13 and
§17.14** are met — an external change is noticed without anyone asking.

**Measured before it was written.** Three properties of the platform decided
the adapter's shape, and each one is a rule in it:

- a watch on a **file** goes deaf the moment that file is replaced by a
  rename — which is exactly how this application saves. A file is therefore
  watched through its directory, filtered by name;
- one atomic save produced **seven** events, `rename` for ordinary writes among
  them, including two for directories that had not changed. The event type
  carries no information;
- `.git/index` shows up in a recursive watch, so the filter of §12 is not
  theoretical.

Two more surfaced while testing: a watch delivers a short **history**, so
changes made just before it started still arrive; and a non-recursive watch
reports activity in subdirectories too. Both mean more notifications than
asked for, never fewer.

**Why no library.** What `chokidar` mostly buys — coalescing, settling,
normalising quirks — this application already owns and tests. Taking it would
have meant two answers to the same questions. It stays recorded as the
replacement if the adapter ever needs to grow its own rescanning; it goes
behind the same port, and no rule moves.

**Three defects, and none of them in the watcher.** All three were latent, and
the watcher exposed them by doing what the refresh button had only ever done on
request:

- **the tree collapsed on every re-read.** Harmless when a re-read meant a
  button press; unusable once it follows every save. The expansion is kept now,
  minus whatever no longer exists;
- **the editor blanked for a moment on every re-read**, because adopting a
  project cleared the open sheet and the freshly read one arrived a bridge
  round trip later. A re-read of the *same* project keeps the document until
  its replacement is there;
- **closing a project told nobody**, so the watcher kept reporting a project
  that was no longer open.

Two of the three were found by checks about something else entirely — a drag
that could no longer find its row, a dirty marker that read `null` — which is
the argument for keeping the smoke as one long sequence rather than a set of
isolated cases.

**A note on my own tests.** Two of the watcher's cases passed at first for the
wrong reason and two failed for the wrong reason: the fixture's own writes were
still arriving when the watch started, so the tests measured the setup. They
now let the history drain before acting. A test that measures its own
preparation is worse than no test, because it reports confidence.

**Verification.** `pnpm run check` green: **612 tests**. The smoke's
twenty-third check writes a file behind the application's back and confirms
that it reaches the editor by itself, that it raises the prompt by itself over
unsaved work, and that a new sheet appears in the list — with nobody pressing
refresh. Falsified by stopping the notification: the check then reports that
the change never arrived.

---

## 2026-09-02 — Node 24, and a warning that had been right all along

**What changed.** The project now insists on Node 24 and refuses to run on
anything else. `engines` and `devEngines` both say `^24.15.0`, and
`devEngines.onFail` went from `warn` to `error`.

**Why 24 is not a preference.** Electron 44.0.0 carries Node **24.18.1** inside
it — measured with `ELECTRON_RUN_AS_NODE=1`, alongside Chrome 152 and V8 15.2.
That is the runtime the application runs on. Building and testing the toolchain
on a different major means checking against a runtime that is never shipped.

**How this came to light.** Every command in this checkout printed

    [WARN] This project requires Node.js 24.15.0. Your current Node.js is v26.4.0

and I read past it around forty times, because the machine's `node` on the PATH
is 26 and no version manager here reads `.node-version`. The three declarations
disagreed with each other as well: `.node-version` said 24, `devEngines` pinned
the exact 24.15.0, and `engines` allowed `>=26.0.0` outright — so the runtime I
happened to have was formally permitted.

**The warning was also broken in a way that guaranteed it would be ignored.**
Because `devEngines.version` was an exact version rather than a range, it fired
on Node **24** too: `requires 24.15.0 … your current is v24.20.0`. A warning
that is always there is a warning nobody reads. That is the lesson worth
keeping, and it is not about Node: a check that cannot be satisfied trains
people to skip it, and then it cannot warn about anything.

**Did it matter?** Measured rather than assumed: `pnpm run check` and the smoke
were run on both runtimes. Node 26.4.0 and Node 24.20.0 both give **592 tests
green and twenty-two smoke checks**, and the filesystem-watcher probe answers
identically on both. Nothing built so far is in question — but "nothing was
wrong this time" is not the same as "it was checked", and the difference is
exactly what the guard now enforces.

**Verification.** On Node 24: `pnpm run check` green with 592 tests, the smoke
green across twenty-two checks, and no warning line at all any more.
Falsified the other way round, which is the half that matters: on Node 26 the
same command now exits 1 with `[ERROR] This project requires Node.js ^24.15.0`.

---

## 2026-09-02 — four rounds towards the MVP, and the entries they should have had

Written after the fact, together: four rounds went in without their `DONE.md`
entry, which `AGENTS.md` asks for in the same round. The lapse is recorded here
rather than tidied away, because a rule kept only when convenient is not one.

### The conflict rule of §10.6, at every re-read

Re-reading a project replaced the open sheet with what was on disk, and what
the author had typed was not on disk. The rule §10.6 already specified now
decides: nothing when the file is unchanged, the file taken silently when
nothing was typed, and the prompt when both are true — with the author's
version held meanwhile, so the prompt asks rather than announcing a loss. A
library edit is not such a situation and carries the work across without
asking.

It uncovered two things. The editor was seeded from the *saved* body, so a
restored version lived in the store while the screen showed the file; the
editor document is now set deliberately at the three moments the text on screen
has to change. And taking the file needed a way to replace an open document's
content without pretending it is a different document, so the adapter port
gained `replace`, with a case in the contract suite both adapters run.

What is still missing is only the trigger — a watcher — which waits on the
dependency decision in `TODO.md` §2.2.

### The front matter area of §10.4

Two blocks between the header and the text, three persisted switches, and
read-only as a **different control**: a `<pre>`, readable and selectable, not a
disabled field. The owned block goes through the serializer that saves, so
display and file cannot drift apart.

The height rule is a pure function — the ten-line cap applied proportionally to
the *measured* height — and the measuring is where this round earned its
lessons. It was taken from whichever control was visible, and a text area
reports the height of its box rather than of its text; a dedicated hidden
element is measured now, through a `ResizeObserver`, because fonts arrive late.
Then the horizontal scrollbar that long values bring took its space out of the
last line. Both were found by **looking at the screenshot** — the second one
after a check that measured pixels had already passed. The check now asserts
the property instead: what is visible against what there is to see.

### Page categories, §6.6

Defined in a manager opened from the Inspector, assigned there, shown as a
badge whose text colour is computed from its background. They travel in the
project snapshot rather than through a channel of their own: read with the
project, refreshed with it, one source instead of two that can disagree.

The defect: a category assigned in the Inspector showed no badge until the
sheet was saved, because the badge came from the file. It is the same rule as
for a title being edited, so the two now share one core function — the library
as the interface shows it, carrying what the author has chosen.

A note to self from this round: `git checkout <file>` to undo a falsification
threw away uncommitted work in that file. A copy aside is the only safe undo
mid-round.

### The commit model of §12, against a real repository

The panel was built but never exercised: the smoke project was a copy in a
temporary directory, so it only ever reported "not inside a Git repository",
and every claim about staging and committing rested on unit tests over a
double. The fixture is a repository now, deliberately without a commit — the
state a freshly created project is in, and the one where unstaging cannot
resolve against `HEAD`.

Two defects. A failed Git action reported **nothing**: the store held the
failure and no one rendered it. And what it held was our code rather than Git's
message — `git/command-failed` where Git had said "fatal: No configured push
destination." `GitError` now carries what Git wrote, which is what its own doc
comment already claimed.

**Verification across the four.** `pnpm run check` green: **592 tests**, up
from 569. The smoke runs twenty-one checks. Each round was falsified: removing
the conflict prompt, dropping the scrollbar allowance, making the badge colour
constant, and — for the commit model — the check simply could not have run
before, which is why it was written.

---

## 2026-09-02 — placing: moving and ordering became one operation

**What exists.** A drag now says both things at once — which group an entry
ends up in, and where in it. Dropping between the children of *another* group
moves it there **and** puts it in that place (`SPEC.md` §6.8).

**Two operations became one, and that is the whole point.** `reorderEntry` and
`moveEntry` were separate: a drag into another group could not say where, and
doing both in two calls would let a failure leave an entry moved but unplaced.
They are one thing — reordering is placing an entry in the group it is already
in — so they are now one channel, one session method, one store method, one
drop shape. The contract version went to 2, which is what it is for.

**A claim the unification made true.** §6.8 already said an entry dropped into
another group "lands at the end". It did not: the destination's order was only
written where one already existed, so the arrival sorted alphabetically —
possibly into the middle. The destination's order is now written in full,
because that is what makes "at the end" mean the end.

**Two regressions the checks caught immediately**, both from the reveal path
now carrying a placed entry rather than only a created one:

- a placed sheet was **opened**. Revealing is not opening: the author was
  moving it, not choosing it. Only a created sheet opens itself.
- a placed group **took the selection with it**, so the sheet list switched to
  a group the author had not asked to see. A created group is selected
  outright; a moved one only gets the tree opened down to it.

Both showed up as the same symptom in the smoke — a sheet list that no longer
held what the next check looked for — which is worth noting: the checks that
found them were about something else entirely, three and four steps later.

**Verification.** `pnpm run check` green: **563 tests**. The smoke's
seventeenth check now drags across the columns three times: a sheet into a
group, that group into another, and a fourth group in front of an existing
child — reading the file from its new place, `structure.json` for the re-keyed
entry, the absence of the old one, *and* the recorded position, and the editor
for the same document it held before. Falsified by dropping the position on a
cross-group placement: the group then travels but arrives unplaced, and the
check says so.

---

## 2026-09-02 — moving between groups, and one owner for the whole drag

**What exists.** A sheet is dragged from the sheet list onto a group in the
tree; a group is dragged onto another group (`SPEC.md` §6.8). The middle half
of a group's row means the group itself, the quarter at each edge means between
the rows — so a reorder and a move are the same gesture aimed differently, and
hitting either does not demand precision.

**The drag changed owner, and that was the substance of this round.** Each
column used to own its own drag. That arrangement cannot express a drop in the
*other* column at all: a dragged row's siblings are not its ancestors, so the
pointer events during the drag never reach the column it started in. The shell
now owns the gesture — it is the one element containing both columns — and each
row merely *describes* itself in the DOM: what it is, where it sits, what it is
called. `elementFromPoint` does the rest. The decision logic stayed pure and
unit-tested; only the measuring touches the DOM.

**What travels with a path.** A moved group's own key in `structure.json`, and
every key beneath it, is re-keyed — otherwise the group arrives without its
display name and without the orders of everything inside it. The old
`moveChild` did none of that and would also have recorded an order of exactly
one name in a group that had none, which puts the arrival *first* in its new
group: the opposite of arriving. Both are now fixed and tested.

**The open sheet is followed, not closed** — whether it was the thing dragged
or sat inside a group that moved around it. It is the same document at a new
path, and what was unsaved in it belongs to it wherever it goes. The second
case is the one worth naming: the sheet was never the thing dragged, and its
path changed anyway.

**A name already taken gives the arrival a suffix.** Overwriting is out of the
question and refusing would block something the author plainly wants. It is the
one case where a file name changes after it was set, and it is invisible: the
title is untouched.

**Two defects the checks found, both mine, both geometric.** The first: an
index from the sheet list was compared against an index from the tree, which
are two different lists over the same group — a sheet dropped on the first
group row read as "already there". The second: the space *below* a list was not
a target at all, so a drop just past the last row did nothing. It now means the
end of that list, which is what that space looks like it means.

**Verification.** `pnpm run check` green: **559 tests**. The smoke's
seventeenth check drags a sheet out of one column and into the other with real
pointer events, then drags the group it landed in into a third — reading the
file from its new place on disk, `structure.json` for the re-keyed entry *and*
for the absence of the old one, and the editor for the same document it held
before. Falsified by widening the edge band so the middle of a row no longer
means the group: the move then fails. The screenshot taken while the pointer is
still down shows the destination outlined, the dragged row dimmed, and no
insertion line — because this drop is an into and not a between.

---

## 2026-09-02 — deleting into the desktop trash

**What exists.** A sheet or a group is deleted from its context menu, and
deleting means moving to the **desktop trash** (`SPEC.md` §6.7). The
application never removes a file itself: without a trash the operation is
refused rather than falling back to something irreversible. This follows the
functional template, which uses `FileManager.trashItem` and never `removeItem`.

**Why the system trash and not one of our own.** It is the place the author
already knows how to restore from, and under Git the manuscript has a second,
independent net — a deleted file is in the history. A trash inside
`.opera-incerta/` would be a third place, sitting in the project, getting
committed, and needing its own retention rules.

**The trash first, the record second.** `structure.json` forgets the entry —
its name in the parent's order, its own entry and everything beneath it — only
after the move succeeded. The other order would leave a hole in the order and
the file still on disk.

**The confirmation says what the author cannot see**: the name, how much goes
along with a group, and — for the open sheet with unsaved changes — that those
are not in the trash afterwards, because they were never in the file. Return
cancels rather than deletes, like the default button of a system alert, and it
is bound outright instead of relying on where the focus landed: a rule about
not deleting things should not depend on that.

**Afterwards the author is left somewhere**: the sheet after the deleted one,
else the one before it; a deleted group hands the selection to its parent, and
the columns never show a place that is gone.

**The lesson of this round is about a check, not about the code.** The first
version of the smoke pressed Return on the confirmation and asserted the file
was still there. It passed — while the dialog was still open, because the
harness sends no character event and the focused button was never activated.
The check proved nothing: a confirmation that ignores every key would have
passed it just as well. It now asserts that the dialog **closed** as well, and
that is what caught it. A negative check has to say what *did* happen, not only
what did not.

**Verification.** `pnpm run check` green: **525 tests**. The smoke's sixteenth
check deletes a sheet and a group through the real context menus, and reads
both ends off the filesystem: gone from the project, **arrived** in the trash
with the group's sheet inside it, and struck from `structure.json`. Under the
smoke the trash is a directory of its own, so a run leaves nothing in the
author's own trash; that the destination is the desktop trash in the
application is one line of wiring, and a unit test proves the session removes
nothing itself — given a trash that does nothing, the file stays exactly where
it was. A screenshot of the confirmation shows the name, the warning, the
restore hint, and Cancel holding the keyboard.

---

## 2026-09-02 — reordering by drag, and the unsaved work it nearly cost

**What exists.** Sheets can be dragged into a new order in the sheet list, and
groups among their siblings in the tree (`SPEC.md` §6.4). The dragged row dims,
an insertion line shows where it would land, and the drop writes the group's
`order` to `structure.json`.

**Scope, deliberately.** An entry moves among its **siblings only**. Dragging a
sheet into another group is a file move — the path changes, and handles, the
open document, both orders and Git all have a stake in it — so it stays a
separate operation, still unbuilt. The core's `moveChild` already anticipates
it.

**Pointer events, not the drag-and-drop API.** The native API cannot be driven
by a synthetic pointer, and a gesture no check can drive is a gesture nothing
proves. The pointer also gives the insertion line the same feel the column
dividers already have. A press becomes a drag only after a few pixels of
travel, so an ordinary click stays a click — and the click that follows a real
drag is swallowed, because the author was moving the row, not choosing it.

**Two rules that keep the file honest.** The interface names the sibling to
land in front of, never a position: by the time the main process has re-read
the group, an index could point at something else. And the *whole* resolved
order is recorded, because a partial one would leave the rest to be appended
alphabetically — scrambling the arrangement just made.

**In the tree, a node owns the drag of its children, not of itself.** A dragged
node's siblings are not its ancestors, so pointer events during the drag would
never reach it; they do reach the one node that contains all of them. Pointer
capture would have been the alternative, and it is exactly what a synthetic
pointer may not support. It also makes "a group only moves among its siblings"
a property of the structure rather than a check.

**The defect this round found is the one that mattered.** Every library edit
re-reads the open sheet from disk — and silently threw away whatever was typed
but not saved. Renaming some *other* sheet was enough to lose a paragraph. The
editing state is now carried across the refresh and put back on top of the
freshly read file. It surfaced only because the new drag check ran after the
rename check and found the renamed title gone; the older checks had never
looked after a second edit. The explicit refresh still has this hole, recorded
in `TODO.md` where the §10.6 comparison rule belongs.

**Verification.** `pnpm run check` green: **506 tests**. The smoke's fifteenth
check drags a sheet past the row below it and a group past its sibling with
real pointer events, then reads both the shown order and `structure.json` from
the filesystem, and confirms that neither drag opened what it moved. Falsified
three ways: an unreachable drag threshold fails the smoke, a `reorderChild`
that returns its input fails nine unit tests across two packages, and removing
the carried-over editing state fails the unsaved-work test. A screenshot taken
**while the pointer is still down** shows the insertion line under the target
row and the dragged row dimmed — the line exists only during the drag, so no
check after it could have seen it.

---

## 2026-09-02 — creating and renaming sheets and groups

**What exists.** The context menus of `SPEC.md` §6.4 and §6.5. Right-clicking a
group in the tree offers a new sheet, a new group, and a rename; right-clicking
a sheet row offers a rename. A small prompt asks for the name and refuses an
empty one.

**What the rules protect.** Names on disk never move:

- a sheet's file name is fixed at creation from the slug of its title, and a
  rename rewrites only the front matter `title`;
- a group's directory name is fixed the same way, and a rename writes only
  `displayName` in `structure.json`;
- both operations append to a group's `order` **only when that group already
  has one** — recording an order for a group that never had one would freeze an
  arrangement the author never chose.

**Renaming the open sheet does not touch the file.** It goes into the editing
state and the sheet turns dirty, exactly as editing the title in the inspector
does, because it *is* that change. Writing the file behind the editor would
discard whatever is unsaved in it.

**The interface adopts, it does not patch.** Every edit is answered by the main
process with a freshly read project. A patched copy is how a tree starts
disagreeing with the disk.

**Two defects the checks found, both invisible to green unit tests.**

The first: after creating a sheet, the editor held it while the sheet list
still showed the group the author had been in — a sheet you can edit but cannot
see in the list beside it. The selection now follows what was created: a new
sheet reveals its group, a new group reveals itself, a rename moves nothing.
Creating a *group* must still leave the open sheet open, and that took a second
correction after the first fix closed the editor.

The second: renaming the open sheet changed the title everywhere except where
the author was looking. The tree, the sheet list, and the header all read the
saved name. They now read the edited one — a rename that nothing visibly
answers looks like a rename that failed — and the dirty marker is what says it
is not saved yet. The substitution is a pure function in the core
(`withSheetDisplayName`) that rebuilds only the branch down to that sheet and
otherwise returns the very same tree.

**A third defect, in the smoke's own exit.** `app.exit` emits no `before-quit`,
so the project window's close handler took the shutdown for an ordinary project
close and built a fresh launcher — the process never ended, and two runs looked
like hangs. The smoke now sets the terminating flag before it exits. The lesson
is older than this round: a guard that reads a flag is only as good as every
path that sets it.

**Verification.** `pnpm run check` green: **478 tests**. The smoke's fourteenth
check drives the real context menus with real right-clicks: it creates a sheet
and finds it on disk under its slug, renames a closed sheet and reads the new
`title` out of the file it was already in, renames the open one and confirms the
file did **not** change while the header shows the new name and a dirty marker,
then creates a group and renames it, reading `structure.json` from the
filesystem both times. Falsified: with `renameGroup` made a no-op the check
fails; with the reveal rule removed two store tests fail. The screenshot shows
both renamed sheets in the list, the new title in the header and the inspector.

---

## 2026-09-02 — draggable column dividers, and the preference record

**What exists.** The three resizable columns of `SPEC.md` §8.2 can be dragged,
and everything about the workbench's appearance now survives a restart.

The dividers needed persistence to be finished at all — "stored" is one of the
three properties the specification demands of a width — so this round also
built the installation-local preference record of §13:

- one versioned JSON document under a stable key, in the user-data directory;
- **a single malformed value costs that one setting, not the whole record.** An
  unreadable preference must not send the author back to defaults everywhere;
- widths are clamped on read as well as on write, so a changed constant cannot
  drag an old stored value into absurdity;
- unknown fields are discarded, and both sides validate — the renderer because
  it must not trust a file, the writer because a malformed record should never
  be written.

It carries the column widths, which view each region shows, whether the sidebar
is open, the sheet-list density, and the two display toggles. That closes the
layout-persistence item as a side effect of finishing the dividers.

**The divider itself** is 6 px to grab and 1 px to see. It reports pixels
moved; the width lives in the layout state, which is what keeps a view switch
from ever moving a column. The sidebar's divider sits to its left, so it is
told which side it belongs to — without that, dragging it would run backwards.
Double-clicking restores the ideal width.

**Verification.** `pnpm run check` green: **457 tests**. The smoke's thirteenth
check drags the navigator with real pointer events, switches views to confirm
the column does not move, and reads the width back out of the preference file.

**Three findings.**

1. **The measured width is not the applied width.** The check compared what the
   file stored against what the column occupied on screen and failed by one
   pixel — the divider overlaps its neighbours by design. It now compares the
   stored number against the applied one, which is the comparison that was
   meant: two numbers that must be identical, not two that happen to be close.
2. **A synthetic pointer may not be capturable.** `setPointerCapture` keeps a
   drag alive when the pointer leaves the 6 px strip, but a capture that cannot
   be taken must not stop the drag; it is now attempted and ignored on failure.
3. **`grep` in a pipe hid a running test.** Two runs looked hung because the
   filter buffered everything until the process ended. Writing the log to a
   file and waiting on its contents showed the run had been making progress the
   whole time — a reminder that "no output" is a statement about the pipe, not
   about the program.

---

## 2026-09-02 — naming a project when creating it

**What exists.** A dialog asking for a display name and a location, replacing
the directory chooser that derived the name from whatever folder was picked.

**Why not a save dialog**, which asks for a name and a place in one native
step: it would show the author typing a *folder* name, when what they type is
the display name and the folder gets a slug of it. The dialog would have looked
like it was doing one thing while doing another.

**It shows the folder it will create.** Typing "Die Nacht am Hafen" previews
`die-nacht-am-hafen` with a line saying the name can change later and the
folder cannot. Displaying the rule at the moment it applies is the difference
between a rule and a surprise.

The collision suffix is deliberately **not** previewed. Whether `-2` is needed
is decided against the real directory when the project is created, and the
renderer cannot know what is in it, so the dialog says the folder name it
derives rather than promising one it might not get.

A failed creation leaves the dialog open with what the author typed, rather
than making them start over.

**Verification.** `pnpm run check` green: **438 tests**. The smoke's twelfth
check drives the whole thing: open the dialog from the File menu, type a name
with spaces and a German article, confirm the preview reads
`die-nacht-am-hafen`, confirm Create is offered only with both a name and a
location, create it, and then read `project.json` from disk to confirm the
display name kept its spaces while the directory took the slug.

**Finding.** The shared test double caught the signature change immediately:
creating now returns a project rather than possibly nothing, because cancelling
happens in the separate location step. One type error, one place, naming
exactly what changed.

---

## 2026-09-02 — the native menu

**What exists.** A File menu with New Project (`Cmd/Ctrl+Shift+N`), Open
Project (`Cmd/Ctrl+O`), Save (`Cmd/Ctrl+S`), and Close Project
(`Cmd/Ctrl+Shift+W`), alongside the platform's own application, Edit, and
Window menus.

**The part that is easy to get wrong.** Installing an application menu
*replaces* the platform default, and with it Undo, Cut, Copy, Paste, and Select
All. A menu that adds four commands and silently removes copy and paste is a
bad trade, so the editing entries are re-declared — as platform **roles**, not
as commands of our own, because a hand-wired copy does not work inside a text
field while the role does. Both the unit test and the smoke assert every role
is present.

**Accelerators belong to the menu.** Once an item claims `Cmd+S`, the key never
reaches the page. The renderer's own key handler was therefore removed, and the
command arrives through a channel that carries the command string alone — never
an event object, which would hand the page a way back into IPC.

**Items are disabled when their command is impossible**, so the menu is rebuilt
whenever a project opens or closes. Close Project closes the window rather than
resetting state itself, which keeps it on the one path the red button and the
shortcut already take.

**Verification.** `pnpm run check` green: **438 tests**. The smoke runs eleven
checks and now drives saving and closing **through the menu items themselves**,
because a synthetic keystroke bypasses accelerators — which makes it the
honest test anyway: it is the path an author takes.

**Two findings.**

1. **Electron reports roles lower-cased**, whatever case the template used, so
   the check for `selectAll` failed on a role that was present. The comparison
   is now case-insensitive. Worth recording because the failure looked exactly
   like the defect it was watching for.
2. **The shared test double paid for itself immediately.** Adding the menu
   channel broke compilation in one place, with a message naming the missing
   method — the same change a day earlier would have broken two files with two
   confusing type errors.

---

## 2026-09-02 — the welcome window and the two-window model

**What exists.** The launcher of `SPEC.md` §8.5 and §8.6: recent projects with
their abbreviated paths, open, new, and the choreography between the two
windows.

- **One path per transition.** Every way of opening — the launcher's button, a
  recent entry, creating one — ends in the same function, which records the
  entry in the recent list and presents the workbench. No caller can forget
  either half.
- **Closing runs through the window's own close event**, so the red button, the
  shortcut, and a future menu command all reset the session and bring the
  launcher back through one path.
- **The quit guard.** A flag is set before any window begins closing, because
  quitting closes the project window and that close would otherwise re-open the
  launcher mid-shutdown — after which closing *that* would quit a second time.
- **One bundle, two windows.** Both load the same renderer and ask the main
  process which they are. The role does not come from a query string, which the
  page itself could change.
- **A missing project stays listed**, marked unavailable, and says so when
  clicked. Availability is checked when the list is shown rather than when it
  is stored, so removing an entry stays the author's decision.
- **The recent list lives in the user-data directory** — installation-local,
  never synchronized. A list that cannot be written is a lost convenience, not
  a reason to interrupt.

**Verification.** `pnpm run check` green: **430 tests** plus the desktop and
asset checks. The smoke now runs ten checks and follows the whole
choreography: it starts at the launcher, confirms an empty recent list, opens
the project, confirms the launcher gave way to the workbench, does everything
it did before, and finally closes the project to confirm the launcher returns
with that project listed and available. It runs against its own temporary
user-data directory, so a test never writes into the author's list.

**Three findings while building it.**

1. **Angular could not find its root element.** The launcher component had its
   own selector, and the document holds one. Both components now share
   `wi-root`, because only one is ever bootstrapped into it.
2. **`ready-to-show` fires before the renderer knows what it is.** It has to
   ask the main process and load a component first, so the smoke waits for the
   element rather than assuming it. That wait is now a helper, used at both
   window transitions.
3. **Every new bridge channel broke two test doubles at once.** Each test file
   carried its own complete fake. They now share one exhaustive base, so a
   forgotten channel fails to compile in one place instead of two — the
   shared-detail rule applies to test doubles as much as to panel headers
   (`CONVENTIONS.md` C-U7).

---

## 2026-09-02 — the remaining panes, and Material Symbols

**What exists.** Every pane of `SPEC.md` §8: the inspector, the outline, source
control, and both activity bars switching between them.

- **Inspector** — progress figures and the owned metadata fields. This is the
  only place they are edited, which is why the block beside the text is
  read-only. Editing a keyword marks the sheet dirty exactly as editing a
  paragraph does; the codec writes both back together.
- **Outline** — the headings with their levels, click to jump, and the
  H3-to-H6 toggle. The visibility rule is the core's pure function, not
  template logic.
- **Source control** — the established commit layout over the Git adapter,
  reached through five new bridge channels. Reads and writes have separate
  guards: one shared flag would let a background refresh swallow a click.
- **Activity bars** — a shared component. No entry toggles a region: that
  would name a position among names for contents. Activating the visible view
  collapses the sidebar, which is the region's rule.

**Material Symbols.** Six icons, packaged as unmodified Apache-2.0 SVGs with
their licence and a notice recording upstream, version, date, and which symbol
serves which entry. Drawn as CSS masks so one file works in light and dark, and
decorative throughout: every button carries its own accessible name.
`pnpm run check:assets` pins their bytes and rejects an SVG that could reach
out or execute — falsified before being trusted, with a changed byte and a
missing notice each failing it.

**Verification.** `pnpm run check` green: **421 tests** plus the desktop and
asset checks. The smoke now runs nine checks, ending with the panes: the
inspector shows the sheet's topic and its progress, editing a field marks the
sheet dirty, the outline lists the heading, activating the visible view
collapses the sidebar, and source control states plainly that the temporary
copy is not inside a repository.

**Two findings.**

1. **A failed write reported nothing.** After a Git action the panel re-reads,
   and a successful read cleared the failure the write had just set — in the
   same tick. The author would have seen a click do nothing. The write's
   outcome is now restored after the refresh, and the refresh still happens,
   because a failed push leaves a made commit behind and the panel must show
   that.
2. **A renderer error was invisible to the smoke.** It reported only "script
   failed to execute" and left the cause to guesswork; the actual fault was an
   escape sequence that became a real newline inside an injected script. The
   smoke now forwards renderer console errors, which turned a guessing game
   into one line of output.

---

## 2026-09-02 — documents, explorer, and sheet list: it can be written in

**What exists.** Opening a project, walking its tree, choosing a sheet, editing
it, and saving it — end to end, through the real bridge, to the real file.

- **The bridge** carries `openProject`, `reopenProject`, `closeProject`,
  `readSheet`, and `writeSheet`. Every privileged request validates its sender
  against the windows this process created and reports failures as results
  rather than as exceptions crossing the boundary.
- **`ProjectSession`** in the main process owns what the renderer must never
  hold: absolute paths and the authority to reach them. It mints one opaque
  handle per sheet at open time; a handle from a previous project, a forged
  one, or a path pretending to be one all fail a registry lookup.
- **The workspace store** holds the state and applies the core's rules. Its
  bridge is injected, so all of it is tested against a scripted double.
- **The explorer, the sheet list, and a shared panel header.** The header is
  the component `SPEC.md` §8.3 demands: fixed height, and the separator
  belongs to it, so no panel can misplace either.
- **Sheet-list previews** carry the actual formatting from the file, sized by
  the core's geometric formula, with the three density steps.

**Verification.** `pnpm run check` green: **397 tests** (core 250, project-node
58, desktop 36, workbench 25, git-node 19, contract 9). The smoke now runs
eight checks against a **copy** of a fixture project, ending with: type a
marker, press `Cmd+S`, and read the file from the filesystem — not through the
bridge — to confirm both the edit and the untouched front matter.

**The visual check caught the defect that mattered most.** The first working
version showed the front matter as raw text at the top of the editor:

```
---
opera-incerta:
  title: A Scene in Part One
---
The Second Bell
```

Every test was green. The store had handed the editor the whole file, and
nothing tested what the editor was *given* — only what it did with it. Two
things were wrong at once: `SPEC.md` §10.4 puts front matter in its own area,
deliberately outside the writing surface; and an author editing that text could
have broken their own metadata, or a foreign tool's, in a product whose central
promise is that this cannot happen.

The editor now receives the **body alone**, and the codec reassembles the file
on save. The protection is structural rather than careful: what is never shown
cannot be edited, and what the codec writes cannot lose a foreign key. A sheet
whose front matter carries a diagnostic is marked read-only in the header and
is not written back at all.

**Lesson.** Tests check what a unit does with its input. They do not ask
whether it should have received that input. The store's tests passed because
they asserted the round trip of exactly the string the store chose to pass on —
the mistake was one layer above every assertion. Looking at the running
application is not a formality at the end of a round; here it was the only
thing standing between a green suite and a product that could corrupt a
manuscript.

---

## 2026-09-02 — cutting a heading takes its prefix

**What changed.** A cut whose selection starts at the visible beginning of a
heading now removes the hidden prefix along with the text, leaving an ordinary
empty line.

**Why it was wrong before.** The clipboard half of the gesture already carried
Markdown, so the two halves of one action disagreed: the text arrived elsewhere
as a heading while an empty `## ` stayed behind — invisible, since the prefix
is hidden, so the author saw a blank line that was secretly still a heading.

**Deleting stays different, on purpose.** Clearing a heading's text with Delete
or Backspace leaves the level alone. Cut means "this moves elsewhere", so the
formatting travels with it; delete means "this text goes", and an author
clearing a title to retype it wants the heading to survive. Backspace at the
visible start remains the deliberate way to remove a level. The rule is now
written down rather than left to whichever behavior happened to fall out.

**Verification.** `pnpm run check` green at **354 tests**, `spike:editor` 7/7,
and the smoke types a fresh `.h2 Cut me`, selects the visible line, cuts, and
requires both halves: `## Cut me` on the system clipboard and an empty
non-heading line behind.

**Falsified before trusted.** With the filter commented out, the smoke failed
with `cut left something behind: {"text":"","heading":true}` — exactly the
invisible empty heading described above — and passed again once restored.

---

## 2026-09-02 — the cursor rules around hidden heading syntax

**Decision, then implementation.** The open question was whether the hidden
`# ` prefix should become an atomic range or whether Backspace should remove
the level. The two are not alternatives: atomicity is the foundation — without
it the caret reaches invisible text through arrow keys, `Home`, a click, or a
selection, and Backspace is only the loudest symptom — and the deletion
semantics are the separate question that atomicity then makes answerable.

**What was built.**

- Heading syntax is an atomic range: the caret cannot enter it by any route.
- `Home` and `Cmd/Ctrl+Left` go to the first visible character; the shift
  variants select to it.
- Backspace at the visible start removes the heading level and keeps the text;
  a second press merges with the line above, as in a word processor. It runs
  the same operation as the gutter menu, so both gestures undo as one thing.
- Copying a heading yields Markdown: the selection cannot start inside the
  prefix, so the prefix is put back on the way to the clipboard.

**Verification.** `pnpm run check` green: **354 tests**. `pnpm run
spike:editor` 7/7. The smoke drives all of it through real key events and the
real system clipboard: line-start shortcut, select to end, copy, and the
clipboard must read `##### Typed heading`; then Backspace removes the level and
a second Backspace merges.

**The smoke found a defect nobody would have reported.** The clipboard held
`#####  Typed heading` — two spaces. Tracing it back: the dot command fired on
`.h3` at the end of the line, one keystroke before the author typed the
separating space, and that space then landed inside the heading prefix. Every
heading created by typing carried a doubled space into the file. It renders
identically, so no reader would ever notice; the file would simply have
contained Markdown the author never wrote.

The fix is that the separator is now **required**: the command must be complete
before it fires. That also makes it easier to predict — `.h3` sits there
visibly until the space triggers it.

**Deliberately left alone.** Return in the middle of a heading still leaves the
second half an ordinary paragraph, because the prefix stays on the first line.
That is what the file says, and special handling would mean the editor inventing
Markdown. Cut at the visible start is genuinely unfinished and recorded as
`TODO.md` §1.4: copying puts the prefix back, but cut removes only the
selection and leaves an empty `##### ` behind.

---

## 2026-09-02 — dot commands and the gutter menu

**What exists.** Both ways of setting a heading level from `SPEC.md` §10.2:
typing `.h1`…`.h6` at the start of a line, and clicking the level label in the
gutter to pick from a menu.

**The dot command is a transaction filter, not a listener.** The conversion
joins the same edit step as the keystroke, so one undo takes the whole thing
back and no intermediate state is ever rendered. Its rules are a pure function
in the core: recognized against the *visible* text, so typing `.h2` in front of
an existing heading changes its level; the separating space consumed with the
command; `.h1x` left as ordinary text; and — the rule that matters most — it
applies to typing only. A file containing a line that starts with `.h1` opens
unchanged, because opening a document must never rewrite it.

**The menu is a view, not an adapter concern.** The adapter reports *what* was
activated and *where* on screen as plain numbers; the view decides what to show
there. One menu will therefore serve any adapter, and the adapter needs no DOM
vocabulary beyond the two coordinates.

**Verification.** `pnpm run check` green: **349 tests** (core 235).
`pnpm run spike:editor` 7/7. The smoke now drives both gestures with **real
input events** — key events for the dot command, mouse events for the marker
and the menu entry — because what was in doubt is exactly the path from a
keystroke or a click to the document. It types `.h3 Typed heading`, checks the
line became an H3 with the command text gone, clicks the marker, checks the
menu shows seven entries with `✓ Heading 3` marked, clicks `Heading 5`, and
checks the line changed and the menu closed. Visually confirmed in
`build/desktop/smoke.png`.

**The same mistake, a third time.** The transaction filter parsed the line it
was editing in isolation, so a `.h3` typed inside a fenced code block became a
heading. The gutter had made this exact mistake two days' work earlier, and
`applyDotCommand` even guards on a `verbatim` flag — but the caller computed
that flag from one line, where it is always false. Whether a line is verbatim
is a question about the document.

The fix is structural rather than another guard: `DisplayModel` now carries
`verbatimLines`, so there is one answer that every consumer reads instead of
each deriving its own. The core test names the reason in place, and the smoke
holds the end-to-end evidence.

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
