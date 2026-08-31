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
 * Cash-ins/Cash-outs need a game to exist; End additionally needs every
 * currently-playing player to have entered a cash-out (see
 * notCashedOutPlayers / the badge+popup on the End button, and
 * lib/pokerActions.ts's `cashedOut` flag for how "entered" is told apart
 * from "still the default 0"). Game Sessions is always enabled.
 *
 * Players/Group+/Cash-ins/Cash-outs/Game Sessions all need a live sheet
 * read, so in mock mode (components/dev/StaticPreview.tsx) they show a
 * "not part of the preview" notice instead of navigating (`notInPreview`)
 * rather than opening their real screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import CashInScreen from './CashInScreen';
import CashOutScreen from './CashOutScreen';
import DoubleTapButton from './DoubleTapButton';
import GameSessionsScreen from './GameSessionsScreen';
import GroupScreen from './GroupScreen';
import TableScreen from './TableScreen';
import Button from './ui/Button';
import ChipStackIcon from './ui/ChipStackIcon';
import IconButton from './ui/IconButton';
import ModalCard from './ui/ModalCard';
import SelectTile from './ui/SelectTile';
import TextField from './ui/TextField';
import TrashIcon from './ui/TrashIcon';
import { displayName } from '../lib/displayName';
import { PokerLedgerService, type CurrentGameInfo, type GroupInfo, type Player, type SumCheckInfo, type TableInfoData } from '../lib/pokerActions';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

// A fixed blue, not a theme token — "in progress" is a status, not a
// brand color, so it stays the same blue in both Felt & Gold and Warm
// Orange rather than picking up either theme's accent hue. Was a
// 3-stop gradient for a filled pill; now just the border/text color.
const STATUS_ACTIVE_COLOR = '#2f6fed';

// "Usual buy-in" (a plain Button) and "Set game" (a DoubleTapButton,
// whose double-ring border wants a bit more room than Button's single
// border does) need to look the same height side by side — an explicit
// shared height, passed to both, rather than trusting their two
// different internal paddings/borders to coincidentally add up to the
// same number.
const SETUP_BTN_HEIGHT = 52;

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

const notInPreview = (what: string) => Alert.alert(what, "Not part of the static preview — see the real flow once the backend is fixed.");

