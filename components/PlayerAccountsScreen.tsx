/**
 * Global player accounts — one real person, reusable across every table
 * they're added to (lib/playerAccounts.ts). Lists existing accounts and
 * lets you create a new one; adding an account to a particular table
 * happens from that table's Players screen (components/TableScreen.tsx),
 * not here.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import BrandHeader from './ui/BrandHeader';
import Button from './ui/Button';
import Card from './ui/Card';
import IconButton from './ui/IconButton';
import TextField from './ui/TextField';
import { createAccount, listAccounts, type PlayerAccount } from '../lib/playerAccounts';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

type Props = {
  userId: string;
  getAccessToken: () => Promise<string>;
  onBack: () => void;
};

export default function PlayerAccountsScreen({ userId, getAccessToken, onBack }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      <BrandHeader />
      <Pressable style={({ pressed }) => [styles.backLink, pressed && styles.pressedDim]} onPress={onBack}>
        <Text style={styles.backLinkText}>‹ Tables</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Player Accounts</Text>
          <IconButton icon="⟳" onPress={load} />
        </View>

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : (accounts ?? []).length === 0 ? (
          <Text style={styles.empty}>No accounts yet.</Text>
        ) : (
          (accounts ?? []).map((a) => (
            <Card key={a.id} style={styles.accountRow}>
              <Text style={styles.accountAlias}>{a.alias || a.name}</Text>
              <Text style={styles.accountDetail}>
                {a.name} · {a.email}
              </Text>
            </Card>
          ))
        )}

        <Text style={styles.sectionTitle}>New Account</Text>
        <TextField value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
        <TextField value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        <TextField value={alias} onChangeText={setAlias} placeholder="Alias (optional)" autoCapitalize="words" />
        <Button label="Create Account" loading={creating} disabled={creating || !name.trim() || !email.trim()} onPress={handleCreate} />
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    pressedDim: { opacity: 0.6 },
    backLink: { paddingHorizontal: 20, paddingVertical: 12, paddingTop: 60 },
    backLinkText: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.md },
    content: { padding: 20, gap: 12 },
    error: { color: theme.colors.danger, textAlign: 'center', marginBottom: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: theme.font.size.md, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary, marginTop: 8 },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginVertical: 12 },
    accountRow: { paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
    // Card text sized up 30% (same bump app-wide).
    accountAlias: { fontSize: theme.font.size.md * 1.3, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    accountDetail: { fontSize: theme.font.size.sm * 1.3, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary },
  });
