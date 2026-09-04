/**
 * Leaderboard — the leaderboard worksheet itself, as a table: same
 * columns, same order (Player/Sessions played/Total buy-ins (#)/Total
 * staked (₹)/Net winnings (₹)/Rank — lib/pokerLedgerSeed.ts's own
 * design, every column already formula-computed sheet-side), just
 * this app's own colors instead of the sheet's. Player is frozen (like
 * GameSessionsScreen's own player column) since the other 5 are a
 * fixed, known set — no unbounded growth here to justify a scrollable
 * column axis, but keeping the frozen/scroll split anyway keeps this
 * screen visually consistent with Game Sessions right next to it.
 *
 * Rows are ordered by the sheet's own Rank column, not re-derived here
 * — a tie then resolves exactly the way the sheet itself broke it
 * rather than however Array.sort's tie-breaking happens to land.
 *
 * Reached from GameSessionsScreen's own "🏆 Leaderboard" button — takes
 * `players`/`useAlias` from there (not fetched here) purely so a
 * player's display name matches the table's alias setting; the
 * leaderboard sheet itself only stores real names (formula-linked to
 * players-info).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from './ui/Button';
import IconButton from './ui/IconButton';
import { displayName } from '../lib/displayName';
import { formatNet } from '../lib/formatNet';
import { getValues } from '../lib/googleSheetsApi';
import { TABS } from '../lib/pokerLedgerSeed';
import type { Player } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

type Props = {
  players: Player[];
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  useAlias: boolean;
  onBack: () => void;
};

type Row = { name: string; sessions: number; buyIns: number; staked: number; net: number; rank: number };

const ROW_HEIGHT = 44;
const HEADER_ROW_HEIGHT = 52; // taller than ROW_HEIGHT — headers wrap to 2 lines ("Total buy-ins (#)" etc), values don't
const PLAYER_COL_WIDTH = 110;
const VALUE_COL_WIDTH = 96;

// Rank 1/2/3 get a medal instead of a plain "#4" — the button that
// opens this screen already carries the general 🏆; medals here read
// as "top of the table" at a glance without repeating that emoji.
const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen({ players, spreadsheetId, getAccessToken, useAlias, onBack }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const values = await getValues(spreadsheetId, `${TABS.leaderboard}!A2:F200`, accessToken);
      const parsed: Row[] = values
        .filter((row) => (row[0] ?? '').trim() !== '')
        .map((row) => ({
          name: (row[0] ?? '').trim(),
          sessions: Number(row[1]) || 0,
          buyIns: Number(row[2]) || 0,
          staked: Number(row[3]) || 0,
          net: Number(row[4]) || 0,
          rank: Number(row[5]) || 0,
        }))
        .sort((a, b) => a.rank - b.rank);
      setRows(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [spreadsheetId, getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const displayNameFor = (name: string) => {
    const player = players.find((p) => p.name === name);
    return player ? displayName(player, useAlias) : name;
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>🏆 Leaderboard</Text>
        <IconButton icon="⟳" onPress={load} />
      </View>

      {rows === null ? (
        <ActivityIndicator color={theme.colors.accent} style={styles.loadingCenter} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.frozenCol}>
            <View style={styles.headerCell}>
              <Text style={styles.headerCellText} numberOfLines={1}>
                Player
              </Text>
            </View>
            {rows.map((r) => (
              <View key={r.name} style={styles.playerCell}>
                <Text style={styles.playerCellText} numberOfLines={1}>
                  {displayNameFor(r.name)}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.dataRow}>
                <View style={[styles.headerCell, styles.valueCol]}>
                  <Text style={styles.headerCellText} numberOfLines={2}>
                    Sessions played
                  </Text>
                </View>
                <View style={[styles.headerCell, styles.valueCol]}>
                  <Text style={styles.headerCellText} numberOfLines={2}>
                    Total buy-ins (#)
                  </Text>
                </View>
                <View style={[styles.headerCell, styles.valueCol]}>
                  <Text style={styles.headerCellText} numberOfLines={2}>
                    Total staked (₹)
                  </Text>
                </View>
                <View style={[styles.headerCell, styles.valueCol]}>
                  <Text style={styles.headerCellText} numberOfLines={2}>
                    Net winnings (₹)
                  </Text>
                </View>
                <View style={[styles.headerCell, styles.valueCol]}>
                  <Text style={styles.headerCellText} numberOfLines={1}>
                    Rank
                  </Text>
                </View>
              </View>
              {rows.map((r) => (
                <View key={r.name} style={styles.dataRow}>
                  <View style={[styles.valueCell, styles.valueCol]}>
                    <Text style={styles.valueCellText}>{r.sessions}</Text>
                  </View>
                  <View style={[styles.valueCell, styles.valueCol]}>
                    <Text style={styles.valueCellText}>{r.buyIns}</Text>
                  </View>
                  <View style={[styles.valueCell, styles.valueCol]}>
                    <Text style={styles.valueCellText}>₹{Math.round(r.staked)}</Text>
                  </View>
                  <View style={[styles.valueCell, styles.valueCol]}>
                    <Text style={[styles.valueCellText, r.net > 0 ? styles.positive : r.net < 0 ? styles.negative : undefined]}>
                      {formatNet(r.net)}
                    </Text>
                  </View>
                  <View style={[styles.valueCell, styles.valueCol]}>
                    <Text style={styles.valueCellText}>{MEDALS[r.rank - 1] ?? `#${r.rank}`}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <Button label="Game Sessions" variant="secondary" onPress={onBack} />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 20, gap: 12 },
    error: { color: theme.colors.danger, textAlign: 'center', marginBottom: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: theme.font.size.xl, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginVertical: 12 },
    loadingCenter: { marginVertical: 24 },
    table: { flexDirection: 'row', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden' },
    frozenCol: { width: PLAYER_COL_WIDTH, borderRightWidth: 1, borderRightColor: theme.colors.borderStrong },
    dataRow: { flexDirection: 'row' },
    valueCol: { width: VALUE_COL_WIDTH, borderRightWidth: 1, borderRightColor: theme.colors.border },
    headerCell: {
      height: HEADER_ROW_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
      backgroundColor: theme.colors.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderStrong,
    },
    headerCellText: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary, textAlign: 'center' },
    playerCell: { height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    playerCellText: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, color: theme.colors.textPrimary },
    valueCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    valueCellText: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, color: theme.colors.textSecondary },
    positive: { color: theme.colors.success },
    negative: { color: theme.colors.danger },
  });
