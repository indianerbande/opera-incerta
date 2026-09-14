import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { isBuildIdentity, type BuildIdentity } from '@opera-incerta/desktop-contract';
import { Localization } from '../localization/localization.js';
import { resolveBridge } from '../workspace/bridge.js';
import { buildIdentityText } from './build-identity.js';

/**
 * Which build is running, as one quiet line. specification.md §16.
 *
 * Shown at the foot of the launcher and in the footer of the settings dialog, the two places
 * an author looks when a report asks for it. The text can be selected, so it
 * can be copied into that report rather than retyped.
 *
 * It asks the bridge itself rather than taking an input: the answer is the
 * same for every window and every moment, and both hosts would otherwise have
 * to carry it for this line alone. What comes back is checked like every other
 * answer; a malformed one shows nothing rather than something wrong.
 */
@Component({
  selector: 'wi-build-identity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as line) {
      <span class="line">{{ line }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      color: var(--wi-muted);
      font-size: 11px;
      /* A revision broken across two lines is copied wrongly; it stays whole. */
      white-space: nowrap;
      user-select: text;
    }
  `,
})
export class BuildIdentityComponent {
  readonly #i18n = inject(Localization);
  readonly #identity = signal<BuildIdentity | null>(null);
  protected readonly text = computed(() => buildIdentityText(this.#identity(), this.#i18n));

  constructor() {
    const bridge = resolveBridge();
    if (bridge === null) {
      return;
    }
    bridge.buildIdentity().then(
      (identity) => {
        if (isBuildIdentity(identity)) {
          this.#identity.set(identity);
        }
      },
      () => undefined,
    );
  }
}
