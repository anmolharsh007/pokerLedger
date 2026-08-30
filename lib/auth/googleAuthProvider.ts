/**
 * Google Sign-In — two genuinely different implementations behind one
 * class, picked by Platform.OS:
 *
 *  - Web: Authorization Code + PKCE via expo-auth-session, exactly as
 *    before — a plain OAuth code flow works fine for a "Web
 *    application" type client, which supports arbitrary registered
 *    redirect URIs.
 *  - iOS/Android: @react-native-google-signin/google-signin. Google's
 *    OAuth 2.0 policy blocks the generic expo-auth-session flow outright
 *    for "iOS"/"Android" type client IDs (rejects the redirect with
 *    Error 400: invalid_request — confirmed live, not theoretical) —
 *    only a native library that owns the app's real platform identity
 *    (bundle ID + Firebase's bundled GoogleService-Info.plist, or
 *    package name + SHA-1 cert + google-services.json) is accepted.
 *    Needs a real dev-client/standalone build; doesn't work in Expo Go.
 *
 * Both paths grant access to the signed-in user's own Sheets data, and
 * (via drive.file) only to files/folders this app creates itself —
 * never the user's whole Drive. (The list of which sheets a user has
 * linked lives in local device storage, not Drive — see
 * lib/sheetRegistry.ts — drive.file is only for filing app-created
 * sheets under a `tracker-apps/<app-name>/` folder instead of Drive
 * root.)
 *
 * Setup required (can't be done from code):
 *  - Web: an OAuth client ID (type "Web application") with the Sheets
 *    API and Drive API enabled, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and
 *    _SECRET) in .env. See README.
 *  - iOS/Android: register the app in Firebase (`firebase apps:create
 *    IOS`/`ANDROID`, plus an Android SHA-1 via `firebase
 *    apps:android:sha:create`) — this auto-provisions the matching
 *    OAuth client in the same Google Cloud project. Download
 *    GoogleService-Info.plist / google-services.json into the project
 *    root and wire them in via app.json's `ios.googleServicesFile` /
 *    `android.googleServicesFile`. EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/
 *    _ANDROID_CLIENT_ID are NOT read by this native path — that's a
 *    leftover of the old universal expo-auth-session approach, kept
 *    around only because nothing reads them incorrectly by using them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { GoogleAuthProvider as FirebaseGoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { getFirebaseAuth, isFirebaseConfigured } from '../firebase';
import type { AuthUser } from './types';

// Required so the browser tab/sheet closes itself and resolves
// promptAsync() once Google redirects back to the app. Web path only.
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
// Web path only — the native path's own scope list is NATIVE_SCOPES
// below (email/profile are implicit there, not passed explicitly).
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
 * refresh; a failure here shouldn't block the rest of sign-in (Sheets
 * access doesn't depend on it), so it's logged, not thrown. Shared by
 * both the web and native sign-in paths below.
 */
async function signIntoFirebase(idToken: string | null | undefined): Promise<void> {
  if (!idToken || !isFirebaseConfigured()) return;
  try {
    const credential = FirebaseGoogleAuthProvider.credential(idToken);
    await signInWithCredential(getFirebaseAuth(), credential);
  } catch (err) {
    console.warn('Firebase sign-in failed (cross-table discovery will be unavailable this session):', err);
  }
}

// ---- Web path (expo-auth-session, Authorization Code + PKCE) ----

function getWebClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
}

/**
 * Google's token endpoint requires a client_secret for "Web application"
 * type OAuth clients even when using PKCE (most providers don't require
 * this once PKCE is used — Google's Web-app client type still does).
 * Since this app has no backend server, this "secret" ships inside the
 * client bundle — not actually confidential — but it's what Google's
 * own requirement forces for a Web-app client type in a serverless app.
 */
