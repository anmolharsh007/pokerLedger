/**
 * Group+'s screen. Three gestures on a group row:
 *  - single tap: selects it (radio-style — REPLACES `selectedPlayers`,
 *    the same local state All+ uses, lifted up in TableHome.tsx; not
 *    merged with a previous group or with All+'s selection). The
 *    actual commit happens back on the Table screen when `start` is
 *    double-tapped.
 *  - long press: view-only info popup (name + members).
 *  - double tap: edit popup (title + checkbox list to add/remove
 *    members) — the one other real write here besides "+ New Group",
 *    via lib/pokerActions.ts#updateGroup.
 */
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from './ui/Button';
import CardButton from './ui/CardButton';
import Checkbox from './ui/Checkbox';
import IconButton from './ui/IconButton';
import ModalCard from './ui/ModalCard';
import TextField from './ui/TextField';
import { displayName } from '../lib/displayName';
import { PokerLedgerService, type GroupInfo, type Player } from '../lib/pokerActions';
// Per-card colors turned off for now — see the commented `tint` prop
// below; may want them back later.
// import { cardTintFor } from '../theme/cardTints';
import { useStyleVariant, useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

type Props = {
  groups: GroupInfo[];
  players: Player[];
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  selectedPlayers: string[] | null;
  setSelectedPlayers: Dispatch<SetStateAction<string[] | null>>;
  useAlias: boolean;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
};

const DOUBLE_TAP_MS = 400;

export default function GroupScreen({
  groups,
  players,
  spreadsheetId,
  getAccessToken,
  setSelectedPlayers,
  useAlias,
  onBack,
  onChanged,
}: Props) {
  const theme = useTheme();
  const styleVariant = useStyleVariant();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);

  // group members are plain resolved name strings (listGroups reads back
  // already-evaluated formula text) — look each up against the roster
  // purely for display, never for the join itself.
  const memberLabel = (name: string) => {
    const p = players.find((pl) => pl.name === name);
    return p ? displayName(p, useAlias) : name;
  };

  // Radio behavior — only one group can be selected at a time.
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const lastTapRef = useRef<Record<string, number>>({});

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [checkedPlayers, setCheckedPlayers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const [infoGroup, setInfoGroup] = useState<GroupInfo | null>(null);

  const [editGroup, setEditGroup] = useState<GroupInfo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editChecked, setEditChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const handleAddGroup = (group: GroupInfo) => {
    setSelectedPlayers(group.members);
    setSelectedGroupName(group.name);
  };

  const openEditGroup = (group: GroupInfo) => {
    setEditGroup(group);
    setEditTitle(group.name);
    setEditChecked(new Set(group.members));
  };

  // Single tap selects; if a second tap follows within DOUBLE_TAP_MS,
  // also opens the edit popup (selecting first is a harmless side effect).
  const handleGroupPress = (group: GroupInfo) => {
    const now = Date.now();
    const last = lastTapRef.current[group.name] ?? 0;
    lastTapRef.current[group.name] = now;
    handleAddGroup(group);
    if (now - last < DOUBLE_TAP_MS) {
      openEditGroup(group);
    }
  };

  const toggleChecked = (name: string) => {
    setCheckedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleEditChecked = (name: string) => {
    setEditChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await service.addGroup(newGroupTitle.trim(), Array.from(checkedPlayers), accessToken);
      setShowNewGroup(false);
      setNewGroupTitle('');
      setCheckedPlayers(new Set());
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editGroup || !editTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await service.updateGroup(editGroup.name, editTitle.trim(), Array.from(editChecked), accessToken);
      setEditGroup(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Groups</Text>
        <IconButton icon="⟳" onPress={onChanged} />
      </View>

      {groups.length === 0 ? (
        <Text style={styles.empty}>No groups yet.</Text>
      ) : (
        <View style={[styles.groupGrid, styleVariant === 'C' && styles.gridRowGapForBadges]}>
          {groups.map((group, i) => {
            const selected = selectedGroupName === group.name;
            return (
              <CardButton
                key={group.name}
                selected={selected}
                onPress={() => handleGroupPress(group)}
                onLongPress={() => setInfoGroup(group)}
                delayLongPress={500}
                // Per-card colors turned off for now — may want them
                // back later, see theme/cardTints.ts.
                // tint={cardTintFor(i)}
                badge="GROUP"
                style={styles.groupCard}>
                <Text style={styles.groupCardName} numberOfLines={1}>
                  {selected ? '✓ ' : ''}
                  {group.name}
                </Text>
                <Text style={styles.groupCardCount}>
                  {group.members.length} member{group.members.length === 1 ? '' : 's'}
                </Text>
                <Text style={styles.groupCardMembers} numberOfLines={2}>
                  {group.members.map(memberLabel).join(', ') || 'No members'}
                </Text>
              </CardButton>
            );
          })}
        </View>
      )}

      <Button label="+ New Group" variant="secondary" onPress={() => setShowNewGroup(true)} />

      <Button label="Return to table screen" onPress={onBack} />

      {/* New group popup */}
      <ModalCard visible={showNewGroup} onRequestClose={() => setShowNewGroup(false)}>
        <Text style={styles.modalTitle}>New Group</Text>
        <TextField value={newGroupTitle} onChangeText={setNewGroupTitle} placeholder="Group title" autoFocus />
        <ScrollView style={styles.checkboxList}>
          {players.map((p) => (
            <Checkbox key={p.row} checked={checkedPlayers.has(p.name)} onPress={() => toggleChecked(p.name)} label={displayName(p, useAlias)} />
          ))}
        </ScrollView>
        <View style={styles.modalActions}>
          <Button
            label={creating ? 'Creating…' : 'Create'}
            disabled={creating || !newGroupTitle.trim()}
            onPress={handleCreateGroup}
            style={styles.flexBtn}
          />
          <Button label="Cancel" variant="secondary" disabled={creating} onPress={() => setShowNewGroup(false)} style={styles.flexBtn} />
        </View>
      </ModalCard>

      {/* Long-press info popup (read-only) */}
      <ModalCard visible={infoGroup !== null} onRequestClose={() => setInfoGroup(null)}>
        <Text style={styles.modalTitle}>{infoGroup?.name}</Text>
        {(infoGroup?.members.length ?? 0) === 0 ? (
          <Text style={styles.modalLine}>No members.</Text>
        ) : (
          infoGroup?.members.map((m) => (
            <Text key={m} style={styles.modalLine}>
              {memberLabel(m)}
            </Text>
          ))
        )}
        <Button label="Close" onPress={() => setInfoGroup(null)} />
      </ModalCard>

      {/* Double-tap edit popup */}
      <ModalCard visible={editGroup !== null} onRequestClose={() => setEditGroup(null)}>
        <Text style={styles.modalTitle}>Edit Group</Text>
        <TextField value={editTitle} onChangeText={setEditTitle} placeholder="Group title" />
        <ScrollView style={styles.checkboxList}>
          {players.map((p) => (
            <Checkbox key={p.row} checked={editChecked.has(p.name)} onPress={() => toggleEditChecked(p.name)} label={displayName(p, useAlias)} />
          ))}
        </ScrollView>
        <View style={styles.modalActions}>
          <Button label={saving ? 'Saving…' : 'Save'} disabled={saving || !editTitle.trim()} onPress={handleSaveEdit} style={styles.flexBtn} />
          <Button label="Cancel" variant="secondary" disabled={saving} onPress={() => setEditGroup(null)} style={styles.flexBtn} />
        </View>
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
    groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    // Variant C's badge chip straddles a card's bottom edge — extra
    // row spacing so it doesn't run into the next row's cards.
    gridRowGapForBadges: { rowGap: 24 },
    groupCard: { width: '47%' },
    // Name at top, member count in the middle, a few names below —
    // one centered block rather than an icon-led layout.
    groupCardName: { fontSize: theme.font.size.md, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary, textAlign: 'center' },
    groupCardCount: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.accent, textAlign: 'center' },
    groupCardMembers: { fontSize: theme.font.size.xs, fontFamily: theme.font.family.regular, color: theme.colors.textSecondary, textAlign: 'center' },
    modalTitle: { fontSize: theme.font.size.lg, fontFamily: theme.font.family.bold, fontWeight: theme.font.weight.bold, color: theme.colors.textPrimary },
    modalLine: { fontSize: theme.font.size.sm, fontFamily: theme.font.family.regular, color: theme.colors.textPrimary },
    checkboxList: { maxHeight: 220 },
    modalActions: { flexDirection: 'row', gap: 10 },
    flexBtn: { flex: 1 },
  });
