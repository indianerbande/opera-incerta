/**
 * Which build is running, as the main process knows it. specification.md §16.
 *
 * `tools/write-build-identity.mjs` writes the record beside the bundle when
 * the application is built; this reads it once at start. A record that is
 * missing or not a build identity is not a reason to stop the application —
 * the author would lose a writing session over a line in a dialog — so it
 * becomes an identity that says it is unknown.
 */
import { readFileSync } from 'node:fs';
import { isBuildIdentity, type BuildIdentity } from '@opera-incerta/desktop-contract';

/** The file the build writes, beside `main.cjs`. */
export const BUILD_IDENTITY_FILE = 'build-identity.json';

/** What the renderer is told when the record cannot be read. */
export const UNKNOWN_BUILD: BuildIdentity = { version: null, revision: null };

/** The record's text as a build identity, or the unknown one. */
export function parseBuildIdentity(text: string | null): BuildIdentity {
  if (text === null) {
    return UNKNOWN_BUILD;
  }
  try {
    const value: unknown = JSON.parse(text);
    return isBuildIdentity(value) ? { version: value.version, revision: value.revision } : UNKNOWN_BUILD;
  } catch {
    return UNKNOWN_BUILD;
  }
}

/** Reads the record at `path`. */
export function readBuildIdentity(path: string): BuildIdentity {
  let text: string | null;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    text = null;
  }
  return parseBuildIdentity(text);
}

/**
 * What the native About panel shows (macOS).
 *
 * Without this the panel reads the desktop package's own version, which is
 * `0.0.0` because that package is never published — an About panel that
 * names a version no build ever had. The revision goes where macOS puts the
 * build number, in parentheses after the version.
 */
export function aboutPanelOptions(identity: BuildIdentity): {
  readonly applicationName: string;
  readonly applicationVersion?: string;
  readonly version?: string;
} {
  return {
    applicationName: 'Opera Incerta',
    ...(identity.version === null ? {} : { applicationVersion: identity.version }),
    ...(identity.revision === null ? {} : { version: identity.revision }),
  };
}
