/**
 * Themed text input — replaces the repeated
 * `{ fontSize, padding, backgroundColor: '#fff', borderRadius, borderWidth, borderColor: '#ddd' }`
 * input style each screen redeclared.
 */
import { TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';

export default function TextField(props: TextInputProps) {
  const { colors, radius, font } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      {...props}
      style={[
        {
          fontSize: font.size.md,
          color: colors.textPrimary,
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.border,
        },
        props.style,
      ]}
    />
  );
}
