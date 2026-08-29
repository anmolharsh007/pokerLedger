/**
 * The cross-table discovery index for #6 (non-logged-in user flow /
 * leftover_plan.md): one Firestore doc per person (collection
 * `accounts`, keyed by their lowercased email — the PlayerAccount
 * primary key, see lib/pokerTypes.ts), holding every table they're a
 * player in regardless of who created it. Backs the a-b-c-d-e-f
 * requirement from the design discussion: sign in (even for the very
 * first time) and every table you're listed in shows up immediately —
 * no proximity/QR step required for that core case (see firestore.rules
 * for the access model, and lib/firebase.ts for the client setup this
 * depends on).
 *
 * Call sites:
 *  - ensureOwnAccount: App.tsx, right after Google+Firebase sign-in —
 *    reads (or creates) the signed-in user's own doc, claiming a
 *    placeholder into a real account if one already existed from being
 *    invited before they'd ever signed in.
 *  - inviteToAccount: TableScreen.tsx's addPlayer flow — appends a
 *    table onto the INVITED player's doc, creating a placeholder for
 *    them if they don't have one yet. This is the write that makes
 *    "they see it the moment they sign in" possible even for someone
 *    who's never opened the app.
 *  - removeStaleSheets: App.tsx, after its own manual (long-press)
 *    integrity check — Firestore's `sheets` list can drift from reality
 *    (a table deleted in Drive, or access revoked, doesn't un-list
 *    itself here on its own), and so can the local registry
 *    (lib/sheetRegistry.ts) a table falls back to when it was never in
 *    Firestore at all. The actual Drive-reachability check runs in
 *    App.tsx against the full on-screen (merged) list, not here — this
 *    only does the resulting Firestore write, once the user confirms.
 *    Not run on every normal load — that's what `ensureOwnAccount` +
 *    Firestore's own local persistence (lib/firebase.ts) already handle
 *    cheaply; verifying is a real Drive round-trip per sheet, opt-in.
 *  - getOrCreateAppFolderId: App.tsx#handleCreateTable — caches the
 *    Drive folder id tables get filed into, in this same doc, so
 *    lib/googleDriveApi.ts#resolveAppFolder's name-search (unreliable
 *    across an OAuth client change — see its own comment) only ever
 *    runs once per account instead of on every table creation.
 */
import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';

import { getDb, getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { folderExists, resolveAppFolder } from './googleDriveApi';

export type SheetEntry = { spreadsheetId: string; name: string };
export type AccountDoc = {
  uuid: string;
  displayName: string | null;
  alias: string | null;
  hasSignedIn: boolean;
  sheets: SheetEntry[];
};

function docIdForEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Same ad hoc id pattern App.tsx already uses for table ids — no new dependency for this. */
function newUuid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Firebase Auth's session restore (from lib/firebase.ts's persistence)
 * is asynchronous — on a cold start, `auth.currentUser` may still be
 * null for a moment even though a session will shortly resolve. Waits
 * for that first resolution once, rather than trusting a synchronous
 * read of `currentUser`.
 */
function waitForFirebaseUser(): Promise<FirebaseUser | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function toAccountDoc(data: Record<string, unknown> | undefined): AccountDoc {
  return {
    uuid: (data?.uuid as string) ?? newUuid(),
    displayName: (data?.displayName as string) ?? null,
    alias: (data?.alias as string) ?? null,
    hasSignedIn: Boolean(data?.hasSignedIn),
    sheets: Array.isArray(data?.sheets) ? (data!.sheets as SheetEntry[]) : [],
  };
}

/**
 * Reads (or creates, or claims a not-yet-signed-in placeholder for)
 * the signed-in user's own account doc — `.sheets` is every table
 * they're a player in, ready for App.tsx's table list. A no-op that
 * returns null if Firebase isn't configured yet, or no Firebase
 * session exists (e.g. it failed silently at sign-in time) — callers
 * should fall back to today's behavior (locally-created tables only)
 * in that case, not hard-fail.
 */
export async function ensureOwnAccount(email: string, displayName: string | null): Promise<AccountDoc | null> {
  if (!isFirebaseConfigured()) return null;
  const user = await waitForFirebaseUser();
  if (!user) return null;

  const ref = doc(getDb(), 'accounts', docIdForEmail(email));
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const fresh: AccountDoc & { createdAt: unknown; updatedAt: unknown } = {
      uuid: newUuid(),
      displayName,
      alias: null,
      hasSignedIn: true,
      sheets: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, fresh);
    return fresh;
  }

  const existing = toAccountDoc(snap.data());
  if (!existing.hasSignedIn || (displayName && existing.displayName !== displayName)) {
    // Claiming a placeholder (created by someone inviting this email
    // before they'd signed in) into a real account, and/or picking up
    // a display name change — both are "your own doc" writes, so
    // firestore.rules' isSelf() branch (full control) applies.
    await setDoc(ref, { hasSignedIn: true, displayName: displayName ?? existing.displayName, updatedAt: serverTimestamp() }, { merge: true });
    existing.hasSignedIn = true;
    if (displayName) existing.displayName = displayName;
  }
  return existing;
}

