import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_BUILD,
  aboutPanelOptions,
  parseBuildIdentity,
  readBuildIdentity,
} from '../src/build-identity.js';

describe('the build identity record', () => {
  it('reads what the build wrote', () => {
    const record = { version: '0.1.0-beta.1', revision: 'v0.1.0-beta.1-7-g0381bfe' };
    expect(parseBuildIdentity(JSON.stringify(record))).toEqual(record);
    expect(parseBuildIdentity(JSON.stringify({ version: '0.1.0-beta.1', revision: null }))).toEqual({
      version: '0.1.0-beta.1',
      revision: null,
    });
  });

  it('keeps only the two fields it knows', () => {
    const text = JSON.stringify({ version: '0.1.0', revision: 'abc1234', path: '/somewhere' });
    expect(parseBuildIdentity(text)).toEqual({ version: '0.1.0', revision: 'abc1234' });
  });

  it('becomes the unknown build when the record is missing, broken, or something else', () => {
    expect(parseBuildIdentity(null)).toEqual(UNKNOWN_BUILD);
    expect(parseBuildIdentity('{ not json')).toEqual(UNKNOWN_BUILD);
    expect(parseBuildIdentity(JSON.stringify({ version: '0.1.0' }))).toEqual(UNKNOWN_BUILD);
    expect(parseBuildIdentity(JSON.stringify({ version: '0.1.0', revision: 'two words' }))).toEqual(
      UNKNOWN_BUILD,
    );
  });

  it('reads a file, and a file that is not there is the unknown build rather than a failure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'build-identity-'));
    const path = join(directory, 'build-identity.json');
    expect(readBuildIdentity(path)).toEqual(UNKNOWN_BUILD);
    writeFileSync(path, JSON.stringify({ version: '0.1.0', revision: 'v0.1.0' }));
    expect(readBuildIdentity(path)).toEqual({ version: '0.1.0', revision: 'v0.1.0' });
  });
});

describe('the About panel', () => {
  it('names the product, the version, and the revision', () => {
    expect(aboutPanelOptions({ version: '0.1.0-beta.1', revision: 'v0.1.0-beta.1-7-g0381bfe' })).toEqual({
      applicationName: 'Opera Incerta',
      applicationVersion: '0.1.0-beta.1',
      version: 'v0.1.0-beta.1-7-g0381bfe',
    });
  });

  it('leaves out what is not known, so macOS does not show an empty field', () => {
    expect(aboutPanelOptions({ version: '0.1.0-beta.1', revision: null })).toEqual({
      applicationName: 'Opera Incerta',
      applicationVersion: '0.1.0-beta.1',
    });
    expect(aboutPanelOptions(UNKNOWN_BUILD)).toEqual({ applicationName: 'Opera Incerta' });
  });
});
