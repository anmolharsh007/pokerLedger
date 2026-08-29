/**
 * Themed modal shell — replaces the repeated modalBackdrop/modalCard
 * pair every popup (info, edit, new-group, selected-players…)
 * redeclared. Tapping the backdrop closes it, same as before. Gets the
 * same faint surface gradient + beveled border as portrait Card tiles,
 * for a consistent premium feel across every popup.
 */
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import GradientSurface from './GradientSurface';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
};

export default function ModalCard({ visible, onRequestClose, children, contentStyle }: Props) {
  const { colors, radius, cardShadow, gradients, bevel } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onRequestClose}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.lg,
              borderTopColor: bevel.light,
              borderLeftColor: bevel.light,
              borderRightColor: bevel.dark,
              borderBottomColor: bevel.dark,
            },
            cardShadow,
            contentStyle,
          ]}
          onStartShouldSetResponder={() => true}>
          <GradientSurface colors={gradients.surface} sheen={false} style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]} />
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 20, width: '85%', maxHeight: '80%', gap: 10, borderWidth: 1 },
});