/**
 * Appends `sheet` onto `email`'s account doc — creating a not-yet-
 * signed-in placeholder for them if they don't have an account yet.
 * This is what makes a table show up for someone the instant they
 * sign in, even if they'd never opened the app before being added as
 * a player. Best-effort: swallows failures (e.g. Firebase not
 * configured, or a rules rejection) rather than blocking addPlayer —
 * the sheet write (players-info) is the source of truth either way;
 * this is a discovery convenience layered on top, not a critical path.
 */
export async function inviteToAccount(email: string, sheet: SheetEntry): Promise<void> {
  if (!isFirebaseConfigured() || !email.trim()) return;
  const user = await waitForFirebaseUser();
  if (!user) return;

  const ref = doc(getDb(), 'accounts', docIdForEmail(email));
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uuid: newUuid(),
        hasSignedIn: false,
        sheets: [sheet],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, { sheets: arrayUnion(sheet), updatedAt: serverTimestamp() });
    }
  } catch (err) {
    // Most likely: two hosts inviting the same brand-new email at
    // once (the getDoc/create race) — one create wins, retry as an
    // update. Anything else (rules rejection, offline) just logs.
    try {
      await updateDoc(ref, { sheets: arrayUnion(sheet), updatedAt: serverTimestamp() });
    } catch (retryErr) {
      console.warn('inviteToAccount failed (table list will still work via the sheet itself):', err, retryErr);
    }
  }
}

/** Appends `sheet` onto the signed-in user's own account — used when THEY create a new table (App.tsx#handleCreateTable). */
export async function addOwnSheet(email: string, sheet: SheetEntry): Promise<void> {
  return inviteToAccount(email, sheet);
}

/**
 * Removes every sheet in `staleSpreadsheetIds` from the signed-in user's
 * own doc — never automatic, always a confirmed user action (App.tsx's
 * verify flow checks the actual on-screen table list — local registry
 * included, not just this doc's own `sheets` — against real Drive
 * reachability first). A no-op if the doc doesn't have any of them (e.g.
 * a table that was only ever in the local registry, never Firestore).
 *
 * Reads, filters, and writes the whole `sheets` array rather than
 * Firestore's `arrayRemove` — `arrayRemove` needs an exact deep-equal
 * value, which a `{spreadsheetId, name}` reconstructed from a merged
 * (local + Firestore) list isn't guaranteed to be if the two ever
 * disagreed on `name`; filtering by `spreadsheetId` alone doesn't have
 * that footgun.
 */
export async function removeStaleSheets(email: string, staleSpreadsheetIds: string[]): Promise<void> {
  if (!isFirebaseConfigured() || staleSpreadsheetIds.length === 0) return;
  const user = await waitForFirebaseUser();
  if (!user) return;
  const ref = doc(getDb(), 'accounts', docIdForEmail(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const staleSet = new Set(staleSpreadsheetIds);
  const current = toAccountDoc(snap.data()).sheets;
  const filtered = current.filter((s) => !staleSet.has(s.spreadsheetId));
  if (filtered.length === current.length) return;
  await updateDoc(ref, { sheets: filtered, updatedAt: serverTimestamp() });
}

/**
 * Resolves the Drive folder new tables should be filed into, caching
 * the result on the signed-in user's own doc so it only needs
 * resolving-by-name-search once ever, not on every table creation —
 * see lib/googleDriveApi.ts#resolveAppFolder for why repeating that
 * search isn't reliable. Falls back to a plain (uncached) resolve if
 * Firebase isn't configured/signed in, so table creation still works
 * either way, just without the caching benefit.
 */
export async function getOrCreateAppFolderId(email: string, appName: string, accessToken: string): Promise<string> {
  if (!isFirebaseConfigured()) return resolveAppFolder(appName, accessToken);
  const user = await waitForFirebaseUser();
  if (!user) return resolveAppFolder(appName, accessToken);

  const ref = doc(getDb(), 'accounts', docIdForEmail(email));
  const snap = await getDoc(ref);
  const cached = snap.exists() ? ((snap.data()?.appFolderId as string | undefined) ?? null) : null;
  if (cached && (await folderExists(cached, accessToken))) {
    return cached;
  }

  const resolved = await resolveAppFolder(appName, accessToken);
  await setDoc(ref, { appFolderId: resolved, updatedAt: serverTimestamp() }, { merge: true });
  return resolved;
}
