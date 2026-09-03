/**
 * Generic "app sheet" creation — reused by any project built on this
 * engine, not just this one. A caller supplies:
 *  - `appName`: identifies the project. Every sheet it creates is filed
 *    under a top-level `<appName>` folder in the user's Drive (instead
 *    of loose files in Drive root).
 *  - `folderId`, optionally: a caller that already knows which folder
 *    to use (e.g. App.tsx, via lib/accountsApi.ts#getOrCreateAppFolderId
 *    caching the resolved id in Firestore) can skip the name-search
 *    `resolveAppFolder` would otherwise do — see that function's own
 *    comment for why repeating that search isn't reliable. Omitted,
 *    this falls back to resolving it fresh each call, same as before.
 *  - `seed`: the project's own "homepage in code" — which tabs to
 *    create and what to write into them (its Config rows, initial
 *    data). This project's own demo seed lives in App.tsx; a real
 *    use case (a poker ledger, an expense tracker, ...) defines its
 *    own instead. Nothing here needs editing per use case.
 *
 * The sheet itself is a normal, native Google Sheet living in the
 * user's regular Drive (visible, shareable). Which sheet(s) a user
 * has is tracked in a local-device registry (lib/sheetRegistry.ts).
 */
import { moveFileToFolder, resolveAppFolder } from './googleDriveApi';
import { batchUpdateSpreadsheet, batchUpdateValues, createSpreadsheet, getSpreadsheetMeta } from './googleSheetsApi';
import { addLinkedSheet, listLinkedSheets, type LinkedSheet } from './sheetRegistry';

export type RGBColor = { red: number; green: number; blue: number }; // 0..1 float components, as the Sheets API expects

export type SheetSeed = {
  tabs: string[]; // e.g. ['Data', 'Config']
  values: Array<{ range: string; values: unknown[][] }>; // batchUpdateValues payload
  /**
   * Optional cells to read back for each sheet shown on a project's
   * home/list screen (e.g. a status line under the sheet's name).
   * Which cells those are is use-case-specific and defined by the
   * caller — this project's own demo seed leaves it empty.
   */
  listColumns?: Array<{ label: string; cell: string }>;
  /**
   * Optional header-row color formatting applied once, right after the
   * tabs are created — `style` (fill/text/border) on the top-left
   * corner of each listed tab. `ranges` names which tabs get it and how
   * big their header block is (rows/cols from A1); a tab omitted here
   * is left unformatted (e.g. a tab with no defined header shape yet).
   * A tab whose header later grows past this initial block (a new
   * column appended structurally, say) needs its own follow-up
   * headerFormatRequest call from the caller that grows it — this only
   * covers the shape known at creation time.
   */
  headerFormat?: {
    style: HeaderStyle;
    ranges: Record<string, { rowCount: number; colCount: number }>;
  };
};

export type HeaderStyle = {
  backgroundColor: RGBColor;
  textColor: RGBColor;
  borderColor: RGBColor;
  fontFamily?: string; // defaults to the sheet's own default font if omitted
};

/** Builds the repeatCell request `headerFormat` describes for one tab — shared with callers that grow a header later (e.g. addPlayer appending session-log columns). */
export function headerFormatRequest(
  sheetId: number,
  rowCount: number,
  colCount: number,
  style: HeaderStyle,
  opts?: { startColumnIndex?: number }
): unknown {
  const startColumnIndex = opts?.startColumnIndex ?? 0;
  const border = { style: 'SOLID', color: style.borderColor };
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: rowCount,
        startColumnIndex,
        endColumnIndex: startColumnIndex + colCount,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: style.backgroundColor,
          textFormat: { foregroundColor: style.textColor, bold: true, fontFamily: style.fontFamily },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
          borders: { top: border, bottom: border, left: border, right: border },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,borders)',
    },
  };
}

/** Creates a brand-new app sheet: files it under the app's Drive folder, seeds it, and links it to this user. */
export async function createAppSheet(
  userId: string,
  accessToken: string,
  // `sheetName` is the literal Drive file title (this project passes a
  // generated Table<id>.xlsx, not something a user should see — see
  // App.tsx#handleCreateTable). `displayName`, if given, is what the
  // registry (and this project's table list) shows instead; omitted
  // callers keep the old behavior of showing `sheetName` itself.
  opts: { appName: string; sheetName: string; displayName?: string; folderId?: string; seed: SheetSeed }
): Promise<{ spreadsheetId: string; folderId: string }> {
  const folderId = opts.folderId ?? (await resolveAppFolder(opts.appName, accessToken));
  const spreadsheetId = await createSpreadsheet(opts.sheetName, opts.seed.tabs, accessToken);
  await moveFileToFolder(spreadsheetId, folderId, accessToken);
  if (opts.seed.values.length > 0) {
    await batchUpdateValues(spreadsheetId, opts.seed.values, accessToken);
  }
  if (opts.seed.headerFormat) {
    const { style, ranges } = opts.seed.headerFormat;
    const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
    const requests = Object.entries(ranges)
      .map(([tabTitle, { rowCount, colCount }]) => {
        const sheet = meta.sheets.find((s) => s.properties.title === tabTitle);
        if (!sheet) return null; // tab named in headerFormat but missing from seed.tabs — skip rather than fail table creation over cosmetics
        return headerFormatRequest(sheet.properties.sheetId, rowCount, colCount, style);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (requests.length > 0) {
      await batchUpdateSpreadsheet(spreadsheetId, requests, accessToken);
    }
  }
  await addLinkedSheet(userId, { name: opts.displayName ?? opts.sheetName, spreadsheetId });
  return { spreadsheetId, folderId };
}

/** Lists every sheet this user has linked (in this project). */
export async function listAppSheets(userId: string): Promise<LinkedSheet[]> {
  return listLinkedSheets(userId);
}
