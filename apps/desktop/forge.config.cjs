/**
 * Electron Forge configuration. SPEC.md §5.1.
 *
 * Packaging is host-native: an artifact built on one operating system is
 * evidence only for that operating system (CONVENTIONS.md C-P3). The ZIP maker
 * is the starting point because it needs no platform-specific build tooling;
 * platform-native installers are accepted separately with PLATFORMS.md.
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
