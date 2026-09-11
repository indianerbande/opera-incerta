# Vibe coding with engineering ownership

**English** | [Deutsch](../de/ki-gestuetzte-entwicklung.md)

Status: Project development statement

Date: 2026-09-11

**Opera Incerta was vibe-coded.** Substantial parts of this project were
developed dialogically with an AI coding agent: goals, constraints, and
observations were expressed in natural language; the agent read the
repository, proposed or implemented changes, ran the gates, and refined the
result through feedback.

That statement is not an apology, and it is not a claim that expertise became
unnecessary. It describes a method in which experienced human engineering
direction and AI implementation capacity reinforce each other — and it is said
openly because a reader deserves to know how the software in front of them was
made.

## What is meant by vibe coding here

The term is used in two very different ways. In its strictest form it means
accepting generated code while paying little attention to its implementation.
In its broader professional form it means conversational, AI-assisted
development in which a person still reviews, tests, understands, and owns the
result.

This project uses the second meaning, and rejects the first explicitly. Code
is not accepted because it looks plausible, because it ran once, or because it
arrived quickly. Conversation accelerates implementation; it does not replace
software engineering.

## Why it was worth doing this way

For an experienced developer, this way of working gives concrete leverage:

- **More attention for architecture and intent.** Natural language carries the
  desired behaviour, the boundaries, and the trade-offs, while the mechanical
  implementation is handled elsewhere.
- **Faster executable feedback.** An idea becomes a running candidate early
  enough to be judged by what it does rather than discussed as a possibility.
- **Cheaper exploration.** Several approaches can be tried and thrown away
  before one is accepted. This project's technical spikes are an example: the
  editor and parser spikes measured real candidates against thresholds fixed
  in advance, and their disposable implementations stayed disposable.
- **Less repetitive work.** Scaffolding, straightforward transformations, test
  matrices, adapter implementations, and broad but mechanical refactorings are
  done quickly and then reviewed as one coherent change.
- **Safer large refactoring where evidence already exists.** A strong suite
  gives fast feedback while names and boundaries move. The tests do not prove
  quality on their own, but they make a broad change observable.

## Expertise is the prerequisite, not the thing replaced

Vibe coding multiplies the judgment applied to it. It multiplies poor judgment
just as efficiently as good judgment.

The person directing production work must be able to define the architecture
and its invariants, recognise a solution that merely looks convincing, read
and reject generated code, judge the consequences for security and
maintenance, and know when an automated check is not enough. A beginner can
use this to learn or to prototype. A production project still needs somebody
technically qualified to own every accepted result.

## How this project keeps ownership human

The process is built around that ownership, and it is visible in the
repository rather than asserted here:

1. **The specification is written before the code.** A change that alters
   behaviour updates [`specification.md`](../engineering/specification.md) in
   the same change. If a rule is not there, it does not exist yet.
2. **[`testing.md`](../engineering/testing.md) defines what counts as
   evidence**, per layer, before the evidence is produced.
3. **Every new check is falsified.** The behaviour is deliberately broken, the
   check is watched going red, and it must go red *for the right reason*. This
   is the single most important rule in the project, and it has repeatedly
   found checks that could not fail at all.
4. **Screenshots are looked at.** The desktop gate writes them; a person opens
   them. Several real defects were found this way and by no other means.
5. **A rule that can be a pure function is a pure function**, in a portable
   core with no DOM, no Electron, and no Node APIs — testable without a
   window, and impossible to reimplement differently in a component.
6. **Boundaries are contracts.** The renderer is sandboxed and receives opaque
   handles; every bridge request is validated in the main process at runtime,
   because a compile-time type is not validation.
7. **Dependencies are accepted by capability, licence, runtime impact, offline
   behaviour, and replacement boundary** — never because a version number is
   newer.
8. **Mistakes are written down.**
   [`completed-work.md`](../engineering/completed-work.md) records what each
   round taught, including what went wrong. That is not decoration; it is how
   the same mistake is not made twice.

An agent may implement a large part of a change. It cannot lower any of these
requirements.

## What that actually caught

These are not hypotheticals. Each was found by the process above, in this
repository:

- **A check that could not fail.** A navigation method carried a loop that
  skipped a deleted sheet. It read well and was unreachable: an earlier step
  already removed such entries. The falsification proved it — the test stayed
  green with the code deliberately broken. The loop was removed and the method
  now states why it needs no guard.
- **A character class that ate the digits.** `[ -<>:"/\|?*]` reads as a range
  from space to `<`, which includes every digit. A project called "Book 2 of
  3" would have been offered as "Book of". The test that caught it is now the
  one that names it.
- **The same shape of mistake, one day later**, writing that class into a
  different file — this time putting real control characters into the source.
  The rule became a list of characters plus a code-point test, with a comment
  saying why.
- **Lines ninety-five characters long** in the first exported PDF. No
  assertion would ever have mentioned it. Somebody looked at the page.
- **A menu covering the header it was opened from**, and — worse — having
  nowhere to appear at all when opened from the keyboard. Found in a
  screenshot, fixed by anchoring it to its button.

## What this statement does not claim

- Generated output is not correct because it compiles.
- Automated tests cannot cover every usability, security, packaging, or
  architectural failure. That is precisely why the visual and native checks
  exist, and why the [platform matrix](platforms.md) records what has *not*
  been verified.
- Human accountability, review, and maintenance ownership are not delegated to
  a model.
- Fast implementation is not evidence of production readiness.
- This method is not appropriate for an unchecked change to security-critical,
  safety-critical, or privacy-sensitive behaviour.

The claim is narrower and stronger than "AI wrote it": conversational AI can
be a powerful engineering multiplier when an experienced person controls the
architecture, understands the result, and insists on explicit evidence.

## Where the evidence is

- [Specification](../engineering/specification.md) — what the product must do.
- [Testing](../engineering/testing.md) — what must be true before a claim is
  made.
- [Completed work](../engineering/completed-work.md) — every round with its
  reasoning, its verification, and its lessons.
- [Project status](project-status.md) — what is built and what is not.
