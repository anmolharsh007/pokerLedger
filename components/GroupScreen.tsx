/**
 * Group+'s screen. Each group's "+" doesn't write anything itself —
 * radio-style, only one group can be selected at a time: tapping one
 * REPLACES `selectedPlayers` (the same local state All+ uses, lifted
 * up in TableHome.tsx) with that group's members, not merged with a
 * previous group or with All+'s selection. The actual commit happens
 * back on the Table screen when `start` is double-tapped. "+ New
 * Group" is the one real write here (via lib/pokerActions.ts#addGroup).
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PokerLedgerService, type GroupInfo, type Player } from '../lib/pokerActions';

type Props = {
  groups: GroupInfo[];
  players: Player[];
  spreadsheetId: string;
  getAccessToken: () => Promise<string>;
  selectedPlayers: string[] | null;
  setSelectedPlayers: Dispatch<SetStateAction<string[] | null>>;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
};

export default function GroupScreen({
  groups,
  players,
  spreadsheetId,
  getAccessToken,
  setSelectedPlayers,
  onBack,
  onChanged,
}: Props) {
  const service = useMemo(() => new PokerLedgerService(spreadsheetId), [spreadsheetId]);
  const [error, setError] = useState<string | null>(null);

  // Radio behavior — only one group can be selected at a time.
  // Selecting a group REPLACES the current selection (doesn't merge
  // with a previous group, or with whatever All+ set).
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [checkedPlayers, setCheckedPlayers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const handleAddGroup = (group: GroupInfo) => {
    setSelectedPlayers(group.members);
    setSelectedGroupName(group.name);
  };

  const toggleChecked = (name: string) => {
    setCheckedPlayers((prev) => {
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
            <View key={group.name} style={styles.groupRow}>
              <View style={styles.groupInfo}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupMembers}>{group.members.join(', ') || 'No members'}</Text>
              </View>
              <Pressable style={[styles.addBtn, selected && styles.addBtnActive]} onPress={() => handleAddGroup(group)}>
                <Text style={styles.addBtnText}>+</Text>
              </Pressable>
            </View>
          );
        })
      )}

      <Pressable style={styles.newGroupBtn} onPress={() => setShowNewGroup(true)}>
        <Text style={styles.newGroupBtnText}>+ New Group</Text>
      </Pressable>

      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Return to table screen</Text>
      </Pressable>

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
                    <Text style={styles.checkboxLabel}>{p.name}</Text>
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
