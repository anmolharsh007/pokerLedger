/**
 * The host side of the QR "retroactive email claim" flow — see
 * lib/claimsApi.ts's module comment for the full picture. Aggregates
 * player names across every one of the host's own tables (not fetched
 * from anywhere new — the same lib/pokerActions.ts#listPlayers each
 * table screen already uses), so a name added without an email in
 * several tables can be fixed in one QR instead of per-table.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { buildClaimQrPayload, type ClaimEntry } from '../lib/claimsApi';
import { PokerLedgerService } from '../lib/pokerActions';
import type { LinkedSheet } from '../lib/sheetRegistry';

type PlayerRow = { spreadsheetId: string; tableName: string; email: string };

type Props = {
  tables: LinkedSheet[];
  getAccessToken: () => Promise<string>;
  hostEmail: string;
  onBack: () => void;
};

export default function AllPlayersScreen({ tables, getAccessToken, hostEmail, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [byName, setByName] = useState<Map<string, PlayerRow[]>>(new Map());
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        const map = new Map<string, PlayerRow[]>();
        await Promise.all(
          tables.map(async (table) => {
            const service = new PokerLedgerService(table.spreadsheetId);
            const roster = await service.listPlayers(accessToken);
            for (const p of roster) {
              const rows = map.get(p.name) ?? [];
              rows.push({ spreadsheetId: table.spreadsheetId, tableName: table.name, email: p.email });
              map.set(p.name, rows);
            }
          })
        );
        if (!cancelled) setByName(map);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tables, getAccessToken]);

  const names = useMemo(() => Array.from(byName.keys()).sort((a, b) => a.localeCompare(b)), [byName]);
  const selectedRows = selectedName ? (byName.get(selectedName) ?? []) : [];
  const missingEmailRows = selectedRows.filter((r) => r.email.trim() === '');

  const handleShowQr = () => {
    if (!selectedName || missingEmailRows.length === 0) return;
    const entries: ClaimEntry[] = missingEmailRows.map((r) => ({ spreadsheetId: r.spreadsheetId, tableName: r.tableName }));
    setQrValue(buildClaimQrPayload(selectedName, hostEmail, entries));
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLinkText}>‹ Tables</Text>
        </Pressable>
        <Text style={styles.title}>All Players</Text>
        <View style={{ width: 60 }} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : selectedName ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => setSelectedName(null)}>
            <Text style={styles.backLinkText}>‹ All names</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>{selectedName}</Text>
          {selectedRows.map((r) => (
            <View key={r.spreadsheetId} style={styles.tableRow}>
              <Text style={styles.tableName}>{r.tableName}</Text>
              <Text style={r.email ? styles.hasEmail : styles.noEmail}>{r.email || 'no email'}</Text>
            </View>
          ))}
          {missingEmailRows.length > 0 ? (
            <Pressable style={styles.primaryBtn} onPress={handleShowQr}>
              <Text style={styles.primaryBtnText}>
                Show QR for {missingEmailRows.length} table{missingEmailRows.length === 1 ? '' : 's'} missing email
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.empty}>Every table already has an email for {selectedName}.</Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {names.length === 0 ? (
            <Text style={styles.empty}>No players yet.</Text>
          ) : (
            names.map((name) => {
              const rows = byName.get(name) ?? [];
              const missing = rows.filter((r) => r.email.trim() === '').length;
              return (
                <Pressable key={name} style={styles.nameRow} onPress={() => setSelectedName(name)}>
                  <Text style={styles.nameText}>{name}</Text>
                  <Text style={styles.nameSummary}>
                    {rows.length} table{rows.length === 1 ? '' : 's'}
                    {missing > 0 ? ` · ${missing} missing email` : ''}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={qrValue !== null} transparent animationType="fade" onRequestClose={() => setQrValue(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQrValue(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Have {selectedName} scan this</Text>
            {qrValue ? (
              <View style={styles.qrWrap}>
                <QRCode value={qrValue} size={220} />
              </View>
            ) : null}
            <Text style={styles.modalHint}>They'll need to be signed in already — it links to their own account.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => setQrValue(null)}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700' },
  backLinkText: { color: '#2f95dc', fontWeight: '600', fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginTop: 8 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 24 },
  nameRow: {
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  nameText: { fontSize: 17, fontWeight: '700' },
  nameSummary: { fontSize: 13, opacity: 0.6 },
  sectionTitle: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
  },
  tableName: { fontSize: 16, fontWeight: '600' },
  hasEmail: { fontSize: 13, opacity: 0.6 },
  noEmail: { fontSize: 13, color: '#c00', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#2f95dc', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', gap: 14, alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalHint: { fontSize: 13, opacity: 0.6, textAlign: 'center' },
  qrWrap: { padding: 12, backgroundColor: '#fff' },
});
