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
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import CashInScreen from './CashInScreen';
import CashOutScreen from './CashOutScreen';
import DoubleTapButton from './DoubleTapButton';
import GroupScreen from './GroupScreen';
import TableScreen from './TableScreen';
import Button from './ui/Button';
import Checkbox from './ui/Checkbox';
import ChipStackIcon from './ui/ChipStackIcon';
import GradientSurface from './ui/GradientSurface';
import IconButton from './ui/IconButton';
import ModalCard from './ui/ModalCard';
import TextField from './ui/TextField';
import { displayName } from '../lib/displayName';
import { PokerLedgerService, type CurrentGameInfo, type GroupInfo, type Player, type TableInfoData } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { GradientStops, Theme } from '../theme/tokens';

// A fixed blue, not a theme token — "in progress" is a status, not a
// brand color, so it stays the same blue in both Felt & Gold and Warm
// Orange rather than picking up either theme's accent hue.
const STATUS_ACTIVE_GRADIENT: GradientStops = ['#6fa4f7', '#2f6fed', '#1b45ad'];

// Fixed color-coding for the two units the buy-in/chips fields deal
// in — money (theme.colors.success, already green in both themes) vs.
// chips (a fixed purple, since neither theme has a purple token) —
// so the two pills read as different currencies at a glance.
const CHIPS_COLOR = '#9b6bf0';

export type TableHomeMockData = {
  tableInfo: TableInfoData;
  gameInfo: CurrentGameInfo | null;
  players: Player[];
  groups: GroupInfo[];
};

type Props = {
  spreadsheetId: string;
  // Only needed to reach TableScreen's account picker (lib/playerAccounts.ts)
  // — unused (and left '') in mock mode, since Players is disabled there.
  userId?: string;
  getAccessToken: () => Promise<string>;
  // When set, this never touches the network — every read comes from
  // here and every write only updates local state. Used by
  // components/dev/StaticPreview.tsx to review this screen while the
  // real sign-in/Sheets backend is down; safe to ignore otherwise.
  mock?: TableHomeMockData;
};

type GameState = 'none' | 'empty' | 'in_progress';

function deriveGameState(tableInfo: TableInfoData | null): GameState {
  if (!tableInfo) return 'none';
  if (tableInfo.status === 'in progress') return 'in_progress';
  if (tableInfo.sessionRow !== null && tableInfo.status === null) return 'empty';
  return 'none';
}

const notImplemented = (what: string) => Alert.alert(what, 'Coming in a later build round.');
const notInPreview = (what: string) => Alert.alert(what, "Not part of the static preview — see the real flow once the backend is fixed.");

