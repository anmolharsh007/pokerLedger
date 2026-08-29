import { CormorantGaramond_400Regular, CormorantGaramond_500Medium, CormorantGaramond_700Bold, useFonts } from '@expo-google-fonts/cormorant-garamond';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AllPlayersScreen from './components/AllPlayersScreen';
import ScanClaimScreen from './components/ScanClaimScreen';
import TableHome from './components/TableHome';
import Button from './components/ui/Button';
import CardButton from './components/ui/CardButton';
import ModalCard from './components/ui/ModalCard';
import StyleVariantToggle from './components/ui/StyleVariantToggle';
import TextField from './components/ui/TextField';
import ThemeToggle from './components/ui/ThemeToggle';
import StaticPreview from './components/dev/StaticPreview';
import { addOwnSheet, ensureOwnAccount, getOrCreateAppFolderId, removeStaleSheets } from './lib/accountsApi';
import { createAppSheet, listAppSheets } from './lib/appSheet';
import { GoogleAuthProvider } from './lib/auth/googleAuthProvider';
import type { AuthUser } from './lib/auth/types';
import { listPendingClaimsForHost, processClaim } from './lib/claimsApi';
import { batchGetValues, getSpreadsheetMeta } from './lib/googleSheetsApi';
import { PokerLedgerService } from './lib/pokerActions';
import { APP_NAME, DEFAULT_SHEET_NAME, pokerLedgerSeed } from './lib/pokerLedgerSeed';
import { removeLinkedSheet, type LinkedSheet } from './lib/sheetRegistry';
import { cardTintFor } from './theme/cardTints';
import { ThemeProvider, useStyleVariant, useTheme } from './theme/ThemeProvider';
import type { Theme } from './theme/tokens';

const auth = new GoogleAuthProvider();

