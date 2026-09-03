/**
 * Game Sessions — every *completed* past game at this table, players
 * down the rows, one column per game, newest game leftmost. Cell values
 * are each player's net result for that game
 * (lib/pokerActions.ts#sessionNet): cash-out value minus buy-in cost. A
 * player who sat a game out (no buy-ins, no chips recorded) shows a
 * dash instead of ₹0.
 *
 * "Completed" (listSessions' own filter, not this screen's) means every
 * player who bought in has a cash-out entered — an in-progress or
 * abandoned game is skipped rather than shown as a finished result.
 * Because that filtering can shrink a row-window's yield unpredictably,
 * pagination here follows listSessions' own `nextBefore` cursor rather
 * than assuming a page always holds PAGE_SIZE sessions or that the last
 * *returned* session's row is where the next scan should resume.
 *
 * Read-only — no writes happen here. Loads a page of the most recent
 * PAGE_SIZE games up front (lib/pokerActions.ts#listSessions) rather
 * than the whole session-log history at once; scrolling the game
 * columns toward the end fetches the next older page and appends it,
 * same direction the user is scrolling in.
 *
 * The player-name and Net columns are frozen (outside the horizontal
 * ScrollView) since they're small and fixed — game columns are the axis
 * that grows without bound as more sessions get played. Net is each
 * player's lifetime total from the net-results sheet tab (same number
 * NetResultsScreen shows) rather than a sum of just the loaded game
 * columns — the latter would silently grow as more columns page in
 * while scrolling.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import Button from './ui/Button';
import IconButton from './ui/IconButton';
import { displayName } from '../lib/displayName';
import { getValues } from '../lib/googleSheetsApi';
import { TABS } from '../lib/pokerLedgerSeed';
import { PokerLedgerService, sessionNet, type CurrentGameInfo, type Player } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

const PAGE_SIZE = 5;
const ROW_HEIGHT = 44;
const PLAYER_COL_WIDTH = 110;
const NET_COL_WIDTH = 84;
const GAME_COL_WIDTH = 84;
// How close to the end of the scrollable content (in px) triggers the
// next page fetch — loads a little before the user actually hits the
// edge, so the next columns are usually already there by the time they arrive.
const SCROLL_LOAD_THRESHOLD = 120;

type Props = {
  players: Player[];
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  useAlias: boolean;
  onBack: () => void;
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatNet(net: number): string {
  const rounded = Math.round(net);
  if (rounded === 0) return '₹0';
  return `${rounded > 0 ? '+' : '-'}₹${Math.abs(rounded)}`;
}

export default function GameSessionsScreen({ players, spreadsheetId, getAccessToken, useAlias, onBack }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);

  const [sessions, setSessions] = useState<CurrentGameInfo[]>([]);
  const [netTotals, setNetTotals] = useState<Record<string, number> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Where the next page's scan should resume from — listSessions' own
  // cursor, not derived from the last *returned* session's row (a page
  // can legitimately return fewer than PAGE_SIZE, even zero, once
  // in-progress/abandoned games are filtered out).
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const [result, netRows] = await Promise.all([
        service.listSessions(accessToken, PAGE_SIZE),
        getValues(spreadsheetId, `${TABS.netResults}!A2:B200`, accessToken),
      ]);
      setSessions(result.sessions);
      setHasMore(result.hasMore);
      setNextBefore(result.nextBefore);
      const totals: Record<string, number> = {};
      for (const [name, total] of netRows) {
        if ((name ?? '').trim() === '') continue;
        totals[name.trim()] = Number(total) || 0;
      }
      setNetTotals(totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, service, spreadsheetId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || nextBefore === null) return;
    setLoadingMore(true);
    try {
      const accessToken = await getAccessToken();
      const result = await service.listSessions(accessToken, PAGE_SIZE, nextBefore);
      setSessions((prev) => [...prev, ...result.sessions]);
      setHasMore(result.hasMore);
      setNextBefore(result.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextBefore, getAccessToken, service]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!hasMore || loadingMore) return;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      if (contentOffset.x + layoutMeasurement.width >= contentSize.width - SCROLL_LOAD_THRESHOLD) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loadMore]
  );

  const tableHeight = ROW_HEIGHT * (players.length + 1);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Game Sessions</Text>
        <IconButton icon="⟳" onPress={load} />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.accent} style={styles.loadingCenter} />
      ) : players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>No games recorded yet.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.frozenCol}>
            <View style={styles.headerCell}>
              <Text style={styles.headerCellText} numberOfLines={1}>
                Player
              </Text>
            </View>
            {players.map((p) => (
              <View key={p.row} style={styles.playerCell}>
                <Text style={styles.playerCellText} numberOfLines={1}>
                  {displayName(p, useAlias)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.netCol}>
            <View style={styles.headerCell}>
              <Text style={styles.headerCellText} numberOfLines={1}>
                Net
              </Text>
            </View>
            {players.map((p) => {
              const total = netTotals?.[p.name] ?? 0;
              return (
                <View key={p.row} style={styles.valueCell}>
                  <Text style={[styles.valueCellText, total > 0 ? styles.positive : total < 0 ? styles.negative : undefined]}>
                    {netTotals ? formatNet(total) : '—'}
                  </Text>
                </View>
              );
            })}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
            <View style={styles.gamesRow}>
              {sessions.map((session) => (
                <View key={session.row} style={styles.gameCol}>
                  <View style={styles.headerCell}>
                    <Text style={styles.headerCellText} numberOfLines={1}>
                      {formatDate(session.date)}
                    </Text>
                  </View>
                  {players.map((p) => {
                    const entry = session.players.find((sp) => sp.name === p.name);
                    const played = !!entry && (entry.buyIns !== 0 || entry.finalChips !== 0);
                    const net = entry ? sessionNet(entry, session.ratio, session.buyInAmount) : 0;
                    return (
                      <View key={p.row} style={styles.valueCell}>
                        <Text style={[styles.valueCellText, played && (net > 0 ? styles.positive : net < 0 ? styles.negative : undefined)]}>
                          {played ? formatNet(net) : '—'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              {loadingMore && hasMore && (
                <View style={[styles.loadingCol, { height: tableHeight }]}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      <Button label="Table screen" variant="secondary" onPress={onBack} />
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
    netCol: { width: NET_COL_WIDTH, borderRightWidth: 1, borderRightColor: theme.colors.borderStrong },
    gamesRow: { flexDirection: 'row' },
    gameCol: { width: GAME_COL_WIDTH, borderRightWidth: 1, borderRightColor: theme.colors.border },
    headerCell: {
      height: ROW_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: 8,
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
    loadingCol: { width: GAME_COL_WIDTH, alignItems: 'center', justifyContent: 'center' },
  });
