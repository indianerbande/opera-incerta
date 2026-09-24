/**
 * The documentation gate. TESTING §2.12.
 *
 * Three things a reader would otherwise discover for us:
 *
 * 1. **Every relative link resolves.** A moved document is not a small
 *    mistake — it is the reader's dead end, and there are now hundreds of
 *    links between the engineering documents, the source comments and the
 *    public guides.
 * 2. **Every translated document has its pair**, and neither side is a stub.
 *    A German page that quietly stopped being maintained is worse than none.
 * 3. **Every language pair links to the other**, so a reader can switch
 *    without going back to the repository root.
 *
 * It runs in `pnpm run check`, which is what keeps it true rather than
 * aspirational.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.angular',
  '.claude',
  '.git',
  '.pnpm-store',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

/**
 * The documents that exist in both languages, English first.
 *
 * The engineering documents are deliberately **not** here: they are the
 * single authoritative sources and are maintained in English only, so a
 * product contract cannot diverge between translations.
 */
const languagePairs = [
  ['README.md', 'README.de.md'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.de.md'],
  ['SECURITY.md', 'SECURITY.de.md'],
  ['docs/en/README.md', 'docs/de/README.md'],
  ['docs/en/user-guide.md', 'docs/de/user-guide.md'],
  ['docs/en/project-status.md', 'docs/de/project-status.md'],
  ['docs/en/build-from-source.md', 'docs/de/build-from-source.md'],
  ['docs/en/platforms.md', 'docs/de/platforms.md'],
  ['docs/en/ai-assisted-development.md', 'docs/de/ki-gestuetzte-entwicklung.md'],
  ['docs/en/releases/0.1.0-beta.1.md', 'docs/de/releases/0.1.0-beta.1.md'],
];

/** A translated page that is this short was started and then abandoned. */
const MINIMUM_TRANSLATION_LINES = 12;

const failures = [];

function fail(where, message) {
  failures.push(`${where}: ${message}`);
}

/** Every Markdown file in the repository, excluding build output and vendors. */
function markdownFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      found.push(...markdownFiles(join(directory, entry.name)));
    } else if (extname(entry.name) === '.md') {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

/**
 * Markdown outside code, so that an example is not read as a claim.
 *
 * `[text](url)` inside a fenced block is documentation *of* Markdown — the
 * specification shows exactly that — and following it would be a fabricated
 * failure.
 */
function prose(text) {
  return text.replace(/```[\s\S]*?```/gu, '').replace(/`[^`\n]*`/gu, '');
}

/**
 * Links a reader can follow, with the anchors and the external ones left out.
 *
 * An external link is not checked: reaching the network is exactly what this
 * repository does not do, in its tests least of all.
 */
function relativeLinks(text) {
  const links = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const target = match[1];
    if (
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:') ||
      target.startsWith('#')
    ) {
      continue;
    }
    links.push(target);
  }
  return links;
}

for (const file of markdownFiles(repositoryRoot)) {
  const shown = relative(repositoryRoot, file);
  const text = readFileSync(file, 'utf8');
  for (const link of relativeLinks(prose(text))) {
    const withoutAnchor = link.split('#')[0];
    if (withoutAnchor === '') {
      continue;
    }
    const target = resolve(dirname(file), decodeURIComponent(withoutAnchor));
    if (!existsSync(target)) {
      fail(shown, `link to ${link} resolves to nothing`);
    }
  }
}

for (const [english, german] of languagePairs) {
  for (const [label, path] of [
    ['English', english],
    ['German', german],
  ]) {
    const full = join(repositoryRoot, path);
    if (!existsSync(full)) {
      fail(path, `${label} document of a translated pair is missing`);
      continue;
    }
    const lines = readFileSync(full, 'utf8').split('\n').length;
    if (lines < MINIMUM_TRANSLATION_LINES) {
      fail(path, `only ${lines} lines — a translated page this short is a stub`);
    }
  }

  // Each side must offer the way to the other, in the reader's own line of
  // sight rather than back through the repository root.
  const pairs = [
    [english, german],
    [german, english],
  ];
  for (const [from, to] of pairs) {
    const full = join(repositoryRoot, from);
    if (!existsSync(full)) {
      continue;
    }
    const text = readFileSync(full, 'utf8');
    const expected = relative(dirname(join(repositoryRoot, from)), join(repositoryRoot, to))
      .split(sep).join('/');
    if (!text.includes(`(${expected})`)) {
      fail(from, `does not link to its translation at ${expected}`);
    }
  }
}

/** The engineering documents are one directory and are reachable from it. */
const engineering = join(repositoryRoot, 'docs', 'engineering');
assert.ok(statSync(engineering).isDirectory(), 'docs/engineering must exist');
const engineeringIndex = readFileSync(join(engineering, 'README.md'), 'utf8');
for (const entry of readdirSync(engineering)) {
  if (entry === 'README.md' || extname(entry) !== '.md') {
    continue;
  }
  if (!engineeringIndex.includes(`(${entry})`)) {
    fail('docs/engineering/README.md', `does not list ${entry}`);
  }
}

if (failures.length > 0) {
  console.error('documentation check failed:');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  `documentation check passed: every relative link resolves, ${String(languagePairs.length)} language pairs present and cross-linked`,
);
