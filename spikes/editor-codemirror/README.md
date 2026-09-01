# Editor spike — CodeMirror 6

Status: Completed 2026-09-01, all six criteria passed; the component is
accepted in `SPEC.md` §5.4

This spike answers one question: can CodeMirror 6 carry the display model of
`SPEC.md` §10 — paragraph-level heading formatting at different sizes, a gutter
aligned to measured line heights, and inline markers hidden everywhere except
on the cursor's line?

It is **not** production architecture. The integration into `apps/workbench` is
its own round (`TODO.md`); this package exists as the evidence behind the
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

Thresholds were fixed in `TESTING.md` §2.8 before the spike ran
(`CONVENTIONS.md` C-T14).

## What it also demonstrated

The renderer bundle imports `@opera-incerta/core` for its heading transform.
The portable core therefore runs unchanged inside a browser bundle, which is
the portability invariant of `SPEC.md` §5.2 exercised rather than asserted.
