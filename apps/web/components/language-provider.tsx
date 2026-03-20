'use client';

import { useEffect } from 'react';
import { useLanguageStore } from '@/stores/language-store';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { locale, isRtl } = useLanguageStore();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [locale, isRtl]);

  return <>{children}</>;
}