// Keeps the native splash up until the app's one font (theme/tokens.ts's
// font.family — Cormorant Garamond, throughout) is ready, so nothing
// ever flashes system-font-then-swaps.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

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
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [showScanClaim, setShowScanClaim] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // Alert.alert is a no-op on web (react-native-web has no real
  // implementation) — these drive an actual Modal instead, which does
  // work cross-platform (TableHome.tsx already relies on the same).
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [claimProcessedMessage, setClaimProcessedMessage] = useState<string | null>(null);
  const [staleToConfirm, setStaleToConfirm] = useState<LinkedSheet[] | null>(null);
  const [removingStale, setRemovingStale] = useState(false);

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

  // Tables created on this device (local registry, lib/sheetRegistry.ts)
  // merged with every table this account is a *player* in, wherever it
  // was created (Firestore, lib/accountsApi.ts#ensureOwnAccount) — #6's
  // whole point: b/c/f see table1/table2/table-yo without having
  // created any of them themselves. Deduped by spreadsheetId, Firestore
  // entries take priority — its `name` is always the human-typed table
  // name (lib/accountsApi.ts#addOwnSheet), whereas the local registry
  // historically stored the raw generated Drive filename instead (fixed
  // going forward in lib/appSheet.ts, but this also self-heals any
  // already-created tables still holding that stale name locally).
  // Firestore is best-effort (ensureOwnAccount returns null if
  // unconfigured or not signed into Firebase), so a local-only entry
  // still shows up (just possibly under the old gibberish name) rather
  // than disappearing outright.
  const loadTables = useCallback(async () => {
    setTablesError(null);
    try {
      const accessToken = await auth.getAccessToken();
      const localLinked = await listAppSheets(user?.id ?? '');
      const byId = new Map<string, LinkedSheet>();
      if (user?.email) {
        const account = await ensureOwnAccount(user.email, user.displayName ?? null);
        for (const sheet of account?.sheets ?? []) {
          byId.set(sheet.spreadsheetId, { id: sheet.spreadsheetId, name: sheet.name, spreadsheetId: sheet.spreadsheetId });
        }
      }
      for (const s of localLinked) {
        if (!byId.has(s.spreadsheetId)) byId.set(s.spreadsheetId, s);
      }
      const merged = Array.from(byId.values());
      setTables(merged);
      await loadTableSummaries(merged, accessToken);
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

  // Auto-processes any pending QR claims naming this account as the
  // generator — see lib/claimsApi.ts's module comment for the full
  // flow. Runs once per sign-in, not on every loadTables refresh
  // (claims are rare; no need to re-check on every ⟳).
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const pending = await listPendingClaimsForHost(user.email!);
        if (pending.length === 0) return;
        const accessToken = await auth.getAccessToken();
        const lines: string[] = [];
        for (const claim of pending) {
          const results = await processClaim(claim, accessToken);
          const ok = results.filter((r) => r.ok).length;
          lines.push(`${claim.playerName} (${claim.claimedBy}): ${ok}/${results.length} tables linked`);
        }
        if (!cancelled) setClaimProcessedMessage(lines.join('\n'));
      } catch {
        // Best-effort — a failed check here doesn't block anything else; whoever scanned can just wait for the next app open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

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
      // Cached (Firestore-backed) folder resolution — see
      // lib/accountsApi.ts#getOrCreateAppFolderId and
      // lib/googleDriveApi.ts#resolveAppFolder's own comments for why
      // resolving this by name-search on every table creation isn't
      // reliable (it's what caused the duplicate-folder issue).
      const folderId = user.email
        ? await getOrCreateAppFolderId(user.email, APP_NAME, accessToken)
        : undefined;
      // The Drive file itself is named Table<ID>.xlsx — not the
      // human-typed name, which lives in TableInfo!B1 instead. Passed
      // through as displayName so the registry (and this screen's own
      // table list) shows the typed name, not the generated file title.
      const tableId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const { spreadsheetId } = await createAppSheet(user.id, accessToken, {
        appName: APP_NAME,
        sheetName: `Table${tableId}.xlsx`,
        displayName: name,
        folderId,
        seed: pokerLedgerSeed,
      });
      // The seed only writes the "title" label into TableInfo!A1, not
      // the actual name into B1 — that has to happen here, once we
      // know the real spreadsheetId.
      const service = new PokerLedgerService(spreadsheetId);
      await service.setTableTitle(name, accessToken);
      // The creator is always a member of their own table — not just
      // its owner. No grantPermission needed here (they already own
      // the file outright) or inviteToAccount (addOwnSheet below is
      // that exact same Firestore write, for themselves).
      await service.addPlayer(user.displayName || user.email || 'Me', user.email ?? '', accessToken);
      // Best-effort discovery-index write — see loadTables' comment.
      if (user.email) await addOwnSheet(user.email, { spreadsheetId, name });
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

  // Long-press on the table list's ⟳ (see the header below) — a real
  // Drive round-trip per table, so deliberately opt-in rather than run
  // on every normal load. Checks the actual on-screen (merged local +
  // Firestore) list, not just Firestore's own `sheets` — a table that
  // was never in Firestore at all (only ever local) still needs to be
  // caught here, or it'd keep showing up forever. Reports stale entries
  // and asks before removing anything; never deletes silently.
  const handleVerifySheets = async () => {
    if (!user) return;
    setVerifying(true);
    try {
      const accessToken = await auth.getAccessToken();
      const current = tables ?? [];
      const stale: LinkedSheet[] = [];
      await Promise.all(
        current.map(async (t) => {
          try {
            await getSpreadsheetMeta(t.spreadsheetId, accessToken);
          } catch {
            stale.push(t);
          }
        })
      );
      if (stale.length === 0) {
        setVerifyMessage('Every table in your list is still reachable.');
      } else {
        setStaleToConfirm(stale);
      }
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirmRemoveStale = async () => {
    if (!user || !staleToConfirm) return;
    setRemovingStale(true);
    try {
      if (user.email) {
        await removeStaleSheets(
          user.email,
          staleToConfirm.map((s) => s.spreadsheetId)
        );
      }
      // Local registry cleanup — removeStaleSheets only touches
      // Firestore; a table that was never in Firestore at all (only
      // ever local) would otherwise keep resurfacing via loadTables'
      // local-fallback merge. removeLinkedSheet is a safe no-op for an
      // id it doesn't have (e.g. a Firestore-only entry).
      for (const entry of staleToConfirm) {
        await removeLinkedSheet(user.id, entry.id);
      }
      setStaleToConfirm(null);
      await loadTables();
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingStale(false);
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

  if (showAllPlayers) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.container}>
        <AllPlayersScreen
          tables={tables ?? []}
          getAccessToken={() => auth.getAccessToken()}
          hostEmail={user.email ?? ''}
          onBack={() => setShowAllPlayers(false)}
        />
        <StatusBar style={theme.statusBarStyle} />
      </LinearGradient>
    );
  }

  if (showScanClaim) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.container}>
        <ScanClaimScreen onBack={() => setShowScanClaim(false)} />
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
          <Pressable onPress={() => setShowScanClaim(true)}>
            <Text style={styles.headerLinkText}>Scan</Text>
          </Pressable>
          <Pressable onPress={() => setShowAllPlayers(true)}>
            <Text style={styles.headerLinkText}>Players</Text>
          </Pressable>
          <Pressable style={styles.refreshBtn} onPress={loadTables} onLongPress={handleVerifySheets} delayLongPress={500}>
            {verifying ? <ActivityIndicator size="small" color={theme.colors.accent} /> : <Text style={styles.refreshBtnText}>⟳</Text>}
          </Pressable>
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

      <ModalCard visible={verifyMessage !== null} onRequestClose={() => setVerifyMessage(null)}>
        <Text style={styles.modalTitle}>Verified</Text>
        <Text style={styles.modalLine}>{verifyMessage}</Text>
        <Button label="OK" onPress={() => setVerifyMessage(null)} />
      </ModalCard>

      <ModalCard visible={claimProcessedMessage !== null} onRequestClose={() => setClaimProcessedMessage(null)}>
        <Text style={styles.modalTitle}>Claim{claimProcessedMessage?.includes('\n') ? 's' : ''} processed</Text>
        <Text style={styles.modalLine}>{claimProcessedMessage}</Text>
        <Button label="OK" onPress={() => setClaimProcessedMessage(null)} />
      </ModalCard>

      <ModalCard visible={staleToConfirm !== null} onRequestClose={() => setStaleToConfirm(null)}>
        <Text style={styles.modalTitle}>Some tables are stale</Text>
        <Text style={styles.modalLine}>These no longer exist or aren't reachable:</Text>
        {(staleToConfirm ?? []).map((s) => (
          <Text key={s.spreadsheetId} style={styles.modalLine}>
            • {s.name || s.spreadsheetId}
          </Text>
        ))}
        <View style={styles.newTableActions}>
          <Button label="Cancel" variant="secondary" disabled={removingStale} onPress={() => setStaleToConfirm(null)} style={styles.flexBtn} />
          <Button label="Remove" variant="danger" loading={removingStale} onPress={handleConfirmRemoveStale} style={styles.flexBtn} />
        </View>
      </ModalCard>

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
    headerLinkText: {
      fontSize: theme.font.size.sm,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
      color: theme.colors.accent,
    },
    refreshBtn: { paddingVertical: 4, paddingHorizontal: 4 },
    refreshBtnText: {
      color: theme.colors.accent,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
      fontSize: 18,
    },
    title: {
      fontSize: theme.font.size.xl,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
      color: theme.colors.textPrimary,
    },
    subtitle: {
      fontSize: theme.font.size.md,
      fontFamily: theme.font.family.regular,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    backText: {
      fontSize: theme.font.size.lg,
      color: theme.colors.accent,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
    },
    signInBtn: { minWidth: 220 },
    staticPreviewLink: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
    retryBtn: { minWidth: 160 },
    signOutText: {
      color: theme.colors.danger,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
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
    tableCardName: { fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    tableCardSummary: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary, textAlign: 'center' },
    newTableForm: { gap: 10 },
    newTableActions: { flexDirection: 'row', gap: 10 },
    flexBtn: { flex: 1 },
    modalTitle: {
      fontSize: theme.font.size.lg,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
      color: theme.colors.textPrimary,
    },
    modalLine: {
      fontSize: theme.font.size.sm,
      fontFamily: theme.font.family.regular,
      color: theme.colors.textSecondary,
    },
  });
