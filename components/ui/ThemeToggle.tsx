/**
 * The design feature-flag switch — lets the two decorative themes
 * (theme/tokens.ts) be compared live instead of picking one at build
 * time. A two-segment pill, icon-only — a card-suit pairing instead of
 * plain dots: ♢ for the light theme (Warm Orange), ♠ for the dark one
 * (Felt & Gold), read off each theme's own `isDark` flag rather than
 * hardcoding which name is which. The diamond is the outline glyph (♢,
 * not the solid ♦) so an unselected segment doesn't read as already
 * filled in with that theme's own accent — colored red (the ambient
 * theme's own danger token, not optionTheme's) while unselected, the
 * traditional diamond-suit color, same way the spade stays the ambient
 * theme's neutral textSecondary. The active segment fills with that
 * theme's own accent so the control previews the swap before you tap it
 * — its icon switches to accentText for contrast against that fill
 * rather than staying red/grey.
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
        // Diamond reads red (traditional suit color) while unselected;
        // spade stays the ambient theme's neutral. Both switch to
        // accentText once active, for contrast against the accent fill.
        const inactiveColor = optionTheme.isDark ? theme.colors.textSecondary : theme.colors.danger;
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
            <Text
              style={[
                styles.icon,
                // Spade is sized down from the shared base and set in
                // the app's own serif (Cormorant Garamond, used
                // everywhere else) instead of the system font — a
                // sharper point, more-curved lobes than the system
                // glyph gave it. Diamond is sized up a touch from the
                // same base to balance the pair.
                optionTheme.isDark ? [styles.iconSpade, { fontFamily: theme.font.family.bold }] : styles.iconDiamond,
                { color: active ? optionTheme.colors.accentText : inactiveColor },
              ]}>
              {optionTheme.isDark ? '♠' : '♢'}
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
  iconSpade: { fontSize: 10 }, // smaller still than the diamond
  iconDiamond: { fontSize: 15 }, // 14 * 1.09, rounded — ~9% bigger than the shared base
});
