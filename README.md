# Opera Incerta

**A local desktop tool for collecting and writing texts — and for growing a
structured book manuscript out of them.**

Opera Incerta is deliberately more than a Markdown editor: it accompanies the
whole path from a first collected thought to a finished manuscript, and every
display and editing decision is measured against **overview** and **practical
operability**.

## Guiding ideas

- **The author's files belong to the author.** Texts are real Markdown files
  (`.md`, UTF-8) on the filesystem. One text is one file. No database, no
  proprietary container.
- **Metadata stays with its content.** Title, topic, keywords, status, category,
  and notes live in the YAML front matter of the same file.
- **The folder structure *is* the library.** Groups are directories, sheets are
  files.
- **Standard Markdown on disk, comfortable presentation in the editor.**
  Headings appear as sizes, not as `#`; the file stays standard-conformant.
- **Saving never discards anything.** Front matter written by other tools
  survives a load/save round trip byte-for-byte.
- **Extensible through modules.** Export, import, and AI actions are separate
  packages behind declared interfaces.

## Project status

Early scaffold. The specification documents are written; the workspace builds,
tests, and launches; the product itself is not implemented yet. See
[`TODO.md`](TODO.md) for what is open and [`DONE.md`](DONE.md) for what exists.

## Development quick start

Requires Node.js 24.15.0 or newer within a supported line, and pnpm 11.24.0.

```bash
pnpm install
```

```bash
pnpm run check
```

```bash
pnpm run desktop:smoke
```

```bash
pnpm run desktop:start
```

`check` builds every package, type-checks test code, and runs all suites.
`desktop:smoke` launches the shell through its smoke entry and drives the real
renderer end to end; `apps/desktop/src/smoke/README.md` explains it.
`desktop:start` opens the application window.

The Electron runtime is fetched by the root `postinstall` script, which runs the
`install-electron` command of the installed package: the published package has
no install script of its own, so no pnpm build setting makes it arrive. The
command is idempotent and skips when `dist/` already holds the right version.
An install with `--ignore-scripts` leaves the runtime out; run
`pnpm --filter @opera-incerta/desktop exec install-electron` afterwards.

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/core` | Portable domain rules. No DOM, no Electron, no Node.js APIs. |
| `packages/desktop-contract` | The versioned main-process/renderer bridge and its runtime guards. |
| `packages/localization` | The English and German catalogues and the rules that read them; used by the renderer and the native menu. |
| `packages/markdown` | The block structure of a document, read with markdown-it and translated into the core's own types. |
| `packages/project-node` | Project and library adapter — owns filesystem access. |
| `packages/git-node` | Source-control adapter over the system `git`. |
| `apps/workbench` | Angular renderer: the workbench UI. |
| `apps/desktop` | Electron shell: lifecycle, windows, dialogs, packaging. |
| `examples/` | Original fixture projects. |

## Documentation

- [SPEC.md](SPEC.md) — normative product behavior and architectural boundaries
- [TESTING.md](TESTING.md) — the evidence required to claim that behavior works
- [AGENTS.md](AGENTS.md) — working process, invariants, and definition of done
- [CONVENTIONS.md](CONVENTIONS.md) — the design and handling measures this
  project works by
- [DEPENDENCIES.md](DEPENDENCIES.md) — dependency purpose, licensing, and
  replacement boundaries
- [TODO.md](TODO.md) — open work only
- [DONE.md](DONE.md) — completed work, with reasoning and lessons

## License

Opera Incerta is licensed under the [Apache License 2.0](LICENSE). Third-party
dependencies retain their own licenses, documented in
[DEPENDENCIES.md](DEPENDENCIES.md).
