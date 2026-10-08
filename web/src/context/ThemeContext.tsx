import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ConfigProvider } from 'antd';
import { lightTokens, darkTokens } from '../theme';

type ThemeMode = 'light' | 'dark';
const ThemeContext = createContext<{ mode: ThemeMode; toggle: () => void }>(null!);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() =>
    (localStorage.getItem('theme') as ThemeMode) || 'light'
  );

  useEffect(() => {
    document.body.classList.toggle('dark', mode === 'dark');
  }, [mode]);

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      <ConfigProvider theme={mode === 'dark' ? darkTokens : lightTokens}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
