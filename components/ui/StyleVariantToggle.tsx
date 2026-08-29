/**
 * The gloss-style feature flag — A/B/C, independent of the Felt/Warm
 * color theme (see ThemeToggle):
 *  A — refined amplification: brighter highlight + deeper shadow on
 *      the existing gradient buttons.
 *  B — full glossy Web 2.0: bright specular streak, beveled border,
 *      heavy shadow — the shiny-plastic/glass button look.
 *  C — colors and badges only: buttons stay as plain GradientSurface;
 *      portrait cards get bolder per-card tints and a gold badge chip.
 * See GradientSurface and Card's `tint`/`badge` props for where each
 * variant actually changes rendering.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useStyleVariantSwitch, type StyleVariant } from '../../theme/ThemeProvider';

const OPTIONS: StyleVariant[] = ['A', 'B', 'C'];

export default function StyleVariantToggle() {
  const theme = useTheme();
  const { styleVariant, setStyleVariant } = useStyleVariantSwitch();

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill }]}>
      {OPTIONS.map((v) => {
        const active = v === styleVariant;
        return (
          <Pressable
            key={v}
            onPress={() => setStyleVariant(v)}
            style={[styles.segment, { borderRadius: theme.radius.pill }, active && { backgroundColor: theme.colors.accent }]}>
            <Text style={[styles.label, { color: active ? theme.colors.accentText : theme.colors.textSecondary, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold }]}>
              {v}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12 },
});
