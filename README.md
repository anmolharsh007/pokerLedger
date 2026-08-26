# Poker Ledger

A poker session tracker. Reuses sheet-ui's lower-level "Google Sheet
as backend" pieces (auth, Sheets/Drive API clients, the per-device
sheet registry, table creation) — but **not** its generic Config-tab
UI engine (`configEngine.ts`/`DynamicScreen.tsx`). This project's
actions are structural sheet operations (inserting/merging columns),
not the plain value writes that engine knows how to express, and its
worksheets don't include a `Config` tab at all — so it has its own
screens instead. See [sheet-ui](../sheet-ui)'s README for the engine
pieces this still does share.

**Status: worksheet layout + "add a player" are real and testable
end-to-end.** The session-log/net-results money math (formulas) and
the leaderboard worksheet are still undesigned.

## Worksheet layout (`lib/pokerLedgerSeed.ts`)

Every new table gets 6 tabs:

- **players-info** — row-based registry. `A1`/`B1` = "Player name"/
  "Player email" headers, one player per row below.
- **net-results** — `A1`/`B1` = "Player name"/"Total" headers. Player
  rows are formula-linked to players-info (e.g. `=players-info!A3`)
  and grown in lockstep with it. The Total formula itself: TBD.
- **session-log** — `A1:C1` = "Date"/"ratio"/"Buy-in(₹)". Every player
  gets a 2-column block appended to the right: row 1 = their name
  (merged across the pair, formula-linked to players-info), row 2 =
  "Buy-ins(#)"/"Final chips" sub-headers.
- **sum-check** — `A1:D1` = "date"/"buy-ins"/"cash-outs"/"deviation".
  Formulas: TBD.
- **groups-info**, **leaderboard** — created blank; format not
  defined yet.

## "Add a player" (`lib/pokerActions.ts#addPlayer`)

This is why the generic engine doesn't fit: adding a player isn't a
value write, it's structural —
1. Appends the player's name + email to players-info's next empty row.
2. Appends a formula-linked row to net-results (same row number, kept
   in lockstep since both only ever grow here, together).
3. Appends a new 2-column block to session-log: grows the sheet's
   column count first if needed (`appendDimension`), merges the
   header cell across both new columns (`mergeCells`), then writes the
   formula-linked name into the merged cell and the "Buy-ins(#)"/
   "Final chips" sub-headers below it.

`TableScreen` (`components/TableScreen.tsx`) is the UI for this: shows
the current roster (`lib/pokerActions.ts#listPlayers`) and a Name/
Email form that calls `addPlayer`.

## What's copied from sheet-ui (with one local tweak)

```
lib/auth/googleAuthProvider.ts
lib/googleDriveApi.ts
lib/sheetRegistry.ts
lib/appSheet.ts
```

`lib/googleSheetsApi.ts` is copied too, but with one addition specific
to this project: `getSpreadsheetMeta` also fetches `gridProperties`
(row/column counts), needed to know whether session-log has room for
a new player's columns before merging into them.

Every table this app creates is filed under `tracker-apps/poker-ledger/`
in the user's Drive (via `lib/appSheet.ts`'s `createAppSheet`, called
with `appName: 'poker-ledger'`), separate from sheet-ui's own
`tracker-apps/sheet-ui/` sheets even though both can share one Google
Cloud project.

## Setup

Uses the **same Google Cloud project** as sheet-ui (Sheets API, Drive
API, OAuth consent screen, and test users already configured there) —
just needs its own OAuth client ID:

1. In that Cloud project: **APIs & Services → Credentials → Create
   Credentials → OAuth client ID** — type **Web application**. Add
   `http://localhost:8081` as an authorized redirect URI (use a
   different `--port` if you'll run this alongside sheet-ui's dev
   server at the same time, and update the redirect URI to match).
   Download the client JSON for its `client_secret` (Google requires
   one for "Web application" clients even with PKCE).
2. This app:
   ```bash
   cp .env.example .env
   # put the new client ID (and secret, for web) in .env

   npm install
   npm run web    # or: npx expo start --web --port 8082
   ```

## Next steps

- Define net-results' Total formula, sum-check's formulas, and the
  leaderboard worksheet.
- Decide how a new session (a new row in session-log) gets added —
  the same kind of structural-growth question "add a player" answered
  for columns, but for rows.
