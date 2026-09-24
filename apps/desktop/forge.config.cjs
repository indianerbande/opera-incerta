/**
 * Electron Forge configuration. docs/engineering/specification.md §5.1.
 *
 * Packaging is host-native: an artifact built on one operating system is
 * evidence only for that operating system (docs/engineering/conventions.md
 * C-P3). The ZIP maker
 * is the starting point because it needs no platform-specific build tooling;
 * platform-native installers are accepted separately, with their evidence
 * recorded in the platform matrix (docs/en/platforms.md).
 */
const { cp, copyFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const repositoryRoot = resolve(__dirname, '../..');
const { version } = require('../../package.json');

module.exports = {
  outDir: join(repositoryRoot, 'build/packages'),
  packagerConfig: {
    name: 'Opera Incerta',
    appVersion: version,
    win32metadata: { CompanyName: 'Opera Incerta', ProductName: 'Opera Incerta' },
    asar: true,
    // Only production entry points. The renderer and licence are copied by
    // the hook below; no smoke bundle, sources or development dependencies.
    ignore: (path) => path !== '' && ![
      '/package.json', '/dist', '/dist/main.cjs', '/dist/preload.cjs',
      '/dist/build-identity.json',
    ].includes(path.replaceAll('\\', '/')),
  },
  hooks: {
    readPackageJson: async (_config, manifest) => ({ ...manifest, version }),
    packageAfterCopy: async (_config, buildPath) => {
      await cp(join(repositoryRoot, 'build/workbench/browser'), join(buildPath, 'renderer'), {
        recursive: true,
      });
      await copyFile(join(repositoryRoot, 'LICENSE'), join(buildPath, 'LICENSE'));
    },
    postPackage: async (_config, result) => {
      const { verifyPackage } = require('../../scripts/check-packaged-app.cjs');
      for (const output of result.outputPaths) verifyPackage(output, result.platform);
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
    },
  ],
};