function getWebClientSecret(): string | undefined {
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

  const result = await AuthSession.refreshAsync(
    { clientId: getWebClientId(), clientSecret: getWebClientSecret(), refreshToken: session.refreshToken },
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

async function webSignIn(): Promise<AuthUser | null> {
  const clientId = getWebClientId();
  const clientSecret = getWebClientSecret();
  if (!clientId) {
    throw new Error('Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — see README.');
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

async function webSignOut(): Promise<void> {
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

async function webGetUser(): Promise<AuthUser | null> {
  const session = await loadSession();
  return session?.user ?? null;
}

async function webGetAccessToken(): Promise<string> {
  const session = await loadSession();
  if (!session) throw new Error('Not signed in with Google');
  const fresh = await refreshIfNeeded(session);
  return fresh.accessToken;
}

// ---- Native path (@react-native-google-signin/google-signin) ----

// email/profile are requested by default by the native SDKs — these
// are the extra API scopes this app actually needs (see this file's
// module comment for what each grants).
const NATIVE_SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

let nativeConfigured = false;
function ensureNativeConfigured(): void {
  if (nativeConfigured) return;
  GoogleSignin.configure({
    // The Web client ID as the ID token's audience — needed so
    // signIntoFirebase's GoogleAuthProvider.credential(idToken) accepts
    // it the same way regardless of which platform signed in, rather
    // than Firebase needing separate verification per platform. Not an
    // iOS/Android client ID substitution — GoogleSignin still reads the
    // real per-platform client ID from the bundled GoogleService-Info
    // .plist / google-services.json (app.json's `googleServicesFile`s).
    webClientId: getWebClientId() || undefined,
    scopes: NATIVE_SCOPES,
  });
  nativeConfigured = true;
}

function toAuthUser(user: { id: string; name: string | null; email: string }): AuthUser {
  return { id: user.id, displayName: user.name ?? undefined, email: user.email };
}

async function nativeSignIn(): Promise<AuthUser | null> {
  ensureNativeConfigured();
  if (Platform.OS === 'android') {
    // Best-effort — if this check itself fails, still attempt sign-in
    // rather than blocking the whole flow on it.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }).catch(() => true);
  }

  const response = await GoogleSignin.signIn();
  if (response.type !== 'success') return null; // cancelled/dismissed

  await signIntoFirebase(response.data.idToken);
  return toAuthUser(response.data.user);
}

async function nativeSignOut(): Promise<void> {
  if (isFirebaseConfigured()) {
    try {
      await getFirebaseAuth().signOut();
    } catch {
      // Best-effort.
    }
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // Best-effort — matches the web path's own tolerance for a failed revoke.
  }
}

async function nativeGetUser(): Promise<AuthUser | null> {
  ensureNativeConfigured();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  try {
    const response = await GoogleSignin.signInSilently();
    if (response.type !== 'success') return null; // noSavedCredentialFound
    return toAuthUser(response.data.user);
  } catch {
    return null;
  }
}

async function nativeGetAccessToken(): Promise<string> {
  ensureNativeConfigured();
  if (!GoogleSignin.hasPreviousSignIn()) throw new Error('Not signed in with Google');
  // Re-validates (and lets the native SDK silently refresh, if it deems
  // that necessary) the session before reading tokens — getTokens()
  // alone isn't documented to refresh on its own.
  await GoogleSignin.signInSilently();
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

// ---- Public API — picks a path by platform, once, per call ----

export class GoogleAuthProvider {
  async signIn(): Promise<AuthUser | null> {
    return Platform.OS === 'web' ? webSignIn() : nativeSignIn();
  }

  async signOut(): Promise<void> {
    return Platform.OS === 'web' ? webSignOut() : nativeSignOut();
  }

  async getUser(): Promise<AuthUser | null> {
    return Platform.OS === 'web' ? webGetUser() : nativeGetUser();
  }

  async getAccessToken(): Promise<string> {
    return Platform.OS === 'web' ? webGetAccessToken() : nativeGetAccessToken();
  }
}
