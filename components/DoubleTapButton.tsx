/**
 * A button that requires two taps to actually fire — for the actions
 * the flow spec calls out as needing confirmation (start, All+, End,
 * Cash-in's Add): the first tap arms it (label changes to prompt a
 * second tap), the second tap within ARM_TIMEOUT_MS runs the action.
 * Arming expires on its own if nothing follows.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

const ARM_TIMEOUT_MS = 2500;

type Props = {
  label: string;
  armedLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function DoubleTapButton({ label, armedLabel, onConfirm, disabled, style }: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <Pressable style={[styles.btn, disabled && styles.disabled, style]} disabled={disabled || busy} onPress={handlePress}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{armed ? (armedLabel ?? 'Tap again to confirm') : label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  disabled: { backgroundColor: '#ccc' },
  text: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
});
