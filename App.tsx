import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from './components/ui/Button';
import CardButton from './components/ui/CardButton';
import StyleVariantToggle from './components/ui/StyleVariantToggle';
import TextField from './components/ui/TextField';
import ThemeToggle from './components/ui/ThemeToggle';
import StaticPreview from './components/dev/StaticPreview';
import TableHome from './components/TableHome';
import { createAppSheet, listAppSheets } from './lib/appSheet';
import { GoogleAuthProvider } from './lib/auth/googleAuthProvider';
import type { AuthUser } from './lib/auth/types';
import { batchGetValues } from './lib/googleSheetsApi';
import { PokerLedgerService } from './lib/pokerActions';
import { APP_NAME, DEFAULT_SHEET_NAME, pokerLedgerSeed } from './lib/pokerLedgerSeed';
import type { LinkedSheet } from './lib/sheetRegistry';
import { cardTintFor } from './theme/cardTints';
import { ThemeProvider, useStyleVariant, useTheme } from './theme/ThemeProvider';
import type { Theme } from './theme/tokens';

const auth = new GoogleAuthProvider();

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const theme = useTheme();
  const styleVariant = useStyleVariant();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Bypasses sign-in/the Sheets backend entirely — see components/dev/StaticPreview.tsx.
  const [staticPreview, setStaticPreview] = useState(false);

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

  if (staticPreview) {
    return <StaticPreview onExit={() => setStaticPreview(false)} />;
  }

  if (checkingSession) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
        {/* Reachable even if the session check itself is what's hanging/broken. */}
        <Pressable onPress={() => setStaticPreview(true)}>
          <Text style={styles.staticPreviewLink}>Static preview (no sign-in)</Text>
        </Pressable>
        <StatusBar style={theme.statusBarStyle} />
      </LinearGradient>
    );
  }

  if (!user) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.center}>
        <View style={[styles.themeToggleFloating, styles.headerActions]}>
          <ThemeToggle />
          <StyleVariantToggle />
        </View>
        <Text style={styles.title}>Poker Ledger</Text>
        <Text style={styles.subtitle}>Sign in to load your tables.</Text>
        <Button label="Sign in with Google" onPress={handleSignIn} loading={signingIn} style={styles.signInBtn} />
        {signInMessage ? <Text style={styles.error}>{signInMessage}</Text> : null}
        <Pressable onPress={() => setStaticPreview(true)}>
          <Text style={styles.staticPreviewLink}>Static preview (no sign-in)</Text>
        </Pressable>
        <StatusBar style={theme.statusBarStyle} />
      </LinearGradient>
    );
  }

  if (selectedSpreadsheetId) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedSpreadsheetId(null)}>
            <Text style={styles.backText}>‹ Tables</Text>
          </Pressable>
          <View style={styles.headerActions}>
            <ThemeToggle />
            <StyleVariantToggle />
            <Pressable onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
        <TableHome spreadsheetId={selectedSpreadsheetId} getAccessToken={() => auth.getAccessToken()} />
        <StatusBar style={theme.statusBarStyle} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{user.displayName || user.email || 'Poker Ledger'}</Text>
        <View style={styles.headerActions}>
          <ThemeToggle />
          <StyleVariantToggle />
          <Pressable onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {tablesError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{tablesError}</Text>
          <Button label="Retry" onPress={loadTables} style={styles.retryBtn} />
        </View>
      ) : tables === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tables.length === 0 ? (
            <Text style={styles.empty}>No tables yet.</Text>
          ) : (
            <View style={[styles.tableGrid, styleVariant === 'C' && styles.gridRowGapForBadges]}>
              {tables.map((table, i) => (
                <CardButton
                  key={table.id}
                  onPress={() => setSelectedSpreadsheetId(table.spreadsheetId)}
                  tint={cardTintFor(i)}
                  badge="TABLE"
                  style={styles.tableCard}>
                  <Text style={styles.tableCardIcon}>♠</Text>
                  <View style={styles.tableCardBody}>
                    <Text style={styles.tableCardName} numberOfLines={2}>
                      {table.name}
                    </Text>
                    {(tableSummaries[table.spreadsheetId] ?? []).length > 0 ? (
                      <Text style={styles.tableCardSummary} numberOfLines={2}>
                        {tableSummaries[table.spreadsheetId].join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                </CardButton>
              ))}
            </View>
          )}

          {showNewTableForm ? (
            <View style={styles.newTableForm}>
              <TextField
                value={newTableName}
                onChangeText={setNewTableName}
                placeholder={tables.length === 0 ? DEFAULT_SHEET_NAME : 'New table name'}
                autoFocus
              />
              <View style={styles.newTableActions}>
                <Button
                  label="Create"
                  loading={creatingTable}
                  onPress={() => handleCreateTable(newTableName.trim() || DEFAULT_SHEET_NAME)}
                  style={styles.flexBtn}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  disabled={creatingTable}
                  onPress={() => setShowNewTableForm(false)}
                  style={styles.flexBtn}
                />
              </View>
            </View>
          ) : (
            <Button
              label={tables.length === 0 ? 'Create your first table' : '+ New Table'}
              onPress={() => setShowNewTableForm(true)}
            />
          )}
        </ScrollView>
      )}

      <StatusBar style={theme.statusBarStyle} />
    </LinearGradient>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: 60,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
      backgroundColor: theme.colors.background,
    },
    themeToggleFloating: { position: 'absolute', top: 60, right: 20 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 12,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    title: {
      fontSize: theme.font.size.xl,
      fontWeight: theme.font.weight.bold,
      color: theme.colors.textPrimary,
    },
    subtitle: {
      fontSize: theme.font.size.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    backText: {
      fontSize: theme.font.size.lg,
      color: theme.colors.accent,
      fontWeight: theme.font.weight.bold,
    },
    signInBtn: { minWidth: 220 },
    staticPreviewLink: { fontSize: theme.font.size.xs, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
    retryBtn: { minWidth: 160 },
    signOutText: {
      color: theme.colors.danger,
      fontWeight: theme.font.weight.bold,
    },
    error: { color: theme.colors.danger, textAlign: 'center' },
    list: { padding: 20, gap: 16 },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 24 },
    tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    // Variant C's badge chip straddles a card's bottom edge — extra
    // row spacing so it doesn't run into the next row's cards.
    gridRowGapForBadges: { rowGap: 24 },
    tableCard: { width: '47%' },
    tableCardIcon: {
      fontSize: 34,
      color: theme.colors.accent,
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    tableCardBody: { gap: 4 },
    tableCardName: { fontSize: theme.font.size.lg, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    tableCardSummary: { fontSize: theme.font.size.xs, color: theme.colors.textSecondary, textAlign: 'center' },
    newTableForm: { gap: 10 },
    newTableActions: { flexDirection: 'row', gap: 10 },
    flexBtn: { flex: 1 },
  });
