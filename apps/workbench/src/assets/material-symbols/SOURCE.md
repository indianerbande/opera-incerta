# Material Symbols asset source

The seven SVG files in this directory are exact, unmodified copies of Google
Material Symbols Outlined at weight 400, 24 px.

- Upstream: <https://github.com/google/material-design-icons>
- Obtained from the published package `@material-symbols/svg-400`, version
  `0.47.0`, which redistributes the upstream SVGs unchanged.
- License: Apache License 2.0. The adjacent `LICENSE` is an unchanged copy of
  the upstream license and is packaged beside this notice.
- Retrieved: 2026-09-02; `settings.svg` on 2026-09-04, from the same package version

| File | Activity bar entry |
| --- | --- |
| `folder_open.svg` | Explorer |
| `account_tree.svg` | Source control |
| `info.svg` | Inspector |
| `toc.svg` | Outline |
| `neurology.svg` | AI assistant |
| `history.svg` | Snapshots |
| `settings.svg` | Settings (the tool entry at the foot of the leading bar) |

They are presentation assets for the local workbench activity bars. They are
decorative: every button carries its own accessible name, so the symbols carry
no information of their own. They never enter a manuscript or an export.

The bytes are pinned in `scripts/check-assets.mjs`; a changed file fails the
check rather than passing unnoticed.
