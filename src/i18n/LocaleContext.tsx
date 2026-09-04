import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { AppLocale } from './locale';

type LocaleContextValue = {
  locale: AppLocale;
  t: (text: string) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'el',
  t: (text) => text,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = 'el';
  }, []);

  return (
    <LocaleContext.Provider value={{ locale: 'el', t: (text) => text }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useT() {
  return useContext(LocaleContext);
}
