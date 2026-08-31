/**
 * A button that requires two taps to actually fire — for the actions
 * the flow spec calls out as needing confirmation (start, All+, End,
 * Cash-in's Add): the first tap arms it (label changes to prompt a
 * second tap), the second tap within ARM_TIMEOUT_MS runs the action.
 * Arming expires on its own if nothing follows.
 *
 * Transparent, border only like every other button — but with a double
 * *dashed* border (an outer ring, a small gap, then an inner ring
 * around the label) instead of a single solid one, so a "this needs two
 * taps" button reads as visually distinct from a regular one-tap button
 * at a glance, not just via its label text. The outer ring is drawn
 * slightly thinner and at reduced opacity — a quieter frame around the
 * inner ring, which carries the real color/weight.
 *
 * The outer ring is a separate absolutely-positioned layer, not the
 * Pressable's own border — that's what lets it fade independently of
 * the Pressable's own disabled/pressed opacity (which would otherwise
 * also dim the inner ring and label). The inner ring's inset from the
 * true outer edge is set as its own `margin` (`OUTER_BORDER_WIDTH +
 * RING_GAP`), not padding on the outer Pressable — a caller sizing the
 * whole button down (TableHome's End button, via `style`) sets padding/
 * minHeight on the OUTER box only; it can't also stack with (and
 * inflate) the inset that's supposed to just separate the two rings.
 * Matching that same total in the inner ring's radius (`radius -
 * OUTER_BORDER_WIDTH - RING_GAP`) is what keeps the two rings genuinely
 * concentric (an equal gap all the way around, corners included)
 * instead of just parallel-looking on the straight edges. Get either
 * constant out of sync with the other and the corners are the first
 * place it shows.
 *
 * `radius` (defaults to theme.radius.md) sizes both rings — a caller
 * that also overrides `borderRadius` via `style` (e.g. TableHome's End
 * button, sized down to match Game Sessions) must pass the same value
 * here too, or the inner ring's radius (computed from this prop) drifts
 * out of sync with the outer ring's (the actually-rendered one, since
 * `style` is applied last) and the double border stops looking concentric.
 *
 * While armed, a soft tinted wash breathes in and out on the inner ring
 * — without it, the only cue that a second tap is needed is the label
 * text changing, easy to miss on a quick double-tap flow.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

const ARM_TIMEOUT_MS = 2500;
const PULSE_MS = 480;
const OUTER_BORDER_WIDTH = 1;
const OUTER_BORDER_OPACITY = 0.55;
const RING_GAP = 2;
const INNER_INSET = OUTER_BORDER_WIDTH + RING_GAP;

type Variant = 'primary' | 'danger';

type Props = {
  label: string;
  armedLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  radius?: number; // see module comment — must match any borderRadius override in `style`
};

export default function DoubleTapButton({ label, armedLabel, onConfirm, disabled, variant = 'primary', style, radius: radiusProp }: Props) {
  const { colors, radius: themeRadius, font } = useTheme();
  const radius = radiusProp ?? themeRadius.md;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  // Breathing highlight while armed — starts/stops with `armed` rather
  // than living inside handlePress, so it also clears correctly when
  // arming expires on its own via the timeout.
  useEffect(() => {
    if (!armed) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: PULSE_MS, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [armed, pulse]);

  const handlePress = async () => {
    if (disabled || busy) return;
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setArmed(false);
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const color = disabled ? colors.border : variant === 'danger' ? colors.danger : colors.accent;
  const fgColor = disabled ? colors.textSecondary : color;

  return (
    <Pressable
      style={({ pressed }) => [styles.outer, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }, style]}
      disabled={disabled || busy}
      onPress={handlePress}>
      {/* The outer ring — its own faded opacity, independent of the
          Pressable's own disabled/pressed opacity above (which would
          otherwise dim the inner ring and label too). */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: OUTER_BORDER_WIDTH, borderColor: color, borderStyle: 'dashed', opacity: OUTER_BORDER_OPACITY },
        ]}
      />
      <Animated.View
        style={[
          styles.inner,
          {
            margin: INNER_INSET,
            borderRadius: Math.max(0, radius - INNER_INSET),
            borderColor: color,
            backgroundColor: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: ['transparent', variant === 'danger' ? `${colors.danger}22` : colors.accentSoft],
            }),
          },
        ]}>
        {busy ? (
          <ActivityIndicator color={fgColor} />
        ) : (
          <Text style={[styles.text, { color: fgColor, fontSize: font.size.md, fontFamily: font.family.bold, fontWeight: font.weight.bold }]}>
            {armed ? (armedLabel ?? 'Tap again to confirm') : label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    minHeight: 48,
  },
  inner: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  text: { textAlign: 'center' },
});
