'use client';

import { create } from 'zustand';
import { en, he, isRtl, type Locale, type TranslationKeys } from '@/lib/i18n';

const translations: Record<Locale, TranslationKeys> = { en, he };

const STORAGE_KEY = 'data-ruler-language';

interface LanguageState {
  locale: Locale;
  t: TranslationKeys;
  isRtl: boolean;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  hydrate: () => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  locale: 'en',
  t: translations['en'],
  isRtl: false,
  hydrated: false,
  setLocale: (locale: Locale) => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    set({ locale, t: translations[locale], isRtl: isRtl(locale) });
  },
  hydrate: () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const locale: Locale = (stored === 'en' || stored === 'he') ? stored : 'en';
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    set({ locale, t: translations[locale], isRtl: isRtl(locale), hydrated: true });
  },
}));
