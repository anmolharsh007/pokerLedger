/**
 * Poker-ledger-specific actions — deliberately NOT part of the shared
 * engine (lib/googleSheetsApi.ts etc., copied from sheet-ui), since
 * they're structural (insert/merge), not the plain value writes that
 * engine's Config-tab system knows how to express.
 *
 * Every actual cell write funnels through the private writeValue(s)
 * methods below — nothing else in this class, or outside it, calls
 * batchUpdateValues directly. A single-cell write is expressed as a
 * ValueV<T> (a value + the SheetData cell it belongs to, from
 * lib/pokerTypes.ts) — never a bare range string. Structural changes
 * (merge, grow the grid) funnel through runStructural the same way.
 *
 * Player/SessionEntry/SessionInput here are the flat, "current,
 * working" shapes the existing screens use — distinct from (and not
 * yet unified with) pokerTypes.ts's richer Player struct, which is
 * for the not-yet-built live-game flow (Table.currentGame etc).
 */
import { batchUpdateSpreadsheet, batchUpdateValues, getSpreadsheetMeta, getValues } from './googleSheetsApi';
import { SheetData, type ValueV } from './pokerTypes';
import { TABS } from './pokerLedgerSeed';

const SESSION_LOG_FIRST_PLAYER_COL = 3; // 0-indexed: column D (A=0, B=1, C=2)
const SESSION_LOG_COLS_PER_PLAYER = 2;
const DEFAULT_GRID_COLUMNS = 26; // Sheets' default new-sheet column count (A–Z)
const DEFAULT_GRID_ROWS = 1000; // Sheets' default new-sheet row count
// session-log's player columns have a 2-row header (row 1 = merged
// name, row 2 = "Buy-ins(#)"/"Final chips" sub-headers), so session
// data starts at row 3. sum-check has no structural need for a 2-row
// header, but also starts data at row 3 (row 2 left blank) so its
// rows stay aligned 1:1 with session-log's by row number.
const SESSION_DATA_FIRST_ROW = 3;

export type Player = { row: number; name: string; email: string; alias: string };
export type SessionEntry = { name: string; buyIns: number; finalChips: number };
export type SessionInput = { date: string; ratio: number; buyInAmount: number; players: SessionEntry[] };

export class PokerLedgerService {
  constructor(private readonly spreadsheetId: string) {}

  // ---- private: the only place raw Sheets API calls happen ----

  private async writeValue<T>(value: ValueV<T>, accessToken: string): Promise<void> {
    await batchUpdateValues(this.spreadsheetId, [{ range: value.sheetData.cellAddress(), values: [[value.value]] }], accessToken);
  }

  private async writeValues(values: Array<ValueV<unknown>>, accessToken: string): Promise<void> {
    if (values.length === 0) return;
    await batchUpdateValues(
      this.spreadsheetId,
      values.map((v) => ({ range: v.sheetData.cellAddress(), values: [[v.value]] })),
      accessToken
    );
  }

  private async runStructural(requests: unknown[], accessToken: string): Promise<void> {
    await batchUpdateSpreadsheet(this.spreadsheetId, requests, accessToken);
  }

  private async readMeta(accessToken: string) {
    return getSpreadsheetMeta(this.spreadsheetId, accessToken);
  }

  private async readRange(sheet: string, range: string, accessToken: string): Promise<string[][]> {
    return getValues(this.spreadsheetId, `${PokerLedgerService.quoteSheet(sheet)}!${range}`, accessToken);
  }

  // ---- protected: internal helpers, not raw-write themselves ----

  /** Quotes a sheet name for a range reference — our tab names contain hyphens, not valid unquoted in A1 notation. */
  protected static quoteSheet(sheet: string): string {
    return `'${sheet}'`;
  }

  /** 0-indexed column number -> its A1 letter(s) (0 -> "A", 25 -> "Z", 26 -> "AA", ...). */
  protected static colToLetter(index0: number): string {
    let n = index0 + 1;
    let letters = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }

