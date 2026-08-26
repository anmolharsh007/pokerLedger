/**
 * Generic "app sheet" creation — reused by any project built on this
 * engine, not just this one. A caller supplies:
 *  - `appName`: identifies the project. Every sheet it creates is
 *    filed under `tracker-apps/<appName>/` in the user's Drive
 *    (instead of loose files in Drive root), so multiple projects
 *    (and multiple sheets within one project) stay organized.
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
import { batchUpdateValues, createSpreadsheet } from './googleSheetsApi';
import { addLinkedSheet, listLinkedSheets, type LinkedSheet } from './sheetRegistry';

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
};

/** Creates a brand-new app sheet: files it under tracker-apps/<appName>/, seeds it, and links it to this user. */
export async function createAppSheet(
  userId: string,
  accessToken: string,
  opts: { appName: string; sheetName: string; seed: SheetSeed }
): Promise<{ spreadsheetId: string }> {
  const folderId = await resolveAppFolder(opts.appName, accessToken);
  const spreadsheetId = await createSpreadsheet(opts.sheetName, opts.seed.tabs, accessToken);
  await moveFileToFolder(spreadsheetId, folderId, accessToken);
  if (opts.seed.values.length > 0) {
    await batchUpdateValues(spreadsheetId, opts.seed.values, accessToken);
  }
  await addLinkedSheet(userId, { name: opts.sheetName, spreadsheetId });
  return { spreadsheetId };
}

/** Lists every sheet this user has linked (in this project). */
export async function listAppSheets(userId: string): Promise<LinkedSheet[]> {
  return listLinkedSheets(userId);
}
