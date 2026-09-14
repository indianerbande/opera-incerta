# Opera Incerta user guide

**English** | [Deutsch](../de/user-guide.md)

Applies to `v0.1.0-beta.1`. What is not built yet is listed in the [project
status](project-status.md) rather than implied here.

## What this application is

Opera Incerta collects texts and grows a structured book manuscript out of
them. It is a **local** tool: your manuscript is a folder of ordinary Markdown
files on your own disk, and the application needs no account, no cloud, and no
network to do anything described on this page.

The promise that shapes every other decision: **your files stay yours, and
stay readable by anything else.** One text is one file. A group is a
directory. Metadata lives in the head of the file it belongs to. If you
uninstalled this application tomorrow, your manuscript would be exactly what
it is today.

## Projects

A project is a folder with a `.opera-incerta/` directory in it. That directory
holds the project record, the recorded order and display names of your groups,
your page categories, the list of recently edited sheets, and any export
stylesheets you made. Everything else in the folder is your manuscript.

### Creating one

**File ▸ New Project…** (`Cmd/Ctrl+Shift+N`) asks where it should live and
what it is called. The folder takes a slug of the name; the name itself is
recorded and can change later without the folder moving.

### Opening one

**File ▸ Open Project…** (`Cmd/Ctrl+O`). The launcher also lists the projects
you opened recently.

### Opening a folder that is not a project

Point the chooser at any folder and the application works out what it is:

- **It is a project** — it opens.
- **It is not, and holds no project** — you are offered to *adopt* it. Adopting
  writes a `.opera-incerta/` directory and changes nothing else: no file is
  moved, renamed, or rewritten. Your existing Markdown becomes the library as
  it stands.
- **It holds exactly one project** — that project is offered.
- **It holds several** — they are named, and you choose.

This is how you bring a manuscript you already have into the application.

## The library

Three columns: the **project tree** on the left, the **sheets of the selected
group** beside it, and the **editor**.

The tree shows groups; the sheet list shows the direct sheets of whichever
group is selected — its own, not those of its subgroups.

### Creating, renaming, deleting

Right-click a group for **New Sheet…**, **New Group…**, **Rename…**, and —
except at the root — **Delete Group…**. Right-click a sheet for **Rename…**,
**Delete Sheet…**, and the two "from here" exports.

**Renaming changes a title, never a file name.** A sheet's file name is
derived once, from the title you first gave it, and then stays; the title
lives in the file's front matter and can change as often as you like. A
group's directory name works the same way, with the display name recorded in
the project.

This is the rule that keeps a manuscript's history readable: your commits show
edits, not a storm of renames.

Deleting moves the entry to your desktop trash, where you can get it back. A
group takes its contents with it, and you are told how many sheets and
subgroups that is before you confirm.

### Ordering

Drag a sheet within its group, or a group within its parent, to set the order.
The order is recorded in the project, so the application's order and your
file manager's alphabetical order are allowed to differ.

Dragging a sheet into a group, or a group into another, moves it — and the
editor follows if the sheet you moved was open.

### Page categories

Each project defines its own categories, with a name and a colour — "Draft",
"Needs a source", "Cut for now". Assign one in the inspector; manage the set
with **Manage…** beside it. A category a sheet names that no longer exists
simply reads as uncategorised, which is not an error.

## The editor

### Formatting is shown, not spelled out

A heading appears at its own size with its level labelled in the gutter, not
as `# `. Emphasis, code spans, and strikethrough appear as what they mean.
Quotes, lists, task boxes, and thematic breaks appear as themselves.

**The markers come back on the line your cursor is in**, so the text stays
editable as text. Nothing is hidden that you cannot get at by moving the
cursor into it.

Inside a fenced code block nothing is transformed at all — a code sample is
shown exactly as written.

### What is on disk

Standard, conformant Markdown. `#`, `**text**`, `- item`, `> quote`,
backticks. Any other editor reads it without loss, and a round trip through
this application does not rewrite what it does not own.

### Working with headings

