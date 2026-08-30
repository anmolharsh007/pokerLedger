# Testing on a physical Android device

This app (`com.anmolharsh.pokerledger`, Expo SDK 57) **cannot run in Expo Go**. It uses
`expo-dev-client` plus a native module (`@react-native-google-signin/google-signin`) with a
config plugin, so it needs a custom **development build** installed on the device instead.

There are two ways to get that build onto a phone: build it locally over USB, or have EAS
build it in the cloud and install the APK. Pick one.

> Reference: [Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) — this project pins
> `expo: ~57.0.18` and all `expo-*` packages to `~57.x`, so use the v57 docs, not `latest`.

## Quick reference

| Goal | Command |
|---|---|
| Build + install over USB, then launch | `npm run android` |
| Cloud dev-client build (installable APK) | `npx eas build --profile development --platform android` |
| Start Metro for an installed dev client | `npx expo start --dev-client` |
| Standalone APK for handing to a tester | `npx eas build --profile preview --platform android` |

## 1. Prerequisites (both paths)

1. `npm install` in the repo root.
2. Copy `.env.example` to `.env` and fill in the values:
   - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` if you use
     web sign-in too)
   - `EXPO_PUBLIC_FIREBASE_*` (API key, auth domain, project id, etc. — from the
     `poker-ledger-qzw2dd` Firebase project)
3. Make sure `google-services.json` exists at the repo root — `app.json` points
   `android.googleServicesFile` at it, and the native build fails without it. Get it from the
   Firebase console for the `poker-ledger-qzw2dd` project if it's missing locally.
4. Log into EAS once: `npx eas login` (needed even for the local-build path, since
   `expo-dev-client` and Google Sign-In require a native project tied to this app's EAS project
   — id `e39db4e6-3da2-4ab2-8f3e-886d8ac22044` — via `extra.eas.projectId` in `app.json`).

## 2. Option A — Local build over USB (`npm run android`)

Needs Android Studio + the Android SDK installed locally.

1. On the phone: **Settings → About phone**, tap "Build number" 7 times to enable Developer
   Options, then **Settings → Developer options → USB debugging** → on.
2. Plug the phone into your computer with a USB cable. Approve the "Allow USB debugging?"
   prompt on the phone.
3. Confirm it's detected:
   ```
   adb devices
   ```
   You should see the device listed as `device` (not `unauthorized` — if it says that, check
   the phone screen for the approval prompt).
4. Build and install:
   ```
   npm run android
   ```
   This runs `expo run:android`, which generates/updates the native `android/` project, builds
   it with Gradle, and installs + launches the dev client on the phone. The first run is slow
   (Gradle downloads + native compile); later runs are much faster.
5. Once the dev client is installed, you don't need to rebuild for JS-only changes — just run:
   ```
   npx expo start --dev-client
   ```
   and reopen the app on the phone (it connects to Metro automatically over the USB connection
   via `adb reverse`, which `expo run:android` sets up for you).

**If Metro won't connect:** run `adb reverse tcp:8081 tcp:8081` manually, or make sure the phone
and computer are on the same Wi-Fi and use `npx expo start --dev-client` without USB.

## 3. Option B — EAS cloud build (no Android Studio needed)

Builds happen on Expo's servers, so this works even without a local Android SDK.

1. Kick off a development-client build:
   ```
   npx eas build --profile development --platform android
   ```
   (The `development` profile in `eas.json` sets `developmentClient: true` and
   `distribution: internal`.)
2. When the build finishes, the CLI prints a link and QR code, and EAS emails you too. Open the
   link on the phone, or scan the QR code, to download the `.apk`.
3. Install it: you'll likely need to allow "Install unknown apps" for your browser/Files app in
   Android settings the first time.
4. Start the dev server and connect:
   ```
   npx expo start --dev-client
   ```
   Open the installed app on the phone — it prompts you to scan the terminal's QR code or enter
   the dev server URL. Phone and computer should be on the same Wi-Fi; if not (or the network
   blocks LAN connections), run `npx expo start --dev-client --tunnel` instead.

**Handing the app to someone else to test** (no live Metro server required): build the
`preview` profile instead, which forces a plain installable APK:
```
npx eas build --profile preview --platform android
```
Install that APK the same way — it runs standalone, without needing `expo start` running.

## 4. Troubleshooting

- **`adb devices` shows nothing** — check USB debugging is on, try a different cable/USB port
  (some cables are charge-only), or run `adb kill-server && adb start-server` and reconnect.
- **App installs but Metro/dev client can't connect** — confirm phone and computer are on the
  same Wi-Fi network, or use `expo start --dev-client --tunnel`; check no firewall is blocking
  port 8081.
- **Google Sign-In fails on the device but works elsewhere** — the Android OAuth client in
  Google Cloud Console must have the SHA-1 fingerprint of whichever keystore signed the build
  (debug keystore for local builds, EAS's managed keystore for cloud builds — run
  `npx eas credentials` to see it) registered against it, and
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` in `.env` must match that OAuth client's ID.
- **Build fails referencing `google-services.json`** — the file is missing or doesn't match the
  Firebase project (`poker-ledger-qzw2dd` per `.firebaserc`); re-download it from the Firebase
  console.
- Android package name for reference: `com.anmolharsh.pokerledger`.
