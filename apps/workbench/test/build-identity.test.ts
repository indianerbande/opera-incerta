import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '@opera-incerta/localization';
import { buildIdentityText } from '../src/app/shell/build-identity.js';

const english = { t: (key: MessageKey, params?: Record<string, string | number>) => translate('en', key, params) };
const german = { t: (key: MessageKey, params?: Record<string, string | number>) => translate('de', key, params) };

describe('the build identity line (specification.md §16)', () => {
  it('shows the revision, which already begins with the tag', () => {
    expect(buildIdentityText({ version: '0.1.0-beta.1', revision: 'v0.1.0-beta.1-7-g0381bfe' }, english)).toBe(
      'Build v0.1.0-beta.1-7-g0381bfe',
    );
    expect(buildIdentityText({ version: '0.1.0-beta.1', revision: 'v0.1.0-beta.1-7-g0381bfe' }, german)).toBe(
      'Build v0.1.0-beta.1-7-g0381bfe',
    );
  });

  it('says so when the build was made outside a Git checkout', () => {
    expect(buildIdentityText({ version: '0.1.0-beta.1', revision: null }, english)).toBe(
      'Version 0.1.0-beta.1, built outside a Git checkout',
    );
    expect(buildIdentityText({ version: '0.1.0-beta.1', revision: null }, german)).toBe(
      'Version 0.1.0-beta.1, außerhalb eines Git-Checkouts gebaut',
    );
  });

  it('says it does not know rather than showing nothing when the record was unreadable', () => {
    expect(buildIdentityText({ version: null, revision: null }, english)).toBe('Build unknown');
  });

  it('shows nothing without a shell to ask', () => {
    expect(buildIdentityText(null, english)).toBeNull();
  });
});
