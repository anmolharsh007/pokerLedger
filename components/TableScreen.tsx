/**
 * This project's own screen (not sheet-ui's generic Config-tab
 * renderer — see lib/pokerLedgerSeed.ts for why). Shows the current
 * player roster, the "use alias" display toggle for this table, and
 * lets you add a player from a global account (lib/playerAccounts.ts)
 * — pick an existing one or create a new one inline — exercising
 * lib/pokerActions.ts#addPlayer end to end: players-info gets a new
 * row, net-results a formula-linked row, session-log a new merged
 * 2-column block.
 *
 * Doesn't fetch its own roster — all worksheet data is read once,
 * when the table is opened (TableHome.tsx's load()), and handed down
 * as props. After a mutation (adding a player, toggling use-alias)
 * this calls `onChanged` so the parent re-reads from the sheet, rather
 * than re-fetching here itself. Accounts are this screen's own local
 * state though, since they're global (not part of the table's sheet).
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { displayName } from '../lib/displayName';
import { PokerLedgerService, type Player, type TableInfoData } from '../lib/pokerActions';
import { addSheetToAccount, createAccount, listAccounts, type PlayerAccount } from '../lib/playerAccounts';

type Props = {
  spreadsheetId: string;
  userId: string;
  getAccessToken: () => Promise<string>;
  players: Player[];
  tableInfo: TableInfoData | null;
  onChanged: () => void | Promise<void>;
};

export default function TableScreen({ spreadsheetId, userId, getAccessToken, players, tableInfo, onChanged }: Props) {
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);
  const useAlias = tableInfo?.useAlias ?? false;

  const [togglingAlias, setTogglingAlias] = useState(false);

  const [accounts, setAccounts] = useState<PlayerAccount[] | null>(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAlias, setNewAlias] = useState('');

  const loadAccounts = useMemo(
    () => async () => {
      try {
        const accessToken = await getAccessToken();
        setAccounts(await listAccounts(userId, accessToken));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [userId, getAccessToken]
  );

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleToggleAlias = async () => {
    setTogglingAlias(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await service.setUseAlias(!useAlias, accessToken);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingAlias(false);
    }
  };

  const addAccountToTable = async (account: PlayerAccount) => {
    setAdding(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await service.addPlayer(account.name, account.email, account.alias, accessToken);
      await addSheetToAccount(userId, account.id, spreadsheetId, accessToken);
      await Promise.all([onChanged(), loadAccounts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const account = await createAccount(userId, { name: newName.trim(), email: newEmail.trim(), alias: newAlias.trim() }, accessToken);
      await service.addPlayer(account.name, account.email, account.alias, accessToken);
      await addSheetToAccount(userId, account.id, spreadsheetId, accessToken);
      setNewName('');
      setNewEmail('');
      setNewAlias('');
      setShowNewAccount(false);
      await Promise.all([onChanged(), loadAccounts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const query = search.trim().toLowerCase();
  const filteredAccounts = (accounts ?? []).filter((a) => {
    if (!query) return true;
    return a.alias.toLowerCase().includes(query) || a.email.toLowerCase().includes(query) || a.name.toLowerCase().includes(query);
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Players</Text>
        <View style={styles.headerActions}>
          <Pressable style={[styles.aliasToggle, useAlias && styles.aliasToggleActive]} disabled={togglingAlias} onPress={handleToggleAlias}>
            {togglingAlias ? (
              <ActivityIndicator size="small" color={useAlias ? '#fff' : '#2f95dc'} />
            ) : (
              <Text style={[styles.aliasToggleText, useAlias && styles.aliasToggleTextActive]}>Use alias</Text>
            )}
          </Pressable>
          <Pressable style={styles.refreshBtn} onPress={onChanged}>
            <Text style={styles.refreshBtnText}>⟳</Text>
          </Pressable>
        </View>
      </View>
      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        players.map((p) => (
          <View key={p.row} style={styles.playerRow}>
            <Text style={styles.playerName}>{displayName(p, useAlias)}</Text>
            <Text style={styles.playerEmail}>{p.email || '—'}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Add Player</Text>
      <TextInput
        style={styles.input}
        value={search}
        onChangeText={setSearch}
        placeholder="Search accounts by alias or email"
        autoCapitalize="none"
      />
      {accounts === null ? (
        <ActivityIndicator />
      ) : filteredAccounts.length === 0 ? (
        <Text style={styles.empty}>No matching accounts.</Text>
      ) : (
        filteredAccounts.map((a) => {
          const alreadyOnTable = a.allSheets.includes(spreadsheetId);
          return (
            <Pressable
              key={a.id}
              style={[styles.accountRow, alreadyOnTable && styles.accountRowDisabled]}
              disabled={alreadyOnTable || adding}
              onPress={() => addAccountToTable(a)}>
              <View style={styles.accountInfo}>
                <Text style={styles.accountAlias}>{a.alias || a.name}</Text>
                <Text style={styles.accountDetail}>
                  {a.name} · {a.email}
                </Text>
              </View>
              {alreadyOnTable ? <Text style={styles.accountBadge}>Already on this table</Text> : null}
            </Pressable>
          );
        })
      )}

      {showNewAccount ? (
        <View style={styles.newAccountForm}>
          <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Name" autoCapitalize="words" />
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput style={styles.input} value={newAlias} onChangeText={setNewAlias} placeholder="Alias (optional)" autoCapitalize="words" />
          <View style={styles.newAccountActions}>
            <Pressable style={styles.primaryBtn} disabled={adding || !newName.trim() || !newEmail.trim()} onPress={handleCreateAndAdd}>
              {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create & Add</Text>}
            </Pressable>
            <Pressable style={styles.secondaryBtn} disabled={adding} onPress={() => setShowNewAccount(false)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.secondaryBtn} onPress={() => setShowNewAccount(true)}>
          <Text style={styles.secondaryBtnText}>+ New Account</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  refreshBtnText: { color: '#2f95dc', fontWeight: '700', fontSize: 18 },
  aliasToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2f95dc',
    minWidth: 74,
    alignItems: 'center',
  },
  aliasToggleActive: { backgroundColor: '#2f95dc' },
  aliasToggleText: { color: '#2f95dc', fontWeight: '600', fontSize: 12 },
  aliasToggleTextActive: { color: '#fff' },
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
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#eef6fc',
    borderRadius: 10,
    gap: 8,
  },
  accountRowDisabled: { backgroundColor: '#eee', opacity: 0.6 },
  accountInfo: { flex: 1, gap: 2 },
  accountAlias: { fontSize: 15, fontWeight: '700' },
  accountDetail: { fontSize: 12, opacity: 0.6 },
  accountBadge: { fontSize: 11, fontWeight: '600', opacity: 0.6 },
  newAccountForm: { gap: 10 },
  newAccountActions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    backgroundColor: '#2f95dc',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  secondaryBtnText: { fontWeight: '600', fontSize: 14 },
});