export default function TableHome({ spreadsheetId, userId = '', getAccessToken, mock }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const [showPlayingModal, setShowPlayingModal] = useState(false);
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

  const useAlias = tableInfo?.useAlias ?? false;
  // selectedPlayers/popupChecked hold real names (startGame needs them
  // that way) — this looks each up against the roster purely so the
  // popup can show the alias when the table's toggle is on.
  const selectedPlayerLabel = (name: string) => {
    const p = players.find((pl) => pl.name === name);
    return p ? displayName(p, useAlias) : name;
  };

  // Everything this table needs — TableInfo, the current game, the
  // player roster, groups — is read from the sheet once here, when
  // the table is opened. Sub-screens receive it as props rather than
  // fetching their own copies; a mutation calls this again (via
  // onChanged) instead of each screen refreshing itself in isolation.
  const load = useCallback(async () => {
    if (mock) {
      setTableInfo(mock.tableInfo);
      setGameInfo(mock.gameInfo);
      setPlayers(mock.players);
      setGroups(mock.groups);
      setError(null);
      setLoading(false);
      return;
    }
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
  }, [service, getAccessToken, mock]);

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

  // Just a submit button — confirms the typed buy-in/chips, double-tap like Set players/All+/End.
  const handleSetBuyIn = () => {
    if ((Number(buyInText) || 0) <= 0 || (Number(chipsText) || 0) <= 0) {
      Alert.alert('Set game', 'Enter a buy-in(₹) and chips amount first.');
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
    if (mock) {
      setTableInfo((prev) => (prev ? { ...prev, usualBuyIn: Number(usualBuyInText) || 0, usualChips: Number(usualChipsText) || 0 } : prev));
      setShowUsualEditor(false);
      return;
    }
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
    if (mock) {
      const buyInAmount = Number(buyInText) || 0;
      const chips = Number(chipsText) || 0;
      const selected = new Set(selectedPlayers ?? []);
      setTableInfo((prev) => (prev ? { ...prev, status: 'in progress', sessionRow: prev.sessionRow ?? 1 } : prev));
      setGameInfo({
        row: 1,
        date: new Date().toISOString().slice(0, 10),
        ratio: chips > 0 ? buyInAmount / chips : 0,
        buyInAmount,
        players: players.map((p) => ({ name: p.name, alias: p.alias, buyIns: selected.has(p.name) ? 1 : 0, finalChips: 0 })),
      });
      setBuyInConfirmed(false);
      setSelectedPlayers(null);
      setShowInfo(true);
      return;
    }
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
    if (mock) {
      setTableInfo((prev) => (prev ? { ...prev, status: 'last played' } : prev));
      return;
    }
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
        <Pressable
          style={({ pressed }) => [styles.backLink, pressed && styles.pressedDim]}
          onPress={() => setShowManagePlayers(false)}>
          <Text style={styles.backLinkText}>‹ Table</Text>
        </Pressable>
        <TableScreen
          spreadsheetId={spreadsheetId}
          userId={userId}
          tableName={tableInfo?.title || 'Poker Table'}
          getAccessToken={getAccessToken}
          players={players}
          tableInfo={tableInfo}
          onChanged={load}
        />
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
        useAlias={useAlias}
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
        useAlias={useAlias}
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
        useAlias={useAlias}
        onBack={() => setShowCashOutScreen(false)}
        onChanged={load}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
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
          <IconButton icon="⟳" onPress={load} />
          <Pressable
            style={({ pressed }) => [styles.managePlayersLink, pressed && styles.pressedDim]}
            onPress={() => (mock ? notInPreview('Players') : setShowManagePlayers(true))}>
            <Text style={styles.managePlayersLinkText}>Players</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusBar}>
        {gameState === 'in_progress' && (
          <GradientSurface colors={STATUS_ACTIVE_GRADIENT} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.pill }]} />
        )}
        <Text style={[styles.statusBarText, gameState === 'in_progress' && styles.statusBarTextActive]}>
          {gameState === 'in_progress' ? 'Game in progress' : 'Last game played'}
        </Text>
        {gameState === 'in_progress' && (
          <>
            <View style={[styles.statusBarDivider, styles.statusBarDividerActive]} />
            <IconButton icon="i" variant="accent" size={22} onPress={() => setShowInfo(true)} />
          </>
        )}
      </View>

      <View style={styles.fieldsRow}>
        <View style={styles.fieldCol}>
          <Text style={[styles.fieldLabel, styles.fieldLabelMoney]}>Buy-in (₹)</Text>
          <TextField
            style={[styles.fieldInputPill, styles.fieldInputPillMoney]}
            value={buyInText}
            onChangeText={handleBuyInTextChange}
            keyboardType="decimal-pad"
            editable={gameState === 'none'}
          />
          <View style={styles.multiplierCol}>
            <Pressable
              style={({ pressed }) => [styles.multiplierBtn, styles.multiplierBtnDown, pressed && styles.multiplierBtnDownPressed]}
              onPress={() => applyMultiplier(buyInText, handleBuyInTextChange, 0.5)}>
              <Text style={[styles.multiplierText, styles.multiplierTextDown]}>0.5x</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.multiplierBtn, styles.multiplierBtnUp, pressed && styles.multiplierBtnUpPressed]}
              onPress={() => applyMultiplier(buyInText, handleBuyInTextChange, 2)}>
              <Text style={[styles.multiplierText, styles.multiplierTextUp]}>2x</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.fieldCol}>
          <View style={styles.fieldLabelRow}>
            <ChipStackIcon size={13} />
            <Text style={[styles.fieldLabel, styles.fieldLabelChips]}>Chips</Text>
          </View>
          <TextField
            style={[styles.fieldInputPill, styles.fieldInputPillChips]}
            value={chipsText}
            onChangeText={handleChipsTextChange}
            keyboardType="number-pad"
            editable={gameState === 'none'}
          />
          <View style={styles.multiplierCol}>
            <Pressable
              style={({ pressed }) => [styles.multiplierBtn, styles.multiplierBtnDown, pressed && styles.multiplierBtnDownPressed]}
              onPress={() => applyMultiplier(chipsText, handleChipsTextChange, 0.5)}>
              <Text style={[styles.multiplierText, styles.multiplierTextDown]}>0.5x</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.multiplierBtn, styles.multiplierBtnUp, pressed && styles.multiplierBtnUpPressed]}
              onPress={() => applyMultiplier(chipsText, handleChipsTextChange, 2)}>
              <Text style={[styles.multiplierText, styles.multiplierTextUp]}>2x</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.setupRow}>
        {showUsualEditor ? (
          <View style={styles.usualEditRow}>
            <TextField
              style={styles.usualEditInput}
              value={usualBuyInText}
              onChangeText={setUsualBuyInText}
              keyboardType="decimal-pad"
              placeholder="₹"
              autoFocus
            />
            <Text style={styles.usualEditSeparator}>|</Text>
            <TextField
              style={styles.usualEditInput}
              value={usualChipsText}
              onChangeText={setUsualChipsText}
              keyboardType="number-pad"
              placeholder="chips"
            />
            <Pressable
              style={({ pressed }) => [styles.usualUpdateBtn, pressed && styles.pressedDimSurface]}
              onPress={handleSaveUsual}>
              <Text style={styles.usualUpdateBtnText}>Set</Text>
            </Pressable>
          </View>
        ) : (
          <Button
            label="Usual buy-in"
            variant="secondary"
            disabled={gameState !== 'none'}
            onPress={handleUsualPress}
            style={styles.setupBtn}
          />
        )}
        <DoubleTapButton
          label={buyInConfirmed ? 'Game set ✓' : 'Set game'}
          armedLabel="Tap again to set"
          disabled={gameState !== 'none'}
          onConfirm={handleSetBuyIn}
          style={styles.setupBtn}
        />
      </View>

      <View style={styles.startRow}>
        <DoubleTapButton
          label={gameState === 'none' ? 'Set players' : 'Add players'}
          armedLabel={gameState === 'none' ? 'Tap again to set players' : 'Tap again to add players'}
          disabled={!startEnabled}
          onConfirm={handleStart}
          style={styles.setupBtn}
        />
        {selectedPlayers !== null && (
          <>
            <IconButton icon="▶" variant="accent" size={40} onPress={handleOpenSelectedPopup} />
            <Pressable
              style={({ pressed }) => [styles.clearSelectedBtn, pressed && styles.pressedDimSurface]}
              onPress={() => setSelectedPlayers(null)}>
              <Text style={styles.clearSelectedBtnText}>✕</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Size A — the pre-game setup actions, most prominent. */}
      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.gridBtnA, styles.gridPressableA, !allPlusEnabled && styles.gridDisabled, allPlusEnabled && pressed && styles.pressedDimSurface]}
          disabled={!allPlusEnabled}
          onPress={handleAllPlus}>
          {allPlusEnabled && <GradientSurface colors={theme.gradients.accent} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]} />}
          <Text style={[styles.gridTextA, !allPlusEnabled && styles.gridTextDisabled]}>👥 All+</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.gridBtnA, styles.gridPressableA, !groupPlusEnabled && styles.gridDisabled, groupPlusEnabled && pressed && styles.pressedDimSurface]}
          disabled={!groupPlusEnabled}
          onPress={() => (mock ? notInPreview('Group+') : setShowGroupScreen(true))}>
          {groupPlusEnabled && <GradientSurface colors={theme.gradients.accent} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]} />}
          <Text style={[styles.gridTextA, !groupPlusEnabled && styles.gridTextDisabled]}>♣ Group+</Text>
        </Pressable>
      </View>

      {/* Size B — the in-game money actions. */}
      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.gridBtnB, styles.gridPressableB, !cashInsEnabled && styles.gridDisabled, cashInsEnabled && pressed && styles.pressedDimSurface]}
          disabled={!cashInsEnabled}
          onPress={() => (mock ? notInPreview('Cash-ins') : setShowCashInScreen(true))}>
          {cashInsEnabled && <GradientSurface colors={theme.gradients.accent} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]} />}
          <Text style={[styles.gridTextB, !cashInsEnabled && styles.gridTextDisabled]}>💵 Cash-ins</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.gridBtnB, styles.gridPressableB, !cashOutsEnabled && styles.gridDisabled, cashOutsEnabled && pressed && styles.pressedDimSurface]}
          disabled={!cashOutsEnabled}
          onPress={() => (mock ? notInPreview('Cash-outs') : setShowCashOutScreen(true))}>
          {cashOutsEnabled && <GradientSurface colors={theme.gradients.accent} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]} />}
          <View style={styles.gridBtnContentRow}>
            <ChipStackIcon size={15} />
            <Text style={[styles.gridTextB, !cashOutsEnabled && styles.gridTextDisabled]}>Cash-outs</Text>
          </View>
        </Pressable>
      </View>

      {/* Size C — wrap-up / occasional actions. */}
      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.gridBtnC, styles.gridPressableC, pressed && styles.pressedDimSurface]}
          onPress={() => notImplemented('Leaderboard')}>
          <GradientSurface colors={theme.gradients.accent} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.sm }]} />
          <Text style={styles.gridTextC}>🏆 Leaderboard</Text>
        </Pressable>
        <DoubleTapButton
          label="End"
          armedLabel="Tap again to end"
          disabled={!endEnabled}
          variant="danger"
          onConfirm={handleEnd}
          style={[styles.gridBtnC, styles.endSizeC]}
        />
      </View>

      {/* Playing:, as a button — opens the players-playing popup rather
          than always spelling every name out inline on the page. */}
      {playingPlayers.length > 0 && (
        <Pressable
          style={({ pressed }) => [styles.playingBtn, pressed && styles.pressedDimSurface]}
          onPress={() => setShowPlayingModal(true)}>
          <Text style={styles.playingBtnLabel}>👥 Playing</Text>
          <Text style={styles.playingBtnNames} numberOfLines={1}>
            {playingPlayers.map((p) => displayName(p, useAlias)).join(', ')}
          </Text>
          <Text style={styles.playingBtnChevron}>›</Text>
        </Pressable>
      )}

      {/* Current session info popup */}
      <ModalCard visible={showInfo} onRequestClose={() => setShowInfo(false)}>
        <Text style={styles.modalTitle}>Current session</Text>
        {gameInfo && (
          <>
            <Text style={styles.modalLine}>Date: {gameInfo.date}</Text>
            <Text style={styles.modalLine}>Ratio: {gameInfo.ratio}</Text>
            <Text style={styles.modalLine}>Buy-in (₹): {gameInfo.buyInAmount}</Text>
            {playingPlayers.map((p) => (
              <Text key={p.name} style={styles.modalLine}>
                {displayName(p, useAlias)} — {p.buyIns} buy-in(s), {p.finalChips} chips
              </Text>
            ))}
          </>
        )}
        <Button label="Close" onPress={() => setShowInfo(false)} />
      </ModalCard>

      {/* Currently-playing popup — triggered by the Playing: button above */}
      <ModalCard visible={showPlayingModal} onRequestClose={() => setShowPlayingModal(false)}>
        <Text style={styles.modalTitle}>Currently playing</Text>
        {playingPlayers.map((p) => (
          <Text key={p.name} style={styles.modalLine}>
            {displayName(p, useAlias)} — {p.buyIns} buy-in(s)
          </Text>
        ))}
        <Button label="Close" onPress={() => setShowPlayingModal(false)} />
      </ModalCard>

      {/* Selected players preview — set locally by All+/Group+, not yet committed to the sheet.
          Unchecking a name here only updates the staged popupChecked
          set; the name stays visible and selectedPlayers isn't
          touched until the popup closes (Close, or tapping outside). */}
      <ModalCard visible={showSelectedPopup} onRequestClose={handleCloseSelectedPopup}>
        <Text style={styles.modalTitle}>Selected for next game</Text>
        {(selectedPlayers ?? []).length === 0 ? (
          <Text style={styles.modalLine}>No players selected.</Text>
        ) : (
          (selectedPlayers ?? []).map((name) => (
            <Checkbox key={name} checked={popupChecked.has(name)} onPress={() => togglePopupChecked(name)} label={selectedPlayerLabel(name)} />
          ))
        )}
        <Button label="Close" onPress={handleCloseSelectedPopup} />
      </ModalCard>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, gap: 12 },
    error: { color: theme.colors.danger, textAlign: 'center' },
    // Shared pressed-state feedback — link-style text buttons dim more
    // (pressedDim) since they have no fill of their own to darken;
    // filled/gradient surfaces just need a slight dim (pressedDimSurface)
    // to read as "shading", not a full fade.
    pressedDim: { opacity: 0.6 },
    pressedDimSurface: { opacity: 0.85 },
    backLink: { paddingHorizontal: 20, paddingVertical: 12 },
    backLinkText: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.md },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    titleGroup: { gap: 2 },
    title: { fontSize: theme.font.size.xxl, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    gameBuyInText: { fontSize: theme.font.size.sm, color: theme.colors.textSecondary, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    managePlayersLink: { paddingVertical: 6, paddingHorizontal: 10 },
    managePlayersLinkText: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    // A full-width pill instead of bare text — the "i" info button sits
    // inside it, separated by a thin divider (statusBarDivider) rather
    // than floating loose next to plain text. Filled solid blue while a
    // game's in progress (a fixed status color, not a theme one) via the
    // GradientSurface painted as this pill's first child; otherwise just
    // the neutral surfaceAlt fallback below.
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.pill,
      paddingVertical: 10,
      paddingHorizontal: 16,
      overflow: 'hidden',
    },
    statusBarText: { flex: 1, fontSize: theme.font.size.md, color: theme.colors.textSecondary, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium },
    statusBarTextActive: { color: '#fff' },
    statusBarDivider: { width: 1, height: 20, backgroundColor: theme.colors.border },
    statusBarDividerActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
    // The Playing: button — opens the currently-playing popup instead of
    // always spelling every name out inline on the page.
    playingBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.pill,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    playingBtnLabel: { fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary, fontSize: theme.font.size.md },
    playingBtnNames: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.font.size.md, fontFamily: theme.font.family.regular },
    playingBtnChevron: { color: theme.colors.textSecondary, fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    fieldsRow: { flexDirection: 'row', gap: 12 },
    fieldCol: { flex: 1, gap: 6 },
    fieldLabel: { fontSize: theme.font.size.sm, color: theme.colors.textSecondary, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium },
    // Money (₹) vs. chips are two different units — a green/purple
    // tint on each pill (label + fill) makes that legible at a glance,
    // same "tint over the neutral fill" trick as the multiplier buttons.
    fieldLabelMoney: { color: theme.colors.success },
    fieldLabelChips: { color: CHIPS_COLOR },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    // Chip/token pill — fully rounded, filled, centered text, no
    // border — reads like a poker chip rather than a form field.
    fieldInputPill: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 0,
      textAlign: 'center',
      fontSize: theme.font.size.lg,
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
      paddingVertical: 14,
    },
    fieldInputPillMoney: { backgroundColor: `${theme.colors.success}1f`, color: theme.colors.success },
    fieldInputPillChips: { backgroundColor: `${CHIPS_COLOR}1f`, color: CHIPS_COLOR },
    multiplierCol: { flexDirection: 'row', gap: 6 },
    multiplierBtn: { flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm, paddingVertical: 6, alignItems: 'center' },
    // 0.5x reads as a reduction, 2x as a boost — a red/green tint (over
    // the same neutral fill) makes that legible at a glance.
    multiplierBtnDown: { backgroundColor: `${theme.colors.danger}22` },
    multiplierBtnUp: { backgroundColor: `${theme.colors.success}22` },
    multiplierBtnDownPressed: { backgroundColor: `${theme.colors.danger}3d` },
    multiplierBtnUpPressed: { backgroundColor: `${theme.colors.success}3d` },
    multiplierText: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, color: theme.colors.textSecondary },
    multiplierTextDown: { color: theme.colors.danger },
    multiplierTextUp: { color: theme.colors.success },
    setupRow: { flexDirection: 'row', gap: 10 },
    setupBtn: { flex: 1 },
    usualEditRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    usualEditInput: { flex: 1, fontSize: theme.font.size.sm, fontFamily: theme.font.family.regular, paddingVertical: 8, paddingHorizontal: 8 },
    usualEditSeparator: { color: theme.colors.textSecondary, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    usualUpdateBtn: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.sm, paddingVertical: 10, paddingHorizontal: 10 },
    usualUpdateBtnText: { color: theme.colors.accentText, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.xs },
    startRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    // Icon-only now (✕, no "Clear" label) — a circle matching the ▶
    // button beside it, tinted danger since it's a destructive action.
    clearSelectedBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.colors.danger}22`,
    },
    clearSelectedBtnText: { fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.md, color: theme.colors.danger },
    // Three size tiers for the action grid — All+/Group+ (A) are the
    // prominent pre-game setup actions, Cash-ins/Cash-outs (B) are the
    // frequent in-game ones, Leaderboard/End (C) are occasional
    // wrap-up actions. A > B > C in both footprint and type size.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridBtnA: { width: '48%' },
    gridBtnB: { width: '48%' },
    gridBtnC: { width: '48%' },
    // backgroundColor here is only the disabled-state fallback — when
    // enabled, a GradientSurface layer painted as the Pressable's first
    // child fully covers it (see gridDisabled, applied after this).
    gridPressableA: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
      minHeight: 88,
      overflow: 'hidden',
    },
    gridPressableB: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      minHeight: 56,
      overflow: 'hidden',
    },
    gridPressableC: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      minHeight: 38,
      overflow: 'hidden',
    },
    // Sizing-only (no fill color) version of the C tier, for End —
    // DoubleTapButton picks its own fill (danger red), so this only
    // needs to shrink its footprint to match Leaderboard's.
    endSizeC: { paddingVertical: 8, minHeight: 38, borderRadius: theme.radius.sm },
    gridDisabled: { backgroundColor: theme.colors.surfaceAlt },
    gridBtnContentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    gridTextA: { color: theme.colors.accentText, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.xl },
    gridTextB: { color: theme.colors.accentText, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.md },
    gridTextC: { color: theme.colors.accentText, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, fontSize: theme.font.size.xs },
    gridTextDisabled: { color: theme.colors.textSecondary },
    modalTitle: { fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    modalLine: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.regular, color: theme.colors.textPrimary },
  });
