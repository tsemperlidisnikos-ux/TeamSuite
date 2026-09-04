import type { AppLocale } from './locale';

export function resolveClubLocale(): AppLocale {
  return 'el';
}

export function translate(text: string, _locale?: AppLocale): string {
  return text;
}

export function t(text: string): string {
  return text;
}
