/**
 * A fully local, network-free walkthrough of the Home screen and the
 * Table screen — for reviewing the FE-deco visual work while the real
 * sign-in/Sheets backend is down (see App.tsx's sign-in screen for the
 * entry point). Every table here opens TableHome in mock mode
 * (lib/dev/staticMockData.ts) — no fetch, no Google auth, nothing
 * reaches a real spreadsheet. Group+/Cash-ins/Cash-outs/Players show a
 * "not part of the preview" notice instead of navigating, so there's no
 * path into a screen that would try to call the (currently broken)
 * backend.
 *
 * Temporary scaffolding: delete this file, lib/dev/staticMockData.ts,
 * and the one `staticPreview` hook in App.tsx once the backend is
 * fixed and the real sign-in flow works again.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

import TableHome from '../TableHome';
import CardButton from '../ui/CardButton';
import StyleVariantToggle from '../ui/StyleVariantToggle';
import ThemeToggle from '../ui/ThemeToggle';
import { getMockTableData, mockTables, mockTableSummaries } from '../../lib/dev/staticMockData';
import { cardTintFor } from '../../theme/cardTints';
import { useStyleVariant, useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';

type Props = {
  onExit: () => void;
};

export default function StaticPreview({ onExit }: Props) {
  const theme = useTheme();
  const styleVariant = useStyleVariant();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [openTableId, setOpenTableId] = useState<string | null>(null);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.container}>
      <View style={styles.header}>
        {openTableId ? (
          <Pressable onPress={() => setOpenTableId(null)}>
            <Text style={styles.backText}>‹ Tables</Text>
          </Pressable>
        ) : (
          <Text style={styles.title}>Static Preview</Text>
        )}
        <View style={styles.headerActions}>
          <ThemeToggle />
          <StyleVariantToggle />
          <Pressable onPress={onExit}>
            <Text style={styles.exitText}>Exit preview</Text>
          </Pressable>
        </View>
      </View>

      {openTableId ? (
        <TableHome
          spreadsheetId={openTableId}
          getAccessToken={async () => 'static-preview-token'}
          mock={getMockTableData(openTableId)}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.notice}>Hardcoded data — nothing on this screen reaches the backend.</Text>
          <View style={[styles.tableGrid, styleVariant === 'C' && styles.gridRowGapForBadges]}>
            {mockTables.map((table, i) => (
              <CardButton
                key={table.id}
                onPress={() => setOpenTableId(table.spreadsheetId)}
                tint={cardTintFor(i)}
                badge="TABLE"
                style={styles.tableCard}>
                <Text style={styles.tableCardIcon}>♠</Text>
                <View style={styles.tableCardBody}>
                  <Text style={styles.tableCardName} numberOfLines={2}>
                    {table.name}
                  </Text>
                  {(mockTableSummaries[table.spreadsheetId] ?? []).length > 0 ? (
                    <Text style={styles.tableCardSummary} numberOfLines={2}>
                      {mockTableSummaries[table.spreadsheetId].join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </CardButton>
            ))}
          </View>
        </ScrollView>
      )}

      <StatusBar style={theme.statusBarStyle} />
    </LinearGradient>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 60 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 12,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    title: { fontSize: theme.font.size.xl, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    backText: { fontSize: theme.font.size.lg, color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    exitText: { color: theme.colors.danger, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    list: { padding: 20, gap: 16 },
    notice: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary, textAlign: 'center' },
    tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridRowGapForBadges: { rowGap: 24 },
    tableCard: { width: '47%' },
    tableCardIcon: {
      fontSize: 34,
      color: theme.colors.accent,
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    tableCardBody: { gap: 4 },
    tableCardName: { fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    tableCardSummary: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary, textAlign: 'center' },
  });
