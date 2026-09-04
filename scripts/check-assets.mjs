/**
 * Pins the packaged visual assets.
 *
 * An asset is a dependency (`CONVENTIONS.md` C-L4): its origin, its licence,
 * and its bytes are part of what ships. A silently replaced icon would be an
 * undocumented third-party file in the application, so the bytes are checked
 * rather than trusted, and the licence and notice must be present beside them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDirectory = join(repositoryRoot, 'apps/workbench/src/assets/material-symbols');
const failures = [];

/** Material Symbols Outlined 400, from @material-symbols/svg-400 0.47.0. */
const PINNED = {
  'account_tree.svg': 'dda634a09d08ac089ecfd533d24a6203ba66160421fc14b3cd80cc8354dcf5fa',
  'folder_open.svg': '6c14eab9472ba95361d3f11e7c5f9c6b927af17aaa1a0129caac57821a60af03',
  'history.svg': 'da9d54de7bb88c58d3db5369cdd30e70854e7a6f7c89757cfb5cae357d911e67',
  'info.svg': '5e398f5f1271d1112fa68c7775a8408cbb974d1d83bc0bd120c1cc1cc319fcdb',
  'neurology.svg': '437e7788f570e366a7ab0e77be125d68471cced5cf54737a01051188bb0d7d93',
  'settings.svg': 'f3a6366b98528acfbd05ea67f4c0ee2e7d33c0fc278fdc885d5f95c431e3c2bb',
  'toc.svg': '067e4f3c6dd2e65f716210b25523ebce30bf407cf9b4c0ffe65c42910a7c8fc9',
};

for (const [name, expected] of Object.entries(PINNED)) {
  const path = join(iconDirectory, name);
  if (!existsSync(path)) {
    failures.push(`missing icon: ${name}`);
    continue;
  }
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== expected) {
    failures.push(`icon changed: ${name}\n      expected ${expected}\n      found    ${actual}`);
  }
}

for (const required of ['LICENSE', 'SOURCE.md']) {
  if (!existsSync(join(iconDirectory, required))) {
    failures.push(`icons ship without their ${required}`);
  }
}

// An SVG that reaches out or executes is not a decorative asset.
for (const name of Object.keys(PINNED)) {
  const path = join(iconDirectory, name);
  if (!existsSync(path)) {
    continue;
  }
  const contents = readFileSync(path, 'utf8');
  for (const forbidden of ['<script', 'href', 'xlink', 'onload', 'data:']) {
    if (contents.includes(forbidden)) {
      failures.push(`icon ${name} contains "${forbidden}"; assets must be inert`);
    }
  }
}

const licence = existsSync(join(iconDirectory, 'LICENSE'))
  ? readFileSync(join(iconDirectory, 'LICENSE'), 'utf8')
  : '';
if (!licence.includes('Apache License')) {
  failures.push('the packaged icon licence is not the Apache License');
}

if (failures.length > 0) {
  console.error('asset check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log(`asset check passed: ${Object.keys(PINNED).length} pinned icons with licence and notice`);
