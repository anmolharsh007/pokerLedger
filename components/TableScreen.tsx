/**
 * This project's own screen (not sheet-ui's generic Config-tab
 * renderer — see lib/pokerLedgerSeed.ts for why). Shows the current
 * player roster and lets you add a new one, exercising
 * lib/pokerActions.ts#addPlayer end to end: players-info gets a new
 * row, net-results a formula-linked row, session-log a new merged
 * 2-column block.
 *
 * Doesn't fetch its own roster — all worksheet data is read once,
 * when the table is opened (TableHome.tsx's load()), and handed down
 * as props. After a mutation (adding a player) this calls `onChanged`
 * so the parent re-reads from the sheet, rather than re-fetching here
 * itself.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from './ui/Button';
import Card from './ui/Card';
import IconButton from './ui/IconButton';
import TextField from './ui/TextField';
import { inviteToAccount } from '../lib/accountsApi';
import { grantPermission } from '../lib/googleDriveApi';
import { PokerLedgerService, type Player } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

type Props = {
  spreadsheetId: string;
  tableName: string;
  getAccessToken: () => Promise<string>;
  players: Player[];
  onChanged: () => void | Promise<void>;
};

// Deliberately loose — just enough to catch an obviously-mistyped
// address before it reaches Drive's own (less friendly) rejection, not
// a full RFC 5322 validator.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TableScreen({ spreadsheetId, tableName, getAccessToken, players, onChanged }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  // Optional again — a player can be added by name alone. See
  // components/AllPlayersScreen.tsx + lib/claimsApi.ts for how their
  // email gets attached later (a QR-based claim), without needing to
  // re-add them as a new row.
  const emailValid = email.trim() === '' || EMAIL_PATTERN.test(email.trim());
  const canAdd = name.trim() !== '' && emailValid;

  const handleAddPlayer = async () => {
    if (!canAdd) return;
    setAdding(true);
    setError(null);
    const trimmedEmail = email.trim();
    try {
      const accessToken = await getAccessToken();
      await service.addPlayer(name.trim(), trimmedEmail, accessToken);
      if (trimmedEmail) {
        // Real Drive access. Reported to the host (not swallowed) if it
        // fails: the player row is already written either way (source
        // of truth, unaffected), but without this they'd see the table
        // listed once signed in yet be unable to open it — worth
        // surfacing, not silently losing.
        try {
          await grantPermission(spreadsheetId, trimmedEmail, 'writer', accessToken);
        } catch (permErr) {
          setError(
            `${name.trim()} was added, but granting them edit access failed: ` +
              (permErr instanceof Error ? permErr.message : String(permErr))
          );
        }
        // Discovery-index write (#6, non-logged-in user flow) —
        // best-effort, doesn't block on failure: the sheet write above
        // is already the source of truth, this just makes the table
        // show up for them the moment they ever sign in.
        await inviteToAccount(trimmedEmail, { spreadsheetId, name: tableName });
      }
      setName('');
      setEmail('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Players</Text>
        <IconButton icon="⟳" onPress={onChanged} />
      </View>
      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        players.map((p) => (
          <Card key={p.row} style={styles.playerRow}>
            <Text style={styles.playerName}>{p.name}</Text>
            <Text style={styles.playerEmail}>{p.email || '—'}</Text>
          </Card>
        ))
      )}

      <Text style={styles.sectionTitle}>Add Player</Text>
      <TextField value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
      <TextField value={email} onChangeText={setEmail} placeholder="Email (optional)" autoCapitalize="none" keyboardType="email-address" />
      {email.trim() !== '' && !emailValid ? <Text style={styles.hint}>Enter a valid email.</Text> : null}
      <Button label="Add Player" loading={adding} disabled={!canAdd} onPress={handleAddPlayer} />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 20, gap: 12 },
    error: { color: theme.colors.danger, textAlign: 'center', marginBottom: 12 },
    hint: { color: theme.colors.danger, fontSize: theme.font.size.xs, fontFamily: theme.font.family.regular, marginTop: -4 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: theme.font.size.md, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary, marginTop: 8 },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginVertical: 12 },
    playerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    playerName: { fontSize: theme.font.size.md, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    playerEmail: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary },
  });
