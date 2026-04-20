import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'dark' | 'light';

type AppTheme = {
  bg: string;
  panel: string;
  panelSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  cyan: string;
  cyanBorder: string;
  gold: string;
  goldBorder: string;
  neonGreen: string;
  neonGreenBorder: string;
  glass: string;
  glassStrong: string;
};

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  isLight: boolean;
  setMode: (next: ThemeMode) => Promise<void>;
  toggleMode: () => Promise<void>;
};

const STORAGE_KEY = '@garage_connect_theme_mode_v1';

const DARK_THEME: AppTheme = {
  bg: '#0B121E',
  panel: '#121c2e',
  panelSoft: '#111827',
  textPrimary: '#ffffff',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  cyan: '#55CCFF',
  cyanBorder: 'rgba(85,204,255,0.45)',
  gold: '#D4AF37',
  goldBorder: 'rgba(212,175,55,0.45)',
  neonGreen: '#22c55e',
  neonGreenBorder: 'rgba(34,197,94,0.9)',
  glass: 'rgba(7,10,16,0.72)',
  glassStrong: 'rgba(7,10,16,0.84)',
};

const LIGHT_THEME: AppTheme = {
  bg: '#f5f8fc',
  panel: '#ffffff',
  panelSoft: '#eef3fb',
  textPrimary: '#0f172a',
  textSecondary: '#1e293b',
  textMuted: '#64748b',
  cyan: '#0284c7',
  cyanBorder: 'rgba(2,132,199,0.35)',
  gold: '#b38728',
  goldBorder: 'rgba(179,135,40,0.35)',
  neonGreen: '#16a34a',
  neonGreenBorder: 'rgba(22,163,74,0.7)',
  glass: 'rgba(255,255,255,0.78)',
  glassStrong: 'rgba(255,255,255,0.92)',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (stored === 'light' || stored === 'dark') setModeState(stored);
      } catch {
        // ignore local persistence errors
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore local persistence errors
    }
  };

  const toggleMode = async () => {
    await setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme: mode === 'light' ? LIGHT_THEME : DARK_THEME,
      isLight: mode === 'light',
      setMode,
      toggleMode,
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

