/**
 * Cash-outs: only players currently in the game (Buy-ins(#) > 0) —
 * unlike Cash-in, this isn't how you join a game. Each row: a white
 * input for the new Final chips value, and a grey read-only display
 * of whatever the sheet currently holds for them this session (0 if
 * blank). Reuses lib/pokerActions.ts#cashIn (buyInDelta: 0, chips set
 * directly) — no new service method needed.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import DoubleTapButton from './DoubleTapButton';
import { PokerLedgerService, type CashInEntry, type CurrentGameInfo } from '../lib/pokerActions';

type Props = {
  gameInfo: CurrentGameInfo | null;
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
};

export default function CashOutScreen({ gameInfo, spreadsheetId, getAccessToken, onBack, onChanged }: Props) {
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);

  // Local, staged — nothing is written until Cash out.
  const [chipsInputs, setChipsInputs] = useState<Record<string, string>>({});

  const playingPlayers = (gameInfo?.players ?? []).filter((p) => p.buyIns > 0);

  const handleCashOut = async () => {
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const entries: CashInEntry[] = playingPlayers
        .map((p): CashInEntry | null => {
          const text = chipsInputs[p.name];
          if (text === undefined || text.trim() === '') return null;
          return { playerName: p.name, buyInDelta: 0, chips: Number(text) || 0 };
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
        <Text style={styles.sectionTitle}>Cash-outs</Text>
        <Pressable style={styles.refreshBtn} onPress={onChanged}>
          <Text style={styles.refreshBtnText}>⟳</Text>
        </Pressable>
      </View>

      {playingPlayers.length === 0 ? (
        <Text style={styles.empty}>No players in the current game.</Text>
      ) : (
        playingPlayers.map((p) => (
          <View key={p.name} style={styles.playerCard}>
            <Text style={styles.playerName}>{p.name}</Text>
            <TextInput
              style={styles.chipsInput}
              value={chipsInputs[p.name] ?? ''}
              onChangeText={(v) => setChipsInputs((prev) => ({ ...prev, [p.name]: v }))}
              keyboardType="number-pad"
              placeholder="Final chips"
            />
            <View style={styles.greyBox}>
              <Text style={styles.greyLabel}>Sheet reads:</Text>
              <Text style={styles.greyText}>{p.finalChips || 0}</Text>
            </View>
          </View>
        ))
      )}

      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Table screen</Text>
      </Pressable>

      <DoubleTapButton label="Cash out" armedLabel="Tap again to cash out" onConfirm={handleCashOut} />
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
  chipsInput: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  greyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
  },
  greyLabel: { fontSize: 12, opacity: 0.6 },
  greyText: { fontWeight: '600' },
  backBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  backBtnText: { fontWeight: '600', fontSize: 14 },
});
