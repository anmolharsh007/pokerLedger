/**
 * The signed-in user's global player accounts — one real person, usable
 * across every table they're added to, instead of retyping name+email per
 * table (that's still what lib/pokerActions.ts#addPlayer writes into a
 * table's players-info; this module is where the source values come from).
 *
 * Stored as a single spreadsheet (`PlayerAccounts.xlsx`, one `Accounts` tab)
 * under the same `tracker-apps/poker-ledger/` Drive folder every table lives
 * in — a spreadsheet, not a Drive JSON blob, so this can reuse the existing
 * Sheets API wrapper (lib/googleSheetsApi.ts) directly, same as
 * lib/pokerActions.ts does, instead of needing new Drive blob-file support.
 *
 * "Syncs across the user's devices" without any sync engine: the file is
 * found by name (lib/googleDriveApi.ts#findFile), not by a local reference,
 * so a second device resolves the *same* Drive file instead of creating a
 * new one. The resolved spreadsheetId is cached locally (AsyncStorage) only
 * as a fast path — a cache miss just re-resolves via Drive.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { findFile, moveFileToFolder, resolveAppFolder } from './googleDriveApi';
import { batchUpdateValues, createSpreadsheet, getValues } from './googleSheetsApi';
import { APP_NAME } from './pokerLedgerSeed';

const ACCOUNTS_FILE_NAME = 'PlayerAccounts.xlsx';
const ACCOUNTS_TAB = 'Accounts';
const HEADER = ['Account ID', 'Name', 'Email', 'Alias', 'All Sheets'];

function cacheKey(userId: string): string {
  return `player-accounts.spreadsheetId.v1.${userId}`;
}

export type PlayerAccount = {
  row: number;
  id: string;
  name: string;
  email: string;
  alias: string;
  /** Every table (spreadsheetId) this account has been added to, via lib/pokerActions.ts#addPlayer. */
  allSheets: string[];
};

/**
 * Finds (or creates, on first-ever use) the user's one PlayerAccounts.xlsx.
 * Caches the id locally as a fast path; always re-resolvable via Drive
 * search on a cache miss, so a second device finds the same file rather
 * than creating a duplicate.
 */
export async function ensureAccountsSpreadsheet(userId: string, accessToken: string): Promise<string> {
  const cached = await AsyncStorage.getItem(cacheKey(userId));
  if (cached) return cached;

  const folderId = await resolveAppFolder(APP_NAME, accessToken);
  let spreadsheetId = await findFile(ACCOUNTS_FILE_NAME, folderId, accessToken);
  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(ACCOUNTS_FILE_NAME, [ACCOUNTS_TAB], accessToken);
    await moveFileToFolder(spreadsheetId, folderId, accessToken);
    await batchUpdateValues(spreadsheetId, [{ range: `${ACCOUNTS_TAB}!A1:E1`, values: [HEADER] }], accessToken);
  }

  await AsyncStorage.setItem(cacheKey(userId), spreadsheetId);
  return spreadsheetId;
}

/** Reads every account, in row order. */
export async function listAccounts(userId: string, accessToken: string): Promise<PlayerAccount[]> {
  const spreadsheetId = await ensureAccountsSpreadsheet(userId, accessToken);
  const rows = await getValues(spreadsheetId, `${ACCOUNTS_TAB}!A2:E1000`, accessToken);
  return rows
    .map((row, i) => ({
      row: i + 2,
      id: row[0] ?? '',
      name: row[1] ?? '',
      email: row[2] ?? '',
      alias: row[3] ?? '',
      allSheets: (row[4] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }))
    .filter((a) => a.id.trim() !== '');
}

/** Creates a brand-new account (a new row) — email required, it's the future claim-matching key. */
export async function createAccount(
  userId: string,
  fields: { name: string; email: string; alias: string },
  accessToken: string
): Promise<PlayerAccount> {
  const spreadsheetId = await ensureAccountsSpreadsheet(userId, accessToken);
  const existing = await listAccounts(userId, accessToken);
  const row = existing.length + 2; // first empty row, same convention as pokerActions.ts#findNextEmptyRow
  const id = `acct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; // same id style as sheetRegistry.ts

  await batchUpdateValues(
    spreadsheetId,
    [{ range: `${ACCOUNTS_TAB}!A${row}:E${row}`, values: [[id, fields.name, fields.email, fields.alias, '']] }],
    accessToken
  );

  return { row, id, name: fields.name, email: fields.email, alias: fields.alias, allSheets: [] };
}

/** Records that `accountId` has been added to `spreadsheetIdToAdd` — idempotent, a no-op if already recorded. */
export async function addSheetToAccount(
  userId: string,
  accountId: string,
  spreadsheetIdToAdd: string,
  accessToken: string
): Promise<void> {
  const accountsSpreadsheetId = await ensureAccountsSpreadsheet(userId, accessToken);
  const accounts = await listAccounts(userId, accessToken);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Account "${accountId}" not found`);
  if (account.allSheets.includes(spreadsheetIdToAdd)) return;

  const updated = [...account.allSheets, spreadsheetIdToAdd].join(', ');
  await batchUpdateValues(accountsSpreadsheetId, [{ range: `${ACCOUNTS_TAB}!E${account.row}`, values: [[updated]] }], accessToken);
}
