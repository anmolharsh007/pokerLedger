/**
 * The real worksheet layout for a poker table, as designed:
 *
 *  - players-info: row-based registry. A1/B1/C1 headers ("Player
 *    name"/"Player email"/"Alias"), one player per row below. Added
 *    via lib/pokerActions.ts#addPlayer from a global player account
 *    (lib/playerAccounts.ts) — name/email are the real identity every
 *    other tab's formulas link to; Alias is display-only, shown
 *    instead of name when a table's "use alias" flag is on.
 *  - net-results: A1/B1 headers ("Player name"/"Total"). Player rows
 *    are formula-linked to players-info (e.g. `=players-info!A3`),
 *    grown in lockstep with it by lib/pokerActions.ts#addPlayer. The
 *    Total formula itself is still TBD — left blank per row for now.
 *  - session-log: A1/B1/C1 = "Date"/"ratio"/"Buy-in(₹)". Every player
 *    gets a 2-column block appended to the right (row 1 = their name,
 *    merged across the pair and formula-linked to players-info; row 2
 *    = "Buy-ins(#)"/"Final chips" sub-headers) — also grown by
 *    addPlayer, since it's structural (insert + merge), not a plain
 *    value write.
 *  - sum-check: A1/B1/C1/D1 = "date"/"buy-ins"/"cash-outs"/
 *    "deviation". Formulas TBD.
 *  - leaderboard: A1:F1 = "Player"/"Sessions played"/"Total buy-ins
 *    (#)"/"Total staked (₹)"/"Net winnings (₹)"/"Rank". Row-based like
 *    players-info/net-results, grown in the same lockstep by addPlayer
 *    — a player's row here is entirely formulas: name links to
 *    players-info, Net winnings links to net-results' own Total
 *    (already a lifetime sum, so no need to re-derive it here the way
 *    the reference sheet's session-by-column Net Results tab has to),
 *    Sessions played/Total buy-ins/Total staked (₹) read the player's
 *    own session-log columns directly (COUNTIF/SUM/SUMPRODUCT — same
 *    idea the reference uses, adapted to our row-per-player shape;
 *    Total staked (₹) has no reference-sheet equivalent, added on
 *    request — SUMPRODUCT of the player's Buy-ins(#) against each
 *    session's own Buy-in(₹) amount, the same "total buy-ins ×
 *    buy-in amount" term net-results' own Total formula already
 *    computes and subtracts), and Rank is RANK() over a fixed
 *    $E$2:$E$200 range (same 200-row cap listPlayers/listGroups
 *    already read up to elsewhere) so it doesn't need rewriting as
 *    more players join.
 *  - TableInfo: label/value pairs down column A/B — A1="title" (B1 =
 *    the table's name, not auto-filled yet), A2="Usual buy-in (₹)",
 *    A3="Usual buy-in (chips)" (B2/B3 left blank, filled in later),
 *    A4/B4="status"/game status (written once a game first starts),
 *    A5/B5="sessionRow"/its row, A6/B6="use alias"/"true"|"false" (the
 *    per-table alias-display toggle, seeded up front like the labels
 *    above since it's a persistent setting, not a lifecycle marker —
 *    row 7+ is free for any future field).
 *  - groups-info: left blank — format not defined yet.
 *
 * This is NOT built on sheet-ui's Config-tab engine (configEngine.ts/
 * DynamicScreen.tsx) — there's no Config tab, and the real actions
 * here (like adding a player) are structural sheet operations, not
 * the value-only writes that engine knows how to express. This
 * project has its own screens instead (see App.tsx, lib/pokerActions.ts).
 */
import type { HeaderStyle, SheetSeed } from './appSheet';

// Header styling, matched cell-for-cell against a reference sheet
// (docs.google.com/spreadsheets/d/1Snr_q5jBezRTkRHV21KA3tMQYknkupE4JnQcL90R9r4)
// built by hand for this same layout — pulled its xlsx export and read
// styles.xml with a real XML parser rather than eyeballing it (a first,
// regex-based pass mis-indexed cellXfs and had this backwards — fixed
// once re-checked properly). Reused wherever a header cell is written
// or grown: the seed below (initial header rows) and
// pokerActions.ts#addPlayer (session-log's per-player header columns,
// appended after creation so they fall outside the seed's own header
// block, hence PLAYER_HEADER_STYLE below). White bold Arial on a
// medium-blue fill for every "real" header row; the reference reserves
// a second, lighter blue tone for session-log's repeating per-player
// block (its row-3/4 headers, style s="13" in the sheet's styles.xml —
// confirmed by counting: 20 cells use it, exactly 10 players × 2
// columns) to set it apart from the sheet's fixed columns — carried
// over here as PLAYER_HEADER_STYLE for the same reason. (The
// reference's third color, orange, marks a different thing entirely —
// reconciliation columns like "Total buy-ins (₹)"/"Check (should be 0)"
// embedded at the tail of Session Log/Net Results' own headers, not
// used here.) Sheets colors are 0..1 floats, not the 0-255/hex a
// swatch picker gives you.
const HEADER_BORDER_COLOR = { red: 0.749, green: 0.749, blue: 0.749 }; // #BFBFBF, thin border on every header cell in the reference

