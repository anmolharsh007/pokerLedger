/**
 * Thin client for the real Google Sheets API v4, using the signed-in
 * user's own OAuth token — access is governed by their normal Sheets
 * permissions (in this app's case, a sheet in the user's own regular
 * Drive, created by lib/appSheet.ts).
 */

const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

class SheetsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetsApiError';
  }
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    // Reads (GET) must always hit the network — a button's increment
    // logic depends on the true current value, and a cached response
    // for the same URL would make it look stuck (e.g. always "0" -> "1"
    // instead of building on the real value each press).
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Sheets API request failed: ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error?.message || message;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new SheetsApiError(message);
  }

  return (await response.json()) as T;
}

export type SheetProperties = {
  sheetId: number;
  title: string;
  // Grid size — needed before merging/writing into columns that might
  // not exist yet (this project grows session-log's columns per player).
  gridProperties?: { rowCount?: number; columnCount?: number };
};
export type SpreadsheetMeta = { sheets: Array<{ properties: SheetProperties }> };

/**
 * Creates a brand-new spreadsheet — lands in the user's regular Drive
 * (visible, shareable like any file), with the given tabs created up
 * front. Uses the Sheets API's own create endpoint rather than Drive's
 * files.create, so only the `spreadsheets` scope is needed — no
 * separate Drive file-creation scope.
 */
export async function createSpreadsheet(
  title: string,
  sheetTitles: string[],
  accessToken: string
): Promise<string> {
  const result = await request<{ spreadsheetId: string }>('', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: sheetTitles.map((t) => ({ properties: { title: t } })),
    }),
  });
  return result.spreadsheetId;
}

/** Lists every tab (name + id) in the spreadsheet. */
export async function getSpreadsheetMeta(spreadsheetId: string, accessToken: string): Promise<SpreadsheetMeta> {
  return request<SpreadsheetMeta>(
    `/${spreadsheetId}?fields=${encodeURIComponent('sheets(properties(sheetId,title,gridProperties))')}`,
    accessToken
  );
}

/** Reads a range as formatted display strings (e.g. "Config!A1:D50"). */
export async function getValues(spreadsheetId: string, range: string, accessToken: string): Promise<string[][]> {
  const result = await request<{ values?: string[][] }>(
    `/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
    accessToken
  );
  return result.values ?? [];
}

/** Reads several ranges/cells in one request; returns values indexed by the same order as `ranges`. */
export async function batchGetValues(
  spreadsheetId: string,
  ranges: string[],
  accessToken: string
): Promise<string[][][]> {
  if (ranges.length === 0) return [];
  const params = new URLSearchParams();
  ranges.forEach((r) => params.append('ranges', r));
  params.set('valueRenderOption', 'FORMATTED_VALUE');

  const result = await request<{ valueRanges?: Array<{ values?: string[][] }> }>(
    `/${spreadsheetId}/values:batchGet?${params.toString()}`,
    accessToken
  );
  // The API preserves request order in valueRanges, so index-align rather
  // than keying by the (possibly reformatted) echoed range string.
  return ranges.map((_, i) => result.valueRanges?.[i]?.values ?? []);
}

/** Writes a single value into one cell (e.g. "Data!B2"). */
export async function updateCell(
  spreadsheetId: string,
  a1Range: string,
  value: unknown,
  accessToken: string
): Promise<void> {
  await request(`/${spreadsheetId}/values/${encodeURIComponent(a1Range)}?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ range: a1Range, values: [[value]] }),
  });
}

/** Writes several ranges/cells at once (e.g. seeding a new sheet's initial template). */
export async function batchUpdateValues(
  spreadsheetId: string,
  updates: Array<{ range: string; values: unknown[][] }>,
  accessToken: string
): Promise<void> {
  if (updates.length === 0) return;
  await request(`/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
  });
}

/** Runs raw spreadsheet-structure requests (add/rename tabs, etc) — see the Sheets API's batchUpdate reference. */
export async function batchUpdateSpreadsheet(
  spreadsheetId: string,
  requests: unknown[],
  accessToken: string
): Promise<void> {
  if (requests.length === 0) return;
  await request(`/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

export { SheetsApiError };
