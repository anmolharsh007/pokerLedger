/**
 * Cash-ins: a rebuy for a player already in the game, or joining an
 * already in-progress game for a registered player who isn't in it
 * yet (starts at 1 buy-in, same as All+/Group+). Buy-ins only — no
 * chips here (that's Cash-out's job). Every value write here goes
 * through lib/pokerActions.ts#cashIn — no structural writes needed
 * (see that method's doc comment for why).
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import DoubleTapButton from './DoubleTapButton';
import { PokerLedgerService, type CashInEntry, type CurrentGameInfo, type Player } from '../lib/pokerActions';

type Props = {
  players: Player[];
  gameInfo: CurrentGameInfo | null;
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
};

export default function CashInScreen({ players, gameInfo, spreadsheetId, getAccessToken, onBack, onChanged }: Props) {
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);

  // Local, staged — nothing is written until Add.
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  const currentFor = (name: string) => gameInfo?.players.find((p) => p.name === name) ?? { buyIns: 0, finalChips: 0 };

  // Buy-in count (current + delta) can never go below zero.
  const bumpDelta = (name: string, by: number) => {
    setDeltas((prev) => {
      const current = currentFor(name).buyIns;
      const nextDelta = (prev[name] ?? 0) + by;
      if (current + nextDelta < 0) return prev;
      return { ...prev, [name]: nextDelta };
    });
  };

  const handleAdd = async () => {
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const entries: CashInEntry[] = players
        .map((p): CashInEntry | null => {
          const delta = deltas[p.name] ?? 0;
          if (delta === 0) return null;
          return { playerName: p.name, buyInDelta: delta };
        })
        .filter((e): e is CashInEntry => e !== null);

      if (entries.length > 0) {
        await service.cashIn(entries, accessToken);
      }
      await onChanged();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Cash-ins</Text>
        <Pressable style={styles.refreshBtn} onPress={onChanged}>
          <Text style={styles.refreshBtnText}>⟳</Text>
        </Pressable>
      </View>

      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        players.map((p) => {
          const current = currentFor(p.name);
          const delta = deltas[p.name] ?? 0;
          const warn = current.buyIns === 0 && delta > 0;
          return (
            <View key={p.row} style={styles.playerCard}>
              <Text style={styles.playerName}>{p.name}</Text>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Buy-ins</Text>
                <View style={styles.greyBox}>
                  <Text style={styles.greyText}>{current.buyIns}</Text>
                </View>
                <View style={styles.stepperRow}>
                  <Pressable style={styles.stepperBtn} onPress={() => bumpDelta(p.name, -1)}>
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <View style={styles.whiteBox}>
                    <Text style={styles.whiteText}>{delta > 0 ? `+${delta}` : delta}</Text>
                  </View>
                  <Pressable style={styles.stepperBtn} onPress={() => bumpDelta(p.name, 1)}>
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>

              {warn && <Text style={styles.warning}>This adds {p.name} to the current game.</Text>}
            </View>
          );
        })
      )}

      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Table screen</Text>
      </Pressable>

      <DoubleTapButton label="Add" armedLabel="Tap again to add" onConfirm={handleAdd} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', opacity: 0.6 },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  refreshBtnText: { color: '#2f95dc', fontWeight: '700', fontSize: 18 },
  empty: { opacity: 0.6, textAlign: 'center', marginVertical: 12 },
  playerCard: { backgroundColor: '#f4f4f4', borderRadius: 10, padding: 14, gap: 8 },
  playerName: { fontSize: 16, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { width: 55, fontSize: 13, opacity: 0.6, fontWeight: '600' },
  greyBox: {
    minWidth: 40,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    alignItems: 'center',
  },
  greyText: { fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  whiteBox: {
    minWidth: 44,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  whiteText: { fontWeight: '600' },
  warning: { color: '#b8860b', fontSize: 12, fontWeight: '600' },
  backBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  backBtnText: { fontWeight: '600', fontSize: 14 },
});