- Type `# ` at the start of a line, as you would anywhere.
- The gutter marker beside a heading opens a menu of levels.
- Backspace at the start of a heading removes the level before it merges the
  line — one undo step, not two.
- Cutting a heading line takes its level with it, so pasting it elsewhere
  keeps it a heading.

### The status bar

Bottom right of the editor: the cursor's line and column, a **Wrap** switch
that belongs to this sheet alone, and a zoom. The zoom is remembered like a
column width; it does not touch the file.

### Line numbers

Off by default; a setting turns them on.

### Finding in the open sheet

**Edit ▸ Find…** (`Cmd/Ctrl+F`) opens a bar between the header and the text —
it pushes the text down rather than covering the line you were looking for.
Whatever you had selected is offered as the query.

Every match is marked; the bar counts them. The search starts **at your
cursor**, not at the top. Return steps forward, `Shift+Return` back, and both
wrap round. Escape closes the bar and takes the marks with it.

## Variables (front matter)

Every sheet may carry YAML front matter in its head: title, topic, keywords,
status, category, and notes. The application owns exactly one top-level key,
`opera-incerta:`. Everything else in that block belongs to whatever other tool
put it there and is **preserved byte for byte** through every load and save.

You edit the owned fields in the **inspector**, on the right.

The raw block can be shown in an area of its own, above the writing surface —
switch **Variables** on in the editor's header. It is **read-only until you
say otherwise**, because looking is harmless and editing YAML by hand is how a
file stops being readable.

If the front matter of a file cannot be understood — a malformed
`opera-incerta:` block, or the key twice — the sheet is shown and marked
**read-only**. The application will not guess what you meant and will not
write over it.

## Searching the library

The magnifying glass in the left rail switches the navigator to search. It
searches the **text** of every sheet in the project — deliberately not the
front matter, so a search for a word finds it where it was written rather than
where it was filed.

Each hit shows its sheet, its line, and the line itself with the match marked.
Choosing one opens the sheet and puts the cursor on that line. A search is
transient: it is not saved, and clearing it forgets it.

## Where you have been

**Go ▸ Back** (`Cmd/Ctrl+[`) and **Go ▸ Forward** (`Cmd/Ctrl+]`) walk the
sheets you opened, as a browser does. Opening a sheet after going back drops
what lay ahead.

The navigator's header has a **Recent** button: the last ten sheets you
**saved**, newest first. Opening a sheet is not editing it, so only a save
puts one in the list. That list lives in the project and travels with it.

## Source control

The second entry in the left rail. It works on **your project's** Git
repository, and it does only what you ask.

- **Status** of every changed file, staged and unstaged.
- **Stage**, **unstage**, **commit**, **push**.
- **Fetch** and **pull**, with the branch's upstream shown.
- **Merge**, with conflicts resolved **per region**: each conflicted passage
  is decided one way or the other, and the file is written back without a
  marker in it.
- **Branches**: list, create, switch — with a switch over unsaved work
  stopping to ask — publish, and delete.
- **Amend** the last commit, offered only while it has not been pushed.
- **`.gitignore`**, editable as text, and one-click ignoring of a file.
- **Discard**, which asks first, because it cannot be undone.

There is deliberately **no hidden pull, checkout, discard, or history
rewrite**. Nothing happens to your repository that you did not click.

### Seeing what changed

A changed file opens **word by word**: what changed is marked, and the rest of
the file reads normally around it. Git's own line view is one click away. For
a manuscript, prose is the useful view — a line diff of a reflowed paragraph
tells you nothing.

### If the project has no repository

The panel offers to create one. Creating it also asks for the name and address
that will author your commits, and writes them into that repository only —
never into your global Git configuration.

## Exporting

**File ▸ Export ▸ Markdown…** (`Cmd/Ctrl+Shift+M`) or **PDF…**
(`Cmd/Ctrl+Shift+P`) writes the whole manuscript out. Right-click a sheet for
the same two **from here**, which begins at that sheet.

How it is assembled:

