/**
 * What an automated dependency update must not be able to break.
 * testing.md §2.13.
 *
 * A bot that raises version numbers is useful and is not a colleague: it
 * cannot know that `@angular/core` and `@angular/compiler-cli` are one thing,
 * that TypeScript is pinned by what Angular's compiler accepts, or that a new
 * Electron major moves Chromium and Node underneath the whole application.
 *
 * pnpm catches one of those on its own — an unmet peer range — but only as a
 * **warning** that an install prints and a log swallows. That was verified
 * rather than assumed: installing TypeScript 5.9.2 against an Angular that
 * wants `>=6.0 <6.1` succeeded with a warning. `pnpm peers check` exits
 * non-zero on the same state, which is why the gate runs it.
 *
 * This file covers what remains:
 *
 * 1. every dependency is pinned exactly, in every package;
 * 2. the packages that are one release move together; and
 * 3. a **major** version cannot rise without somebody editing this file —
 *    which is where they are told that a major needs its own round.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The majors this project has accepted, with the round that accepted them.
 *
 * **Raising one of these numbers is not a dependency update.** A major moves
 * an API, a runtime, or both; it needs a round of its own, with the
 * specification read, the gates run, and the result written down. The number
 * lives here so that the bot's pull request fails until a person has been
 * through that — and so that the person is told why.
 */
const ACCEPTED_MAJORS = {
  electron: 44,
  '@angular/core': 22,
  typescript: 6,
  vitest: 4,
};

/** The Angular packages that are one release and must carry one version. */
const ANGULAR_FRAMEWORK = [
  '@angular/common',
  '@angular/compiler',
  '@angular/compiler-cli',
  '@angular/core',
  '@angular/platform-browser',
];

/** Angular's build tooling, which versions on its own but together. */
const ANGULAR_TOOLING = ['@angular/build', '@angular/cli'];

const failures = [];

/** Every package manifest in the workspace, the root included. */
function manifests() {
  const found = [['package.json', readManifest(join(repositoryRoot, 'package.json'))]];
  for (const group of ['apps', 'packages', 'spikes']) {
    const directory = join(repositoryRoot, group);
    if (!existsSync(directory)) {
      continue;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(path)) {
        found.push([`${group}/${entry.name}/package.json`, readManifest(path)]);
      }
    }
  }
  return found;
}

function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every external dependency of a manifest, name to range. */
function externals(manifest) {
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  const external = {};
  for (const [name, range] of Object.entries(all)) {
    if (!String(range).startsWith('workspace:')) {
      external[name] = String(range);
    }
  }
  return external;
}

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

// 1. Everything pinned, everywhere.
//
// A range means the lockfile and the manifest can disagree about what is
// installed, and a reader of the manifest cannot tell what they will get.
const everywhere = new Map();
for (const [where, manifest] of manifests()) {
  for (const [name, range] of Object.entries(externals(manifest))) {
    if (!EXACT.test(range)) {
      failures.push(`${where}: ${name} is "${range}" — every dependency must be pinned exactly`);
      continue;
    }
    const seen = everywhere.get(name) ?? [];
    seen.push([where, range]);
    everywhere.set(name, seen);
  }
}

// The same package at two versions in one workspace is a trap: which one a
// build resolves depends on where it is built from.
for (const [name, places] of everywhere) {
  const versions = [...new Set(places.map(([, range]) => range))];
  if (versions.length > 1) {
    const detail = places.map(([where, range]) => `${where} → ${range}`).join(', ');
    failures.push(`${name} is at ${versions.length} versions in one workspace: ${detail}`);
  }
}

// 2. The families that must move together.
function oneVersion(family, label) {
  const found = new Map();
  for (const name of family) {
    const places = everywhere.get(name);
    if (places !== undefined) {
      found.set(name, places[0][1]);
    }
  }
  const versions = [...new Set(found.values())];
  if (versions.length > 1) {
    const detail = [...found].map(([name, version]) => `${name}@${version}`).join(', ');
    failures.push(
      `${label} must move as one release, found ${versions.length} versions: ${detail}`,
    );
  }
}

oneVersion(ANGULAR_FRAMEWORK, 'the Angular framework packages');
oneVersion(ANGULAR_TOOLING, 'the Angular build tooling');

// 3. The major bolt.
for (const [name, accepted] of Object.entries(ACCEPTED_MAJORS)) {
  const places = everywhere.get(name);
  if (places === undefined) {
    failures.push(
      `${name} is named in ACCEPTED_MAJORS but is no longer a dependency — remove it from the list`,
    );
    continue;
  }
  const major = Number(places[0][1].split('.')[0]);
  if (major !== accepted) {
    failures.push(
      `${name} is at major ${String(major)}, accepted is ${String(accepted)}. ` +
        'A major version is not a dependency update: it moves an API or a runtime, ' +
        'and it needs a round of its own with the specification read and the gates run. ' +
        'When that round happens, change the number in scripts/check-dependencies.mjs.',
    );
  }
}

if (failures.length > 0) {
  console.error('dependency check failed:');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  `dependency check passed: ${String(everywhere.size)} external dependencies, all pinned exactly, ` +
    'families aligned, majors as accepted',
);
