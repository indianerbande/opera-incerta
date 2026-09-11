/**
 * The interface catalogues and the rules that read them. specification.md §14.
 *
 * A separate package, portable like the core, because two processes need the
 * same words: the renderer for the workbench and the launcher, the main
 * process for the native menu. The core itself stays text-free (§14.3); this
 * is the one place interface text lives.
 *
 * Keys are symbolic and stable — `panel.outline.title`, never the English
 * sentence — so polishing a wording does not create a new key. Every key is
 * typed from the English catalogue, and the German one is typed against it,
 * so a key missing in one language is a compile error rather than a silent
 * fallback at run time. The fallback still exists, for a key that arrives as
 * a string, and is therefore tested.
 */
import { EN } from './catalogue-en.js';
import { DE } from './catalogue-de.js';

export type Language = 'en' | 'de';

/** What the preference stores: a language, or "whatever the system says". */
export type LanguageChoice = 'system' | Language;

export const LANGUAGES: readonly Language[] = ['en', 'de'];

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = ['system', 'en', 'de'];

/** Every key of the interface, from the base catalogue. */
export type MessageKey = keyof typeof EN;

/** The base of a plural family: `inspector.words` for `.one` and `.other`. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.other` ? Base : never;
}[MessageKey];

export type Catalogue = Readonly<Record<MessageKey, string>>;

export const CATALOGUES: Readonly<Record<Language, Catalogue>> = { en: EN, de: DE };

export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Resolves the stored choice against the system's language tag. A tag this
 * application has no catalogue for falls back to English, the base language.
 */
export function resolveLanguage(choice: LanguageChoice, systemTag: string): Language {
  if (choice !== 'system') {
    return choice;
  }
  const primary = systemTag.toLowerCase().split(/[-_]/u)[0] ?? '';
  return (LANGUAGES as readonly string[]).includes(primary) ? (primary as Language) : 'en';
}

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return typeof value === 'string' && (LANGUAGE_CHOICES as readonly string[]).includes(value);
}

/**
 * The message for a key, with `{name}` placeholders filled in.
 *
 * A key the catalogue does not have comes back as the key itself: visible,
 * ugly, and not an exception in the middle of rendering. The type keeps that
 * from happening from source; the test keeps it from happening from a
 * catalogue that lost a line.
 */
export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  const message = CATALOGUES[language][key] ?? EN[key] ?? key;
  return interpolate(message, params);
}

/**
 * The message for a count, chosen by the platform's plural rules — never by a
 * hand-written `count === 1` (specification.md §14.1). English and German have `one`
 * and `other`; a catalogue for a language with more forms adds the keys, and
 * a missing form falls back to `other`.
 */
export function plural(
  language: Language,
  key: PluralKey,
  count: number,
  params?: MessageParams,
): string {
  const category = new Intl.PluralRules(language).select(count);
  const catalogue = CATALOGUES[language] as Readonly<Record<string, string>>;
  const message = catalogue[`${key}.${category}`] ?? catalogue[`${key}.other`] ?? key;
  return interpolate(message, { count, ...params });
}

function interpolate(message: string, params: MessageParams | undefined): string {
  if (params === undefined) {
    return message;
  }
  return message.replace(/\{(\w+)\}/gu, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export { EN, DE };
