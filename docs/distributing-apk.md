# Sharing a built APK with testers

This covers handing testers a working app with **no dev server involved** — they install an
APK, sign in, and use the app. Nobody needs to run `expo start`, keep a laptop connected, or run
any command after install. (For the day-to-day dev-loop workflow — running the app during
active development — see `docs/testing-android.md` instead.)

## For the tester

1. Open the `.apk` link/QR code you were sent, download it, and install it (Android will ask to
   allow "install unknown apps" for whatever app you downloaded it through — allow that once).
2. Open the app and sign in with the Google account you were added as a test user with.
3. That's it — nothing else to install or run.

If sign-in fails: make sure you're using the exact Google account that was added as a test
user (see the note on test users below), and that you have a network connection.

## For the maintainer — building the shareable APK

```
npx eas build --profile preview --platform android
```

This builds in the cloud with `eas.json`'s `preview` profile — `distribution: internal`,
`android.buildType: "apk"` (a plain installable APK, not the `.aab` app-bundle format the
`production` profile produces), and no `developmentClient` — so the JS bundle is baked into the
APK at build time, not fetched from Metro at runtime.

When it finishes, the CLI prints a download link and QR code (also emailed) — share either one.

### One-time setup this required

`eas.json`'s `preview` and `production` profiles now carry an `env` block with the app's
Firebase config and Google web client ID, so the *cloud* build has them available at bundle
time (a local `.env` file — which is how `expo start`/`expo run:android` get these — isn't
visible to an EAS cloud build otherwise). These values are safe to commit: they're client-side
config, not secrets — actual access is governed by `firestore.rules`, and the Google web client
ID doesn't need to be kept private either.

## SHA-1 fingerprints — why they matter, and verifying yours

Every APK is signed with a certificate (a keystore). Google Sign-In checks two things together
to trust a caller: the package name (`com.anmolharsh.pokerledger`) **and** the SHA-1 hash of the
certificate that signed that specific APK. This stops someone else from repackaging the app
under the same name to intercept sign-in tokens — so **every keystore that will ever sign a
build you hand out has to have its SHA-1 registered** with the Firebase/Google Cloud project, or
sign-in fails for that build (typically a `DEVELOPER_ERROR`).

`google-services.json` currently registers two Android SHA-1s. One is confirmed to match the
standard React Native debug keystore (`android/app/debug.keystore`) — that's why local
`expo run:android` debug builds already sign in fine. The other is unverified — it needs to
match whichever keystore EAS actually signs the `preview` build with.

**Before your first distributed build**, confirm this once:
```
npx eas credentials
```
(Android → your project → view credentials, note the SHA-1 shown.) Compare it to the two
entries in `google-services.json`. If it doesn't match either:
1. Firebase console → Project settings → your Android app → **Add fingerprint**, paste the
   SHA-1 `eas credentials` showed you.
2. Re-download `google-services.json` from Firebase console and replace the one in the repo.
3. Re-run the build.

## Test users note

The Google OAuth consent screen is currently in "Testing" status, so only the test users you've
already added can sign in — and their sign-in sessions typically need re-authentication roughly
every 7 days (a Google restriction on unpublished consent screens, not a bug in this app).

## USB alternative (no APK file needed, no Metro either)

If you have the tester's phone physically connected via USB instead:
```
npm run android:release
```
Builds and installs a release-variant build directly — signed with the same debug keystore
that's already registered, so sign-in works with no extra credential setup. Once installed, the
app runs standalone; you can disconnect the phone and close Metro.
