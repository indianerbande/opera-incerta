/**
 * Production boundary check for the desktop application.
 *
 * The unit tests assert the security boundary in the **source**. This checks
 * the **built artifacts** that actually ship, because a boundary that survives
 * review but not the build protects nothing (TESTING.md §2.7).
 *
 * Run after `pnpm run desktop:build`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function read(relativePath) {
  const absolute = join(repositoryRoot, relativePath);
  if (!existsSync(absolute)) {
    failures.push(`missing build artifact: ${relativePath} — run "pnpm run desktop:build"`);
    return null;
  }
  return readFileSync(absolute, 'utf8');
}

// --- pinned dependencies ------------------------------------------------
const desktopManifest = JSON.parse(read('apps/desktop/package.json') ?? '{}');
const pinned = { ...desktopManifest.dependencies, ...desktopManifest.devDependencies };

for (const [name, range] of Object.entries(pinned)) {
  if (range.startsWith('workspace:')) {
    continue;
  }
  check(
    /^\d+\.\d+\.\d+/.test(range),
    `dependency ${name} must be pinned exactly, found "${range}"`,
  );
}
check(pinned.electron !== undefined, 'the desktop application must depend on electron');

// --- main process -------------------------------------------------------
const main = read('apps/desktop/dist/main.cjs');
if (main !== null) {
  const required = [
    'contextIsolation: true',
    'sandbox: true',
    'nodeIntegration: false',
    'webviewTag: false',
    'setWindowOpenHandler',
    'will-navigate',
    'will-attach-webview',
    'setPermissionRequestHandler',
    'registerSchemesAsPrivileged',
  ];
  for (const needle of required) {
    check(main.includes(needle), `built main process is missing: ${needle}`);
  }

  const forbidden = [
    /nodeIntegration:\s*true/,
    /contextIsolation:\s*false/,
    /sandbox:\s*false/,
    /webSecurity:\s*false/,
    /allowRunningInsecureContent:\s*true/,
  ];
  for (const pattern of forbidden) {
    check(!pattern.test(main), `built main process enables a privileged option: ${pattern}`);
  }

  check(
    !/loadFile\(/.test(main),
    'built main process uses loadFile; the renderer must be served through the owned protocol',
  );

  // The smoke is bundled to `dist/smoke.cjs`, separately. Nothing of it may
  // reach the production bundle: no harness, no fixture path, no driving of
  // the renderer from the main process.
  for (const needle of ['executeJavaScript', 'smoke-project', 'smoke ok', 'sendInputEvent']) {
    check(!main.includes(needle), `built main process carries smoke code: ${needle}`);
  }
}

// --- smoke bundle ---------------------------------------------------------
const smoke = read('apps/desktop/dist/smoke.cjs');
if (smoke !== null) {
  // The smoke starts the same shell with the same window options; a smoke
  // that loosened them would test a different application.
  for (const needle of ['contextIsolation: true', 'sandbox: true', 'nodeIntegration: false']) {
    check(smoke.includes(needle), `built smoke bundle is missing: ${needle}`);
  }
}

// --- preload ------------------------------------------------------------
const preload = read('apps/desktop/dist/preload.cjs');
if (preload !== null) {
  const exposeCalls = preload.match(/exposeInMainWorld/g) ?? [];
  check(
    exposeCalls.length === 1,
    `preload must expose exactly one global, found ${exposeCalls.length}`,
  );
  check(
    !/exposeInMainWorld\([^,]+,\s*ipcRenderer\s*\)/.test(preload),
    'preload must not hand the renderer the raw IPC object',
  );

  const contract = read('packages/desktop-contract/dist/index.js') ?? '';
  const declared = [...contract.matchAll(/'(opera-incerta:[^']+)'/g)].map((match) => match[1]);
  const used = [...preload.matchAll(/"(opera-incerta:[^"]+)"|'(opera-incerta:[^']+)'/g)].map(
    (match) => match[1] ?? match[2],
  );
  check(declared.length > 0, 'no channels found in the built contract');
  for (const channel of used) {
    check(
      declared.includes(channel),
      `preload reaches a channel the contract does not declare: ${channel}`,
    );
  }
}

// --- renderer artifact --------------------------------------------------
const indexHtml = read('build/workbench/browser/index.html');

// The parser's command-line dependency (PSF-2.0, DEPENDENCIES.md) must never
// reach the renderer: it is not imported, and this makes sure it stays so.
const browserDirectory = join(repositoryRoot, 'build/workbench/browser');
for (const name of readdirSync(browserDirectory).filter((file) => file.endsWith('.js'))) {
  check(
    !readFileSync(join(browserDirectory, name), 'utf8').includes('argparse'),
    `the built renderer carries argparse (${name}); the parser's CLI dependency is not for the bundle`,
  );
}
if (indexHtml !== null) {
  check(
    indexHtml.includes('Content-Security-Policy'),
    'the built renderer document must carry a content-security policy',
  );
  check(
    /default-src\s+'self'/.test(indexHtml),
    "the renderer content-security policy must default to 'self'",
  );
  check(
    !/unsafe-eval/.test(indexHtml),
    'the renderer content-security policy must not allow unsafe-eval',
  );
}

// --- packaged assets ----------------------------------------------------
for (const icon of [
  'account_tree.svg',
  'folder_open.svg',
  'history.svg',
  'info.svg',
  'neurology.svg',
  'toc.svg',
]) {
  check(
    existsSync(join(repositoryRoot, 'build/workbench/browser/icons', icon)),
    `the built renderer is missing its icon: ${icon}`,
  );
}
for (const notice of ['LICENSE', 'SOURCE.md']) {
  check(
    existsSync(join(repositoryRoot, 'build/workbench/browser/third-party/material-symbols', notice)),
    `the built renderer ships icons without their ${notice}`,
  );
}

// --- report -------------------------------------------------------------
if (failures.length > 0) {
  console.error('desktop production check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log('desktop production check passed');
