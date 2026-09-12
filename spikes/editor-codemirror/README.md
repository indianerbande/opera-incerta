# Editor spike — CodeMirror 6

Status: Completed 2026-09-01, all six criteria passed; the component is
accepted in `specification.md` §5.4. The adapter contract of `testing.md` §2.8
joined the run afterwards as criterion 7, so `pnpm run spike:editor` now
reports 7/7.

This spike answers one question: can CodeMirror 6 carry the display model of
`specification.md` §10 — paragraph-level heading formatting at different sizes, a gutter
aligned to measured line heights, and inline markers hidden everywhere except
on the cursor's line?

It is **not** production architecture. The integration into `apps/workbench` is
its own round (`roadmap.md`); this package exists as the evidence behind the
decision and may be deleted once that integration carries its own tests.

## Running it

```bash
pnpm run spike:editor
```

The criteria run in a real Chromium renderer. A DOM stub reports zero for every
height, which would turn criteria 1, 2, and 6 into tests that pass while
proving nothing. The exit code is the verdict.

## Result, 2026-09-01

| # | Criterion | Measurement |
| --- | --- | --- |
| 1 | Variable heading sizes | H1 45 px, H2 36 px, body 22.5 px; the line blocks plus the content's 8 px padding equal the content height exactly |
| 2 | Gutter alignment | Marker top matches its line's top to 0 px; a heading wrapping across 8 visual rows carries exactly one marker, at the first row |
| 3 | Inline markers | The unfocused line renders without `**`, the focused line with them, and moving the cursor switches both; the document text is untouched |
| 4 | Undo per document | After editing A, switching to B, and returning, one undo reverted only A |
| 5 | Paste | A real `ClipboardEvent` with CRLF, a tab, and Markdown arrived intact and round-tripped through the display transform |
| 6 | Typing latency | 112,020 characters, 200 keystrokes: median 5.8 ms, p95 6.6 ms against a 16 ms threshold |

Thresholds were fixed in `testing.md` §2.8 before the spike ran
(`conventions.md` C-T14).

**Re-measured 2026-09-12.** A grouped dependency update moved the three
packages to `@codemirror/state` 6.7.4, `@codemirror/view` 6.43.11, and
`@codemirror/commands` 6.11.0 — five minor releases on `view`, in the
component the author looks at all day. All seven criteria were re-run against
them: 7/7, with typing latency at a median of 6.1 ms and a p95 of 6.7 ms over
112,020 characters. The table above records the run of 2026-09-01 and is left
as it was measured.

## What it also demonstrated

The renderer bundle imports `@opera-incerta/core` for its heading transform.
The portable core therefore runs unchanged inside a browser bundle, which is
the portability invariant of `specification.md` §5.2 exercised rather than asserted.
