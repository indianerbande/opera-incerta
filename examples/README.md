# Fixture projects

Original projects used by the test suites. Every one is written for this
project; none is adapted from another tool, and none contains real manuscript
content (`TESTING.md` §1.7, §3).

| Project | What it exercises |
| --- | --- |
| `nested-project` | Nested groups, explicit order and display names, categories, front matter, a code fence that must not enter the outline |
| `foreign-front-matter` | Keys from other conventions — nested mappings, sequences, folded blocks, comments — that must survive a load and save byte-for-byte, plus a file with no owned block at all |
| `stale-structure` | An `order` naming a removed item and omitting a present one |
| `broken-metadata` | A malformed project record, unparsable `structure.json`, and all three front matter failure modes |

These directories are read by tests and are never written to. Changing one
changes what the suite proves, so treat them as part of the specification
rather than as sample content.
