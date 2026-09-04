/**
 * Shared themed button — replaces the primaryBtn/secondaryBtn pairs each
 * screen used to redeclare. `variant` picks the border/text color;
 * everything else (radius, padding, type scale) comes from the active
 * theme so both decorative designs stay visually consistent automatically.
 *
 * Every variant is transparent, border only — no gradient, no flat fill.
 * `primary`/`danger` read as the "loud" actions via a full-strength
 * accent/danger border+text; `secondary` is a quieter neutral border;
 * `ghost` is quieter still (a faint border, dimmer text) for the least
 * emphasized action on a screen.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = {
  // Usually a plain string — ReactNode is only for a mixed-size label
  // (e.g. a nested <Text> to size a leading icon differently from the
  // rest of the text, both still inheriting this Text's own color/font).
  label: ReactNode;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>; // per-instance override (e.g. a larger size for one particular button)
};

export default function Button({ label, onPress, variant = 'primary', disabled, loading, style, labelStyle }: Props) {
  const theme = useTheme();
  const { colors, radius, font } = theme;

  const outlineFor: Record<Variant, { fg: string; border: string }> = {
    primary: { fg: colors.accent, border: colors.accent },
    secondary: { fg: colors.textPrimary, border: colors.borderStrong },
    danger: { fg: colors.danger, border: colors.danger },
    ghost: { fg: colors.textSecondary, border: colors.border },
  };
  const { fg, border } = outlineFor[variant];

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: 'transparent',
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: disabled ? colors.border : border,
          opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.text, { color: disabled ? colors.textSecondary : fg, fontSize: font.size.md, fontFamily: font.family.bold, fontWeight: font.weight.bold }, labelStyle]}>
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
  },
  text: { textAlign: 'center' },
});
