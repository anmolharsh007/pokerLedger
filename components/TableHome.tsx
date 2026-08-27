/**
 * The real table screen — see the approved plan for the full spec.
 *
 * All+/Group+ no longer write anything themselves — they just set
 * `selectedPlayers` locally (a preview, viewable via the ▶ icon that
 * appears once set). `start` is the single atomic action that
 * actually commits: creates the session-log row AND adds every
 * selected player to it, together (lib/pokerActions.ts#startGame).
 * `start` stays disabled until players have been selected.
 *
 * Game lifecycle is derived, not a stored enum:
 *  - 'none'        — no status row yet, or status = "last played"
 *  - 'empty'        — a game shell exists (TableInfo!sessionRow set)
 *                      but no status row yet — shouldn't normally
 *                      happen anymore (start now writes players in
 *                      the same call), kept only for robustness
 *  - 'in_progress'  — status = "in progress"
 * All+/Group+/the buy-in fields are only editable in 'none'.
 * Cash-ins/Cash-outs/End need a game to exist. Leaderboard is always
 * enabled.
 *
 * Group+/Cash-ins/Cash-outs/Leaderboard are placeholders this round
 * (later build phases, per the plan) — they respect the gating so the
 * layout reads correctly, but tapping just shows "coming soon".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import CashInScreen from './CashInScreen';
import CashOutScreen from './CashOutScreen';
import DoubleTapButton from './DoubleTapButton';
import GroupScreen from './GroupScreen';
import TableScreen from './TableScreen';
import { PokerLedgerService, type CurrentGameInfo, type GroupInfo, type Player, type TableInfoData } from '../lib/pokerActions';

type Props = {
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
};

type GameState = 'none' | 'empty' | 'in_progress';

function deriveGameState(tableInfo: TableInfoData | null): GameState {
  if (!tableInfo) return 'none';
  if (tableInfo.status === 'in progress') return 'in_progress';
  if (tableInfo.sessionRow !== null && tableInfo.status === null) return 'empty';
  return 'none';
}

const notImplemented = (what: string) => Alert.alert(what, 'Coming in a later build round.');

export default function TableHome({ spreadsheetId, getAccessToken }: Props) {
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);

  const [tableInfo, setTableInfo] = useState<TableInfoData | null>(null);
  const [gameInfo, setGameInfo] = useState<CurrentGameInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [buyInText, setBuyInText] = useState('');
  const [chipsText, setChipsText] = useState('');
  const [buyInConfirmed, setBuyInConfirmed] = useState(false);

  const [showInfo, setShowInfo] = useState(false);
  const [showUsualEditor, setShowUsualEditor] = useState(false);
  const [usualBuyInText, setUsualBuyInText] = useState('');
  const [usualChipsText, setUsualChipsText] = useState('');
  const usualLastTapRef = useRef(0);

  const [showManagePlayers, setShowManagePlayers] = useState(false);
  const [showGroupScreen, setShowGroupScreen] = useState(false);
  const [showCashInScreen, setShowCashInScreen] = useState(false);
  const [showCashOutScreen, setShowCashOutScreen] = useState(false);

  // null = not yet selected (Start stays disabled); set by All+/Group+
  // locally — nothing is written to the sheet until Start commits it.
  const [selectedPlayers, setSelectedPlayers] = useState<string[] | null>(null);
  const [showSelectedPopup, setShowSelectedPopup] = useState(false);
  // Staged checkbox state for the selected-players popup — unchecking
  // a name doesn't touch selectedPlayers (or shrink the visible list)
  // until the popup actually closes, so a name stays visible right
  // after you uncheck it instead of disappearing mid-review.
  const [popupChecked, setPopupChecked] = useState<Set<string>>(new Set());

  // Everything this table needs — TableInfo, the current game, the
  // player roster, groups — is read from the sheet once here, when
  // the table is opened. Sub-screens receive it as props rather than
  // fetching their own copies; a mutation calls this again (via
  // onChanged) instead of each screen refreshing itself in isolation.
  const load = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      const [info, game, roster, groupList] = await Promise.all([
        service.getTableInfo(accessToken),
        service.getCurrentGameInfo(accessToken),
        service.listPlayers(accessToken),
        service.listGroups(accessToken),
      ]);
      setTableInfo(info);
      setGameInfo(game);
      setPlayers(roster);
      setGroups(groupList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [service, getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const gameState = deriveGameState(tableInfo);
  // Only a genuinely active game's players show — not a finished
  // ("last played") one, even though gameInfo still points at that
  // same row until a new game overwrites it.
  const playingPlayers = gameState === 'in_progress' ? (gameInfo?.players ?? []).filter((p) => p.buyIns > 0) : [];

  const startEnabled =
    gameState === 'none' &&
    buyInConfirmed &&
    (Number(buyInText) || 0) > 0 &&
    (Number(chipsText) || 0) > 0 &&
    (selectedPlayers?.length ?? 0) > 0; // not just "!== null" — unchecking everyone in the popup leaves [], not null
  const allPlusEnabled = gameState === 'none';
  const groupPlusEnabled = gameState === 'none';
  const cashInsEnabled = gameState === 'empty' || gameState === 'in_progress';
  const cashOutsEnabled = gameState === 'in_progress';
  const endEnabled = gameState === 'in_progress';

  const applyMultiplier = (text: string, setText: (v: string) => void, factor: number) => {
    const current = Number(text) || 0;
    setText(String(current * factor));
  };

  const handleBuyInTextChange = (v: string) => setBuyInText(v);
  const handleChipsTextChange = (v: string) => setChipsText(v);

  // Just a submit button — confirms the typed buy-in/chips, double-tap like Start/All+/End.
  const handleSetBuyIn = () => {
    if ((Number(buyInText) || 0) <= 0 || (Number(chipsText) || 0) <= 0) {
      Alert.alert('Set buy-in', 'Enter a buy-in(₹) and chips amount first.');
      return;
    }
    setBuyInConfirmed(true);
  };

  const handleUsualPress = () => {
    const now = Date.now();
    const isDoubleTap = now - usualLastTapRef.current < 400;
    usualLastTapRef.current = now;
    if (isDoubleTap) {
      setUsualBuyInText(String(tableInfo?.usualBuyIn ?? ''));
      setUsualChipsText(String(tableInfo?.usualChips ?? ''));
      setShowUsualEditor(true);
    } else if (tableInfo) {
      handleBuyInTextChange(String(tableInfo.usualBuyIn));
      handleChipsTextChange(String(tableInfo.usualChips));
    }
  };

  const handleSaveUsual = async () => {
    try {
      const accessToken = await getAccessToken();
      await service.setUsualBuyIn(Number(usualBuyInText) || 0, Number(usualChipsText) || 0, accessToken);
      setShowUsualEditor(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStart = async () => {
    try {
      const accessToken = await getAccessToken();
      await service.startGame(Number(buyInText) || 0, Number(chipsText) || 0, selectedPlayers ?? [], accessToken);
      setBuyInConfirmed(false);
      setSelectedPlayers(null);
      await load();
      setShowInfo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Local selection only — nothing is written until Start commits it.
  const handleAllPlus = () => {
    setSelectedPlayers(players.map((p) => p.name));
  };

  const handleEnd = async () => {
    try {
      const accessToken = await getAccessToken();
      await service.endGame(accessToken);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenSelectedPopup = () => {
    setPopupChecked(new Set(selectedPlayers ?? []));
    setShowSelectedPopup(true);
  };

  const togglePopupChecked = (name: string) => {
    setPopupChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Only now — on Close, or a tap outside the card — does the staged
  // checkbox state actually update selectedPlayers.
  const handleCloseSelectedPopup = () => {
    setSelectedPlayers(Array.from(popupChecked));
    setShowSelectedPopup(false);
  };

  if (showManagePlayers) {
    return (
      <View style={{ flex: 1 }}>
        <Pressable style={styles.backLink} onPress={() => setShowManagePlayers(false)}>
          <Text style={styles.backLinkText}>‹ Table</Text>
        </Pressable>
        <TableScreen spreadsheetId={spreadsheetId} getAccessToken={getAccessToken} players={players} onChanged={load} />
      </View>
    );
  }

  if (showGroupScreen) {
    return (
      <GroupScreen
        groups={groups}
        players={players}
        spreadsheetId={spreadsheetId}
        getAccessToken={getAccessToken}
        selectedPlayers={selectedPlayers}
        setSelectedPlayers={setSelectedPlayers}
        onBack={() => setShowGroupScreen(false)}
        onChanged={load}
      />
    );
  }

  if (showCashInScreen) {
    return (
      <CashInScreen
        players={players}
        gameInfo={gameInfo}
        spreadsheetId={spreadsheetId}
        getAccessToken={getAccessToken}
        onBack={() => setShowCashInScreen(false)}
        onChanged={load}
      />
    );
  }

  if (showCashOutScreen) {
    return (
      <CashOutScreen
        gameInfo={gameInfo}
        spreadsheetId={spreadsheetId}
        getAccessToken={getAccessToken}
        onBack={() => setShowCashOutScreen(false)}
        onChanged={load}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.titleRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{tableInfo?.title || 'Poker Table'}</Text>
          {buyInConfirmed && (
            <Text style={styles.gameBuyInText}>
              Game buy-in: (₹{buyInText}, #{chipsText})
            </Text>
          )}
        </View>
        <View style={styles.titleActions}>
          <Pressable style={styles.refreshBtn} onPress={load}>
            <Text style={styles.refreshBtnText}>⟳</Text>
          </Pressable>
          <Pressable style={styles.managePlayersLink} onPress={() => setShowManagePlayers(true)}>
            <Text style={styles.managePlayersLinkText}>Players</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{gameState === 'in_progress' ? 'Game in progress' : 'Last game played'}</Text>
        {gameState === 'in_progress' && (
          <Pressable style={styles.infoBtn} onPress={() => setShowInfo(true)}>
            <Text style={styles.infoBtnText}>i</Text>
          </Pressable>
        )}
      </View>

      {playingPlayers.length > 0 && (
        <View style={styles.playingRow}>
          <Text style={styles.playingLabel}>Playing:</Text>
          <Text style={styles.playingNames}>{playingPlayers.map((p) => p.name).join(', ')}</Text>
        </View>
      )}

      <View style={styles.fieldsRow}>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>Buy-in (₹)</Text>
          <TextInput
            style={styles.fieldInput}
            value={buyInText}
            onChangeText={handleBuyInTextChange}
            keyboardType="decimal-pad"
            editable={gameState === 'none'}
          />
          <View style={styles.multiplierCol}>
            <Pressable style={styles.multiplierBtn} onPress={() => applyMultiplier(buyInText, handleBuyInTextChange, 0.5)}>
              <Text style={styles.multiplierText}>0.5x</Text>
            </Pressable>
            <Pressable style={styles.multiplierBtn} onPress={() => applyMultiplier(buyInText, handleBuyInTextChange, 2)}>
              <Text style={styles.multiplierText}>2x</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>Chips</Text>
          <TextInput
            style={styles.fieldInput}
            value={chipsText}
            onChangeText={handleChipsTextChange}
            keyboardType="number-pad"
            editable={gameState === 'none'}
          />
          <View style={styles.multiplierCol}>
            <Pressable style={styles.multiplierBtn} onPress={() => applyMultiplier(chipsText, handleChipsTextChange, 0.5)}>
              <Text style={styles.multiplierText}>0.5x</Text>
            </Pressable>
            <Pressable style={styles.multiplierBtn} onPress={() => applyMultiplier(chipsText, handleChipsTextChange, 2)}>
              <Text style={styles.multiplierText}>2x</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.setupRow}>
        {showUsualEditor ? (
          <View style={styles.usualEditRow}>
            <TextInput
              style={styles.usualEditInput}
              value={usualBuyInText}
              onChangeText={setUsualBuyInText}
              keyboardType="decimal-pad"
              placeholder="₹"
              autoFocus
            />
            <Text style={styles.usualEditSeparator}>|</Text>
            <TextInput
              style={styles.usualEditInput}
              value={usualChipsText}
              onChangeText={setUsualChipsText}
              keyboardType="number-pad"
              placeholder="chips"
            />
            <Pressable style={styles.usualUpdateBtn} onPress={handleSaveUsual}>
              <Text style={styles.usualUpdateBtnText}>Set</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.secondaryBtn} disabled={gameState !== 'none'} onPress={handleUsualPress}>
            <Text style={styles.secondaryBtnText}>Usual buy-in (₹, #chips)</Text>
          </Pressable>
        )}
        <DoubleTapButton
          label={buyInConfirmed ? 'Buy-in set ✓' : 'Set buy-in'}
          armedLabel="Tap again to set"
          disabled={gameState !== 'none'}
          onConfirm={handleSetBuyIn}
          style={styles.setupBtn}
        />
      </View>

      <View style={styles.startRow}>
        <DoubleTapButton
          label={gameState === 'none' ? 'Start' : 'Add'}
          armedLabel={gameState === 'none' ? 'Tap again to start' : 'Tap again to add'}
          disabled={!startEnabled}
          onConfirm={handleStart}
          style={styles.setupBtn}
        />
        {selectedPlayers !== null && (
          <>
            <Pressable style={styles.selectedIconBtn} onPress={handleOpenSelectedPopup}>
              <Text style={styles.selectedIconText}>▶</Text>
            </Pressable>
            <Pressable style={styles.clearSelectedBtn} onPress={() => setSelectedPlayers(null)}>
              <Text style={styles.clearSelectedBtnText}>Clear</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.grid}>
        <Pressable
          style={[styles.gridBtn, styles.gridPressable, !allPlusEnabled && styles.gridDisabled]}
          disabled={!allPlusEnabled}
          onPress={handleAllPlus}>
          <Text style={styles.gridText}>All+</Text>
        </Pressable>
        <Pressable
          style={[styles.gridBtn, styles.gridPressable, !groupPlusEnabled && styles.gridDisabled]}
          disabled={!groupPlusEnabled}
          onPress={() => setShowGroupScreen(true)}>
          <Text style={styles.gridText}>Group+</Text>
        </Pressable>
        <Pressable
          style={[styles.gridBtn, styles.gridPressable, !cashInsEnabled && styles.gridDisabled]}
          disabled={!cashInsEnabled}
          onPress={() => setShowCashInScreen(true)}>
          <Text style={styles.gridText}>Cash-ins</Text>
        </Pressable>
        <Pressable
          style={[styles.gridBtn, styles.gridPressable, !cashOutsEnabled && styles.gridDisabled]}
          disabled={!cashOutsEnabled}
          onPress={() => setShowCashOutScreen(true)}>
          <Text style={styles.gridText}>Cash-outs</Text>
        </Pressable>
        <Pressable style={[styles.gridBtn, styles.gridPressable]} onPress={() => notImplemented('Leaderboard')}>
          <Text style={styles.gridText}>Leaderboard</Text>
        </Pressable>
        <DoubleTapButton label="End" armedLabel="Tap again to end" disabled={!endEnabled} onConfirm={handleEnd} style={styles.gridBtn} />
      </View>

      {/* Current session info popup */}
      <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Current session</Text>
            {gameInfo && (
              <>
                <Text style={styles.modalLine}>Date: {gameInfo.date}</Text>
                <Text style={styles.modalLine}>Ratio: {gameInfo.ratio}</Text>
                <Text style={styles.modalLine}>Buy-in (₹): {gameInfo.buyInAmount}</Text>
                {playingPlayers.map((p) => (
                  <Text key={p.name} style={styles.modalLine}>
                    {p.name} — {p.buyIns} buy-in(s), {p.finalChips} chips
                  </Text>
                ))}
              </>
            )}
            <Pressable style={styles.primaryBtn} onPress={() => setShowInfo(false)}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Selected players preview — set locally by All+/Group+, not yet committed to the sheet.
          Unchecking a name here only updates the staged popupChecked
          set; the name stays visible and selectedPlayers isn't
          touched until the popup closes (Close, or tapping outside). */}
      <Modal visible={showSelectedPopup} transparent animationType="fade" onRequestClose={handleCloseSelectedPopup}>
        <Pressable style={styles.modalBackdrop} onPress={handleCloseSelectedPopup}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Selected for next game</Text>
            {(selectedPlayers ?? []).length === 0 ? (
              <Text style={styles.modalLine}>No players selected.</Text>
            ) : (
              (selectedPlayers ?? []).map((name) => {
                const checked = popupChecked.has(name);
                return (
                  <Pressable key={name} style={styles.selectedCheckRow} onPress={() => togglePopupChecked(name)}>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.modalLine}>{name}</Text>
                  </Pressable>
                );
              })
            )}
            <Pressable style={styles.primaryBtn} onPress={handleCloseSelectedPopup}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center' },
  backLink: { paddingHorizontal: 20, paddingVertical: 12 },
  backLinkText: { color: '#2f95dc', fontWeight: '600', fontSize: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleGroup: { gap: 2 },
  title: { fontSize: 22, fontWeight: '700' },
  gameBuyInText: { fontSize: 13, opacity: 0.6, fontWeight: '600' },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  refreshBtnText: { color: '#2f95dc', fontWeight: '700', fontSize: 18 },
  managePlayersLink: { paddingVertical: 6, paddingHorizontal: 10 },
  managePlayersLinkText: { color: '#2f95dc', fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 15, opacity: 0.7 },
  infoBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2f95dc', alignItems: 'center', justifyContent: 'center' },
  infoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  playingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playingLabel: { fontWeight: '700', opacity: 0.6 },
  playingNames: { flex: 1, opacity: 0.8 },
  fieldsRow: { flexDirection: 'row', gap: 12 },
  fieldCol: { flex: 1, gap: 6 },
  fieldLabel: { fontSize: 13, opacity: 0.6, fontWeight: '600' },
  fieldInput: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  multiplierCol: { flexDirection: 'row', gap: 6 },
  multiplierBtn: { flex: 1, backgroundColor: '#eee', borderRadius: 6, paddingVertical: 6, alignItems: 'center' },
  multiplierText: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
  setupRow: { flexDirection: 'row', gap: 10 },
  setupBtn: { flex: 1 },
  secondaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  usualEditRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  usualEditInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  usualEditSeparator: { opacity: 0.4, fontWeight: '700' },
  usualUpdateBtn: { backgroundColor: '#2f95dc', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 10 },
  usualUpdateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  secondaryBtnText: { fontWeight: '600', fontSize: 13, textAlign: 'center' },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIconText: { color: '#fff', fontSize: 16 },
  clearSelectedBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  clearSelectedBtnText: { fontWeight: '600', fontSize: 12, color: '#c00' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridBtn: { width: '47%' },
  gridPressable: {
    backgroundColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  gridDisabled: { backgroundColor: '#ccc' },
  gridText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalLine: { fontSize: 14 },
  selectedCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2f95dc' },
  checkboxMark: { color: '#fff', fontWeight: '700', fontSize: 13 },
  primaryBtn: { flex: 1, backgroundColor: '#2f95dc', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
});
