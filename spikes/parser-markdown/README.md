# Parser spike — CommonMark/GFM candidates

Status: Run 2026-09-04. No candidate passed every criterion of `TESTING.md`
§2.11. Decided the same day (`TODO.md` §2.1): the gate is read as two;
commonmark.js and `yaml` are the accepted test-time oracle
(`packages/core/test/standard-oracle.test.ts`), the runtime parser waits for
the GFM display round.

This spike answers one question: which Markdown parser can serve as the
standard-conformance oracle that `TESTING.md` §2.2 requires, and later as the
parser behind the GFM display of `SPEC.md` §18 — within the footprint the
dependency rules allow?

It is **not** production architecture. No candidate's types leave `src/main.ts`
(`CONVENTIONS.md` C-A6). The package exists as the evidence behind the
decision and may be deleted once a chosen parser carries its own tests.

## Running it

```bash
pnpm run spike:parser
```

The first run fetches the 652 examples of CommonMark 0.31.2 from
`spec.commonmark.org` into `build/spike-parser/spec.json` and verifies their
SHA-256 (pinned in `src/main.ts`); later runs use the cached file. The
examples are CC-BY-SA and are not committed. `SPIKE_DETAIL=1` prints the first
three conformance failures of each candidate. The exit code is the verdict.

## Result, 2026-09-04

| # | Criterion | markdown-it 15.0.1 | marked 18.0.11 | commonmark.js 0.31.2 | micromark 4.0.2 + mdast |
| --- | --- | --- | --- | --- | --- |
| 1 | Conformance, 652 examples | **652** | 587 (90.0 %) | **652** | 648 (99.4 %) |
| 2 | Source positions | yes | no — only by adding up `raw` | yes | yes |
| 3 | Agreement with the core | 8 disagreements | 8 | 8 | 7 |
| 4 | GFM table / strikethrough / task list | yes / yes / **no** | yes / yes / yes | no / no / no | yes / yes / yes |
| 5 | Footprint | 7 packages, 3 MB; argparse is **PSF-2.0** | 1 package | 4 packages, 1 MB, BSD-2/MIT | **43 packages**, 4 MB |
| 6 | Parse time, 112,854 characters | 15 ms | 11 ms | 9.5 ms | **164 ms** |
| 7 | The codec's front matter read by `yaml` 2.9.0 | 13 problems in 181 generated sheets — see below | | | |

Bold marks what fails a threshold.

**Criterion 1.** marked fails on tabs, on list tightness, and on the
finer link rules; it is a renderer, not a reference. micromark's four
failures are all link destinations with backslash escapes or unusual
schemes (examples 500, 598, 599, 601), where it emits an empty `href`.

**Criterion 3 measures the core, not the parser.** The three parsers that
pass criterion 1 disagree with `markdownToDisplay` in the same places, so
the disagreements are findings about the core, recorded in `TODO.md`:

- examples 138 and 145: a backtick fence whose info string contains a
  backtick is not a fence (`` ``` ``` ``, `` ``` aa ``` `` are code spans); the
  core opens a fence there. Reading the section also showed that a closing
  fence may be followed by spaces only, while the core lets `` ``` aaa ``
  close one (example 147). Both are defects;
- examples 108 and 109: an indented line after a blank line inside a list
  item is a paragraph of that item, not code. The core models no
  containers (`SPEC.md` §10.1) and shows the line verbatim. A design limit,
  to be recorded, not a defect of the rule as specified;
- example 117: a whitespace-only line at the edge of an indented code block
  is not part of it. The core shows it verbatim, which nobody can see.

**Criterion 7 found four defects in the codec**, which is what the
cross-check was for:

- `0x1F` is written bare and read as the number 31 by any YAML reader; the
  quoting rule knows decimal numbers only;
- `trailing colon:` is written bare; a plain scalar cannot end in a colon,
  and `yaml` refuses the file;
- `keywords: ["a #comment", plain]` — the writer quotes the item correctly,
  but the **reader strips the ` #comment` before it splits the list**, and
  reads back `["a`. A file the application wrote loses a keyword on the next
  load;
- `notes` whose first non-empty line begins with a space, or is indented
  deeper than a later line, lose that indentation in a block literal — for
  `yaml` and for the codec alike — because YAML would need an indentation
  indicator, which the reader refuses by design. Such notes have to be
  written as a quoted scalar.

Everything else held: 165 of 181 generated sheets and all three fixtures of
`examples/foreign-front-matter` read back identically through `yaml`.

## What follows

For the test-time oracle of `TESTING.md` §2.2, commonmark.js — the reference
implementation, four packages, no GFM needed in a test — and `yaml` (ISC, one
package) are the fitting pair; criterion 4 does not apply to a test
dependency, but the gate as written does not say so, and that is the
decision in `TODO.md` §2.1. For the GFM display of `SPEC.md` §18,
markdown-it is the only candidate that is both conformant and small, and it
misses the gate on two points that are decisions rather than measurements:
task list items (a ten-line rule in the translation layer, or a third-party
plugin) and the PSF-2.0 license of its `argparse` dependency, which serves
only its command-line tool.
