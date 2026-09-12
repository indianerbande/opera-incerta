# Contributing to Opera Incerta

**English** | [Deutsch](CONTRIBUTING.de.md)

Thank you for helping improve Opera Incerta. The project is a public source
beta: the implemented functionality is real and exercised end to end, but
there are no signed installers yet and several specified capabilities are not
built. See [`docs/en/project-status.md`](docs/en/project-status.md) for the
current maturity and the release boundaries.

## Before starting

Open an issue before investing in a broad product, architecture, dependency,
or user-interface change. [`docs/engineering/specification.md`](docs/engineering/specification.md)
defines accepted product behaviour;
[`docs/engineering/testing.md`](docs/engineering/testing.md) defines the
evidence required for a change.

**Specify before building.** This project writes the rule down before it
writes the code: a change that alters behaviour updates the specification in
the same change, never afterwards. If a requirement is not in the
specification, it does not exist yet — decide it, record it, then build it.

Opera Incerta must remain an original program. Describe other writing tools in
terms of general capabilities or limitations. Do not copy their code,
documentation, examples, fixtures, icons, or interface layouts.

## Development setup

Use Node.js 24.15.0 or a newer 24.x release and pnpm 11.24.0. Follow
[`docs/en/build-from-source.md`](docs/en/build-from-source.md) for a clean
checkout and build. Before opening a pull request, run:

```shell
pnpm install --frozen-lockfile
pnpm run check
pnpm run desktop:smoke
git diff --check
```

Changes to the editor's display model also require `pnpm run spike:editor`,
which runs the adapter contract in a real rendering engine. Continuous
integration runs it too, so a pull request that moves CodeMirror cannot go
green without it. Changes to the
visual system require **looking at** the screenshots the desktop check writes
to `build/desktop/` — an assertion cannot tell you that a line ran to
ninety-five characters.

## What counts as evidence

Two rules matter more than the rest, and a pull request that skips them will
be asked to come back:

1. **Every new check must be falsified.** Break the behaviour deliberately,
   watch the check go red, and confirm it went red for the *right reason*.
   A check that cannot fail is worse than none: it tells the next reader the
   case is handled where it is not.
2. **A rule that can be a pure function is a pure function.** It lives in
   `packages/core`, is tested there without a window, and is not reimplemented
   in a component.

## Pull requests

Keep each pull request focused, and explain:

- the user-visible problem or the architectural boundary;
- what the specification says about it, after your change;
- the implementation and its adapter impact;
- the automated evidence, and the falsification of each new check; and
- what you deliberately left undone.

Do not commit generated build output, credentials, private manuscript content,
or local machine paths. Dependency changes must follow the update gate in
[`docs/engineering/dependencies.md`](docs/engineering/dependencies.md); an
automated update pull request is never merged solely because its version
number is newer.

## Working documents

- [`docs/engineering/roadmap.md`](docs/engineering/roadmap.md) holds **open
  work only**. Finished work moves out of it completely.
- [`docs/engineering/completed-work.md`](docs/engineering/completed-work.md)
  records what was built, why it was built that way, how it was verified, and
  what it taught — including the mistakes. That last part is not decoration:
  it is how the project avoids making a mistake twice.

## AI-assisted contributions

AI-assisted contributions are welcome — this project was built that way and
says so openly. The contributor remains responsible for understanding the
submitted code, protecting the architecture and originality boundaries,
reviewing the complete diff, and providing the same evidence as for manually
typed code. See the project's [statement on AI-assisted
development](docs/en/ai-assisted-development.md).

By submitting a contribution for inclusion, you agree that it is licensed
under the repository's Apache License 2.0 according to its contribution terms.