  /** The session-log column pair (Buy-ins(#), Final chips) for the player at roster index `i` (0-indexed, in players-info row order — the same order addPlayer assigns columns in). */
  protected static playerColumns(i: number): { buyInsLetter: string; finalChipsLetter: string } {
    const startCol = SESSION_LOG_FIRST_PLAYER_COL + i * SESSION_LOG_COLS_PER_PLAYER;
    return { buyInsLetter: PokerLedgerService.colToLetter(startCol), finalChipsLetter: PokerLedgerService.colToLetter(startCol + 1) };
  }

  /** First empty row (1-indexed) in `column` of `sheet`, scanning down from `fromRow`. */
  protected async findNextEmptyRow(sheet: string, column: string, fromRow: number, accessToken: string): Promise<number> {
    const values = await this.readRange(sheet, `${column}${fromRow}:${column}5000`, accessToken);
    return fromRow + values.length;
  }

  /** Grows `sheetId`'s grid (COLUMNS or ROWS) if `needed` exceeds what it currently has. */
  protected async ensureGridSize(
    sheetId: number,
    dimension: 'COLUMNS' | 'ROWS',
    currentSize: number,
    needed: number,
    accessToken: string
  ): Promise<void> {
    if (needed > currentSize) {
      await this.runStructural([{ appendDimension: { sheetId, dimension, length: needed - currentSize + 10 } }], accessToken);
    }
  }

  // ---- public: the domain actions ----

