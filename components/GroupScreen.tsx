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
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { displayName } from '../lib/displayName';
import { PokerLedgerService, type GroupInfo, type Player } from '../lib/pokerActions';

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
        <Pressable style={styles.refreshBtn} onPress={onChanged}>
          <Text style={styles.refreshBtnText}>⟳</Text>
        </Pressable>
      </View>

      {groups.length === 0 ? (
        <Text style={styles.empty}>No groups yet.</Text>
      ) : (
        groups.map((group) => {
          const selected = selectedGroupName === group.name;
          return (
            <Pressable
              key={group.name}
              style={styles.groupRow}
              onPress={() => handleGroupPress(group)}
              onLongPress={() => setInfoGroup(group)}
              delayLongPress={500}>
              <View style={styles.groupInfo}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupMembers}>{group.members.map(memberLabel).join(', ') || 'No members'}</Text>
              </View>
              <View style={[styles.addBtn, selected && styles.addBtnActive]}>
                <Text style={styles.addBtnText}>+</Text>
              </View>
            </Pressable>
          );
        })
      )}

      <Pressable style={styles.newGroupBtn} onPress={() => setShowNewGroup(true)}>
        <Text style={styles.newGroupBtnText}>+ New Group</Text>
      </Pressable>

      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Return to table screen</Text>
      </Pressable>

      {/* New group popup */}
      <Modal visible={showNewGroup} transparent animationType="fade" onRequestClose={() => setShowNewGroup(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Group</Text>
            <TextInput
              style={styles.input}
              value={newGroupTitle}
              onChangeText={setNewGroupTitle}
              placeholder="Group title"
              autoFocus
            />
            <ScrollView style={styles.checkboxList}>
              {players.map((p) => {
                const checked = checkedPlayers.has(p.name);
                return (
                  <Pressable key={p.row} style={styles.checkboxRow} onPress={() => toggleChecked(p.name)}>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>{displayName(p, useAlias)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.primaryBtn} disabled={creating || !newGroupTitle.trim()} onPress={handleCreateGroup}>
                <Text style={styles.primaryBtnText}>{creating ? 'Creating…' : 'Create'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} disabled={creating} onPress={() => setShowNewGroup(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Long-press info popup (read-only) */}
      <Modal visible={infoGroup !== null} transparent animationType="fade" onRequestClose={() => setInfoGroup(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setInfoGroup(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
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
            <Pressable style={styles.primaryBtn} onPress={() => setInfoGroup(null)}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Double-tap edit popup */}
      <Modal visible={editGroup !== null} transparent animationType="fade" onRequestClose={() => setEditGroup(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Group</Text>
            <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} placeholder="Group title" />
            <ScrollView style={styles.checkboxList}>
              {players.map((p) => {
                const checked = editChecked.has(p.name);
                return (
                  <Pressable key={p.row} style={styles.checkboxRow} onPress={() => toggleEditChecked(p.name)}>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>{displayName(p, useAlias)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.primaryBtn} disabled={saving || !editTitle.trim()} onPress={handleSaveEdit}>
                <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} disabled={saving} onPress={() => setEditGroup(null)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  error: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', opacity: 0.6 },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  refreshBtnText: { color: '#2f95dc', fontWeight: '700', fontSize: 18 },
  empty: { opacity: 0.6, textAlign: 'center', marginVertical: 12 },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
  },
  groupInfo: { flex: 1, gap: 2 },
  groupName: { fontSize: 16, fontWeight: '700' },
  groupMembers: { fontSize: 13, opacity: 0.6 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnActive: { backgroundColor: '#2a7a2a' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  newGroupBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  newGroupBtnText: { fontWeight: '600', fontSize: 14 },
  backBtn: { paddingVertical: 14, borderRadius: 10, backgroundColor: '#2f95dc', alignItems: 'center' },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxHeight: '80%', gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalLine: { fontSize: 14 },
  input: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  checkboxList: { maxHeight: 220 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
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
  checkboxLabel: { fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10 },
  primaryBtn: { flex: 1, backgroundColor: '#2f95dc', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  secondaryBtnText: { fontWeight: '600' },
});
