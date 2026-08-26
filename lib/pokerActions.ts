/**
 * Poker-ledger-specific actions — deliberately NOT part of the shared
 * engine (lib/googleSheetsApi.ts etc., copied from sheet-ui), since
 * they're structural (insert/merge), not the plain value writes that
 * engine's Config-tab system knows how to express.
 */
import { batchUpdateSpreadsheet, batchUpdateValues, getSpreadsheetMeta, getValues } from './googleSheetsApi';
import { TABS } from './pokerLedgerSeed';

const SESSION_LOG_FIRST_PLAYER_COL = 3; // 0-indexed: column D (A=0, B=1, C=2)
const SESSION_LOG_COLS_PER_PLAYER = 2;
const DEFAULT_GRID_COLUMNS = 26; // Sheets' default new-sheet column count (A–Z)

/** 0-indexed column number -> its A1 letter(s) (0 -> "A", 25 -> "Z", 26 -> "AA", ...). */
function colToLetter(index0: number): string {
  let n = index0 + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** First empty row (1-indexed) in `column`, scanning down from `fromRow`. */
async function findNextEmptyRow(
  spreadsheetId: string,
  sheetName: string,
  column: string,
  fromRow: number,
  accessToken: string
): Promise<number> {
  const values = await getValues(spreadsheetId, `${sheetName}!${column}${fromRow}:${column}5000`, accessToken);
  return fromRow + values.length;
}

/**
 * Registers a new player on this table:
 *  1. Appends their name + email to players-info's next empty row.
 *  2. Appends a formula-linked row to net-results (`=players-info!A{row}`),
 *     kept in lockstep with players-info by construction (both grown
 *     one row at a time, together, only here).
 *  3. Appends a new 2-column block to session-log: merges the header
 *     cell across both columns, formula-links it to the player's name,
 *     and writes the "Buy-ins(#)"/"Final chips" sub-headers below it.
 *     Structural (merge + possibly grow the grid), so it goes through
 *     batchUpdateSpreadsheet, not a plain value write.
 */
export async function addPlayer(spreadsheetId: string, accessToken: string, name: string, email: string): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const sessionLogSheet = meta.sheets.find((s) => s.properties.title === TABS.sessionLog);
  if (!sessionLogSheet) throw new Error(`Sheet is missing the "${TABS.sessionLog}" tab`);
  const sessionLogSheetId = sessionLogSheet.properties.sheetId;

  const playerRow = await findNextEmptyRow(spreadsheetId, TABS.playersInfo, 'A', 2, accessToken);

  // How many player blocks already exist in session-log's header row —
  // determines which 2 columns this player gets.
  const headerRow = await getValues(
    spreadsheetId,
    `${TABS.sessionLog}!${colToLetter(SESSION_LOG_FIRST_PLAYER_COL)}1:ZZ1`,
    accessToken
  );
  const existingPlayerCount = headerRow[0]?.filter((v) => (v ?? '').trim() !== '').length ?? 0;
  const startCol = SESSION_LOG_FIRST_PLAYER_COL + existingPlayerCount * SESSION_LOG_COLS_PER_PLAYER;
  const endCol = startCol + SESSION_LOG_COLS_PER_PLAYER; // exclusive

  const currentColumnCount = sessionLogSheet.properties.gridProperties?.columnCount ?? DEFAULT_GRID_COLUMNS;
  if (endCol > currentColumnCount) {
    await batchUpdateSpreadsheet(
      spreadsheetId,
      [{ appendDimension: { sheetId: sessionLogSheetId, dimension: 'COLUMNS', length: endCol - currentColumnCount + 10 } }],
      accessToken
    );
  }

  await batchUpdateSpreadsheet(
    spreadsheetId,
    [
      {
        mergeCells: {
          range: { sheetId: sessionLogSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol },
          mergeType: 'MERGE_ALL',
        },
      },
    ],
    accessToken
  );

  const startLetter = colToLetter(startCol);
  const endLetter = colToLetter(startCol + 1);

  // Everything else is a plain value write — formulas included, since
  // the Sheets API interprets a leading "=" as a formula under
  // valueInputOption=USER_ENTERED (what updateCell/batchUpdateValues use).
  await batchUpdateValues(
    spreadsheetId,
    [
      { range: `${TABS.playersInfo}!A${playerRow}:B${playerRow}`, values: [[name, email]] },
      { range: `${TABS.netResults}!A${playerRow}:B${playerRow}`, values: [[`=${TABS.playersInfo}!A${playerRow}`, '']] },
      { range: `${TABS.sessionLog}!${startLetter}1`, values: [[`=${TABS.playersInfo}!A${playerRow}`]] },
      { range: `${TABS.sessionLog}!${startLetter}2:${endLetter}2`, values: [['Buy-ins(#)', 'Final chips']] },
    ],
    accessToken
  );
}

export type Player = { row: number; name: string; email: string };

/** Reads the current player roster from players-info. */
export async function listPlayers(spreadsheetId: string, accessToken: string): Promise<Player[]> {
  const values = await getValues(spreadsheetId, `${TABS.playersInfo}!A2:B200`, accessToken);
  return values
    .map((row, i) => ({ row: i + 2, name: row[0] ?? '', email: row[1] ?? '' }))
    .filter((p) => p.name.trim() !== '');
}
