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
