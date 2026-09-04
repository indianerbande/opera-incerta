import { computed, type Signal } from '@angular/core';
import {
  plural,
  resolveLanguage,
  translate,
  type Language,
  type LanguageChoice,
  type MessageKey,
  type MessageParams,
  type PluralKey,
} from '@opera-incerta/localization';

/**
 * The one localization service. SPEC.md §14, §13.
 *
 * Owns nothing but the resolved language: the catalogues and the rules live
 * in `@opera-incerta/localization`, the choice lives in the preference record.
 * Components inject this and call `t` for a message and `n` for a count;
 * both read the language signal, so a change of language re-renders every
 * OnPush template that shows interface text, without a restart.
 *
 * Interface text and user data stay apart in the type: `t` takes a
 * `MessageKey`, never a string, so a category name or a sheet title cannot be
 * handed to it by accident (§14.2, `CONVENTIONS.md` C-N4).
 */
export class Localization {
  readonly language: Signal<Language>;

  constructor(choice: Signal<LanguageChoice>, systemTag: string) {
    this.language = computed(() => resolveLanguage(choice(), systemTag));
  }

  /** The message for a key in the current language. */
  t(key: MessageKey, params?: MessageParams): string {
    return translate(this.language(), key, params);
  }

  /** The message for a count, by the platform's plural rules. */
  n(key: PluralKey, count: number, params?: MessageParams): string {
    return plural(this.language(), key, count, params);
  }
}

/** The system's language tag as the renderer sees it; English without a DOM. */
export function systemLanguageTag(): string {
  return typeof navigator === 'undefined' ? 'en' : navigator.language;
}
