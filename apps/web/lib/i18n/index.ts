export { default as en } from './en';
export { default as he } from './he';
export type { TranslationKeys } from './en';

export type Locale = 'en' | 'he';

export const RTL_LOCALES: Locale[] = ['he'];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}
