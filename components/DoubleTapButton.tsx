/**
 * A button that requires two taps to actually fire — for the actions
 * the flow spec calls out as needing confirmation (start, All+, End,
 * Cash-in's Add): the first tap arms it (label changes to prompt a
 * second tap), the second tap within ARM_TIMEOUT_MS runs the action.
 * Arming expires on its own if nothing follows.
 *
 * While armed, a soft white overlay breathes in and out on a loop —
 * without it, the only cue that a second tap is needed is the label
 * text changing, easy to miss on a quick double-tap flow.
 *
 * Its metallic fill (see GradientSurface) paints as an absolute-fill
 * layer behind the label — Pressable itself keeps owning all real
 * sizing, so the size-tiered grid buttons in TableHome can still just
 * pass a plain combined `style` (width + padding/minHeight/radius).
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import GradientSurface from './ui/GradientSurface';
import { useTheme } from '../theme/ThemeProvider';

const ARM_TIMEOUT_MS = 2500;
const PULSE_MS = 480;

type Variant = 'primary' | 'danger';

type Props = {
  label: string;
  armedLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export default function DoubleTapButton({ label, armedLabel, onConfirm, disabled, variant = 'primary', style }: Props) {
  const { colors, radius, font, gradients } = useTheme();
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

  // Danger's red reads better with a plain white label in both themes —
  // colors.textInverse is tuned for sitting on `accent` (gold or orange),
  // not on `danger`, and would be low-contrast against it in the felt theme.
  const gradientColors = variant === 'danger' ? gradients.danger : gradients.accent;
  const fgColor = variant === 'danger' ? '#fff' : colors.accentText;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: disabled ? colors.surfaceAlt : undefined,
          borderRadius: radius.md,
          opacity: disabled ? 1 : pressed ? 0.88 : 1,
        },
        style,
      ]}
      disabled={disabled || busy}
      onPress={handlePress}>
      {!disabled && <GradientSurface colors={gradientColors} style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]} />}
      {armed && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius.md, backgroundColor: '#fff', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) },
          ]}
        />
      )}
      {busy ? (
        <ActivityIndicator color={fgColor} />
      ) : (
        <Text style={[styles.text, { color: disabled ? colors.textSecondary : fgColor, fontSize: font.size.md, fontFamily: font.family.bold, fontWeight: font.weight.bold }]}>
          {armed ? (armedLabel ?? 'Tap again to confirm') : label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
  },
  text: { textAlign: 'center' },
});
