/**
 * Design tokens for the two decorative themes, switched at runtime via
 * theme/ThemeProvider.tsx (persisted like any other local flag — see
 * STORAGE_KEY there). Every screen should read colors/spacing/etc. from
 * `useTheme()` rather than hardcoding hex values, so both themes stay in
 * sync as the app grows.
 *
 *  - 'felt'  — deep poker-felt green surfaces, gold accent, light text.
 *  - 'warm'  — cream/neutral surfaces, burnt-orange accent, dark text.
 *
 * Solid fills read as flat/cheap, so every accent/danger surface (see
 * GradientSurface) is a 3-stop gradient — light edge, true color,
 * shadowed edge — instead of one hex value; `bevel` gives borders the
 * same light-catches-the-top-edge treatment on cards.
 */
import type { TextStyle, ViewStyle } from 'react-native';

export type ThemeName = 'felt' | 'warm';

export type ThemeColors = {
  background: string;
  surface: string; // card / row background
  surfaceAlt: string; // secondary button / input fill
  surfaceRaised: string; // modal card background
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string; // text placed on top of `accent`
  accent: string;
  accentSoft: string; // tinted accent background (e.g. selected state)
  accentText: string;
  success: string;
  danger: string;
  warning: string;
  overlay: string; // modal backdrop
};

export type GradientStops = readonly [string, string, ...string[]];

export type Theme = {
  name: ThemeName;
  label: string;
  isDark: boolean;
  statusBarStyle: 'light' | 'dark';
  colors: ThemeColors;
  gradients: {
    background: GradientStops; // subtle screen-depth wash
    surface: GradientStops; // faint emboss for portrait card tiles
    accent: GradientStops; // metallic accent fill (primary buttons, grid tiles)
    danger: GradientStops;
  };
  bevel: { light: string; dark: string }; // top/left vs bottom/right border shading
  radius: { sm: number; md: number; lg: number; pill: number };
  spacing: (mult: number) => number;
  font: {
    size: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
    weight: { regular: TextStyle['fontWeight']; medium: TextStyle['fontWeight']; bold: TextStyle['fontWeight'] };
  };
  cardShadow: ViewStyle;
};

const spacing = (mult: number) => mult * 4;

const font: Theme['font'] = {
  size: { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24 },
  weight: { regular: '400', medium: '600', bold: '700' },
};

const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const themes: Record<ThemeName, Theme> = {
  felt: {
    name: 'felt',
    label: 'Felt & Gold',
    isDark: true,
    statusBarStyle: 'light',
    colors: {
      background: '#0d2b20',
      surface: '#153a2b',
      surfaceAlt: '#1c4433',
      surfaceRaised: '#173829',
      border: 'rgba(226,214,178,0.14)',
      borderStrong: 'rgba(216,168,64,0.45)',
      textPrimary: '#f5efe0',
      textSecondary: 'rgba(245,239,224,0.62)',
      textInverse: '#1c1206',
      accent: '#d8a840',
      accentSoft: 'rgba(216,168,64,0.18)',
      accentText: '#1c1206',
      success: '#4caf6d',
      danger: '#e2685c',
      warning: '#d8a840',
      overlay: 'rgba(4,14,10,0.62)',
    },
    gradients: {
      background: ['#123a2b', '#0d2b20', '#071c13'],
      // ~90% opaque — a little transparency so portrait card tiles let
      // the screen's own background gradient bleed through faintly,
      // instead of sitting on it as a fully opaque slab.
      surface: ['#1b4735e6', '#153a2be6'],
      // metallic gold: pale champagne highlight -> true gold -> bronzed shadow
      accent: ['#f3d98a', '#d8a840', '#9c701f'],
      danger: ['#f0a99b', '#e2685c', '#a8402f'],
    },
    bevel: { light: 'rgba(255,224,160,0.22)', dark: 'rgba(0,0,0,0.4)' },
    radius,
    spacing,
    font,
    cardShadow: {
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
  },
  warm: {
    name: 'warm',
    label: 'Warm Orange',
    isDark: false,
    statusBarStyle: 'dark',
    colors: {
      background: '#faf5ec',
      surface: '#ffffff',
      surfaceAlt: '#f3e9da',
      surfaceRaised: '#fffdf9',
      border: '#ecdfc9',
      borderStrong: 'rgba(224,113,29,0.4)',
      textPrimary: '#2b241c',
      textSecondary: 'rgba(43,36,28,0.6)',
      textInverse: '#ffffff',
      accent: '#e2711d',
      accentSoft: 'rgba(226,113,29,0.12)',
      accentText: '#ffffff',
      success: '#3f9142',
      danger: '#c9432f',
      warning: '#b8860b',
      overlay: 'rgba(35,24,12,0.35)',
    },
    gradients: {
      background: ['#fffaf2', '#faf5ec', '#f3e6d2'],
      // ~90% opaque — a little transparency so portrait card tiles let
      // the screen's own background gradient bleed through faintly,
      // instead of sitting on it as a fully opaque slab.
      surface: ['#ffffffe6', '#faf3e5e6'],
      // burnished amber: warm highlight -> true orange -> umber shadow
      accent: ['#f6b573', '#e2711d', '#a24d10'],
      danger: ['#e58e77', '#c9432f', '#8f2b1c'],
    },
    bevel: { light: 'rgba(255,255,255,0.75)', dark: 'rgba(120,70,20,0.2)' },
    radius,
    spacing,
    font,
    cardShadow: {
      shadowColor: '#3a2c17',
      shadowOpacity: 0.12,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
  },
};
