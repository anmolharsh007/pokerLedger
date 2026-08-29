/**
 * Shared themed button — replaces the primaryBtn/secondaryBtn pairs each
 * screen used to redeclare. `variant` picks the fill; everything else
 * (radius, padding, type scale) comes from the active theme so both
 * decorative designs stay visually consistent automatically.
 *
 * Primary/danger get a metallic GradientSurface painted as an
 * absolute-fill layer behind the label, instead of a flat backgroundColor
 * — Pressable itself still owns all real sizing (padding, flex, width),
 * so callers can keep passing plain layout styles. Secondary/ghost stay
 * flat on purpose — they're meant to read as quieter than the gradient CTAs.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import GradientSurface from './GradientSurface';
import { useTheme } from '../../theme/ThemeProvider';
import type { GradientStops } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Button({ label, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const theme = useTheme();
  const { colors, radius, font, gradients } = theme;

  const gradientFor: Partial<Record<Variant, GradientStops>> = { primary: gradients.accent, danger: gradients.danger };
  const flatFill: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.accent, fg: colors.accentText },
    secondary: { bg: colors.surfaceAlt, fg: colors.textPrimary },
    danger: { bg: colors.danger, fg: '#fff' },
    ghost: { bg: 'transparent', fg: colors.accent, border: colors.borderStrong },
  };
  const { bg, fg, border } = flatFill[variant];
  const gradientColors = !disabled ? gradientFor[variant] : undefined;

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: disabled ? colors.surfaceAlt : gradientColors ? undefined : bg,
          borderRadius: radius.md,
          borderWidth: border ? 1 : 0,
          borderColor: border,
          opacity: disabled ? 0.6 : pressed ? 0.88 : 1,
        },
        style,
      ]}>
      {gradientColors && <GradientSurface colors={gradientColors} style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]} />}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.text, { color: disabled ? colors.textSecondary : fg, fontSize: font.size.md, fontFamily: font.family.bold, fontWeight: font.weight.bold }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
  },
  text: { textAlign: 'center' },
});
