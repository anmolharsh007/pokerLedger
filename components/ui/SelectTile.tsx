/**
 * A name in a 2-column selection grid — the card-shaped toggle button
 * used in place of a checkbox row wherever a popup picks people from a
 * list (Group+'s New/Edit Group member picker, the Table screen's
 * selected-players review popup). Selected reads as a solid accent
 * border + a ✓ mark; unselected uses the same dashed-border "empty"
 * look Cash-in's cards use — one consistent selected/unselected
 * language across the app, transparent/border-only like everything
 * else (see components/ui/Button.tsx, Card.tsx).
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export default function SelectTile({ label, selected, onPress }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          borderRadius: theme.radius.md,
          borderWidth: selected ? 2 : 1.5,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          borderStyle: selected ? 'solid' : 'dashed',
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <Text
        numberOfLines={1}
        style={{
          color: selected ? theme.colors.accent : theme.colors.textPrimary,
          fontFamily: selected ? theme.font.family.bold : theme.font.family.medium,
          fontWeight: selected ? theme.font.weight.bold : theme.font.weight.medium,
          fontSize: theme.font.size.sm,
          textAlign: 'center',
        }}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48%',
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
