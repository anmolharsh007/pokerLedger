/**
 * Cash-ins: a rebuy for a player already in the game, or joining an
 * already in-progress game for a registered player who isn't in it
 * yet (starts at 1 buy-in, same as All+/Group+). Buy-ins only — no
 * chips here (that's Cash-out's job). Every value write here goes
 * through lib/pokerActions.ts#cashIn — no structural writes needed
 * (see that method's doc comment for why).
 *
 * No +/- stepper buttons — the whole card *is* the control: tap
 * anywhere on a card to add a buy-in. Cards are transparent, border
 * only, like everything else — a grey dashed border while empty, a
 * solid accent border once a buy-in's staged (Card's own `highlighted`)
 * — and a full-width bar appears across its top showing "+n" — that
 * bar is itself the decrement button (tap it to back the count off by
 * one; it disappears again at +0, since there's nothing left to
 * decrement). Every tap also flashes the card briefly brighter before
 * it settles back, so a change registers as a beat, not just a number
 * ticking.
 */
import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from './ui/Button';
import Card from './ui/Card';
import IconButton from './ui/IconButton';
import DoubleTapButton from './DoubleTapButton';
import { displayName } from '../lib/displayName';
import { PokerLedgerService, type CashInEntry, type CurrentGameInfo, type Player } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

const FLASH_IN_MS = 130;
const FLASH_OUT_MS = 380;

type Props = {
  players: Player[];
  gameInfo: CurrentGameInfo | null;
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  useAlias: boolean;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
};

export default function CashInScreen({ players, gameInfo, spreadsheetId, getAccessToken, useAlias, onBack, onChanged }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);

  // Local, staged — nothing is written until Add.
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  // One Animated.Value per player, created lazily and reused across
  // renders — the "flash brighter then settle" pulse on every tap.
  const flashRefs = useRef<Map<string, Animated.Value>>(new Map());

  const currentFor = (name: string) => gameInfo?.players.find((p) => p.name === name) ?? { buyIns: 0, finalChips: 0 };

  const getFlash = (name: string) => {
    let v = flashRefs.current.get(name);
    if (!v) {
      v = new Animated.Value(0);
      flashRefs.current.set(name, v);
    }
    return v;
  };

  // Buy-in count (current + delta) can never go below zero.
  const bumpDelta = (name: string, by: number) => {
    setDeltas((prev) => {
      const current = currentFor(name).buyIns;
      const nextDelta = (prev[name] ?? 0) + by;
      if (current + nextDelta < 0) return prev;
      return { ...prev, [name]: nextDelta };
    });
    const flash = getFlash(name);
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: FLASH_IN_MS, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: FLASH_OUT_MS, useNativeDriver: true }),
    ]).start();
  };

  const handleAdd = async () => {
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const entries: CashInEntry[] = players
        .map((p): CashInEntry | null => {
          const delta = deltas[p.name] ?? 0;
          if (delta === 0) return null;
          return { playerName: p.name, buyInDelta: delta };
        })
        .filter((e): e is CashInEntry => e !== null);

      if (entries.length > 0) {
        await service.cashIn(entries, accessToken);
      }
      await onChanged();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Cash-ins</Text>
        <IconButton icon="⟳" onPress={onChanged} />
      </View>

      {players.length === 0 ? (
        <Text style={styles.empty}>No players yet.</Text>
      ) : (
        <View style={styles.playerGrid}>
          {players.map((p) => {
            const current = currentFor(p.name);
            const delta = deltas[p.name] ?? 0;
            const warn = current.buyIns === 0 && delta > 0;
            return (
              <Card
                key={p.row}
                portrait
                highlighted={delta > 0}
                borderColor={delta > 0 ? undefined : theme.colors.border}
                style={[styles.playerCard, delta === 0 && styles.playerCardDashed]}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: theme.radius.lg, backgroundColor: theme.colors.accent, opacity: getFlash(p.name).interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }) },
                  ]}
                />
                <Pressable style={styles.cardTapArea} onPress={() => bumpDelta(p.name, 1)}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {displayName(p, useAlias)}
                  </Text>
                  <Text style={styles.banked}>
                    {current.buyIns} buy-in{current.buyIns === 1 ? '' : 's'} banked
                  </Text>
                  {warn && (
                    <Text style={styles.warning} numberOfLines={2}>
                      Joins the current game
                    </Text>
                  )}
                </Pressable>
                {delta > 0 && (
                  <Pressable style={styles.decrementBar} onPress={() => bumpDelta(p.name, -1)}>
                    <Text style={styles.decrementBarText}>+{delta}</Text>
                    <Text style={styles.decrementBarChevron}>⌄</Text>
                  </Pressable>
                )}
              </Card>
            );
          })}
        </View>
      )}

      <Button
        label={
          <>
            <Text style={{ fontSize: theme.font.size.lg }}>↩</Text> Table screen
          </>
        }
        variant="secondary"
        onPress={onBack}
      />

      <DoubleTapButton label="Add" armedLabel="Tap again to add" onConfirm={handleAdd} />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 20, gap: 12 },
    error: { color: theme.colors.danger, textAlign: 'center', marginBottom: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: theme.font.size.md, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginVertical: 12 },
    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    playerCard: { width: '47%' },
    // Empty (no staged buy-in) cards get a dashed border instead of
    // Card's own solid beveled default — a visual "nothing here yet"
    // that a solid accent border (once highlighted) reads as filled in.
    playerCardDashed: { borderStyle: 'dashed' },
    // Fills the card so tapping almost anywhere on it registers as
    // "add a buy-in" — the decrement bar (rendered after this, so it
    // paints on top) claims just its own strip at the very top.
    cardTapArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
    // All card text sized up 30% (same bump app-wide).
    playerName: { fontSize: theme.font.size.md * 1.3, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    banked: { fontSize: theme.font.size.xs * 1.3, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary, textAlign: 'center' },
    warning: { color: theme.colors.warning, fontSize: theme.font.size.xs * 1.3, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, textAlign: 'center' },
    // The "+n" bar — both the display for the staged delta and, since
    // it's a button, the way to back it off. Only shown once there's
    // something to decrement.
    decrementBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 7,
      backgroundColor: 'transparent',
      borderBottomWidth: 1.5,
      borderColor: theme.colors.accent,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
    },
    decrementBarText: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.md * 1.3 },
    decrementBarChevron: { color: theme.colors.accent, fontSize: theme.font.size.sm * 1.3, fontFamily: theme.font.family.regular, opacity: 0.7 },
  });
