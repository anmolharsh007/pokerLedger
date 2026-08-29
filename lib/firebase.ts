/**
 * Firebase init — backs lib/accountsApi.ts, the cross-table discovery
 * index for #6 (non-logged-in user flow / leftover_plan.md): given a
 * signed-in person's email, which tables are they a player in,
 * regardless of who created those tables. See firestore.rules for the
 * access model this pairs with.
 *
 * Deliberately NOT Firebase's own Google sign-in flow — this project
 * already has its own Google OAuth (lib/auth/googleAuthProvider.ts).
 * That provider exchanges its id_token for a Firebase Auth session
 * (see signIntoFirebase there) so Firestore rules can key off
 * request.auth — a second, independent identity system would be
 * redundant and confusing.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, type Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

function isConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensureApp(): FirebaseApp {
  if (!isConfigured()) {
    throw new Error('Firebase is not configured — set EXPO_PUBLIC_FIREBASE_* in .env (see .env.example).');
  }
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

/** Native (iOS/Android) needs explicit AsyncStorage-backed persistence; web's getAuth() already persists itself. */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    const a = ensureApp();
    auth =
      Platform.OS === 'web'
        ? getAuth(a)
        : initializeAuth(a, { persistence: getReactNativePersistence(AsyncStorage) });
  }
  return auth;
}

/**
 * Native RN's networking needs long-polling detection to avoid Firestore
 * connections silently hanging; web's default (real browser fetch/
 * WebSocket) doesn't. Web also gets `persistentLocalCache` (IndexedDB-
 * backed) — the last-read `accounts/{email}` doc renders instantly from
 * cache while Firestore syncs any change in the background, instead of
 * every table-list load blocking on a network round trip. Deliberately
 * NOT enabled on native here — `persistentLocalCache` is documented as
 * IndexedDB-backed, which native doesn't have; RN Firestore's own
 * offline-cache story hasn't been verified in this build, so native
 * stays on the SDK's plain in-memory default rather than guessing.
 */
export function getDb(): Firestore {
  if (!db) {
    const a = ensureApp();
    db =
      Platform.OS === 'web'
        ? initializeFirestore(a, { localCache: persistentLocalCache() })
        : initializeFirestore(a, { experimentalAutoDetectLongPolling: true });
  }
  return db;
}

export { isConfigured as isFirebaseConfigured };
