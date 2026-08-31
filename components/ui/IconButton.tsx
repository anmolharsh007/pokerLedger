/**
 * Small circular/text icon button — used for refresh (⟳), info (i),
 * the selected-players popup trigger (▶), etc. Replaces the one-off
 * `refreshBtn`/`infoBtn`/`selectedIconBtn` styles each screen declared.
 * Transparent, border only, like every other button — the 'accent'
 * variant just uses a full-strength accent border+text instead of
 * 'plain's quieter one, not a filled circle.
 */
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';

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
  const { colors, font } = useTheme();
  const color = variant === 'accent' ? colors.accent : colors.textSecondary;

  return (
    <Pressable
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
      onPress={onPress}>
      <Text
        style={{
          color,
          fontFamily: font.family.bold, fontWeight: font.weight.bold,
          fontSize: size * 0.45,
        }}>
        {icon}
      </Text>
    </Pressable>
  );
}
