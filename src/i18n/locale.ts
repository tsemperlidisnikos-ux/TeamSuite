export const APP_LOCALES = ['el'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function normalizeAppLocale(_value?: unknown): AppLocale {
  return 'el';
}

export function localeBcp47(_locale?: AppLocale): string {
  return 'el-GR';
}
