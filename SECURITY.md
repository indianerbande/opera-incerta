# Security policy

**English** | [Deutsch](SECURITY.de.md)

## Supported source

Opera Incerta is beta software. Security corrections are made against the
latest source on `main`; older commits and self-built artifacts receive no
separate maintenance guarantee. There are no publicly distributed signed
binaries yet.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Use GitHub's
private vulnerability-reporting form for this repository:

https://github.com/indianerbande/opera-incerta/security/advisories/new

Include the affected build — the line at the foot of the launcher or in the
settings dialog's footer, or the commit you built from — the operating system,
the steps to reproduce, and the expected impact. Remove manuscript content,
access tokens, personal paths, and other confidential data from the report
unless they are essential to reproducing the problem — and if a manuscript is
essential, reduce it to the smallest text that still shows the behaviour.

The maintainers will acknowledge a usable report, investigate it, and
coordinate disclosure according to severity and available evidence. Because
the project is pre-release, no fixed response or remediation deadline is
promised.

## Where this application's risk actually sits

This is a local tool: it needs no network, no account, and no service, so its
attack surface is the boundary between a sandboxed renderer and a main process
that may touch the disk. Reports are especially useful when they concern:

- **The preload bridge and its guards.** Every request is validated in the
  main process, and the renderer receives opaque handles rather than
  filesystem paths. A way to make the main process act on a path the renderer
  chose is a real finding.
- **Containment.** A path that escapes the open project — through `..`, a
  symlink, an encoded separator, or a handle that was forged or reused.
- **The renderer's own protocol.** The application serves its interface from
  an owned scheme rather than `file://`, precisely so that a relative request
  cannot walk the disk.
- **The export.** An exported document carries the author's text and must not
  be able to execute anything: the parser escapes markup and the document's
  own content security policy allows its style and nothing else. A way past
  either is a finding.
- **Git as a subprocess**, and what can be made to reach its arguments.
- **What a manuscript can do to the application.** A `.md` file is untrusted
  input: front matter, conflict markers, enormous files, and unusual encodings
  belong to an author, not to us.

## What is not a vulnerability here

The application deliberately reads and writes the files in the project
directory you opened — that is its purpose. Equally deliberate: it does not
sandbox the manuscript from you, and a project you open is a project you
trust.
