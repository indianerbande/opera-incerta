/** Verify the distribution itself, not just the inputs to Forge. testing.md §2.7. */
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join, resolve, normalize } = require('node:path');
const { createRequire } = require('node:module');

const repositoryRoot = resolve(__dirname, '..');
// Use the archive reader of the installed packager, not another ASAR version.
const desktopRequire = createRequire(join(repositoryRoot, 'apps/desktop/package.json'));
const cliRequire = createRequire(desktopRequire.resolve('@electron-forge/cli/package.json'));
const coreRequire = createRequire(cliRequire.resolve('@electron-forge/core'));
const packagerRequire = createRequire(coreRequire.resolve('@electron/packager'));
const asar = packagerRequire('@electron/asar');

function filesUnder(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    return entry.isDirectory()
      ? filesUnder(join(directory, entry.name), name + '/')
      : [name];
  });
}

function verifyPackage(output, platform = process.platform) {
  const resources = platform === 'darwin'
    ? join(output, 'Opera Incerta.app/Contents/Resources')
    : join(output, 'resources');
  const archive = join(resources, 'app.asar');
  try {
    const entries = asar.listPackage(archive).map((name) => name.replaceAll('\\', '/').replace(/^\//, ''));
    const allowed = new Set(['package.json', 'LICENSE']);
    const compare = (name, source) => {
      allowed.add(name);
      assert(entries.includes(name), `package missing ${name}`);
      assert(asar.extractFile(archive, normalize(name)).equals(readFileSync(source)), `package bytes differ: ${name}`);
    };
    for (const name of ['main.cjs', 'preload.cjs', 'build-identity.json']) {
      compare(`dist/${name}`, join(repositoryRoot, 'apps/desktop/dist', name));
    }
    compare('LICENSE', join(repositoryRoot, 'LICENSE'));
    const renderer = join(repositoryRoot, 'build/workbench/browser');
    assert(filesUnder(renderer).includes('index.html'), 'build missing renderer/index.html');
    for (const name of filesUnder(renderer)) compare(`renderer/${name}`, join(renderer, name));
    const directories = new Set(['dist', 'renderer']);
    for (const name of allowed) {
      const parts = name.split('/');
      while (parts.length > 1) { parts.pop(); directories.add(parts.join('/')); }
    }
    for (const name of entries) {
      assert(allowed.has(name) || directories.has(name), `unexpected packaged file: ${name}`);
    }
    const manifest = JSON.parse(asar.extractFile(archive, 'package.json'));
    const version = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).version;
    assert.equal(manifest.version, version, 'package version differs from workspace');
    assert.equal(manifest.main, 'dist/main.cjs', 'wrong packaged entry point');
    console.log(`packaged application verified: ${platform}, version ${version}, ${allowed.size} files`);
  } finally {
    // Do not reuse headers if an archive is replaced after a failed check.
    asar.uncacheAll();
  }
}

module.exports = { verifyPackage };
if (require.main === module) {
  const output = process.argv[2];
  assert(output, 'Pass the packaged application directory');
  verifyPackage(resolve(output), process.argv[3]);
}
