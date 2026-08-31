/**
 * This project's own screen (not sheet-ui's generic Config-tab
 * renderer — see lib/pokerLedgerSeed.ts for why). Shows the current
 * player roster, the "use alias" display toggle for this table, and
 * lets you add a player from a global account (lib/playerAccounts.ts)
 * — pick an existing one or create a new one inline — exercising
 * lib/pokerActions.ts#addPlayer end to end: players-info gets a new
 * row, net-results a formula-linked row, session-log a new merged
 * 2-column block. Since every account carries a real email, adding one
 * also grants them real Drive access (lib/googleDriveApi.ts#grantPermission)
 * and writes the cross-table discovery-index entry
 * (lib/accountsApi.ts#inviteToAccount) — same two effects
 * components/AllPlayersScreen.tsx's QR-claim flow produces for a
 * name-only player once their email is filled in later.
 *
 * Doesn't fetch its own roster — all worksheet data is read once,
 * when the table is opened (TableHome.tsx's load()), and handed down
 * as props. After a mutation (adding a player, toggling use-alias)
 * this calls `onChanged` so the parent re-reads from the sheet, rather
 * than re-fetching here itself. Accounts are this screen's own local
 * state though, since they're global (not part of the table's sheet).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from './ui/Button';
import Card from './ui/Card';
import IconButton from './ui/IconButton';
import TextField from './ui/TextField';
import { inviteToAccount } from '../lib/accountsApi';
import { displayName } from '../lib/displayName';
import { grantPermission } from '../lib/googleDriveApi';
import { PokerLedgerService, type Player, type TableInfoData } from '../lib/pokerActions';
import { addSheetToAccount, createAccount, listAccounts, type PlayerAccount } from '../lib/playerAccounts';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

type Props = {
  spreadsheetId: string;
  userId: string;
  tableName: string;
  getAccessToken: () => Promise<string>;
  players: Player[];
  tableInfo: TableInfoData | null;
  onChanged: () => void | Promise<void>;
};

export default function TableScreen({ spreadsheetId, userId, tableName, getAccessToken, players, tableInfo, onChanged }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  // Real Drive access + the cross-table discovery-index write — same
  // two effects components/AllPlayersScreen.tsx's QR-claim flow
  // produces once a name-only player's email is filled in. Both
  // best-effort: the players-info row is already the source of truth,
  // written either way, so a failure here is surfaced (not swallowed)
  // but doesn't undo the add.
  const grantAccessAndInvite = async (accountName: string, email: string, accessToken: string) => {
    try {
      await grantPermission(spreadsheetId, email, 'writer', accessToken);
    } catch (permErr) {
      setError(`${accountName} was added, but granting them edit access failed: ` + (permErr instanceof Error ? permErr.message : String(permErr)));
    }
    await inviteToAccount(email, { spreadsheetId, name: tableName });
  };

  const addAccountToTable = async (account: PlayerAccount) => {
    setAdding(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await service.addPlayer(account.name, account.email, account.alias, accessToken);
      await addSheetToAccount(userId, account.id, spreadsheetId, accessToken);
      await grantAccessAndInvite(account.name, account.email, accessToken);
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
      await grantAccessAndInvite(account.name, account.email, accessToken);
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
          <Pressable
            style={[styles.aliasToggle, useAlias && styles.aliasToggleActive]}
            disabled={togglingAlias}
            onPress={handleToggleAlias}>
            <Text style={styles.aliasToggleText}>Use alias</Text>
          </Pressable>
          <IconButton icon="⟳" onPress={onChanged} />
        </View>
      </View>
      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        players.map((p) => (
          <Card key={p.row} style={styles.playerRow}>
            <Text style={styles.playerName}>{displayName(p, useAlias)}</Text>
            <Text style={styles.playerEmail}>{p.email || '—'}</Text>
          </Card>
        ))
      )}

      <Text style={styles.sectionTitle}>Add Player</Text>
      <TextField value={search} onChangeText={setSearch} placeholder="Search accounts by alias or email" autoCapitalize="none" />
      {accounts === null ? (
        <Text style={styles.empty}>Loading accounts…</Text>
      ) : filteredAccounts.length === 0 ? (
        <Text style={styles.empty}>No matching accounts.</Text>
      ) : (
        filteredAccounts.map((a) => {
          const alreadyOnTable = a.allSheets.includes(spreadsheetId);
          return (
            <Pressable key={a.id} disabled={alreadyOnTable || adding} onPress={() => addAccountToTable(a)}>
              <Card style={styles.playerRow} highlighted={alreadyOnTable}>
                <View style={styles.accountInfo}>
                  <Text style={styles.playerName}>{a.alias || a.name}</Text>
                  <Text style={styles.playerEmail}>
                    {a.name} · {a.email}
                  </Text>
                </View>
                {alreadyOnTable ? <Text style={styles.accountBadge}>Already on this table</Text> : null}
              </Card>
            </Pressable>
          );
        })
      )}

      {showNewAccount ? (
        <View style={styles.newAccountForm}>
          <TextField value={newName} onChangeText={setNewName} placeholder="Name" autoCapitalize="words" />
          <TextField value={newEmail} onChangeText={setNewEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
          <TextField value={newAlias} onChangeText={setNewAlias} placeholder="Alias (optional)" autoCapitalize="words" />
          <View style={styles.newAccountActions}>
            <Button
              label="Create & Add"
              loading={adding}
              disabled={adding || !newName.trim() || !newEmail.trim()}
              onPress={handleCreateAndAdd}
              style={styles.flexBtn}
            />
            <Button label="Cancel" variant="secondary" disabled={adding} onPress={() => setShowNewAccount(false)} style={styles.flexBtn} />
          </View>
        </View>
      ) : (
        <Button label="+ New Account" variant="secondary" onPress={() => setShowNewAccount(true)} />
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 20, gap: 12 },
    error: { color: theme.colors.danger, textAlign: 'center', marginBottom: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    aliasToggle: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 74,
      alignItems: 'center',
    },
    // On: a thicker accent border instead of a fill — still border only.
    aliasToggleActive: { borderWidth: 2, borderColor: theme.colors.accent },
    aliasToggleText: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.accent },
    sectionTitle: { fontSize: theme.font.size.md, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary, marginTop: 8 },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginVertical: 12 },
    playerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    accountInfo: { flex: 1, gap: 2 },
    accountBadge: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, color: theme.colors.textSecondary },
    // Card text sized up 30% (same bump app-wide).
    playerName: { fontSize: theme.font.size.md * 1.3, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    playerEmail: { fontSize: theme.font.size.sm * 1.3, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary },
    newAccountForm: { gap: 10 },
    newAccountActions: { flexDirection: 'row', gap: 10 },
    flexBtn: { flex: 1 },
  });
