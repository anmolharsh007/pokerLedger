import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PokerLedgerService, type Player } from '../lib/pokerActions';

type Props = {
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
};

export default function RecordSessionScreen({ spreadsheetId, getAccessToken }: Props) {
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [date, setDate] = useState('');
  const [ratio, setRatio] = useState('');
  const [buyInAmount, setBuyInAmount] = useState('');
  const [perPlayer, setPerPlayer] = useState<Record<string, { buyIns: string; finalChips: string }>>({});

  const load = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      const roster = await service.listPlayers(accessToken);
      setPlayers(roster);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [service, getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const setPlayerField = (name: string, field: 'buyIns' | 'finalChips', value: string) => {
    setPerPlayer((prev) => ({ ...prev, [name]: { ...prev[name], [field]: value } }));
  };

  const handleSubmit = async () => {
    if (!players) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const accessToken = await getAccessToken();
      await service.addSession(
        {
          date,
          ratio: Number(ratio) || 0,
          buyInAmount: Number(buyInAmount) || 0,
          players: players.map((p) => ({
            name: p.name,
            buyIns: Number(perPlayer[p.name]?.buyIns) || 0,
            finalChips: Number(perPlayer[p.name]?.finalChips) || 0,
          })),
        },
        accessToken
      );
      setSuccessMessage('Session recorded.');
      setPerPlayer({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.primaryBtn} onPress={load}>
          <Text style={styles.primaryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (players === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Session</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Date (e.g. 2026-08-27)" />
      <TextInput style={styles.input} value={ratio} onChangeText={setRatio} placeholder="ratio (₹ per chip)" keyboardType="numeric" />
      <TextInput
        style={styles.input}
        value={buyInAmount}
        onChangeText={setBuyInAmount}
        placeholder="Buy-in (₹)"
        keyboardType="numeric"
      />

      <Text style={styles.sectionTitle}>Players</Text>
      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet — add some on the Players tab first.</Text>
      ) : (
        players.map((p) => (
          <View key={p.row} style={styles.playerRow}>
            <Text style={styles.playerName}>{p.name}</Text>
            <View style={styles.playerInputs}>
              <TextInput
                style={styles.smallInput}
                value={perPlayer[p.name]?.buyIns ?? ''}
                onChangeText={(v) => setPlayerField(p.name, 'buyIns', v)}
                placeholder="Buy-ins(#)"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.smallInput}
                value={perPlayer[p.name]?.finalChips ?? ''}
                onChangeText={(v) => setPlayerField(p.name, 'finalChips', v)}
                placeholder="Final chips"
                keyboardType="numeric"
              />
            </View>
          </View>
        ))
      )}

      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
      <Pressable style={styles.primaryBtn} disabled={submitting || players.length === 0} onPress={handleSubmit}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Record Session</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  success: { color: '#2a7a2a', textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', opacity: 0.6, marginTop: 8 },
  empty: { opacity: 0.6, textAlign: 'center', marginVertical: 12 },
  playerRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
    gap: 8,
  },
  playerName: { fontSize: 16, fontWeight: '700' },
  playerInputs: { flexDirection: 'row', gap: 8 },
  input: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  smallInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  primaryBtn: {
    backgroundColor: '#2f95dc',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
