/**
 * Runtime theme switch — the "feature flag" for the two decorative
 * designs (see theme/tokens.ts). Persisted in AsyncStorage the same way
 * lib/auth/googleAuthProvider.ts persists its session, so the choice
 * survives a reload; defaults to 'felt' the first time.
 *
 * `styleVariant` used to be a second, independent toggle (A/B/C) for
 * how glossy/metallic the buttons and cards render (see GradientSurface
 * and Card's `tint`/`badge`) — that comparison is settled now (C won),
 * so it's a fixed constant rather than a switchable one, and the
 * toggle UI that used to set it is gone. Screens still read it via
 * `useStyleVariant()` (unchanged call sites), it just can't be changed
 * anymore.
 *
 * Usage: wrap the app in <ThemeProvider>, then read `const theme =
 * useTheme()` anywhere for colors/spacing/etc., `useThemeSwitch()` for
 * { themeName, setThemeName } to build the theme toggle, or
 * `useStyleVariant()` for the fixed style variant ('C').
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { themes, type Theme, type ThemeName } from './tokens';

const STORAGE_KEY = 'theme.selection.v1';
const DEFAULT_THEME: ThemeName = 'felt';

export type StyleVariant = 'A' | 'B' | 'C';
// No longer switchable (see this file's module comment) — 'C' won the
// A/B/C comparison, so every useStyleVariant() call site just gets it.
const FIXED_STYLE_VARIANT: StyleVariant = 'C';

type ThemeContextValue = {
  theme: Theme;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
  styleVariant: StyleVariant;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'felt' || saved === 'warm') setThemeNameState(saved);
    });
  }, []);

  const setThemeName = (name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[themeName], themeName, setThemeName, styleVariant: FIXED_STYLE_VARIANT }),
    [themeName]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme/useThemeSwitch must be used within a ThemeProvider');
  return ctx;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useThemeSwitch(): Pick<ThemeContextValue, 'themeName' | 'setThemeName'> {
  const { themeName, setThemeName } = useThemeContext();
  return { themeName, setThemeName };
}

export function useStyleVariant(): StyleVariant {
  return useThemeContext().styleVariant;
}
