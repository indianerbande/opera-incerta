/**
 * The line that says which build is running. specification.md §16.
 *
 * Kept apart from its component so the wording can be tested without a
 * framework harness, like the other rules of the workbench.
 */
import type { BuildIdentity } from '@opera-incerta/desktop-contract';
import type { Localization } from '../localization/localization.js';

/**
 * The line for an identity, or `null` when there is nothing to show — the
 * development harness has no shell to ask.
 *
 * The revision alone when there is one: it already begins with the tag, so
 * the version beside it would say the same thing twice.
 */
export function buildIdentityText(
  identity: BuildIdentity | null,
  i18n: Pick<Localization, 't'>,
): string | null {
  if (identity === null) {
    return null;
  }
  if (identity.revision !== null) {
    return i18n.t('build.revision', { revision: identity.revision });
  }
  if (identity.version !== null) {
    return i18n.t('build.withoutRevision', { version: identity.version });
  }
  return i18n.t('build.unknown');
}
