# Testing on a physical iPhone via SideStore (free Apple ID)

This app (`com.anmolharsh.pokerledger`, Expo SDK 57) **cannot run in Expo Go**. It uses
`expo-dev-client` plus a native module (`@react-native-google-signin/google-signin`) with a
config plugin, so it needs a custom **development build** installed on the device instead.

If you have a paid Apple Developer Program membership, the simplest route mirrors the Android
EAS path: `npx eas build --profile preview --platform ios`, then install the resulting `.ipa`
via TestFlight or `eas build:run`. **This doc is for the free-Apple-ID case** — Apple only
issues ad-hoc provisioning profiles (what EAS's internal-distribution builds need) to paid
Developer Program accounts, so that cloud path isn't available. Instead, [SideStore](https://sidestore.io)
sideloads a locally-built `.ipa` using nothing but a free Apple ID, and re-signs it in the
background every 7 days so you don't have to keep re-plugging the phone in.

> Reference: [Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) — this project pins
> `expo: ~57.0.18` and all `expo-*` packages to `~57.x`, so use the v57 docs, not `latest`.
> SideStore's own install method changed recently too — this doc follows the current
> [SideStore docs](https://docs.sidestore.io/) (`iloader`), not the older AltServer-based flow
> you'll still see in older guides.

## Quick reference

| Goal | Command / action |
|---|---|
| Generate the native iOS project (first time, or after `app.json` changes) | `npx expo prebuild --platform ios` |
| Open the project in Xcode | `open ios/pokerledger.xcworkspace` |
| Produce a sideloadable build | Xcode: **Product → Archive**, then **Distribute App → Development → Export** |
| Install SideStore itself on the phone | `iloader` (macOS app) over USB, one-time |
| Get the app onto the phone | SideStore → My Apps → **+** → pick the exported `.ipa` |

## 1. Prerequisites

1. `npm install` in the repo root.
2. Copy `.env.example` to `.env` and fill in the values (Google client IDs,
   `EXPO_PUBLIC_FIREBASE_*` — from the `poker-ledger-qzw2dd` Firebase project).
3. `GoogleService-Info.plist` should already exist at the repo root (it's checked in) — `app.json`
   points `ios.googleServicesFile` at it, and the native build fails without it.
4. `ios/` and `android/` are **gitignored** — they're generated, not committed. If `ios/` doesn't
   exist yet in your checkout, generate it:
   ```
   npx expo prebuild --platform ios
   ```
5. An iPhone/iPad on iOS 15+ with a passcode set, and a Mac (macOS High Sierra+) — SideStore's
   installer needs a computer once, then re-signs over Wi-Fi from then on.

## 2. One-time SideStore setup (install SideStore on the phone)

You only do this section once per phone.

1. On the Mac: download and install **`iloader`** (macOS DMG) from [sidestore.io](https://sidestore.io).
2. On the iPhone: install the **LocalDevVPN** app (App Store, or the AltStore PAL source if it's
   not in your region's store). This VPN has to be connected any time you install, update, or
   refresh an app in SideStore — and it only works over **Wi-Fi**, not cellular.
3. Connect the iPhone to the Mac with a USB cable; trust the computer and enter your passcode if
   prompted.
4. Open `iloader`, sign in with your (free) Apple ID, select the connected iPhone, and choose
   **"Install SideStore (Stable)"**.
5. On the phone: **Settings → General → VPN & Device Management** → select the entry named after
   your Apple ID → **Trust**.
6. If you're on iOS 16+: **Settings → Privacy & Security → Developer Mode** → turn it on (the
   phone will reboot and ask you to confirm).
7. Connect the LocalDevVPN toggle, then open SideStore once to finish authenticating.

## 3. Build a device `.ipa` locally with Xcode

EAS can't produce an installable build here (see the intro), so this replaces the `eas build`
step from the Android doc — you archive and export straight from Xcode using its free "Personal
Team" signing.

1. `open ios/pokerledger.xcworkspace` (not the `.xcodeproj`).
2. Xcode → **Settings → Accounts** → add your Apple ID if it isn't there already.
3. Select the `pokerledger` target → **Signing & Capabilities** → check **"Automatically manage
   signing"** → set **Team** to your name (Personal Team).
4. Set the run destination to **"Any iOS Device (arm64)"** (top toolbar, not a simulator).
5. **Product → Archive**. This builds a Release archive (may take a while the first time).
6. When the Organizer window opens: **Distribute App → Development** (this is the *only* export
   method a free account offers — no Ad Hoc or App Store, that's expected) → keep the default
   signing options → **Export** → pick a folder. You'll get `pokerledger.ipa` there.

## 4. Sideload the `.ipa`

1. Get `pokerledger.ipa` onto the phone — AirDrop from the Mac is easiest, or Files/iCloud Drive.
2. Make sure LocalDevVPN is connected (Wi-Fi).
3. Open **SideStore → My Apps → +**, pick `pokerledger.ipa` from the Files picker, and wait for
   it to sign and install.
4. First launch: if you see "Untrusted Developer", go back to **Settings → General → VPN &
   Device Management** and trust the profile, then reopen the app.

## 5. Free-account limits

- **3 active app slots**, and SideStore counts as one of them — leaves room for 2 apps like
  `pokerledger`.
- **10 distinct app IDs per week** — reinstalling the *same* app repeatedly doesn't count against
  this, but installing many different apps does.
- The signing cert expires every **7 days**; SideStore refreshes it automatically in the
  background as long as the phone gets Wi-Fi + LocalDevVPN periodically. Open SideStore
  occasionally to make sure a refresh actually ran.
- To test a new code change: repeat step 3 (Archive → Export) and step 4 (re-add the `.ipa` in
  SideStore) — optionally bump `ios.buildNumber` in `app.json` first so it's obviously a new
  build.

## 6. Troubleshooting

- **"Untrusted Developer" on first launch** — trust the profile under **Settings → General →
  VPN & Device Management**, then relaunch the app (not a build problem).
- **LocalDevVPN won't connect / install hangs** — confirm the phone is on Wi-Fi, not cellular;
  toggle the VPN off and back on.
- **Distribute App only shows "Development", no Ad Hoc/App Store** — expected with a free
  (non-paid) Apple ID; there's nothing to fix, just export Development.
- **Google Sign-In fails on the device** — check that `ios.plugins`'s
  `@react-native-google-signin/google-signin` `iosUrlScheme` in `app.json` matches the
  `REVERSED_CLIENT_ID` in `GoogleService-Info.plist`. Unlike Android, iOS Google Sign-In isn't
  tied to the signing certificate, so personal-team signing doesn't affect this.
- **Hit the 10-app/week cap** — wait for the rolling week to clear, or free up a slot by deleting
  an unused app from SideStore's My Apps.
- iOS bundle identifier for reference: `com.anmolharsh.pokerledger`.
