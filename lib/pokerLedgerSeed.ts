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
 *  - TableInfo: label/value pairs down column A/B — A1="title" (B1 =
 *    the table's name, not auto-filled yet), A2="Usual buy-in (₹)",
 *    A3="Usual buy-in (chips)" (B2/B3 left blank, filled in later),
 *    A4/B4="status"/game status (written once a game first starts),
 *    A5/B5="sessionRow"/its row, A6/B6="use alias"/"true"|"false" (the
 *    per-table alias-display toggle, seeded up front like the labels
 *    above since it's a persistent setting, not a lifecycle marker —
 *    row 7+ is free for any future field).
 *  - groups-info, leaderboard: left blank — format not defined yet.
 *
 * This is NOT built on sheet-ui's Config-tab engine (configEngine.ts/
 * DynamicScreen.tsx) — there's no Config tab, and the real actions
 * here (like adding a player) are structural sheet operations, not
 * the value-only writes that engine knows how to express. This
 * project has its own screens instead (see App.tsx, lib/pokerActions.ts).
 */
import type { SheetSeed } from './appSheet';

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
    { range: `${TABS.sumCheck}!A1:D1`, values: [['date', 'buy-ins', 'cash-outs', 'deviation']] },
    { range: `${TABS.tableInfo}!A1:A3`, values: [['title'], ['Usual buy-in (₹)'], ['Usual buy-in (chips)']] },
    { range: `${TABS.tableInfo}!A6:B6`, values: [['use alias', 'false']] },
  ],
  // The Drive file itself is named Table<ID>.xlsx (an internal
  // identifier, not the human name — see App.tsx#handleCreateTable).
  // The registry/Firestore `name` is normally already the human title
  // too (handleCreateTable writes it there directly), but this is read
  // back and preferred on the home screen's table list regardless, so
  // a table linked before that was true (a stale filename-based local
  // name) still displays correctly.
  listColumns: [{ label: 'Title', cell: `${TABS.tableInfo}!B1` }],
};
