# Running LeetSwipe on your phone

LeetSwipe is an Expo (React Native) app, so it runs on iOS and Android from the
same codebase. There are three ways to get it on a phone, from fastest to
most "real".

## 1. Instant test — Expo Go (no build, ~2 min)
Best for quick iteration on your own phone.

```bash
cd LeetSwipe
npm install
npx expo start
```

- Install **Expo Go** from the App Store / Play Store.
- Scan the QR code in the terminal (iOS: Camera app; Android: Expo Go's scanner).
- The app hot-reloads as you edit. Phone and computer must be on the same
  network (or add `--tunnel`).

## 2. Real installable app — EAS Build
Builds an actual native binary you can install and keep on your phone. Needs a
free **Expo account** (`npx expo login`). `eas.json` is already configured.

```bash
npm install -g eas-cli
eas login
eas build:configure   # first time only

# Android — produces an .apk you can download + sideload, no paid account:
eas build --platform android --profile preview

# iOS — installable build (see TestFlight note below):
eas build --platform ios --profile preview
```

When the build finishes, EAS gives you a URL. On Android, open it on your phone
and install the APK directly. This is the easiest way to "have it on my phone
to test before the App Store".

## 3. App Store / TestFlight (production)
- **iOS:** requires an **Apple Developer account** ($99/yr). Then:
  ```bash
  eas build --platform ios --profile production
  eas submit --platform ios          # uploads to App Store Connect → TestFlight
  ```
  Testers install via the TestFlight app.
- **Android:** requires a one-time **$25** Google Play Developer account, then
  `eas submit --platform android` for internal testing / Play Store.

## Notes
- `ios.bundleIdentifier` / `android.package` are set to `com.vishnualachi.leetswipe`
  in `app.json` — change these if you want a different id.
- The **web build** (what's deployed at
  https://vishnu-alachi123.github.io/Leetswipe/) already works in a phone
  browser today; the native builds above are for a real installable app.
- Question data: the app ships a bundled deck (`assets/data/questions.json`).
  Set `EXPO_PUBLIC_QUESTIONS_URL` to serve live generated questions from an API.
