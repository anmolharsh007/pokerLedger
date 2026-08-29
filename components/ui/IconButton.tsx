/**
 * Small circular/text icon button — used for refresh (⟳), info (i),
 * the selected-players popup trigger (▶), etc. Replaces the one-off
 * `refreshBtn`/`infoBtn`/`selectedIconBtn` styles each screen declared.
 * The 'accent' variant gets the metallic GradientSurface fill instead
 * of a flat circle, matching the buttons/grid.
 */
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import GradientSurface from './GradientSurface';
import { useTheme } from '../../theme/ThemeProvider';

type Variant = 'accent' | 'plain';

type Props = {
  icon: string;
  onPress: () => void;
  variant?: Variant;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function IconButton({ icon, onPress, variant = 'plain', size = 32, style }: Props) {
  const { colors, font, gradients } = useTheme();
  const filled = variant === 'accent';

  return (
    <Pressable
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: pressed ? (filled ? 0.85 : 0.6) : 1,
        },
        style,
      ]}
      onPress={onPress}>
      {filled && <GradientSurface colors={gradients.accent} sheen={false} style={StyleSheet.absoluteFill} />}
      <Text
        style={{
          color: filled ? colors.accentText : colors.accent,
          fontFamily: font.family.bold, fontWeight: font.weight.bold,
          fontSize: size * 0.45,
        }}>
        {icon}
      </Text>
    </Pressable>
  );
}