export const HEADER_STYLE: HeaderStyle = {
  backgroundColor: { red: 0.180, green: 0.459, blue: 0.714 }, // #2E75B6
  textColor: { red: 1, green: 1, blue: 1 }, // #FFFFFF
  borderColor: HEADER_BORDER_COLOR,
  fontFamily: 'Arial',
};

export const PLAYER_HEADER_STYLE: HeaderStyle = {
  backgroundColor: { red: 0.616, green: 0.765, blue: 0.902 }, // #9DC3E6
  textColor: { red: 1, green: 1, blue: 1 }, // #FFFFFF
  borderColor: HEADER_BORDER_COLOR,
  fontFamily: 'Arial',
};

// The app's Drive folder name (lib/appSheet.ts#createAppSheet's
// `appName`) — deliberately the real display name now, not a
// kebab-case id: this is a top-level folder a user sees in their own
// Drive, not an internal identifier, so it should read like one.
export const APP_NAME = 'Poker Ledger';
export const DEFAULT_SHEET_NAME = 'Poker Table';

export const TABS = {
  playersInfo: 'players-info',
  groupsInfo: 'groups-info',
  netResults: 'net-results',
  sessionLog: 'session-log',
  leaderboard: 'leaderboard',
  sumCheck: 'sum-check',
  tableInfo: 'TableInfo',
} as const;

export const pokerLedgerSeed: SheetSeed = {
  tabs: [TABS.playersInfo, TABS.groupsInfo, TABS.netResults, TABS.sessionLog, TABS.leaderboard, TABS.sumCheck, TABS.tableInfo],
  values: [
    { range: `${TABS.playersInfo}!A1:C1`, values: [['Player name', 'Player email', 'Alias']] },
    { range: `${TABS.netResults}!A1:B1`, values: [['Player name', 'Total']] },
    { range: `${TABS.sessionLog}!A1:C1`, values: [['Date', 'ratio', 'Buy-in(₹)']] },
    {
      range: `${TABS.leaderboard}!A1:F1`,
      values: [['Player', 'Sessions played', 'Total buy-ins (#)', 'Total staked (₹)', 'Net winnings (₹)', 'Rank']],
    },
    { range: `${TABS.sumCheck}!A1:D1`, values: [['date', 'buy-ins', 'cash-outs', 'deviation']] },
    { range: `${TABS.tableInfo}!A1:A3`, values: [['title'], ['Usual buy-in (₹)'], ['Usual buy-in (chips)']] },
    { range: `${TABS.tableInfo}!A6:B6`, values: [['use alias', 'false']] },
  ],
  // Only tabs with an already-defined header shape (see the layout
  // notes above) — groups-info has none yet, and TableInfo is a
  // label/value column, not a header row. session-log's block is just
  // its 3 static columns (Date/ratio/Buy-in); each player's own
  // 2-column block is formatted separately as it's added, by
  // pokerActions.ts#addPlayer, reusing the same colors below.
  // leaderboard doesn't grow columns (only rows, like players-info/
  // net-results), so its whole header fits in this one-time block.
  headerFormat: {
    style: HEADER_STYLE,
    ranges: {
      [TABS.playersInfo]: { rowCount: 1, colCount: 3 },
      [TABS.netResults]: { rowCount: 1, colCount: 2 },
      [TABS.sessionLog]: { rowCount: 1, colCount: 3 },
      [TABS.leaderboard]: { rowCount: 1, colCount: 6 },
      [TABS.sumCheck]: { rowCount: 1, colCount: 4 },
    },
  },
  // The Drive file itself is named Table<ID>.xlsx (an internal
  // identifier, not the human name — see App.tsx#handleCreateTable).
  // The registry/Firestore `name` is normally already the human title
  // too (handleCreateTable writes it there directly), but this is read
  // back and preferred on the home screen's table list regardless, so
  // a table linked before that was true (a stale filename-based local
  // name) still displays correctly.
  listColumns: [{ label: 'Title', cell: `${TABS.tableInfo}!B1` }],
};
