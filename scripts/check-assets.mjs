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
  'search.svg': '16f9192bb2593c0069b8e7df1d0e36be632035949a20fa4db5530de1d4f8fefb',
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

/**
 * The interface face of SPEC.md §8.8, from IBM Plex v6.4.2. Same rule as the
 * icons: the bytes ship, so the bytes are checked.
 */
const fontDirectory = join(repositoryRoot, 'apps/workbench/src/assets/ibm-plex');
const PINNED_FONTS = {
  'IBMPlexMono-Bold.woff2': '5788454f0ba4bd6300752c474215c4dd926682fa173ae1c6252d57828b6a235d',
  'IBMPlexMono-Italic.woff2': '6afc2a6edd9a1d1f8104daf139a5062392f47da2f97fe19cb18a6a5a1fa67ec3',
  'IBMPlexMono-Regular.woff2': '49ce58b41a0e1cb921c0f58d9a5b8b96a2cc21437c7066f3ba4f24873076d131',
  'IBMPlexSans-Bold.woff2': 'fa7130d854a660b39a7fc9e6e0f2dc23dba5f1346e2adea3e1fe37b6d884133d',
  'IBMPlexSans-Italic.woff2': '13284fab1821ba6e3652c1580fcf2bbfd8c9309520c69b3d1224dab40b37c597',
  'IBMPlexSans-Medium.woff2': '5660f8a658f8bb50dbc005232f885eadffd2bc1c235c4f6fbb63469d1f9cde6d',
  'IBMPlexSans-Regular.woff2': 'ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a',
  'IBMPlexSans-SemiBold.woff2': 'f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205',
};

for (const [name, expected] of Object.entries(PINNED_FONTS)) {
  const path = join(fontDirectory, name);
  if (!existsSync(path)) {
    failures.push(`missing font: ${name}`);
    continue;
  }
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== expected) {
    failures.push(`font changed: ${name}\n      expected ${expected}\n      found    ${actual}`);
  }
}

for (const required of ['LICENSE', 'SOURCE.md']) {
  if (!existsSync(join(fontDirectory, required))) {
    failures.push(`fonts ship without their ${required}`);
  }
}

const fontLicence = existsSync(join(fontDirectory, 'LICENSE'))
  ? readFileSync(join(fontDirectory, 'LICENSE'), 'utf8')
  : '';
if (!fontLicence.includes('SIL OPEN FONT LICENSE')) {
  failures.push('the packaged font licence is not the SIL Open Font License');
}

if (failures.length > 0) {
  console.error('asset check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log(
  `asset check passed: ${Object.keys(PINNED).length} pinned icons and ` +
    `${Object.keys(PINNED_FONTS).length} pinned fonts, with licence and notice`,
);