// sum-check!D — buy-ins money in minus cash-outs money out for the
// game, so far. 0 has no sign; a real deviation always does, since the
// badge otherwise reads ambiguous ("140" doesn't say which direction).
const formatDeviation = (deviation: number) => {
  const rounded = Math.round(deviation);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

export default function TableHome({ spreadsheetId, userId = '', getAccessToken, mock }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);

  const [tableInfo, setTableInfo] = useState<TableInfoData | null>(null);
  const [gameInfo, setGameInfo] = useState<CurrentGameInfo | null>(null);
  const [sumCheck, setSumCheck] = useState<SumCheckInfo | null>(null);
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
  const [showGameSessions, setShowGameSessions] = useState(false);
  const [showNotCashedOutPopup, setShowNotCashedOutPopup] = useState(false);

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
      // Not part of the lightweight mock model — the deviation badge
      // just stays hidden in static preview (sum-check is a separate
      // sheet tab, unrelated to gameInfo/tableInfo).
      setSumCheck(null);
      setPlayers(mock.players);
      setGroups(mock.groups);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      const accessToken = await getAccessToken();
      const [info, game, sums, roster, groupList] = await Promise.all([
        service.getTableInfo(accessToken),
        service.getCurrentGameInfo(accessToken),
        service.getSumCheck(accessToken),
        service.listPlayers(accessToken),
        service.listGroups(accessToken),
      ]);
      setTableInfo(info);
      setGameInfo(game);
      setSumCheck(sums);
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
  // Players still owed a cash-out entry — End stays blocked until this
  // is empty (see endEnabled below); the badge on End and its popup
  // both read straight from this same list.
  const notCashedOutPlayers = playingPlayers.filter((p) => !p.cashedOut);

  const setGameEnabled = gameState === 'none' && (Number(buyInText) || 0) > 0 && (Number(chipsText) || 0) > 0;
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
  const endEnabled = gameState === 'in_progress' && notCashedOutPlayers.length === 0;

  const applyMultiplier = (text: string, setText: (v: string) => void, factor: number) => {
    const current = Number(text) || 0;
    setText(String(current * factor));
  };

  const handleBuyInTextChange = (v: string) => setBuyInText(v);
  const handleChipsTextChange = (v: string) => setChipsText(v);

  // Just a submit button — confirms the typed buy-in/chips, double-tap like Set players/All+/End.
  // The button itself is disabled (setGameEnabled) whenever buy-in/chips
  // aren't both set, so this check is a backstop, not the primary gate.
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
        players: players.map((p) => ({ name: p.name, alias: p.alias, buyIns: selected.has(p.name) ? 1 : 0, finalChips: 0, cashedOut: false })),
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

  if (showGameSessions) {
    return (
      <GameSessionsScreen
        players={players}
        spreadsheetId={spreadsheetId}
        getAccessToken={getAccessToken}
        useAlias={useAlias}
        onBack={() => setShowGameSessions(false)}
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

      <View style={styles.fieldsRow}>
        <View style={styles.fieldCol}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabelMoneyIcon}>💰</Text>
            <Text style={[styles.fieldLabel, styles.fieldLabelMoney]}>Buy-in (₹)</Text>
          </View>
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
              <Text style={[styles.multiplierText, styles.multiplierTextDown]}>
                0.5<Text style={styles.multiplierTextX}>x</Text>
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.multiplierBtn, styles.multiplierBtnUp, pressed && styles.multiplierBtnUpPressed]}
              onPress={() => applyMultiplier(buyInText, handleBuyInTextChange, 2)}>
              <Text style={[styles.multiplierText, styles.multiplierTextUp]}>
                2<Text style={styles.multiplierTextX}>x</Text>
              </Text>
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
              <Text style={[styles.multiplierText, styles.multiplierTextDown]}>
                0.5<Text style={styles.multiplierTextX}>x</Text>
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.multiplierBtn, styles.multiplierBtnUp, pressed && styles.multiplierBtnUpPressed]}
              onPress={() => applyMultiplier(chipsText, handleChipsTextChange, 2)}>
              <Text style={[styles.multiplierText, styles.multiplierTextUp]}>
                2<Text style={styles.multiplierTextX}>x</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.setupRow}>
        {showUsualEditor ? (
          <View style={styles.usualEditRow}>
            <View style={styles.usualEditFieldGroup}>
              <Text style={styles.usualEditIcon}>💰</Text>
              <TextField
                style={styles.usualEditInput}
                value={usualBuyInText}
                onChangeText={setUsualBuyInText}
                keyboardType="decimal-pad"
                placeholder="₹"
                autoFocus
              />
            </View>
            <Text style={styles.usualEditSeparator}>|</Text>
            <View style={styles.usualEditFieldGroup}>
              <ChipStackIcon size={13} />
              <TextField
                style={styles.usualEditInput}
                value={usualChipsText}
                onChangeText={setUsualChipsText}
                keyboardType="number-pad"
                placeholder="chips"
              />
            </View>
            {/* Empty — no label, no icon. A small square, self-explanatory
                as the one actionable control in this row. */}
            <Pressable
              style={({ pressed }) => [styles.usualUpdateBtn, pressed && styles.pressedDimSurface]}
              onPress={handleSaveUsual}
            />
          </View>
        ) : (
          <Button
            label="💰 Usual buy-in"
            variant="secondary"
            disabled={gameState !== 'none'}
            onPress={handleUsualPress}
            labelStyle={styles.usualBtnLabel}
            style={[styles.setupBtn, styles.usualBtnNarrow, styles.setupBtnHeight]}
          />
        )}
        <View style={styles.setupBtn}>
          <DoubleTapButton
            label={buyInConfirmed ? 'Game set ✓' : 'Set game'}
            armedLabel="Tap again to set"
            disabled={!setGameEnabled}
            onConfirm={handleSetBuyIn}
            style={styles.setupBtnHeight}
          />
          <Text style={styles.ordinalBadge}>I</Text>
        </View>
      </View>

      {/* Size A — the pre-game setup actions, most prominent. */}
      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.gridBtnA, styles.gridPressableA, !allPlusEnabled && styles.gridDisabled, allPlusEnabled && pressed && styles.pressedDimSurface]}
          disabled={!allPlusEnabled}
          onPress={handleAllPlus}>
          <Text style={[styles.gridTextA, !allPlusEnabled && styles.gridTextDisabled]}>♣ All ➕</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.gridBtnA, styles.gridPressableA, !groupPlusEnabled && styles.gridDisabled, groupPlusEnabled && pressed && styles.pressedDimSurface]}
          disabled={!groupPlusEnabled}
          onPress={() => (mock ? notInPreview('Group+') : setShowGroupScreen(true))}>
          <Text style={[styles.gridTextA, !groupPlusEnabled && styles.gridTextDisabled]}>👥 Group ➕</Text>
        </Pressable>
      </View>

      {/* Size B — the in-game money actions. */}
      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.gridBtnB, styles.gridPressableB, !cashInsEnabled && styles.gridDisabled, cashInsEnabled && pressed && styles.pressedDimSurface]}
          disabled={!cashInsEnabled}
          onPress={() => (mock ? notInPreview('Cash-ins') : setShowCashInScreen(true))}>
          <Text style={[styles.gridTextB, !cashInsEnabled && styles.gridTextDisabled]}>💰 Cash-ins</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.gridBtnB, styles.gridPressableB, !cashOutsEnabled && styles.gridDisabled, cashOutsEnabled && pressed && styles.pressedDimSurface]}
          disabled={!cashOutsEnabled}
          onPress={() => (mock ? notInPreview('Cash-outs') : setShowCashOutScreen(true))}>
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
          onPress={() => (mock ? notInPreview('Game Sessions') : setShowGameSessions(true))}>
          <Text style={styles.gridTextC}>🏆 Game Sessions</Text>
        </Pressable>
        <View style={[styles.gridBtnC, styles.endWrap]}>
          <DoubleTapButton
            label=""
            armedLabel="Tap again to end"
            disabled={!endEnabled}
            variant="danger"
            onConfirm={handleEnd}
            radius={theme.radius.sm}
            style={styles.endSizeC}
          />
          {/* Count of playing players who haven't entered a cash-out yet
              — End stays disabled (see endEnabled) until this reaches 0.
              Only meaningful while a game's actually in progress. */}
          {gameState === 'in_progress' && (
            <Pressable
              style={({ pressed }) => [styles.notCashedOutBadge, pressed && styles.pressedDimSurface]}
              onPress={() => setShowNotCashedOutPopup(true)}>
              <Text style={styles.notCashedOutBadgeText}>{notCashedOutPlayers.length}</Text>
            </Pressable>
          )}
          {/* sum-check's deviation for this game — buy-ins money in minus
              cash-outs money out, so far. Stays visible after End too
              (gameInfo persists past "last played"), hidden only for a
              table that's never had a game. */}
          {gameInfo && sumCheck && (
            <View style={styles.deviationBadge}>
              <Text style={styles.deviationBadgeText}>💰 {formatDeviation(sumCheck.deviation)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* The whole bar opens the current-session info popup — not just a
          small icon at its end — when a game's actually in progress.
          Moved below the action grids (Game Sessions/End), not up near the
          title, so the setup/action controls read first. */}
      <Pressable
        disabled={gameState !== 'in_progress'}
        onPress={() => setShowInfo(true)}
        style={({ pressed }) => [
          styles.statusBar,
          gameState === 'in_progress' && styles.statusBarActive,
          gameState === 'in_progress' && pressed && styles.pressedDimSurface,
        ]}>
        <Text style={[styles.statusBarText, gameState === 'in_progress' && styles.statusBarTextActive]}>
          {gameState === 'in_progress' ? 'Game in progress' : 'No game on'}
        </Text>
        {gameState === 'in_progress' && (
          <>
            <View style={styles.statusBarDivider} />
            {/* Purely decorative now — a plain View, not its own
                Pressable, since the bar above already handles the tap. */}
            <View style={styles.statusBarInfoBadge}>
              <Text style={styles.statusBarInfoBadgeText}>i</Text>
            </View>
          </>
        )}
      </Pressable>

      {/* Selected-players preview (▶) and clear (trash icon) — sits right
          under the status bar, ahead of "Set players"/"Add players"
          itself (now the final action, moved to the bottom of the
          screen) so the preview is visible before that button. */}
      {selectedPlayers !== null && (
        <View style={styles.selectedActionsRow}>
          <IconButton icon="▶" variant="accent" size={40} onPress={handleOpenSelectedPopup} />
          <Pressable
            style={({ pressed }) => [styles.clearSelectedBtn, pressed && styles.pressedDimSurface]}
            onPress={() => setSelectedPlayers(null)}>
            <TrashIcon size={16} color={theme.colors.danger} />
          </Pressable>
        </View>
      )}

      {/* Playing:, directly below the status bar (moved down together
          with it) — a full-width label rather than a floating pill.
          Opens the players-playing popup rather than always spelling
          every name out inline on the page. */}
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

      {/* Moved to the bottom of the screen — the final action once
          everything above (buy-in, usual, All+/Group+ selection) has
          been reviewed, rather than sitting right under "Set game". */}
      <View style={styles.startRow}>
        <View style={styles.setupBtn}>
          <DoubleTapButton
            label={gameState === 'none' ? 'Set players' : 'Add players'}
            armedLabel={gameState === 'none' ? 'Tap again to set players' : 'Tap again to add players'}
            disabled={!startEnabled}
            onConfirm={handleStart}
            style={styles.setupBtnHeight}
          />
          <Text style={styles.ordinalBadge}>II</Text>
        </View>
      </View>

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

      {/* Haven't-cashed-out popup — triggered by End's top-right badge */}
      <ModalCard visible={showNotCashedOutPopup} onRequestClose={() => setShowNotCashedOutPopup(false)}>
        <Text style={styles.modalTitle}>Haven't cashed out</Text>
        {notCashedOutPlayers.length === 0 ? (
          <Text style={styles.modalLine}>Everyone's cashed out — End is ready.</Text>
        ) : (
          notCashedOutPlayers.map((p) => (
            <Text key={p.name} style={styles.modalLine}>
              {displayName(p, useAlias)}
            </Text>
          ))
        )}
        <Button label="Close" onPress={() => setShowNotCashedOutPopup(false)} />
      </ModalCard>

      {/* Selected players preview — set locally by All+/Group+, not yet
          committed to the sheet. A 2-col grid of toggle tiles (see
          components/ui/SelectTile.tsx), not a checkbox list. Toggling a
          tile off here only updates the staged popupChecked set; the
          name stays visible and selectedPlayers isn't touched until the
          popup closes (Close, or tapping outside). */}
      <ModalCard visible={showSelectedPopup} onRequestClose={handleCloseSelectedPopup}>
        <Text style={styles.modalTitle}>Selected for next game</Text>
        {(selectedPlayers ?? []).length === 0 ? (
          <Text style={styles.modalLine}>No players selected.</Text>
        ) : (
          <View style={styles.selectedGrid}>
            {(selectedPlayers ?? []).map((name) => (
              <SelectTile key={name} selected={popupChecked.has(name)} onPress={() => togglePopupChecked(name)} label={selectedPlayerLabel(name)} />
            ))}
          </View>
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
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    managePlayersLink: { paddingVertical: 6, paddingHorizontal: 10 },
    managePlayersLinkText: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    // A full-width pill instead of bare text — the "i" info button sits
    // inside it, separated by a thin divider (statusBarDivider) rather
    // than floating loose next to plain text. Transparent, border only,
    // like every other button/card — a neutral border normally, the
    // fixed status blue (border + text) once a game's in progress.
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: 'transparent',
      // Matches Button's own default radius (theme.radius.md) — same
      // corner as "Usual buy-in" and the buy-in/chips fields below,
      // rather than the fully-rounded pill this used to be.
      borderRadius: theme.radius.md,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    statusBarActive: { borderColor: STATUS_ACTIVE_COLOR },
    statusBarText: { flex: 1, fontSize: theme.font.size.md, color: theme.colors.textSecondary, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium },
    statusBarTextActive: { color: STATUS_ACTIVE_COLOR },
    statusBarDivider: { width: 1, height: 20, backgroundColor: STATUS_ACTIVE_COLOR, opacity: 0.35 },
    // Decorative only (see the render site's comment) — a bordered
    // circle in the same fixed status blue as the bar around it.
    statusBarInfoBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: STATUS_ACTIVE_COLOR,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusBarInfoBadgeText: { color: STATUS_ACTIVE_COLOR, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: 12 },
    // The Playing: button — opens the currently-playing popup instead of
    // always spelling every name out inline on the page.
    playingBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'transparent',
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    playingBtnLabel: { fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textSecondary, fontSize: theme.font.size.md },
    playingBtnNames: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.font.size.md, fontFamily: theme.font.family.regular },
    playingBtnChevron: { color: theme.colors.textSecondary, fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    fieldsRow: { flexDirection: 'row', gap: 12 },
    fieldCol: { flex: 1, gap: 6 },
    fieldLabel: { fontSize: theme.font.size.sm * 1.25, color: theme.colors.textSecondary, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium },
    // Money (₹) vs. chips are two different units — a green/purple
    // tint on each pill (label + fill) makes that legible at a glance,
    // same "tint over the neutral fill" trick as the multiplier buttons.
    fieldLabelMoney: { color: theme.colors.success },
    fieldLabelMoneyIcon: { fontSize: 13 },
    fieldLabelChips: { color: CHIPS_COLOR },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    // Chip/token pill — fully rounded, filled, centered text, no
    // border — reads like a poker chip rather than a form field.
    fieldInputPill: {
      // Matches Button's own default radius (theme.radius.md) — same
      // corner as "Usual buy-in" and the status bar above.
      borderRadius: theme.radius.md,
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
    multiplierBtn: { flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm, paddingVertical: 9, alignItems: 'center' },
    // 0.5x reads as a reduction, 2x as a boost — a red/green tint (over
    // the same neutral fill) makes that legible at a glance.
    multiplierBtnDown: { backgroundColor: `${theme.colors.danger}22` },
    multiplierBtnUp: { backgroundColor: `${theme.colors.success}22` },
    multiplierBtnDownPressed: { backgroundColor: `${theme.colors.danger}3d` },
    multiplierBtnUpPressed: { backgroundColor: `${theme.colors.success}3d` },
    multiplierText: { fontSize: theme.font.size.sm * 1.3, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, color: theme.colors.textSecondary },
    // The "x" reads small next to the (now bigger) number — 0.5/2 are
    // the part worth reading at a glance, "x" is just grammar.
    multiplierTextX: { fontSize: theme.font.size.xs },
    multiplierTextDown: { color: theme.colors.danger },
    multiplierTextUp: { color: theme.colors.success },
    setupRow: { flexDirection: 'row', gap: 10 },
    setupBtn: { flex: 1, position: 'relative' },
    // See SETUP_BTN_HEIGHT's own comment — passed to both the plain
    // Button ("Usual buy-in") and the DoubleTapButton ("Set game"/"Set
    // players") so they render the same height as each other.
    setupBtnHeight: { height: SETUP_BTN_HEIGHT },
    // Narrower than "Set game" beside it (flex 0.7 vs that button
    // wrapper's default flex 1 from setupBtn) — "Usual buy-in" is the
    // secondary of the two, so it gets less of the row.
    usualBtnNarrow: { flex: 0.7 },
    // 25% bigger than the base size, then 12% back down, then another
    // 12% (still overflowing at the first reduction) — then one more
    // 15% once the button itself got narrower (usualBtnNarrow), or the
    // label would overflow the now-smaller box.
    usualBtnLabel: { fontSize: theme.font.size.md * 1.25 * 0.88 * 0.88 * 0.85 },
    // "I"/"II" — Set game and Set players are a fixed two-step sequence,
    // even though "Set players" itself now renders at the bottom of the
    // screen rather than right below "Set game" — the badges are the
    // only thing left spelling out the order between them.
    // A small badge sitting fully inside the button's own bottom-right
    // corner (not overlapping past its edge) spells that out, faded
    // translucent grey so it reads as a subtle sequence marker, not
    // another loud label. A hard-edged rectangle (barely-rounded
    // corners), not a pill, and italic — reads more like a stamped
    // numeral than another button.
    ordinalBadge: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: 'rgba(128,128,128,0.35)',
      // theme.colors.textSecondary, not a hardcoded white — the grey
      // badge sits over whichever theme's own background shows through
      // its translucency, so the text needs to stay legible on both.
      color: theme.colors.textSecondary,
      fontSize: 10,
      fontStyle: 'italic',
      fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      overflow: 'hidden',
      zIndex: 2,
    },
    usualEditRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    usualEditFieldGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    usualEditIcon: { fontSize: 13 },
    usualEditInput: { flex: 1, fontSize: theme.font.size.sm, fontFamily: theme.font.family.regular, paddingVertical: 8, paddingHorizontal: 8 },
    usualEditSeparator: { color: theme.colors.textSecondary, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    // A small square, floating centered (both axes) in the row — no
    // label text (the button is the one actionable control here,
    // self-explanatory without a word), half the size it started at.
    usualUpdateBtn: {
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      backgroundColor: 'transparent',
      borderRadius: theme.radius.sm / 2,
      borderWidth: 1.5,
      borderColor: theme.colors.accent,
    },
    // "Set players"/"Add players" itself lives at the bottom of the
    // screen now (see the render site's own comment) — this style just
    // sizes/positions the row wherever it's rendered.
    startRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    // ▶ (selected-players preview) and 🗑 (clear) — sit below the status bar.
    selectedActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    // Icon-only (TrashIcon, no "Clear" label) — a circle matching the ▶
    // button beside it, tinted danger since it's a destructive action.
    clearSelectedBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: theme.colors.danger,
    },
    // Three size tiers for the action grid — All+/Group+ (A) are the
    // prominent pre-game setup actions, Cash-ins/Cash-outs (B) are the
    // frequent in-game ones, Game Sessions/End (C) are occasional
    // wrap-up actions. A > B > C in both footprint and type size.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridBtnA: { width: '48%' },
    gridBtnB: { width: '48%' },
    gridBtnC: { width: '48%' },
    // Transparent, border only — accent-colored when enabled, a dim
    // neutral border when not (see gridDisabled, applied after this).
    gridPressableA: {
      backgroundColor: 'transparent',
      borderRadius: theme.radius.lg,
      borderWidth: 1.5,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
      minHeight: 88,
    },
    gridPressableB: {
      backgroundColor: 'transparent',
      borderRadius: theme.radius.md,
      borderWidth: 1.5,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      minHeight: 56,
    },
    gridPressableC: {
      backgroundColor: 'transparent',
      borderRadius: theme.radius.sm,
      borderWidth: 1.5,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      minHeight: 38,
    },
    // Sizing-only (no fill color) version of the C tier, for End —
    // DoubleTapButton picks its own fill (danger red), so this only
    // needs to shrink its footprint to match Game Sessions'. No
    // paddingVertical here — DoubleTapButton's own inner ring already
    // carries fixed padding; stacking another one on the outer box on
    // top of it is what made End's double border look overly spaced.
    endSizeC: { minHeight: 38 },
    // Wraps End's DoubleTapButton so its two corner badges (not-cashed-out
    // count, sum-check deviation) can be absolutely positioned against a
    // fixed-size box — DoubleTapButton itself carries gridBtnC's old
    // `width: '48%'` only indirectly now, via stretching to fill this.
    endWrap: { position: 'relative' },
    notCashedOutBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 5,
      borderRadius: 11,
      backgroundColor: theme.colors.danger,
      borderWidth: 1.5,
      borderColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3,
    },
    notCashedOutBadgeText: { color: '#fff', fontSize: 11, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    // A pill, not a circle like notCashedOutBadge — "💰 +140" needs more
    // room than a bare count does, and a fixed 22×22 box would either
    // clip it or force a tiny illegible font.
    deviationBadge: {
      position: 'absolute',
      bottom: -6,
      right: -6,
      minHeight: 22,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3,
    },
    deviationBadgeText: { color: theme.colors.textPrimary, fontSize: 11, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold },
    gridDisabled: { borderColor: theme.colors.border },
    gridBtnContentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    gridTextA: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.xl },
    gridTextB: { color: theme.colors.accent, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, fontSize: theme.font.size.md * 1.25 },
    gridTextC: { color: theme.colors.accent, fontFamily: theme.font.family.medium, fontWeight: theme.font.weight.medium, fontSize: theme.font.size.xs },
    gridTextDisabled: { color: theme.colors.textSecondary },
    modalTitle: { fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    modalLine: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.regular, color: theme.colors.textPrimary },
    selectedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  });
