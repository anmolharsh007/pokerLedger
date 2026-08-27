/**
 * The domain struct model for poker-ledger — mirrors poker-settles'
 * own proven pattern (SheetData / value-wrapper types / Player /
 * Group / Game / CurrentGame / Table). `CurrentGame` and
 * `Table.sessionRow` are wired into lib/pokerActions.ts's live-game
 * flow (TableInfo!A4:B5). `Table.newPlayerTag`/`.newSessionMarker`
 * remain unplaced — `addPlayer` still works via column-counting, not
 * a marker cell.
 *
 * See the mapping notes on each type below for which existing
 * worksheet (players-info, groups-info, net-results, session-log,
 * sum-check) a field is meant to come from.
 */

/**
 * A cell's location — fully self-contained (which tab, not just
 * {col}{row}), since our model spans 5 worksheets. `cellAddress()`
 * returns a sheet-qualified, ready-to-use reference, e.g.
 * "'session-log'!D3" — quoted since our tab names contain hyphens,
 * which A1 notation doesn't allow unquoted.
 */
export class SheetData {
  constructor(
    public row: number,
    public col: string,
    public sheet: string
  ) {}

  cellAddress(): string {
    return `'${this.sheet}'!${this.col}${this.row}`;
  }
}

/** Shared shape for every "a value, read from a specific cell" wrapper. */
export type ValueV<T> = { value: T; sheetData: SheetData };

export type TextV = ValueV<string>;
export type IntV = ValueV<number>;
export type FloatV = ValueV<number>;
/** A date, represented as text (matches session-log's Date column). */
export type DateV = ValueV<string>;
/** An amount of money for one buy-in (session-log's Buy-in(₹)). */
export type BuyInV = ValueV<number>;
/** A chip count (session-log's Final chips). */
export type ChipsV = ValueV<number>;

/**
 * A player, in context. In Table.allPlayers (the registry, from
 * players-info) buyIn/finalChips are blank/zero — they only hold real
 * values once this Player is part of CurrentGame.playingPlayers (the
 * live session-log row), or a finished Game's roster.
 */
export type Player = {
  name: TextV;
  buyIn: BuyInV;
  finalChips: ChipsV;
  sheetData: SheetData;
};

/** From groups-info: one column, its name in row 1, its members below. */
export type Group = {
  groupName: TextV;
  players: Player[];
  sheetData: SheetData;
};

/**
 * A finished, historical game/session — one completed session-log
 * row. No sheetData at this level (each Player in `roster` carries
 * its own); `status` isn't a real column yet (session-log has none).
 */
export type Game = {
  roster: Player[];
  date: DateV;
  status: 'in progress' | 'last played';
};

/**
 * The live game — unlike Game, has its own sheetData, since it's
 * actively being written to at a known (open) session-log row.
 * Wired to TableInfo!A4/B4 (status) and !A5/B5 (sessionRow, see
 * Table.sessionRow) by lib/pokerActions.ts.
 */
export type CurrentGame = {
  playingPlayers: Player[];
  date: DateV;
  status: 'in progress' | 'last played';
  sheetData: SheetData;
  /**
   * The session-level buy-in(₹)/chips set via the table screen's
   * `start` — session-log's row-level Buy-in(₹), and the chips figure
   * used to derive `ratio` (= buyIn.value / chips.value). Distinct
   * from BuyInV/ChipsV, which are a specific *player's* buy-in/final
   * chips, not the session's own setting.
   */
  buyIn: FloatV;
  chips: IntV;
};

/** Marker cell locating where to write a newly-added player. Not placed on any worksheet yet. */
export type NewPlayerTag = TextV;
/** Marker locating where the next new game gets written — purely positional, no text value. Not placed on any worksheet yet. */
export type NewSessionMarker = SheetData;

export type Table = {
  /** spreadsheetId — same identity as LinkedSheet (lib/sheetRegistry.ts), not a new concept. */
  sheetLink: string;
  allPlayers: Player[];
  groups: Group[];
  currentGame: CurrentGame;
  newPlayerTag: NewPlayerTag;
  newSessionMarker: NewSessionMarker;
  /** Which row the current/next session lives at — a persisted counter (TableInfo!A5/B5), not re-derived by scanning session-log each time. */
  sessionRow: IntV;
};
