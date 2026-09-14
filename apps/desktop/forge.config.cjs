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
module.exports = {
  packagerConfig: {
    name: 'Opera Incerta',
    asar: true,
    ignore: [
      /^\/src/,
      /^\/test/,
      /^\/tsconfig.*\.json$/,
      /^\/node_modules/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
    },
  ],
};
