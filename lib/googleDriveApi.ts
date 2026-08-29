/**
 * Thin client for the Drive API v3 — used only to keep app-created
 * sheets organized into their own top-level folder (named after the
 * app itself, e.g. "Poker Ledger" — not a generic engineering-sounding
 * umbrella a real user would see in their own Drive) instead of
 * dropping loose files in Drive root. Needs the `drive.file` scope:
 * the app can only see/manage files and folders it creates itself, not
 * the user's whole Drive — which is exactly why `resolveAppFolder`'s
 * name-search can go stale (see its own comment) and callers should
 * prefer a cached folder id (lib/accountsApi.ts#getOrCreateAppFolderId)
 * over calling this every time.
 */

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

class DriveApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveApiError';
  }
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

/** Finds a folder by exact name under `parentId` ("root" for Drive's top level); returns its id, or null if none exists. */
async function findFolder(name: string, parentId: string, accessToken: string): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const params = new URLSearchParams({ q, fields: 'files(id,name)' });
  const response = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new DriveApiError(await extractErrorMessage(response, `Drive folder lookup failed: ${response.status}`));
  }
  const body = (await response.json()) as { files?: Array<{ id: string }> };
  return body.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const response = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!response.ok) {
    throw new DriveApiError(await extractErrorMessage(response, `Drive folder create failed: ${response.status}`));
  }
  const body = (await response.json()) as { id: string };
  return body.id;
}

/** Finds a folder by name under `parentId`, creating it if it doesn't exist yet. */
export async function findOrCreateFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const existing = await findFolder(name, parentId, accessToken);
  if (existing) return existing;
  return createFolder(name, parentId, accessToken);
}

/**
 * Resolves (creating if needed) a single top-level `<appName>` folder in
 * Drive root, returning its id. Re-discovers it by *searching* for a
 * folder with this name each call — under `drive.file` scope, that
 * search only sees folders the currently-authenticated OAuth client
 * itself created, so switching which client the app signs in with
 * (e.g. for an unrelated reason, like satisfying a different service's
 * audience check) makes an already-existing folder invisible to this
 * search and silently creates a duplicate instead of finding it. That's
 * exactly what happened once already — callers that create tables
 * repeatedly should cache the resolved id (getOrCreateAppFolderId)
 * rather than call this on every table creation.
 */
export async function resolveAppFolder(appName: string, accessToken: string): Promise<string> {
  return findOrCreateFolder(appName, 'root', accessToken);
}

/** Cheap existence check for a previously-resolved folder id — used to validate a cached id before trusting it (a deleted/inaccessible folder should fall back to re-resolving, not fail outright). */
export async function folderExists(folderId: string, accessToken: string): Promise<boolean> {
  const params = new URLSearchParams({ fields: 'id,trashed' });
  const response = await fetch(`${DRIVE_FILES_URL}/${folderId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { trashed?: boolean };
  return body.trashed !== true;
}

/** Moves a file (e.g. a newly-created spreadsheet) into `folderId`, out of wherever it landed by default (Drive root). */
export async function moveFileToFolder(fileId: string, folderId: string, accessToken: string): Promise<void> {
  const params = new URLSearchParams({ addParents: folderId, removeParents: 'root', fields: 'id,parents' });
  const response = await fetch(`${DRIVE_FILES_URL}/${fileId}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new DriveApiError(await extractErrorMessage(response, `Drive move failed: ${response.status}`));
  }
}

/**
 * Grants `email` real Drive access to `fileId` — this is the piece that
 * makes a player's own account actually able to read/write a table's
 * spreadsheet once they sign in, not just see it listed (that's
 * lib/accountsApi.ts's Firestore index, a separate concern — being
 * *listed* and being *allowed in* are independent of each other; this
 * is what closes the second half). Works even if `email` isn't a
 * Google Account yet: Drive still creates the grant and resolves it
 * once someone signs in/creates an account with that email later —
 * real-world, well-established Drive sharing behavior, though Google's
 * own API reference docs don't spell out this exact case explicitly.
 * `sendNotificationEmail=false` — this app conveys its own invite
 * (players-info + the in-app table list), not Drive's separate emailed
 * notification.
 */
export async function grantPermission(
  fileId: string,
  email: string,
  role: 'writer' | 'reader',
  accessToken: string
): Promise<void> {
  const params = new URLSearchParams({ sendNotificationEmail: 'false' });
  const response = await fetch(`${DRIVE_FILES_URL}/${fileId}/permissions?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'user', role, emailAddress: email }),
  });
  if (!response.ok) {
    throw new DriveApiError(await extractErrorMessage(response, `Drive permission grant failed: ${response.status}`));
  }
}

export { DriveApiError };