  /**
   * Registers a new player on this table:
   *  1. Appends their name + email + alias to players-info's next empty
   *     row. name/email are the real identity (what every other tab's
   *     formulas link to); alias is display-only, shown instead of name
   *     wherever the table's "use alias" flag is on. Callers source all
   *     three from a global player account (lib/playerAccounts.ts), not
   *     free text.
   *  2. Appends a formula-linked row to net-results (`='players-info'!A{row}`
   *     for the name; Total is a self-updating formula over this
   *     player's own session-log columns — correct automatically as
   *     sessions get added later, no rewrite needed), kept in lockstep
   *     with players-info by construction (both grown one row at a
   *     time, together, only here).
   *  3. Appends a new 2-column block to session-log: merges the header
   *     cell across both columns, formula-links it to the player's name,
   *     and writes the "Buy-ins(#)"/"Final chips" sub-headers below it.
   *     Structural (merge + possibly grow the grid), so it goes through
   *     runStructural, not a plain value write.
   */
  async addPlayer(name: string, email: string, alias: string, accessToken: string): Promise<void> {
    const meta = await this.readMeta(accessToken);
    const sessionLogSheet = meta.sheets.find((s) => s.properties.title === TABS.sessionLog);
    if (!sessionLogSheet) throw new Error(`Sheet is missing the "${TABS.sessionLog}" tab`);
    const sessionLogSheetId = sessionLogSheet.properties.sheetId;

    const playerRow = await this.findNextEmptyRow(TABS.playersInfo, 'A', 2, accessToken);

    // How many player blocks already exist in session-log's header row —
    // determines which 2 columns this player gets (same index the
    // roster will have, so playerColumns(existingPlayerCount) matches).
    const headerRow = await this.readRange(
      TABS.sessionLog,
      `${PokerLedgerService.colToLetter(SESSION_LOG_FIRST_PLAYER_COL)}1:ZZ1`,
      accessToken
    );
    const existingPlayerCount = headerRow[0]?.filter((v) => (v ?? '').trim() !== '').length ?? 0;
    const startCol = SESSION_LOG_FIRST_PLAYER_COL + existingPlayerCount * SESSION_LOG_COLS_PER_PLAYER;
    const endCol = startCol + SESSION_LOG_COLS_PER_PLAYER; // exclusive

    await this.ensureGridSize(
      sessionLogSheetId,
      'COLUMNS',
      sessionLogSheet.properties.gridProperties?.columnCount ?? DEFAULT_GRID_COLUMNS,
      endCol,
      accessToken
    );

    await this.runStructural(
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

    const { buyInsLetter, finalChipsLetter } = PokerLedgerService.playerColumns(existingPlayerCount);
    const q = PokerLedgerService.quoteSheet;

    // Cash-out value (Final chips × ratio) minus buy-in cost (Buy-ins(#)
    // × Buy-in(₹)), summed over every session-log row so far — a wide
    // fixed row range so it stays correct as sessions get added later
    // without ever needing to be rewritten.
    const totalFormula =
      `=SUMPRODUCT(${q(TABS.sessionLog)}!${finalChipsLetter}${SESSION_DATA_FIRST_ROW}:${finalChipsLetter}5000,` +
      `${q(TABS.sessionLog)}!B${SESSION_DATA_FIRST_ROW}:B5000)` +
      `-SUMPRODUCT(${q(TABS.sessionLog)}!${buyInsLetter}${SESSION_DATA_FIRST_ROW}:${buyInsLetter}5000,` +
      `${q(TABS.sessionLog)}!C${SESSION_DATA_FIRST_ROW}:C5000)`;
    const nameLinkFormula = `=${q(TABS.playersInfo)}!A${playerRow}`;

    // Everything else is a plain value write — formulas included, since
    // the Sheets API interprets a leading "=" as a formula under
    // valueInputOption=USER_ENTERED (what writeValue(s) uses).
    await this.writeValues(
      [
        { value: name, sheetData: new SheetData(playerRow, 'A', TABS.playersInfo) },
        { value: email, sheetData: new SheetData(playerRow, 'B', TABS.playersInfo) },
        { value: alias, sheetData: new SheetData(playerRow, 'C', TABS.playersInfo) },
        { value: nameLinkFormula, sheetData: new SheetData(playerRow, 'A', TABS.netResults) },
        { value: totalFormula, sheetData: new SheetData(playerRow, 'B', TABS.netResults) },
        { value: nameLinkFormula, sheetData: new SheetData(1, buyInsLetter, TABS.sessionLog) },
        { value: 'Buy-ins(#)', sheetData: new SheetData(2, buyInsLetter, TABS.sessionLog) },
        { value: 'Final chips', sheetData: new SheetData(2, finalChipsLetter, TABS.sessionLog) },
      ],
      accessToken
    );
  }

  /** Reads the current player roster from players-info, in row order (== the order addPlayer assigned session-log columns in). */
  async listPlayers(accessToken: string): Promise<Player[]> {
    const values = await this.readRange(TABS.playersInfo, 'A2:C200', accessToken);
    return values
      .map((row, i) => ({ row: i + 2, name: row[0] ?? '', email: row[1] ?? '', alias: row[2] ?? '' }))
      .filter((p) => p.name.trim() !== '');
  }

  /**
   * Backfills a blank email for the named player — the QR "retroactive
   * claim" flow (lib/claimsApi.ts#processClaim): someone was added by
   * name only, and this fills in their email once they've claimed it,
   * without re-adding them as a new row. Only writes if a row with this
   * exact name currently has a blank email — never overwrites an
   * already-set (possibly different) email, and returns false rather
   * than guessing if no such blank-email row exists.
   */
  async setPlayerEmail(name: string, email: string, accessToken: string): Promise<boolean> {
    const roster = await this.listPlayers(accessToken);
    const target = roster.find((p) => p.name === name && p.email.trim() === '');
    if (!target) return false;
    await this.writeValue({ value: email, sheetData: new SheetData(target.row, 'B', TABS.playersInfo) }, accessToken);
    return true;
  }

  /**
   * Records one session: a new session-log row (Date/ratio/Buy-in(₹) +
   * every current player's Buy-ins(#)/Final chips, 0 for anyone who
   * sat this one out) and the matching sum-check row. sum-check's
   * formulas list exactly the columns just written this call — not a
   * wide scan — so they never reference a session-log column that
   * doesn't exist yet (relevant once more players get added later:
   * older sessions' formulas correctly stay scoped to who existed then).
   */
  async addSession(input: SessionInput, accessToken: string): Promise<void> {
    const meta = await this.readMeta(accessToken);
    const sessionLogSheet = meta.sheets.find((s) => s.properties.title === TABS.sessionLog);
    const sumCheckSheet = meta.sheets.find((s) => s.properties.title === TABS.sumCheck);
    if (!sessionLogSheet) throw new Error(`Sheet is missing the "${TABS.sessionLog}" tab`);
    if (!sumCheckSheet) throw new Error(`Sheet is missing the "${TABS.sumCheck}" tab`);

    const roster = await this.listPlayers(accessToken);
    const row = await this.findNextEmptyRow(TABS.sessionLog, 'A', SESSION_DATA_FIRST_ROW, accessToken);

    await this.ensureGridSize(
      sessionLogSheet.properties.sheetId,
      'ROWS',
      sessionLogSheet.properties.gridProperties?.rowCount ?? DEFAULT_GRID_ROWS,
      row,
      accessToken
    );
    await this.ensureGridSize(
      sumCheckSheet.properties.sheetId,
      'ROWS',
      sumCheckSheet.properties.gridProperties?.rowCount ?? DEFAULT_GRID_ROWS,
      row,
      accessToken
    );

    const values: Array<ValueV<unknown>> = [
      { value: input.date, sheetData: new SheetData(row, 'A', TABS.sessionLog) },
      { value: input.ratio, sheetData: new SheetData(row, 'B', TABS.sessionLog) },
      { value: input.buyInAmount, sheetData: new SheetData(row, 'C', TABS.sessionLog) },
    ];

    const q = PokerLedgerService.quoteSheet;
    const buyInsCells: string[] = [];
    const finalChipsCells: string[] = [];
    roster.forEach((player, i) => {
      const { buyInsLetter, finalChipsLetter } = PokerLedgerService.playerColumns(i);
      const entry = input.players.find((p) => p.name === player.name);
      values.push(
        { value: entry?.buyIns ?? 0, sheetData: new SheetData(row, buyInsLetter, TABS.sessionLog) },
        { value: entry?.finalChips ?? 0, sheetData: new SheetData(row, finalChipsLetter, TABS.sessionLog) }
      );
      buyInsCells.push(`${q(TABS.sessionLog)}!${buyInsLetter}${row}`);
      finalChipsCells.push(`${q(TABS.sessionLog)}!${finalChipsLetter}${row}`);
    });

    // Written into sum-check, but sum session-log's cells — every
    // reference here needs the sheet-name prefix (missing it would
    // silently resolve against sum-check's own columns instead, which
    // happen to be exactly the buy-ins/cash-outs cells being written
    // this same call — a wrong, circular result, not an error).
    const buyInsFormula = `=${q(TABS.sessionLog)}!C${row}*(${buyInsCells.length > 0 ? buyInsCells.join('+') : '0'})`;
    const cashOutsFormula = `=${q(TABS.sessionLog)}!B${row}*(${finalChipsCells.length > 0 ? finalChipsCells.join('+') : '0'})`;

    values.push(
      { value: input.date, sheetData: new SheetData(row, 'A', TABS.sumCheck) },
      { value: buyInsFormula, sheetData: new SheetData(row, 'B', TABS.sumCheck) },
      { value: cashOutsFormula, sheetData: new SheetData(row, 'C', TABS.sumCheck) },
      // Same-sheet reference (sum-check's own B/C, just written above) — no sheet prefix needed here, unlike the two formulas above.
      { value: `=B${row}-C${row}`, sheetData: new SheetData(row, 'D', TABS.sumCheck) }
    );

    await this.writeValues(values, accessToken);
  }

  // ---- TableInfo / live-game lifecycle (Table screen) ----

  /** Reads TableInfo's label/value rows: title (A1/B1), Usual buy-in (₹)/(chips) (A2:B3), and — once a game has ever started — status (A4/B4) and sessionRow (A5/B5). Also reads the "use alias" toggle (A6/B6) — 'false' (the default, including tables seeded before this flag existed) if never set. */
  async getTableInfo(accessToken: string): Promise<TableInfoData> {
    const rows = await this.readRange(TABS.tableInfo, 'A1:B6', accessToken);
    const value = (r: number) => rows[r]?.[1] ?? '';
    const status = value(3);
    const sessionRow = value(4);
    return {
      title: value(0),
      usualBuyIn: Number(value(1)) || 0,
      usualChips: Number(value(2)) || 0,
      status: status === 'in progress' || status === 'last played' ? status : null,
      sessionRow: sessionRow ? Number(sessionRow) : null,
      useAlias: value(5) === 'true',
    };
  }

  /** Writes the table's name into TableInfo!B1 — called once, right after the table is created (createAppSheet's seed only writes the "title" label into A1, not the value). */
  async setTableTitle(title: string, accessToken: string): Promise<void> {
    await this.writeValue({ value: title, sheetData: new SheetData(1, 'B', TABS.tableInfo) }, accessToken);
  }

  /** Writes TableInfo's Usual buy-in (₹)/(chips) defaults — the "Usual buy-in (₹, #chips)" editor. */
  async setUsualBuyIn(buyInAmount: number, chips: number, accessToken: string): Promise<void> {
    await this.writeValues(
      [
        { value: buyInAmount, sheetData: new SheetData(2, 'B', TABS.tableInfo) },
        { value: chips, sheetData: new SheetData(3, 'B', TABS.tableInfo) },
      ],
      accessToken
    );
  }

  /**
   * Writes TableInfo's "use alias" toggle (A6 label + B6 boolean-as-string).
   * Display-only — every join elsewhere (addSession/startGame/addGroup/
   * updateGroup/listGroups/cashIn) keeps matching by the real name in
   * players-info!A regardless of this flag. Rewrites the label every call
   * (not just once), same defensive style startGame uses for status/
   * sessionRow, so a table seeded before this flag existed self-heals it on
   * first toggle.
   */
  async setUseAlias(value: boolean, accessToken: string): Promise<void> {
    await this.writeValues(
      [
        { value: 'use alias', sheetData: new SheetData(6, 'A', TABS.tableInfo) },
        { value: value ? 'true' : 'false', sheetData: new SheetData(6, 'B', TABS.tableInfo) },
      ],
      accessToken
    );
  }

  /**
   * `start`: the single atomic action that commits a new game —
   * writes a new session-log row (today's date, `ratio` = buyInAmount
   * / chips, Buy-in(₹)), Buy-ins(#)=1 for every name in
   * `selectedPlayerNames` (set locally by All+/Group+ before this is
   * called — they no longer write anything themselves), the matching
   * sum-check row, and flips TableInfo status → "in progress" if any
   * players were selected. Records the row in TableInfo!A5/B5
   * (sessionRow) so later actions don't need to re-scan for it.
   */
  async startGame(buyInAmount: number, chips: number, selectedPlayerNames: string[], accessToken: string): Promise<{ row: number }> {
    if (!buyInAmount || buyInAmount <= 0) throw new Error('Set a buy-in amount before starting.');
    if (!chips || chips <= 0) throw new Error('Set a chips amount before starting.');

    const meta = await this.readMeta(accessToken);
    const sessionLogSheet = meta.sheets.find((s) => s.properties.title === TABS.sessionLog);
    const sumCheckSheet = meta.sheets.find((s) => s.properties.title === TABS.sumCheck);
    if (!sessionLogSheet) throw new Error(`Sheet is missing the "${TABS.sessionLog}" tab`);
    if (!sumCheckSheet) throw new Error(`Sheet is missing the "${TABS.sumCheck}" tab`);

    const row = await this.findNextEmptyRow(TABS.sessionLog, 'A', SESSION_DATA_FIRST_ROW, accessToken);

    await this.ensureGridSize(
      sessionLogSheet.properties.sheetId,
      'ROWS',
      sessionLogSheet.properties.gridProperties?.rowCount ?? DEFAULT_GRID_ROWS,
      row,
      accessToken
    );
    await this.ensureGridSize(
      sumCheckSheet.properties.sheetId,
      'ROWS',
      sumCheckSheet.properties.gridProperties?.rowCount ?? DEFAULT_GRID_ROWS,
      row,
      accessToken
    );

    const ratio = buyInAmount / chips;
    const date = new Date().toISOString().slice(0, 10);

    const roster = await this.listPlayers(accessToken);
    const selected = new Set(selectedPlayerNames);
    const q = PokerLedgerService.quoteSheet;
    const values: Array<ValueV<unknown>> = [
      { value: date, sheetData: new SheetData(row, 'A', TABS.sessionLog) },
      { value: ratio, sheetData: new SheetData(row, 'B', TABS.sessionLog) },
      { value: buyInAmount, sheetData: new SheetData(row, 'C', TABS.sessionLog) },
      { value: 'sessionRow', sheetData: new SheetData(5, 'A', TABS.tableInfo) },
      { value: row, sheetData: new SheetData(5, 'B', TABS.tableInfo) },
    ];

    const buyInsCells: string[] = [];
    const finalChipsCells: string[] = [];
    roster.forEach((player, i) => {
      const { buyInsLetter, finalChipsLetter } = PokerLedgerService.playerColumns(i);
      if (selected.has(player.name)) {
        values.push({ value: 1, sheetData: new SheetData(row, buyInsLetter, TABS.sessionLog) });
      }
      buyInsCells.push(`${q(TABS.sessionLog)}!${buyInsLetter}${row}`);
      finalChipsCells.push(`${q(TABS.sessionLog)}!${finalChipsLetter}${row}`);
    });

    const buyInsFormula = `=${q(TABS.sessionLog)}!C${row}*(${buyInsCells.length > 0 ? buyInsCells.join('+') : '0'})`;
    const cashOutsFormula = `=${q(TABS.sessionLog)}!B${row}*(${finalChipsCells.length > 0 ? finalChipsCells.join('+') : '0'})`;

    values.push(
      { value: date, sheetData: new SheetData(row, 'A', TABS.sumCheck) },
      { value: buyInsFormula, sheetData: new SheetData(row, 'B', TABS.sumCheck) },
      { value: cashOutsFormula, sheetData: new SheetData(row, 'C', TABS.sumCheck) },
      { value: `=B${row}-C${row}`, sheetData: new SheetData(row, 'D', TABS.sumCheck) }
    );

    if (selectedPlayerNames.length > 0) {
      values.push(
        { value: 'status', sheetData: new SheetData(4, 'A', TABS.tableInfo) },
        { value: 'in progress', sheetData: new SheetData(4, 'B', TABS.tableInfo) }
      );
    }

    await this.writeValues(values, accessToken);
    return { row };
  }

  /**
   * End: the "null check" — refuses to end when there's no game
   * actually in progress (guards a stray double-tap) — then flips
   * TableInfo status → "last played".
   */
  async endGame(accessToken: string): Promise<void> {
    const tableInfo = await this.getTableInfo(accessToken);
    if (tableInfo.status !== 'in progress') {
      throw new Error('No game is currently in progress.');
    }
    await this.writeValue({ value: 'last played', sheetData: new SheetData(4, 'B', TABS.tableInfo) }, accessToken);
  }

  /** Reads the current/last game's session-log row (via TableInfo!B5) for the "i" info popup and the playing-players row. null if no game has ever started. */
  async getCurrentGameInfo(accessToken: string): Promise<CurrentGameInfo | null> {
    const tableInfo = await this.getTableInfo(accessToken);
    if (tableInfo.sessionRow === null) return null;
    const row = tableInfo.sessionRow;

    const roster = await this.listPlayers(accessToken);
    const lastCol =
      roster.length > 0
        ? PokerLedgerService.colToLetter(SESSION_LOG_FIRST_PLAYER_COL + roster.length * SESSION_LOG_COLS_PER_PLAYER - 1)
        : 'C';
    const rowValues = await this.readRange(TABS.sessionLog, `A${row}:${lastCol}${row}`, accessToken);
    const cells = rowValues[0] ?? [];

    const players = roster.map((player, i) => {
      const startCol = SESSION_LOG_FIRST_PLAYER_COL + i * SESSION_LOG_COLS_PER_PLAYER;
      return {
        name: player.name,
        alias: player.alias,
        buyIns: Number(cells[startCol]) || 0,
        finalChips: Number(cells[startCol + 1]) || 0,
      };
    });

    return {
      row,
      date: cells[0] ?? '',
      ratio: Number(cells[1]) || 0,
      buyInAmount: Number(cells[2]) || 0,
      players,
    };
  }

  /**
   * Creates a new group: appends a column to groups-info (a plain
   * value write — groups-info's columns have no sub-header to merge,
   * unlike session-log's player blocks). Title goes in row 1; each
   * selected member becomes a formula-linked cell below it
   * (`='players-info'!A{row}`, the same convention groups-info's
   * existing columns use), looked up via listPlayers().
   */
  async addGroup(title: string, memberNames: string[], accessToken: string): Promise<void> {
    const meta = await this.readMeta(accessToken);
    const groupsInfoSheet = meta.sheets.find((s) => s.properties.title === TABS.groupsInfo);
    if (!groupsInfoSheet) throw new Error(`Sheet is missing the "${TABS.groupsInfo}" tab`);

    const headerRow = await this.readRange(TABS.groupsInfo, 'A1:ZZ1', accessToken);
    const col = headerRow[0]?.filter((v) => (v ?? '').trim() !== '').length ?? 0;

    await this.ensureGridSize(
      groupsInfoSheet.properties.sheetId,
      'COLUMNS',
      groupsInfoSheet.properties.gridProperties?.columnCount ?? DEFAULT_GRID_COLUMNS,
      col + 1,
      accessToken
    );

    const colLetter = PokerLedgerService.colToLetter(col);
    const roster = await this.listPlayers(accessToken);
    const q = PokerLedgerService.quoteSheet;

    const values: Array<ValueV<unknown>> = [{ value: title, sheetData: new SheetData(1, colLetter, TABS.groupsInfo) }];
    memberNames.forEach((name, i) => {
      const player = roster.find((p) => p.name === name);
      if (!player) return;
      values.push({
        value: `=${q(TABS.playersInfo)}!A${player.row}`,
        sheetData: new SheetData(2 + i, colLetter, TABS.groupsInfo),
      });
    });

    await this.writeValues(values, accessToken);
  }

  /**
   * Edits an existing group: finds its column by its current title
   * (`oldTitle`), overwrites the title and member rows with the new
   * selection. If the new selection is shorter than the old one, the
   * now-unused rows below it are cleared (blank), not left with stale
   * members.
   */
  async updateGroup(oldTitle: string, newTitle: string, memberNames: string[], accessToken: string): Promise<void> {
    const headerRow = await this.readRange(TABS.groupsInfo, 'A1:ZZ1', accessToken);
    const colIndex = headerRow[0]?.findIndex((v) => (v ?? '').trim() === oldTitle) ?? -1;
    if (colIndex === -1) throw new Error(`Group "${oldTitle}" not found`);
    const colLetter = PokerLedgerService.colToLetter(colIndex);

    const existingMembers = await this.readRange(TABS.groupsInfo, `${colLetter}2:${colLetter}200`, accessToken);
    const roster = await this.listPlayers(accessToken);
    const q = PokerLedgerService.quoteSheet;

    const values: Array<ValueV<unknown>> = [{ value: newTitle, sheetData: new SheetData(1, colLetter, TABS.groupsInfo) }];
    const rowCount = Math.max(existingMembers.length, memberNames.length);
    for (let i = 0; i < rowCount; i++) {
      const name = memberNames[i];
      const player = name ? roster.find((p) => p.name === name) : undefined;
      values.push({
        value: player ? `=${q(TABS.playersInfo)}!A${player.row}` : '',
        sheetData: new SheetData(2 + i, colLetter, TABS.groupsInfo),
      });
    }

    await this.writeValues(values, accessToken);
  }

  /** Reads groups-info: one group per column (its name in row 1, members — formula-linked to players-info — below). */
  async listGroups(accessToken: string): Promise<GroupInfo[]> {
    const rows = await this.readRange(TABS.groupsInfo, 'A1:ZZ200', accessToken);
    if (rows.length === 0) return [];
    const header = rows[0] ?? [];
    const groups: GroupInfo[] = [];
    for (let col = 0; col < header.length; col++) {
      const name = (header[col] ?? '').trim();
      if (!name) continue;
      const members: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const v = (rows[r]?.[col] ?? '').trim();
        if (v) members.push(v);
      }
      groups.push({ name, members });
    }
    return groups;
  }

