/**
 * Global player accounts — one real person, reusable across every table
 * they're added to (lib/playerAccounts.ts). Lists existing accounts and
 * lets you create a new one; adding an account to a particular table
 * happens from that table's Players screen (components/TableScreen.tsx),
 * not here.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { createAccount, listAccounts, type PlayerAccount } from '../lib/playerAccounts';

type Props = {
  userId: string;
  getAccessToken: () => Promise<string>;
  onBack: () => void;
};

export default function PlayerAccountsScreen({ userId, getAccessToken, onBack }: Props) {
  const [accounts, setAccounts] = useState<PlayerAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [alias, setAlias] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useMemo(
    () => async () => {
      setError(null);
      try {
        const accessToken = await getAccessToken();
        setAccounts(await listAccounts(userId, accessToken));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [userId, getAccessToken]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await createAccount(userId, { name: name.trim(), email: email.trim(), alias: alias.trim() }, accessToken);
      setName('');
      setEmail('');
      setAlias('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>‹ Tables</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Player Accounts</Text>
          <Pressable style={styles.refreshBtn} onPress={load}>
            <Text style={styles.refreshBtnText}>⟳</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator />
        ) : (accounts ?? []).length === 0 ? (
          <Text style={styles.empty}>No accounts yet.</Text>
        ) : (
          (accounts ?? []).map((a) => (
            <View key={a.id} style={styles.accountRow}>
              <Text style={styles.accountAlias}>{a.alias || a.name}</Text>
              <Text style={styles.accountDetail}>
                {a.name} · {a.email}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>New Account</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput style={styles.input} value={alias} onChangeText={setAlias} placeholder="Alias (optional)" autoCapitalize="words" />
        <Pressable style={styles.primaryBtn} disabled={creating || !name.trim() || !email.trim()} onPress={handleCreate}>
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backLink: { paddingHorizontal: 20, paddingVertical: 12, paddingTop: 60 },
  backLinkText: { color: '#2f95dc', fontWeight: '600', fontSize: 16 },
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  refreshBtnText: { color: '#2f95dc', fontWeight: '700', fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', opacity: 0.6, marginTop: 8 },
  empty: { opacity: 0.6, textAlign: 'center', marginVertical: 12 },
  accountRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
    gap: 2,
  },
  accountAlias: { fontSize: 16, fontWeight: '700' },
  accountDetail: { fontSize: 13, opacity: 0.6 },
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
