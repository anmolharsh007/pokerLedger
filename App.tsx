import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import TableHome from './components/TableHome';
import { createAppSheet, listAppSheets } from './lib/appSheet';
import { GoogleAuthProvider } from './lib/auth/googleAuthProvider';
import type { AuthUser } from './lib/auth/types';
import { batchGetValues } from './lib/googleSheetsApi';
import { PokerLedgerService } from './lib/pokerActions';
import { APP_NAME, DEFAULT_SHEET_NAME, pokerLedgerSeed } from './lib/pokerLedgerSeed';
import type { LinkedSheet } from './lib/sheetRegistry';

const auth = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);

  const [tables, setTables] = useState<LinkedSheet[] | null>(null);
  const [tableSummaries, setTableSummaries] = useState<Record<string, string[]>>({});
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [showNewTableForm, setShowNewTableForm] = useState(false);

  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string | null>(null);

  // For every linked table, read back whatever `listColumns` the
  // project's seed defines (e.g. a status/total line under its name).
  // A no-op when listColumns is empty — this placeholder seed leaves
  // it blank; the real ledger format will define its own.
  const loadTableSummaries = useCallback(async (linked: LinkedSheet[], accessToken: string) => {
    if (!pokerLedgerSeed.listColumns || pokerLedgerSeed.listColumns.length === 0 || linked.length === 0) return;
    const cells = pokerLedgerSeed.listColumns.map((c) => c.cell);
    const entries = await Promise.all(
      linked.map(async (sheet) => {
        try {
          const values = await batchGetValues(sheet.spreadsheetId, cells, accessToken);
          return [sheet.spreadsheetId, values.map((v) => v?.[0]?.[0] ?? '')] as const;
        } catch {
          return [sheet.spreadsheetId, []] as const;
        }
      })
    );
    setTableSummaries(Object.fromEntries(entries));
  }, []);

  const loadTables = useCallback(async () => {
    setTablesError(null);
    try {
      const accessToken = await auth.getAccessToken();
      const linked = await listAppSheets(user?.id ?? '');
      setTables(linked);
      await loadTableSummaries(linked, accessToken);
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : String(err));
    }
  }, [user, loadTableSummaries]);

  useEffect(() => {
    auth.getUser().then(async (existing) => {
      setUser(existing);
      setCheckingSession(false);
    });
  }, []);

  useEffect(() => {
    if (user) loadTables();
  }, [user, loadTables]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setSignInMessage(null);
    try {
      const signedInUser = await auth.signIn();
      if (signedInUser) {
        setUser(signedInUser);
      } else {
        // Not an error — the user cancelled/dismissed the Google flow, or
        // it didn't return a success result. Alert.alert doesn't reliably
        // show anything on web, so surface this inline instead of silently
        // landing back on the sign-in button with no feedback.
        console.warn('Google sign-in did not complete (cancelled, dismissed, or no success result).');
        setSignInMessage('Sign-in was cancelled or did not complete. Try again.');
      }
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setSignInMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    setUser(null);
    setTables(null);
    setTableSummaries({});
    setTablesError(null);
    setSelectedSpreadsheetId(null);
  };

  const handleCreateTable = async (name: string) => {
    if (!user) return;
    setCreatingTable(true);
    setTablesError(null);
    try {
      const accessToken = await auth.getAccessToken();
      // The Drive file itself is named Table<ID>.xlsx — not the
      // human-typed name, which lives in TableInfo!B1 instead (and in
      // the local registry's `name`, used for the table list below).
      const tableId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const { spreadsheetId } = await createAppSheet(user.id, accessToken, {
        appName: APP_NAME,
        sheetName: `Table${tableId}.xlsx`,
        seed: pokerLedgerSeed,
      });
      // The seed only writes the "title" label into TableInfo!A1, not
      // the actual name into B1 — that has to happen here, once we
      // know the real spreadsheetId.
      await new PokerLedgerService(spreadsheetId).setTableTitle(name, accessToken);
      setShowNewTableForm(false);
      setNewTableName('');
      await loadTables();
      setSelectedSpreadsheetId(spreadsheetId);
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingTable(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Poker Ledger</Text>
        <Text style={styles.subtitle}>Sign in to load your tables.</Text>
        <Pressable style={styles.primaryBtn} disabled={signingIn} onPress={handleSignIn}>
          {signingIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign in with Google</Text>}
        </Pressable>
        {signInMessage ? <Text style={styles.error}>{signInMessage}</Text> : null}
        <StatusBar style="auto" />
      </View>
    );
  }

  if (selectedSpreadsheetId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedSpreadsheetId(null)}>
            <Text style={styles.backText}>‹ Tables</Text>
          </Pressable>
          <Pressable onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
        <TableHome spreadsheetId={selectedSpreadsheetId} getAccessToken={() => auth.getAccessToken()} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{user.displayName || user.email || 'Poker Ledger'}</Text>
        <Pressable onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {tablesError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{tablesError}</Text>
          <Pressable style={styles.primaryBtn} onPress={loadTables}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : tables === null ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tables.length === 0 ? (
            <Text style={styles.empty}>No tables yet.</Text>
          ) : (
            tables.map((table) => (
              <Pressable key={table.id} style={styles.tableRow} onPress={() => setSelectedSpreadsheetId(table.spreadsheetId)}>
                <Text style={styles.tableName}>{table.name}</Text>
                {(tableSummaries[table.spreadsheetId] ?? []).length > 0 ? (
                  <Text style={styles.tableSummary}>{tableSummaries[table.spreadsheetId].join(' · ')}</Text>
                ) : null}
              </Pressable>
            ))
          )}

          {showNewTableForm ? (
            <View style={styles.newTableForm}>
              <TextInput
                style={styles.input}
                value={newTableName}
                onChangeText={setNewTableName}
                placeholder={tables.length === 0 ? DEFAULT_SHEET_NAME : 'New table name'}
                autoFocus
              />
              <View style={styles.newTableActions}>
                <Pressable
                  style={styles.primaryBtn}
                  disabled={creatingTable}
                  onPress={() => handleCreateTable(newTableName.trim() || DEFAULT_SHEET_NAME)}>
                  {creatingTable ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create</Text>}
                </Pressable>
                <Pressable style={styles.secondaryBtn} disabled={creatingTable} onPress={() => setShowNewTableForm(false)}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={() => setShowNewTableForm(true)}>
              <Text style={styles.primaryBtnText}>{tables.length === 0 ? 'Create your first table' : '+ New Table'}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.65,
    textAlign: 'center',
  },
  backText: {
    fontSize: 16,
    color: '#2f95dc',
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#2f95dc',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  signOutText: {
    color: '#d33',
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    textAlign: 'center',
  },
  list: { padding: 20, gap: 12 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 24 },
  tableRow: {
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  tableName: { fontSize: 17, fontWeight: '700' },
  tableSummary: { fontSize: 13, opacity: 0.6 },
  newTableForm: { gap: 10 },
  newTableActions: { flexDirection: 'row', gap: 10 },
  input: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
});
