/**
 * Runtime theme switch — the "feature flag" for the two decorative
 * designs (see theme/tokens.ts). Persisted in AsyncStorage the same way
 * lib/auth/googleAuthProvider.ts persists its session, so the choice
 * survives a reload; defaults to 'felt' the first time.
 *
 * Also carries `styleVariant` — a second, independent toggle (A/B/C)
 * for how glossy/metallic the buttons and cards render (see
 * GradientSurface and Card's `tint`/`badge`), so the two axes — color
 * theme and gloss style — can be compared separately.
 *
 * Usage: wrap the app in <ThemeProvider>, then read `const theme =
 * useTheme()` anywhere for colors/spacing/etc., `useThemeSwitch()` for
 * { themeName, setThemeName } to build the theme toggle, `useStyleVariant()`
 * for the current A/B/C, or `useStyleVariantSwitch()` for { styleVariant,
 * setStyleVariant } to build that toggle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { themes, type Theme, type ThemeName } from './tokens';

const STORAGE_KEY = 'theme.selection.v1';
const DEFAULT_THEME: ThemeName = 'felt';

export type StyleVariant = 'A' | 'B' | 'C';
const STYLE_VARIANT_KEY = 'styleVariant.selection.v1';
const DEFAULT_STYLE_VARIANT: StyleVariant = 'C';

type ThemeContextValue = {
  theme: Theme;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
  styleVariant: StyleVariant;
  setStyleVariant: (variant: StyleVariant) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>(DEFAULT_THEME);
  const [styleVariant, setStyleVariantState] = useState<StyleVariant>(DEFAULT_STYLE_VARIANT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'felt' || saved === 'warm') setThemeNameState(saved);
    });
    AsyncStorage.getItem(STYLE_VARIANT_KEY).then((saved) => {
      if (saved === 'A' || saved === 'B' || saved === 'C') setStyleVariantState(saved);
    });
  }, []);

  const setThemeName = (name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {});
  };

  const setStyleVariant = (variant: StyleVariant) => {
    setStyleVariantState(variant);
    AsyncStorage.setItem(STYLE_VARIANT_KEY, variant).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[themeName], themeName, setThemeName, styleVariant, setStyleVariant }),
    [themeName, styleVariant]
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

export function useStyleVariantSwitch(): Pick<ThemeContextValue, 'styleVariant' | 'setStyleVariant'> {
  const { styleVariant, setStyleVariant } = useThemeContext();
  return { styleVariant, setStyleVariant };
}
