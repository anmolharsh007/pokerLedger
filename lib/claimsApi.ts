/**
 * The QR "retroactive email claim" flow: a player added by name only
 * (no email — see components/TableScreen.tsx, email is optional) can't
 * be found by the discovery index (lib/accountsApi.ts) or granted real
 * Drive access (lib/googleDriveApi.ts#grantPermission) until an email
 * is attached. This is how that happens after the fact, without
 * re-adding them as a new row:
 *
 *  1. Host (components/AllPlayersScreen.tsx): picks a name, sees every
 *     one of their own tables where that name has a blank email, and
 *     renders a QR encoding those — see `ClaimQrPayload`.
 *  2. Whoever scans it (components/ScanClaimScreen.tsx) must already be
 *     signed in — their email comes from their own verified Firebase
 *     session, never something typed into a box (see firestore.rules:
 *     `claimedBy` is checked against `request.auth.token.email`, not
 *     trusted from the payload). Scanning calls `createClaim`.
 *  3. The host's own app, next time it's open, finds this pending claim
 *     (`listPendingClaimsForHost`) and — since generating and handing
 *     out that specific QR was already their deliberate trust decision,
 *     no separate approval step — processes it automatically
 *     (`processClaim`): backfills the email into each matching sheet
 *     row (lib/pokerActions.ts#setPlayerEmail), grants real Drive
 *     access, and invites them into the discovery index. Can't happen
 *     on the scanning device itself: whoever scans has no write access
 *     to the host's sheets yet — that's the entire reason this flow
 *     exists, and exactly why it has to round-trip through the host.
 */
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';

import { inviteToAccount } from './accountsApi';
import { getDb, getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { grantPermission } from './googleDriveApi';
import { PokerLedgerService } from './pokerActions';

export type ClaimEntry = { spreadsheetId: string; tableName: string };
export type ClaimQrPayload = {
  type: 'claim-players';
  playerName: string;
  generatedBy: string; // the host's own email, at QR-generation time
  entries: ClaimEntry[];
};
export type Claim = {
  id: string;
  claimedBy: string;
  generatedBy: string;
  playerName: string;
  entries: ClaimEntry[];
  status: 'pending' | 'done';
};

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

/** Encodes the QR payload a host's "show QR" action renders — a plain JSON string, decoded back by parseClaimQr. */
export function buildClaimQrPayload(playerName: string, generatedBy: string, entries: ClaimEntry[]): string {
  const payload: ClaimQrPayload = { type: 'claim-players', playerName, generatedBy, entries };
  return JSON.stringify(payload);
}

/** Decodes a scanned QR's raw string back into a payload — null if it's not one of ours (a stray/unrelated QR someone scanned). */
export function parseClaimQr(raw: string): ClaimQrPayload | null {
  try {
    const data = JSON.parse(raw);
    if (data?.type !== 'claim-players' || !Array.isArray(data.entries)) return null;
    return data as ClaimQrPayload;
  } catch {
    return null;
  }
}

/**
 * Scanning side: writes a pending claim for the *currently signed-in*
 * user (their own verified email — see the module comment on why this
 * can't come from the QR itself). Requires a live Firebase session;
 * throws rather than silently no-op, since unlike the other best-effort
 * writes elsewhere, this action has no other effect if it fails — the
 * whole point of scanning was this write.
 */
export async function createClaim(payload: ClaimQrPayload): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.');
  const user = await waitForFirebaseUser();
  if (!user?.email) throw new Error('Sign in first — this needs your verified email.');
  await addDoc(collection(getDb(), 'claims'), {
    claimedBy: user.email.toLowerCase(),
    generatedBy: payload.generatedBy,
    playerName: payload.playerName,
    entries: payload.entries,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

/** Host side: every pending claim naming this host as the QR's generator — what App.tsx auto-processes on load. */
export async function listPendingClaimsForHost(hostEmail: string): Promise<Claim[]> {
  if (!isFirebaseConfigured()) return [];
  const user = await waitForFirebaseUser();
  if (!user) return [];
  const q = query(
    collection(getDb(), 'claims'),
    where('generatedBy', '==', hostEmail.toLowerCase()),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Claim, 'id'>) }));
}

/**
 * Runs one claim's actual backfill, using the host's own access token —
 * per-entry, not all-or-nothing: one table having already been fixed
 * some other way, or one write failing, doesn't block the rest. Marks
 * the claim 'done' once every entry has been attempted (not
 * necessarily succeeded — see the returned per-entry results if the
 * caller wants to report failures).
 */
export async function processClaim(
  claim: Claim,
  accessToken: string
): Promise<Array<{ entry: ClaimEntry; ok: boolean; error?: string }>> {
  const results = await Promise.all(
    claim.entries.map(async (entry) => {
      try {
        const service = new PokerLedgerService(entry.spreadsheetId);
        const backfilled = await service.setPlayerEmail(claim.playerName, claim.claimedBy, accessToken);
        if (backfilled) {
          await grantPermission(entry.spreadsheetId, claim.claimedBy, 'writer', accessToken);
          await inviteToAccount(claim.claimedBy, { spreadsheetId: entry.spreadsheetId, name: entry.tableName });
        }
        return { entry, ok: backfilled };
      } catch (err) {
        return { entry, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
  await updateDoc(doc(getDb(), 'claims', claim.id), { status: 'done', processedAt: serverTimestamp() });
  return results;
}
