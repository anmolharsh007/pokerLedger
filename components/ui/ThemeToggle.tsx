/**
 * The design feature-flag switch — lets the two decorative themes
 * (theme/tokens.ts) be compared live instead of picking one at build
 * time. A two-segment pill, icon-only — a card-suit pairing instead of
 * plain dots: ♦ for the light theme (Warm Orange), ♠ for the dark one
 * (Felt & Gold), read off each theme's own `isDark` flag rather than
 * hardcoding which name is which. The active segment fills with that
 * theme's own accent so the control previews the swap before you tap it.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { themes, type ThemeName } from '../../theme/tokens';
import { useTheme, useThemeSwitch } from '../../theme/ThemeProvider';

const OPTIONS: ThemeName[] = ['felt', 'warm'];

export default function ThemeToggle() {
  const theme = useTheme();
  const { themeName, setThemeName } = useThemeSwitch();

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill }]}>
      {OPTIONS.map((name) => {
        const active = name === themeName;
        const optionTheme = themes[name];
        return (
          <Pressable
            key={name}
            onPress={() => setThemeName(name)}
            accessibilityLabel={optionTheme.label}
            style={[
              styles.segment,
              { borderRadius: theme.radius.pill },
              active && { backgroundColor: optionTheme.colors.accent },
            ]}>
            <Text style={[styles.icon, { color: active ? optionTheme.colors.accentText : theme.colors.textSecondary }]}>
              {optionTheme.isDark ? '♠' : '♦'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 14 },
});
