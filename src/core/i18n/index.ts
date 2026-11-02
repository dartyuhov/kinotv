import ru from './ru.json';
import en from './en.json';

/** Every UI string has a key in ru.json. Adding a key there without adding it to en.json fails the typecheck. */
export type MessageKey = keyof typeof ru;
export type Locale = 'ru' | 'en';

const dictionaries = { ru, en } satisfies Record<Locale, Record<MessageKey, string>>;

let locale: Locale = 'ru';

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
}

/** Looks up a UI string. `{name}` placeholders are filled from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template: string = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * A counted string: the keys `<base>.one`, `.few`, `.many` and `.other` hold the forms (Russian needs all
 * four; English uses one and other, and repeats other for the rest). `{n}` is the count.
 */
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}.one` ? Base : never }[MessageKey];

const pluralRules: Partial<Record<Locale, Intl.PluralRules>> = {};

/** Looks up the form of a counted string for `n`, e.g. tn('title.seasons', 2) → "2 сезона". */
export function tn(base: PluralKey, n: number, params?: Record<string, string | number>): string {
  const rules = (pluralRules[locale] ??= new Intl.PluralRules(locale));
  const form = rules.select(n);
  const key = `${base}.${form}` as MessageKey;
  return t(key in dictionaries[locale] ? key : (`${base}.other` as MessageKey), { n, ...params });
}
