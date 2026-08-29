/**
 * The design feature-flag switch — lets the two decorative themes
 * (theme/tokens.ts) be compared live instead of picking one at build
 * time. A two-segment pill; the active segment is filled with that
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
            style={[
              styles.segment,
              { borderRadius: theme.radius.pill },
              active && { backgroundColor: optionTheme.colors.accent },
            ]}>
            <Text
              style={[
                styles.label,
                { color: active ? optionTheme.colors.accentText : theme.colors.textSecondary, fontWeight: theme.font.weight.bold },
              ]}>
              {optionTheme.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { paddingVertical: 6, paddingHorizontal: 10 },
  label: { fontSize: 12 },
});
