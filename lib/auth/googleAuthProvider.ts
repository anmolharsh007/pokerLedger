/**
 * Google Sign-In (Authorization Code + PKCE via expo-auth-session).
 * Grants this app access to the signed-in user's own Sheets data, and
 * (via drive.file) only to files/folders it creates itself — never
 * the user's whole Drive. (The list of which sheets a user has linked
 * lives in local device storage, not Drive — see lib/sheetRegistry.ts
 * — drive.file is only for filing app-created sheets under a
 * `tracker-apps/<app-name>/` folder instead of Drive root.)
 *
 * Setup required (can't be done from code — needs Google Cloud
 * Console): create an OAuth client ID with the Sheets API and Drive
 * API enabled, then set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and
 * _IOS_/_ANDROID_ as needed) in .env. See README.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { GoogleAuthProvider as FirebaseGoogleAuthProvider, signInWithCredential } from 'firebase/auth';

import { getFirebaseAuth, isFirebaseConfigured } from '../firebase';
import type { AuthUser } from './types';

// Required so the browser tab/sheet closes itself and resolves
// promptAsync() once Google redirects back to the app.
WebBrowser.maybeCompleteAuthSession();

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

// openid/email/profile identify the user. spreadsheets is read/write
// access to their Sheets data. drive.file grants access to ONLY the
// files/folders this app creates (used to organize app-created sheets
// into a tracker-apps/<app-name>/ folder) — not the user's whole Drive.
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const STORAGE_KEY = 'googleAuth.session.v1';

type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  user: AuthUser;
};

/**
 * Exchanges this Google sign-in's id_token for a Firebase Auth session,
 * so Firestore rules (firestore.rules) can key off request.auth —
 * lib/accountsApi.ts's reads/writes need this to have happened first.
 * Best-effort: Firebase's own persistence (lib/firebase.ts) means this
 * only needs to run once per Google sign-in, not on every access-token
 * refresh; a failure here shouldn't block the rest of the app (Sheets
 * access doesn't depend on it), so it's logged, not thrown.
 */
async function signIntoFirebase(idToken: string | undefined): Promise<void> {
  if (!idToken || !isFirebaseConfigured()) return;
  try {
    const credential = FirebaseGoogleAuthProvider.credential(idToken);
    await signInWithCredential(getFirebaseAuth(), credential);
  } catch (err) {
    console.warn('Firebase sign-in failed (cross-table discovery will be unavailable this session):', err);
  }
}

/** Google issues separate OAuth client IDs per app type (Web/iOS/Android). */
function getClientId(): string {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
}

/**
 * Google's token endpoint requires a client_secret for "Web application"
 * type OAuth clients even when using PKCE (most providers don't require
 * this once PKCE is used — Google's Web-app client type still does).
 * iOS/Android client types don't need one. Since this app has no backend
 * server, this "secret" ships inside the client bundle — not actually
 * confidential — but it's what Google's own requirement forces for a
 * Web-app client type in a serverless app.
 */
function getClientSecret(): string | undefined {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return undefined;
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET || undefined;
}

async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

async function saveSession(session: StoredSession | null): Promise<void> {
  try {
    if (session) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort persistence — a failed write just means re-login next launch.
  }
}

/** Refreshes the access token if it's expired (or close to it); returns the session unchanged otherwise. */
async function refreshIfNeeded(session: StoredSession): Promise<StoredSession> {
  const oneMinute = 60_000;
  if (Date.now() < session.expiresAt - oneMinute) return session;
  if (!session.refreshToken) {
    throw new Error('Google session expired — please sign in again.');
  }

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const result = await AuthSession.refreshAsync(
    { clientId, clientSecret, refreshToken: session.refreshToken },
    DISCOVERY
  );

  const updated: StoredSession = {
    ...session,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? session.refreshToken,
    expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1000,
  };
  await saveSession(updated);
  return updated;
}

export class GoogleAuthProvider {
  async signIn(): Promise<AuthUser | null> {
    const clientId = getClientId();
    const clientSecret = getClientSecret();
    if (!clientId) {
      throw new Error(
        'Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and _IOS_/_ANDROID_ as needed) — see README.'
      );
    }

    const redirectUri = AuthSession.makeRedirectUri();
    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { access_type: 'offline', prompt: 'consent' },
    });

    const result = await request.promptAsync(DISCOVERY);
    if (result.type !== 'success' || !result.params.code) {
      return null; // cancelled, dismissed, or failed
    }

    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        clientSecret,
        code: result.params.code,
        redirectUri,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
      },
      DISCOVERY
    );

    let user: AuthUser = { id: 'google-user' };
    try {
      const info = await AuthSession.fetchUserInfoAsync(
        { accessToken: tokenResponse.accessToken },
        { userInfoEndpoint: USERINFO_ENDPOINT }
      );
      user = { id: String(info.sub ?? 'google-user'), displayName: info.name, email: info.email };
    } catch {
      // Sign-in itself still succeeded even if the profile fetch failed.
    }

    const session: StoredSession = {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      expiresAt: Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
      user,
    };
    await saveSession(session);
    // Best-effort, doesn't block the caller — see signIntoFirebase's own
    // comment for why a failure here isn't fatal to the rest of sign-in.
    await signIntoFirebase(tokenResponse.idToken);
    return user;
  }

  async signOut(): Promise<void> {
    const session = await loadSession();
    await saveSession(null);
    if (isFirebaseConfigured()) {
      try {
        await getFirebaseAuth().signOut();
      } catch {
        // Best-effort.
      }
    }
    if (session?.accessToken) {
      try {
        await AuthSession.revokeAsync({ token: session.accessToken }, DISCOVERY);
      } catch {
        // Best-effort — the local session is already cleared either way.
      }
    }
  }

  async getUser(): Promise<AuthUser | null> {
    const session = await loadSession();
    return session?.user ?? null;
  }

  async getAccessToken(): Promise<string> {
    const session = await loadSession();
    if (!session) throw new Error('Not signed in with Google');
    const fresh = await refreshIfNeeded(session);
    return fresh.accessToken;
  }
}
