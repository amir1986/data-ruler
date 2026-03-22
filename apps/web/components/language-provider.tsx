'use client';

import { useEffect } from 'react';
import { useLanguageStore } from '@/stores/language-store';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useLanguageStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
