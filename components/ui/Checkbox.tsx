/**
 * Themed checkbox row — replaces the repeated checkbox/checkboxChecked/
 * checkboxMark trio each popup redeclared. The checked fill uses the
 * same metallic GradientSurface as the buttons rather than a flat square.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import GradientSurface from './GradientSurface';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  checked: boolean;
  onPress: () => void;
  label: string;
};

export default function Checkbox({ checked, onPress, label }: Props) {
  const { colors, font, gradients } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
      onPress={onPress}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {checked && <GradientSurface colors={gradients.accent} sheen={false} style={StyleSheet.absoluteFill} />}
        {checked ? <Text style={{ color: colors.accentText, fontFamily: font.family.bold, fontWeight: font.weight.bold, fontSize: 13 }}>✓</Text> : null}
      </View>
      <Text style={{ fontSize: font.size.md, fontFamily: font.family.regular, color: colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}
