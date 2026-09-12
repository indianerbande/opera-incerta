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
 * 2. the packages that are one release move together;
 * 3. a **major** version cannot rise without somebody editing this file —
 *    which is where they are told that a major needs its own round; and
 * 4. the record in `dependencies.md` says what is actually installed.
 *
 * The fourth was added after the first grouped updates were merged. A bot
 * changes manifests and not sentences, and three of those five updates would
 * have left the document naming versions that are not installed — with every
 * check green. A gate that keeps the build from breaking does nothing about a
 * record that quietly stops being true.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// 4. The record must say what is installed.
//
// `dependencies.md` names a version beside nearly every package it describes.
// An automated update changes the manifest and leaves the sentence, and a
// reader has no reason to doubt a sentence. So the two are compared.

const RECORD = 'docs/engineering/dependencies.md';

/**
 * Prose names that are not package names.
 *
 * Deliberately short. Every entry here is a place where the match had to be
 * loosened, and a long list would mean the check is guessing rather than
 * comparing.
 */
const PROSE_ALIASES = new Map([['commonmark.js', 'commonmark']]);

const VERSION_TOKEN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

/** One installed version per package name. */
const installed = new Map();
for (const [name, places] of everywhere) {
  installed.set(name, places[0][1]);
}

/** A word as prose writes it — backticked, bolded, or followed by a comma. */
function clean(word) {
  return word.replace(/^[`*_("']+/u, '').replace(/[`*_,.;:)"']+$/u, '');
}

/** The installed package a word names, or null if it names none. */
function packageNamed(word) {
  const bare = clean(word);
  const named = PROSE_ALIASES.get(bare) ?? PROSE_ALIASES.get(bare.toLowerCase()) ?? bare;
  if (installed.has(named)) {
    return named;
  }
  return installed.has(named.toLowerCase()) ? named.toLowerCase() : null;
}

const recordPath = join(repositoryRoot, RECORD);
const record = readFileSync(recordPath, 'utf8');

record.split('\n').forEach((line, index) => {
  const where = `${RECORD}:${String(index + 1)}`;
  const words = line.split(/\s+/u).map(clean).filter((word) => word.length > 0);
  const versions = [];

  // A version stands beside the package whose name precedes it.
  for (let i = 1; i < words.length; i += 1) {
    if (!VERSION_TOKEN.test(words[i])) {
      continue;
    }
    versions.push(words[i]);
    const name = packageNamed(words[i - 1]);
    if (name !== null && installed.get(name) !== words[i]) {
      failures.push(
        `${where}: the record says ${name} ${words[i]}, ` +
          `installed is ${String(installed.get(name))}`,
      );
    }
  }

  // A heading naming one version and several packages gives it to each.
  if (line.startsWith('### ') && versions.length === 1) {
    for (const [, backticked] of line.matchAll(/`([^`]+)`/gu)) {
      const name = packageNamed(backticked);
      if (name !== null && installed.get(name) !== versions[0]) {
        failures.push(
          `${where}: the heading gives ${name} version ${versions[0]}, ` +
            `installed is ${String(installed.get(name))}`,
        );
      }
    }
  }
});

// Every override the workspace declares must be in the record, key and value
// on one line. An override is a decision about somebody else's dependency;
// unrecorded, it is indistinguishable from an accident.
const workspace = readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
const overridesBlock = /^overrides:\n((?:[ \t].*\n|\n)*)/mu.exec(workspace);
for (const [, key, value] of (overridesBlock?.[1] ?? '').matchAll(
  /^\s+'([^']+)':\s*'([^']+)'$/gmu,
)) {
  const stated = record
    .split('\n')
    .some((line) => line.includes(key) && line.includes(value));
  if (!stated) {
    failures.push(
      `${RECORD}: pnpm-workspace.yaml overrides '${key}' to '${value}', ` +
        'and the record does not say so on any one line',
    );
  }
}

// The runtime inside Electron is the one figure no manifest holds, and it is
// the one that drifted: none of the three releases between 44.0.0 and 44.3.0
// announced a Node.js change, and Node moved two minors anyway. The document
// makes the claim; the installed binary answers it.
const RUNTIME_CLAIM =
  /Electron\s+(\d+\.\d+\.\d+\S*?)\s+bundles\s+Node\s+\*\*([\d.]+)\*\*\s+\(Chrome\s+([\d.]+),\s+V8\s+([0-9A-Za-z.-]+)\)/u;
const claim = RUNTIME_CLAIM.exec(record);
if (claim === null) {
  failures.push(
    `${RECORD}: no sentence of the form "Electron <version> bundles Node ` +
      '**<version>** (Chrome <version>, V8 <version>)". That sentence is what ' +
      'this check compares against the installed binary; without it the ' +
      'runtime is unrecorded.',
  );
} else {
  const [, statedElectron, statedNode, statedChrome, statedV8] = claim;
  try {
    const electronBinary = createRequire(
      pathToFileURL(join(repositoryRoot, 'apps/desktop/package.json')),
    )('electron');
    const reported = JSON.parse(
      execFileSync(electronBinary, ['-p', 'JSON.stringify(process.versions)'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
      }),
    );
    const claimed = {
      electron: statedElectron,
      node: statedNode,
      chrome: statedChrome,
      v8: statedV8,
    };
    for (const [part, said] of Object.entries(claimed)) {
      if (reported[part] !== said) {
        failures.push(
          `${RECORD}: the record says Electron carries ${part} ${said}, ` +
            `the installed binary reports ${String(reported[part])}`,
        );
      }
    }
  } catch (error) {
    failures.push(
      `could not ask the installed Electron what it carries (${String(error)}). ` +
        'The record claims a runtime; something has to answer for it.',
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
    'families aligned, majors as accepted, and the record in dependencies.md ' +
    'naming the versions that are installed — down to the runtime inside Electron',
);
