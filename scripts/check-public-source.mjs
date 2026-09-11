/**
 * What must never leave this machine. TESTING §2.12.
 *
 * The repository is about to be public. A key, a token, or somebody's home
 * directory in a committed file is not a mistake that can be taken back: it
 * is in the history from the moment it is pushed, and rotating a leaked
 * credential is the only real remedy.
 *
 * So this runs in `pnpm run check`, before every commit rather than before
 * the first publication — a check that only runs on release day protects the
 * one day it runs.
 *
 * It deliberately looks for **shapes**, not for a list of our own secrets:
 * a list would have to contain them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { dirname } from 'node:path';
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

/** Files this reads. Anything else is skipped rather than guessed at. */
const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);

/** A file that should not be in a repository at all, by its name. */
const forbiddenNames = [
  /(^|\/)\.env(?:\.(?!example$).+)?$/u,
  /(^|\/)(?:credentials?|secrets?)(?:\.|$)/iu,
  /(^|\/)id_(?:ed25519|rsa)$/u,
  /\.(?:jks|key|keystore|p12|pem|pfx)$/iu,
];

/**
 * Shapes that are a credential wherever they appear.
 *
 * Each pattern is written so that this file does not itself contain an
 * example that would trip it.
 */
const forbiddenContent = [
  ['a private key block', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u],
  ['a GitHub token', /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/u],
  ['an AWS access key id', /AKIA[0-9A-Z]{16}/u],
  ['a Google API key', /AIza[0-9A-Za-z_-]{30,}/u],
  ['an Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/u],
  ['an OpenAI API key', /sk-[A-Za-z0-9]{32,}/u],
  ['a Slack token', /xox[abprs]-[A-Za-z0-9-]{10,}/u],
];

/**
 * A home directory that is not a placeholder.
 *
 * Documentation legitimately shows `~/` and `/Users/you`; what must not ship
 * is the author's actual account name, which would say more about the machine
 * this was built on than anybody needs to know.
 */
const HOME_DIRECTORY = /(?:\/Users\/|\/home\/|C:\\Users\\)([A-Za-z0-9._-]+)/gu;
const PLACEHOLDER_NAMES = new Set([
  // The name the tests and the documentation use for a person who is not
  // anybody. Keeping it in one list is what lets the check stay strict.
  'someone',
  'you',
  'user',
  'username',
  'name',
  'your-name',
  'runner',
  'root',
  'me',
  'author',
]);

const failures = [];

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      found.push(...walk(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

for (const file of walk(repositoryRoot)) {
  const shown = relative(repositoryRoot, file).split('\\').join('/');

  for (const pattern of forbiddenNames) {
    if (pattern.test(`/${shown}`)) {
      failures.push(`${shown}: a file of this kind must not be in the repository`);
    }
  }

  if (!textExtensions.has(extname(file))) {
    continue;
  }
  // A very large text file is data, not source; reading it whole would make
  // this check slow for no gain.
  if (statSync(file).size > 2 * 1024 * 1024) {
    continue;
  }

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const [what, pattern] of forbiddenContent) {
    if (pattern.test(text)) {
      failures.push(`${shown}: looks like it contains ${what}`);
    }
  }

  // This file holds the patterns themselves, so it is not its own subject.
  if (shown === 'scripts/check-public-source.mjs') {
    continue;
  }

  for (const match of text.matchAll(HOME_DIRECTORY)) {
    const name = match[1];
    if (!PLACEHOLDER_NAMES.has(name.toLowerCase())) {
      failures.push(`${shown}: contains a real home directory (${match[0]})`);
      break;
    }
  }
}

/** The licence must be present and must be the one the project claims. */
const licence = join(repositoryRoot, 'LICENSE');
if (!existsSync(licence)) {
  failures.push('LICENSE: missing');
} else if (!readFileSync(licence, 'utf8').includes('Apache License')) {
  failures.push('LICENSE: is not the Apache License the project claims');
}

for (const required of ['README.md', 'README.de.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
  if (!existsSync(join(repositoryRoot, required))) {
    failures.push(`${required}: missing, and a public repository needs it`);
  }
}

if (failures.length > 0) {
  console.error('public source check failed:');
  for (const failure of [...new Set(failures)]) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  'public source check passed: no credential shapes, no private paths, licence and public files present',
);
