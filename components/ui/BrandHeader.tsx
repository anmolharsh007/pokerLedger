/**
 * Small persistent app-identity row — logo + "Poker Ledger" — placed at
 * the top of every screen so the app's branding stays visible no matter
 * which screen is showing. Compact and left-aligned; sits above each
 * screen's own contextual header (back link / title / actions), which
 * is untouched. Logo image is a placeholder using the app icon
 * (assets/icon.png) until a dedicated in-app logo asset exists.
 */
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';

export default function BrandHeader() {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.row}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} />
      <Text style={styles.label}>Poker Ledger</Text>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    logo: {
      width: 20,
      height: 20,
      borderRadius: 5,
    },
    label: {
      fontSize: theme.font.size.xs,
      fontFamily: theme.font.family.bold,
      fontWeight: theme.font.weight.bold,
      color: theme.colors.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
  });
