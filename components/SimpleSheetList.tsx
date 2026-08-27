/**
 * Shared read-only rendering for a small headered range (net-results,
 * sum-check) — not part of the shared engine, just de-duplicated
 * between this project's two near-identical read-only screens.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getValues } from '../lib/googleSheetsApi';

type Props = {
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  range: string; // e.g. "net-results!A2:B200"
  headers: string[]; // column labels, same order as the range's columns
};

export default function SimpleSheetList({ spreadsheetId, getAccessToken, range, headers }: Props) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      const values = await getValues(spreadsheetId, range, accessToken);
      setRows(values.filter((row) => (row[0] ?? '').trim() !== ''));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [spreadsheetId, getAccessToken, range]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        {headers.map((h) => (
          <Text key={h} style={styles.headerCell}>
            {h}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>No rows yet.</Text>
      ) : (
        rows.map((row, i) => (
          <View key={i} style={styles.dataRow}>
            {headers.map((_, colIdx) => (
              <Text key={colIdx} style={styles.dataCell}>
                {row[colIdx] || '—'}
              </Text>
            ))}
          </View>
        ))
      )}
      <Pressable style={styles.refreshBtn} onPress={load}>
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, gap: 6 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 12 },
  headerRow: { flexDirection: 'row', gap: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  headerCell: { flex: 1, fontSize: 13, fontWeight: '700', opacity: 0.7 },
  dataRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
  },
  dataCell: { flex: 1, fontSize: 15 },
  primaryBtn: { backgroundColor: '#2f95dc', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  refreshBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16, marginTop: 8 },
  refreshText: { color: '#2f95dc', fontWeight: '600' },
});
