'use client';

import { create } from 'zustand';
import { en, he, isRtl, type Locale, type TranslationKeys } from '@/lib/i18n';

const translations: Record<Locale, TranslationKeys> = { en, he };

const STORAGE_KEY = 'data-ruler-language';

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'he') return stored;
  return 'en';
}

interface LanguageState {
  locale: Locale;
  t: TranslationKeys;
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
}

export const useLanguageStore = create<LanguageState>((set) => {
  const initial = getStoredLocale();
  return {
    locale: initial,
    t: translations[initial],
    isRtl: isRtl(initial),
    setLocale: (locale: Locale) => {
      localStorage.setItem(STORAGE_KEY, locale);
      document.documentElement.lang = locale;
      document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
      set({ locale, t: translations[locale], isRtl: isRtl(locale) });
    },
  };
});
