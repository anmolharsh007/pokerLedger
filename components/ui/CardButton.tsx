/**
 * The pressable version of Card's portrait tile — the "card-shaped
 * button" used for grids of things you pick (home screen tables,
 * Group+'s groups). Selection reads as an accent border, same
 * language the checkbox/grid buttons use elsewhere; press feedback is
 * a slight dim rather than a color change so it works on both themes.
 *
 * A long press otherwise looks identical to a normal tap right up
 * until release — nothing marks the moment it actually registered. A
 * brief accent flash right when onLongPress fires gives that a beat
 * of its own, distinct from the release-triggered onPress.
 */
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import Card from './Card';
import { useTheme } from '../../theme/ThemeProvider';
import type { GradientStops } from '../../theme/tokens';

const FLASH_IN_MS = 90;
const FLASH_OUT_MS = 260;

type Props = {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  delayLongPress?: number;
  selected?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: GradientStops; // variant C only — see Card
  badge?: string; // variant C only — see Card
};

export default function CardButton({ onPress, onLongPress, delayLongPress, selected, disabled, children, style, tint, badge }: Props) {
  const theme = useTheme();
  const flash = useRef(new Animated.Value(0)).current;

  const handleLongPress = onLongPress
    ? (e: GestureResponderEvent) => {
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: FLASH_IN_MS, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: FLASH_OUT_MS, useNativeDriver: true }),
        ]).start();
        onLongPress(e);
      }
    : undefined;

  return (
    <Pressable onPress={onPress} onLongPress={handleLongPress} delayLongPress={delayLongPress} disabled={disabled}>
      {({ pressed }) => (
        <Card
          portrait
          borderColor={selected ? theme.colors.accent : undefined}
          borderWidth={selected ? 2 : undefined}
          tint={tint}
          badge={badge}
          style={[{ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}>
          {children}
          {onLongPress && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: theme.radius.lg, backgroundColor: theme.colors.accent, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) },
              ]}
            />
          )}
        </Card>
      )}
    </Pressable>
  );
}
