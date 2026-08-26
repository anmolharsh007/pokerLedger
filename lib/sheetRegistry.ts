/**
 * The user's own list of linked Google Sheets — kept in local device
 * storage (AsyncStorage), keyed by their Google account id so signing
 * in with a different account on the same device doesn't see someone
 * else's list. Just references (name + spreadsheetId); the actual
 * sheets live in the user's regular Drive (lib/appSheet.ts creates
 * them there), fully normal/shareable files.
 *
 * Note: this list itself does NOT sync across devices — sign in on a
 * second device and it starts empty there (a fresh sheet gets created
 * on that device the first time, per lib/appSheet.ts). Fine for now;
 * revisit if cross-device use becomes a real need.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LinkedSheet = {
  id: string;
  name: string;
  spreadsheetId: string;
};

function storageKey(userId: string): string {
  return `sheet-ui.registry.v1.${userId}`;
}

export async function listLinkedSheets(userId: string): Promise<LinkedSheet[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LinkedSheet[];
  } catch {
    return [];
  }
}

export async function addLinkedSheet(
  userId: string,
  sheet: { name: string; spreadsheetId: string }
): Promise<LinkedSheet[]> {
  const sheets = await listLinkedSheets(userId);
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const updated = [...sheets, { id, ...sheet }];
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(updated));
  return updated;
}

export async function removeLinkedSheet(userId: string, sheetId: string): Promise<LinkedSheet[]> {
  const sheets = await listLinkedSheets(userId);
  const updated = sheets.filter((s) => s.id !== sheetId);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(updated));
  return updated;
}