  /**
   * Cash-ins: adds `buyInDelta` to (not replaces) each named player's
   * current-row Buy-ins(#) — a rebuy, or joining an already in-
   * progress game if their count was 0 — and/or sets their Final
   * chips directly. No structural writes needed: every registered
   * player already has a session-log column (from addPlayer), and
   * startGame's sum-check formulas already sum every roster player's
   * column (not just who was selected at game start), so filling in a
   * previously-blank cell here is picked up automatically.
   */
  async cashIn(entries: CashInEntry[], accessToken: string): Promise<void> {
    const tableInfo = await this.getTableInfo(accessToken);
    if (tableInfo.sessionRow === null) throw new Error('No game has been started yet.');
    const row = tableInfo.sessionRow;

    const roster = await this.listPlayers(accessToken);
    const values: Array<ValueV<unknown>> = [];

    for (const entry of entries) {
      const i = roster.findIndex((p) => p.name === entry.playerName);
      if (i === -1) continue;
      const { buyInsLetter, finalChipsLetter } = PokerLedgerService.playerColumns(i);

      if (entry.buyInDelta !== 0) {
        const current = await this.readRange(TABS.sessionLog, `${buyInsLetter}${row}:${buyInsLetter}${row}`, accessToken);
        const currentValue = Number(current[0]?.[0]) || 0;
        values.push({ value: currentValue + entry.buyInDelta, sheetData: new SheetData(row, buyInsLetter, TABS.sessionLog) });
      }
      if (entry.chips !== undefined) {
        values.push({ value: entry.chips, sheetData: new SheetData(row, finalChipsLetter, TABS.sessionLog) });
      }
    }

    await this.writeValues(values, accessToken);
  }
}

export type TableInfoData = {
  title: string;
  usualBuyIn: number;
  usualChips: number;
  status: 'in progress' | 'last played' | null;
  sessionRow: number | null;
  useAlias: boolean;
};

export type CurrentGameInfo = {
  row: number;
  date: string;
  ratio: number;
  buyInAmount: number;
  players: Array<{ name: string; alias: string; buyIns: number; finalChips: number }>;
};

export type GroupInfo = { name: string; members: string[] };

export type CashInEntry = { playerName: string; buyInDelta: number; chips?: number };
