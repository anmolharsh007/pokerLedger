/**
 * This project's own screen (not sheet-ui's generic Config-tab
 * renderer — see lib/pokerLedgerSeed.ts for why). Shows the current
 * player roster and lets you add a new one, exercising
 * lib/pokerActions.ts#addPlayer end to end: players-info gets a new
 * row, net-results a formula-linked row, session-log a new merged
 * 2-column block.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { addPlayer, listPlayers, type Player } from '../lib/pokerActions';

type Props = {
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
};

export default function TableScreen({ spreadsheetId, getAccessToken }: Props) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      const roster = await listPlayers(spreadsheetId, accessToken);
      setPlayers(roster);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [spreadsheetId, getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddPlayer = async () => {
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await addPlayer(spreadsheetId, accessToken, name.trim(), email.trim());
      setName('');
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
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
      <Text style={styles.sectionTitle}>Players</Text>
      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        players.map((p) => (
          <View key={p.row} style={styles.playerRow}>
            <Text style={styles.playerName}>{p.name}</Text>
            <Text style={styles.playerEmail}>{p.email || '—'}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Add Player</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email (optional)"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Pressable style={styles.primaryBtn} disabled={adding || !name.trim()} onPress={handleAddPlayer}>
        {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Add Player</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', opacity: 0.6, marginTop: 8 },
  empty: { opacity: 0.6, textAlign: 'center', marginVertical: 12 },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
  },
  playerName: { fontSize: 16, fontWeight: '700' },
  playerEmail: { fontSize: 13, opacity: 0.6 },
  input: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