- The order is the library's recorded order.
- **A group becomes a heading** at its depth, and the headings of the sheets
  inside it move down under it. Your library structure becomes the document's
  structure.
- **Front matter never appears.**
- "From here" carries the groups **above** the starting sheet along, so an
  excerpt keeps its place in the book instead of beginning in mid-air.

### Choosing how the PDF is set

A PDF asks which stylesheet to use. Four are supplied:

| | for |
| --- | --- |
| **Manuscript** | The default: a serif, a readable measure, each sheet on a new page. |
| **Typescript** | Monospaced and double-spaced — the shape a manuscript is sent in to be marked up. |
| **Reading** | Larger, flowing, no page break between sheets. |
| **Plain** | Sans-serif and close-set, for a working print. |

**Duplicate…** makes one your own under a new name, and **Edit…** opens it as
CSS. Your stylesheets are files in `.opera-incerta/styles/`, so they belong to
the manuscript and travel with it.

Two things a stylesheet cannot set, because the printer owns them: the page
margins and the page numbers.

The PDF is set by the application itself. There is nothing to install.

## Settings and appearance

**Settings…** (`Cmd/Ctrl+,`), or the gear at the bottom of the left rail.

- **Interface language**: English, German, or whatever the system says.
  It changes at once, including the native menu.
- **Appearance**: light, dark, or the system's choice; and one of eight accent
  palettes.
- **Sheet list density**: three sizes of preview.
- **Editor**: font family, base size, wrapping, line numbers.

The typeface is packaged with the application rather than borrowed from your
system, so a manuscript looks the same on every machine.

Settings never modify a document, never mark one dirty, and never change file
content.

## Keyboard

Every action has a menu item or a shortcut; nothing is reachable only by
clicking.

| | |
| --- | --- |
| `Cmd/Ctrl+Shift+N` | New project |
| `Cmd/Ctrl+O` | Open project |
| `Cmd/Ctrl+Shift+W` | Close project |
| `Cmd/Ctrl+S` | Save the open sheet |
| `Cmd/Ctrl+F` | Find in the open sheet |
| `Cmd/Ctrl+[` / `Cmd/Ctrl+]` | Back / forward |
| `Cmd/Ctrl+Shift+M` | Export Markdown |
| `Cmd/Ctrl+Shift+P` | Export PDF |
| `Cmd/Ctrl+,` | Settings |

Plus the platform's own editing keys, which are kept rather than replaced.

## When a file changes behind the application's back

The project is watched. If you edit a sheet in another editor, or pull a
change with Git:

- **and you have nothing unsaved** — the editor takes the new text silently.
- **and you were in the middle of something** — you are asked, once, and
  nothing is lost until you answer. Keeping yours changes nothing on disk;
  saving afterwards overwrites the file.

A file left with conflict markers by a merge is shown **read-only** until the
merge is decided, so you cannot accidentally save a version that is neither.

## Where things are kept

**In your project**, and belonging in your version control:

```text
your-manuscript/
├── .opera-incerta/
│   ├── project.json        the project's identity and name
│   ├── structure.json      recorded order and group display names
│   ├── categories.json     your page categories
│   ├── recent.json         recently edited sheets
│   └── styles/             export stylesheets you made
├── opening.md
└── part-one/
    └── a-scene.md
```

**On this installation only**, never written into a project: the list of
recent projects and your preferences, in the user-data directory your
operating system provides.

## Getting help and reporting problems

- [Project status](project-status.md) — what is built and what is not.
- [Build from source](build-from-source.md) — running and verifying it.
- [Report a problem](https://github.com/indianerbande/opera-incerta/issues) —
  with the build, your operating system, and the steps. The build is the line
  at the foot of the launcher and in the footer of the settings dialog, for
  example `Build v0.1.0-beta.1-7-g0381bfe`; it can be selected and copied.
  Builds of `v0.1.0-beta.1` itself do not show it yet; name the tag instead.
- [Security policy](../../SECURITY.md) — for anything that should not be
  posted publicly.
