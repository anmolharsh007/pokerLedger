/**
 * Thin client for the Drive API v3 — used only to keep app-created
 * sheets organized into a folder (`tracker-apps/<app-name>/`) instead
 * of dropping loose files in the user's Drive root. Needs the
 * `drive.file` scope: the app can only see/manage files and folders
 * it creates itself, not the user's whole Drive.
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

/** Finds a file (not a folder) by exact name under `parentId`; returns its id, or null if none exists. */
export async function findFile(name: string, parentId: string, accessToken: string): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
  const params = new URLSearchParams({ q, fields: 'files(id,name)' });
  const response = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new DriveApiError(await extractErrorMessage(response, `Drive file lookup failed: ${response.status}`));
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

/** Resolves (creating if needed) the `tracker-apps/<appName>` folder path, returning the leaf folder's id. */
export async function resolveAppFolder(appName: string, accessToken: string): Promise<string> {
  const trackerAppsId = await findOrCreateFolder('tracker-apps', 'root', accessToken);
  return findOrCreateFolder(appName, trackerAppsId, accessToken);
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

export { DriveApiError };
