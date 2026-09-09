# IBM Plex asset source

The eight WOFF2 files in this directory are exact, unmodified copies of IBM
Plex, the interface face of the workbench (`SPEC.md` §8.8).

- Upstream: <https://github.com/IBM/plex>, release `v6.4.2`, commit
  `242c4cccd37e87985a5337815c99b960ef13c65c`.
- License: SIL Open Font License 1.1. The adjacent `LICENSE` is the upstream
  license text, packaged beside this notice; its line endings are LF, because
  this repository normalises them (`.gitattributes`) and the upstream file
  uses CRLF. The wording is untouched. The font files themselves are binary
  and byte-identical to the release — that is what the pinned hashes below
  are for.
- Retrieved: 2026-09-09.

| File | Used for |
| --- | --- |
| `IBMPlexSans-Regular.woff2` | the interface, at 400 |
| `IBMPlexSans-Medium.woff2` | emphasis inside a row or a label, 500 |
| `IBMPlexSans-SemiBold.woff2` | headings and active entries, 600 |
| `IBMPlexSans-Bold.woff2` | the few things that carry weight, 700 |
| `IBMPlexSans-Italic.woff2` | italics in interface prose |
| `IBMPlexMono-Regular.woff2` | what is code rather than prose: paths, diffs, the editor's monospace face |
| `IBMPlexMono-Bold.woff2` | the same, emphasised |
| `IBMPlexMono-Italic.woff2` | the same, italic |

They are packaged rather than taken from the system because an interface that
looks different on every machine cannot be designed (`SPEC.md` §8.8). They are
presentation only: no word an author reads is decided here, and no manuscript
carries them — an exported document is Markdown, and the fonts never leave the
application.

The bytes are pinned in `scripts/check-assets.mjs`; a changed file fails the
check rather than passing unnoticed.

## SHA-256

```text
5788454f0ba4bd6300752c474215c4dd926682fa173ae1c6252d57828b6a235d  IBMPlexMono-Bold.woff2
6afc2a6edd9a1d1f8104daf139a5062392f47da2f97fe19cb18a6a5a1fa67ec3  IBMPlexMono-Italic.woff2
49ce58b41a0e1cb921c0f58d9a5b8b96a2cc21437c7066f3ba4f24873076d131  IBMPlexMono-Regular.woff2
fa7130d854a660b39a7fc9e6e0f2dc23dba5f1346e2adea3e1fe37b6d884133d  IBMPlexSans-Bold.woff2
13284fab1821ba6e3652c1580fcf2bbfd8c9309520c69b3d1224dab40b37c597  IBMPlexSans-Italic.woff2
5660f8a658f8bb50dbc005232f885eadffd2bc1c235c4f6fbb63469d1f9cde6d  IBMPlexSans-Medium.woff2
ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a  IBMPlexSans-Regular.woff2
f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205  IBMPlexSans-SemiBold.woff2
```
