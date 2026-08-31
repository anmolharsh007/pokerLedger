/**
 * Cash-outs: only players currently in the game (Buy-ins(#) > 0) —
 * unlike Cash-in, this isn't how you join a game. No inline field on
 * the card itself — double-tap a card to open the "Final chips" popup
 * (same double-tap-to-edit gesture GroupScreen uses), enter the value
 * there, and the card lights up (accent border + tint) once it holds
 * one. "Sheet reads" was confusing outside the spreadsheet it names —
 * "Until now" reads as what it is, this player's chip count before
 * this cash-out. Reuses lib/pokerActions.ts#cashIn (buyInDelta: 0,
 * chips set directly) — no new service method needed.
 */
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import Button from './ui/Button';
import Card from './ui/Card';
import ChipStackIcon from './ui/ChipStackIcon';
import IconButton from './ui/IconButton';
import ModalCard from './ui/ModalCard';
import TextField from './ui/TextField';
import DoubleTapButton from './DoubleTapButton';
import { displayName } from '../lib/displayName';
import { PokerLedgerService, type CashInEntry, type CurrentGameInfo } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

const DOUBLE_TAP_MS = 400;

type Props = {
  gameInfo: CurrentGameInfo | null;
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  useAlias: boolean;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
};

export default function CashOutScreen({ gameInfo, spreadsheetId, getAccessToken, useAlias, onBack, onChanged }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);

  // Explicit pixel width, not a `width: '47%'` — that percentage
  // resolves against the wrapping Pressable below, which has no
  // explicit width of its own (content-sized). Confirmed live on the
  // home screen's identical table-card grid: Android's Yoga resolves it
  // by walking up to a definite-width ancestor, iOS's doesn't — same
  // bug here (this screen's cards render fine on Android, but collapse
  // to a single narrow column on iOS without this fix).
  const { width: windowWidth } = useWindowDimensions();
  const PLAYER_GRID_PADDING = 20; // matches styles.content's own padding
  const PLAYER_GRID_GAP = 10; // matches styles.playerGrid's own gap
  const playerCardWidth = (windowWidth - PLAYER_GRID_PADDING * 2 - PLAYER_GRID_GAP) / 2;

  // Local, staged — nothing is written until Cash out.
  const [chipsInputs, setChipsInputs] = useState<Record<string, string>>({});
  const lastTapRef = useRef<Record<string, number>>({});

  // The "Final chips" popup — which player it's open for, and its own
  // staged text until Set commits it into chipsInputs.
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const playingPlayers = (gameInfo?.players ?? []).filter((p) => p.buyIns > 0);
  const editingPlayerLabel = () => {
    const p = playingPlayers.find((pl) => pl.name === editingPlayer);
    return p ? displayName(p, useAlias) : editingPlayer;
  };

  const handleCardPress = (name: string) => {
    const now = Date.now();
    const last = lastTapRef.current[name] ?? 0;
    lastTapRef.current[name] = now;
    if (now - last < DOUBLE_TAP_MS) {
      setEditValue(chipsInputs[name] ?? '');
      setEditingPlayer(name);
    }
  };

  const handleSaveChips = () => {
    if (editingPlayer) {
      setChipsInputs((prev) => ({ ...prev, [editingPlayer]: editValue }));
    }
    setEditingPlayer(null);
  };

  // Clears a staged "Final chips" entry — the ✕ badge on a filled card.
  const handleClearChips = (name: string) => {
    setChipsInputs((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleCashOut = async () => {
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const entries: CashInEntry[] = playingPlayers
        .map((p): CashInEntry | null => {
          const text = chipsInputs[p.name];
          if (text === undefined || text.trim() === '') return null;
          return { playerName: p.name, buyInDelta: 0, chips: Number(text) || 0 };
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
        <Text style={styles.sectionTitle}>Cash-outs</Text>
        <IconButton icon="⟳" onPress={onChanged} />
      </View>

      {playingPlayers.length === 0 ? (
        <Text style={styles.empty}>No players in the current game.</Text>
      ) : (
        <View style={styles.playerGrid}>
          {playingPlayers.map((p) => {
            const value = chipsInputs[p.name] ?? '';
            const filled = value.trim() !== '';
            return (
              <View key={p.name} style={{ width: playerCardWidth }}>
              <Pressable onPress={() => handleCardPress(p.name)}>
                <Card
                  portrait
                  highlighted={filled}
                  borderColor={filled ? undefined : theme.colors.border}
                  style={[styles.playerCard, !filled && styles.playerCardDashed]}>
                  {filled && (
                    <Pressable style={styles.deleteBtn} onPress={() => handleClearChips(p.name)}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </Pressable>
                  )}
                  <Text style={styles.playerName} numberOfLines={1}>
                    {displayName(p, useAlias)}
                  </Text>
                  {filled && (
                    <View style={styles.chipsSet}>
                      <ChipStackIcon size={16} />
                      <Text style={styles.chipsSetValue}>{value}</Text>
                    </View>
                  )}
                  <View style={styles.untilNowBox}>
                    <Text style={styles.untilNowLabel}>Until now</Text>
                    <Text style={styles.untilNowValue}>{p.finalChips || 0}</Text>
                  </View>
                  {/* Pinned to the card's bottom edge, centered — not
                      stacked in with the rest of the centered content
                      above, so it reads as a hint about the whole card
                      rather than just another line in the stack. */}
                  {!filled && <Text style={styles.tapHint}>Double-tap to enter</Text>}
                </Card>
              </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Button label="Table screen" variant="secondary" onPress={onBack} />

      <DoubleTapButton label="Cash out" armedLabel="Tap again to cash out" onConfirm={handleCashOut} />

      {/* "Final chips" popup — opened by double-tapping a player's card */}
      <ModalCard visible={editingPlayer !== null} onRequestClose={() => setEditingPlayer(null)}>
        <View style={styles.modalIconRow}>
          <ChipStackIcon size={28} />
        </View>
        <Text style={styles.modalTitle}>Final chips — {editingPlayerLabel()}</Text>
        <TextField
          value={editValue}
          onChangeText={setEditValue}
          keyboardType="number-pad"
          placeholder="Final chips"
          autoFocus
          style={styles.modalInput}
        />
        <Button label="Set" onPress={handleSaveChips} />
      </ModalCard>
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
    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 14 },
    // Actual width comes from the wrapping View's explicit pixel width
    // (playerCardWidth) — see that computation's own comment for why.
    // aspectRatio less tall than Card's own portrait default (0.74) —
    // three stacked lines (name, chips/hint, "Until now") felt cramped
    // at that ratio; paddingHorizontal claims back some of the width
    // Card's own padding (16, all sides by default) left for them.
    playerCard: { width: '100%', aspectRatio: 0.92, paddingHorizontal: theme.spacing(3) },
    // Empty (no final chips staged) cards get a dashed grey border
    // instead of Card's own solid beveled default — same "nothing here
    // yet" language Cash-in's cards use; a solid accent border (once
    // highlighted) reads as filled in.
    playerCardDashed: { borderStyle: 'dashed' },
    // Clears a filled card's staged value — top-right, only shown once
    // there's something to delete.
    deleteBtn: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: theme.colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    deleteBtnText: { color: theme.colors.danger, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: 12 },
    // All card text sized up 30% (same bump app-wide).
    playerName: { fontSize: theme.font.size.md * 1.3, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    // Pinned to the card's bottom edge, centered — see the render
    // site's own comment for why it's not just stacked in like the
    // other centered content.
    tapHint: {
      position: 'absolute',
      bottom: 10,
      left: 0,
      right: 0,
      textAlign: 'center',
      // Slightly smaller than the card's other 1.3x-bumped text — it's a
      // hint, not content, so it can sit a step quieter.
      fontSize: theme.font.size.xs * 1.1,
      fontFamily: theme.font.family.regular,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
    },
    // Row layout with no justifyContent stretches full-width by default
    // (Card's own children aren't center-aligned) and left-aligns its
    // content — centered here so the entered "Final chips" value reads
    // the same as "Until now" beneath it, not offset to one side.
    chipsSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    chipsSetValue: { fontSize: theme.font.size.lg * 1.3, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.accent },
    untilNowBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 10,
      // No background — border-only/transparent like everything else.
      borderRadius: theme.radius.sm,
    },
    untilNowLabel: { fontSize: theme.font.size.xs * 1.3, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary },
    // Had no explicit fontSize (RN's plain default, 14) — pinned to
    // theme.font.size.sm now so the 30% card-text bump has a real base
    // to scale from, instead of scaling an implicit default.
    untilNowValue: { fontSize: theme.font.size.sm * 1.3, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, color: theme.colors.textPrimary },
    modalIconRow: { alignItems: 'center' },
    modalTitle: { fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    modalInput: { textAlign: 'center' },
  });
