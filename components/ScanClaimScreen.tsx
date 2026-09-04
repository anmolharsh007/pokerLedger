/**
 * The scanning side of the QR "retroactive email claim" flow — see
 * lib/claimsApi.ts's module comment. Requires you to already be
 * signed in: createClaim uses your own verified Firebase session's
 * email, not anything read off the QR or typed here, so someone else
 * can't claim a table by handing you a QR meant for them.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { createClaim, parseClaimQr } from '../lib/claimsApi';
import BrandHeader from './ui/BrandHeader';

type Props = { onBack: () => void };

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; message: string } | { kind: 'error'; message: string };

export default function ScanClaimScreen({ onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const handleScanned = async ({ data }: BarcodeScanningResult) => {
    if (status.kind === 'working') return; // ignore repeat scans mid-flight
    const payload = parseClaimQr(data);
    if (!payload) {
      setStatus({ kind: 'error', message: "That QR isn't a table-claim code." });
      return;
    }
    setStatus({ kind: 'working' });
    try {
      await createClaim(payload);
      setStatus({
        kind: 'done',
        message: `Claim sent for "${payload.playerName}" across ${payload.entries.length} table${payload.entries.length === 1 ? '' : 's'} — it'll finish once ${payload.generatedBy} next opens the app.`,
      });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Camera access is needed to scan a claim QR.</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant permission</Text>
        </Pressable>
        <Pressable onPress={onBack}>
          <Text style={styles.backLinkText}>‹ Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <BrandHeader />
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLinkText}>‹ Tables</Text>
        </Pressable>
        <Text style={styles.title}>Scan Claim QR</Text>
        <View style={{ width: 60 }} />
      </View>

      {status.kind === 'done' || status.kind === 'error' ? (
        <View style={styles.center}>
          <Text style={status.kind === 'error' ? styles.error : styles.success}>{status.message}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => setStatus({ kind: 'idle' })}>
            <Text style={styles.primaryBtnText}>Scan another</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={status.kind === 'working' ? undefined : handleScanned}
          />
          {status.kind === 'working' ? (
            <View style={styles.overlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  hint: { fontSize: 15, opacity: 0.7, textAlign: 'center' },
  error: { color: '#c00', fontSize: 15, textAlign: 'center' },
  success: { color: '#1a7a3c', fontSize: 15, textAlign: 'center' },
  primaryBtn: { backgroundColor: '#2f95dc', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cameraWrap: { flex: 1, margin: 20, borderRadius: 12, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});
