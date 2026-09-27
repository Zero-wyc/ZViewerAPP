# Development

The shared frontend lives in `src/`, native adapters in `src/platform/`, and
Android's host in `ZV-Android/`. Keep Capacitor imports inside the platform
boundary. iOS and HarmonyOS retain independent host directories.

Install Node 24, Go 1.26.8, JDK 21, Android SDK 36 and NDK r30. Configure
`ANDROID_HOME`, `ANDROID_NDK_HOME` and `JAVA_HOME` for your machine. Run:

```sh
npm ci
npm test
npm run test:native
npm run test:e2e
npm run android:sync
cd ZV-Android
./gradlew assembleDebug
```

On Windows use `gradlew.bat`. Browser regressions require Google Chrome.
The native AAR is generated automatically by Gradle; do not commit it.
Debug uses package `com.zviewer.mobile.debug`, so it can coexist with release.

For connected Android validation, start the debug app, connect adb, and run
`npm run test:android:bilibili`. Set `ADB` and `ANDROID_SERIAL` if necessary.
This checks the real native bridge, loopback health and synthetic 1080p/720p
video plus AAC playback/seek in the app's WebView. It does not substitute for
real Bilibili login, membership, CDN or device-specific playback tests.

On a fresh debug installation, `./gradlew :app:connectedDebugAndroidTest`
also validates Keystore encryption and loopback lifecycle. Target `:app:`
explicitly; Capacitor's generated Cordova library has unrelated test dependencies.
The Keystore test refuses to overwrite an existing saved account.

Synthetic media fixtures are checked in; `scripts/generate-bilibili-fixtures.mjs`
regenerates them with FFmpeg if needed. Do not commit build outputs, test reports,
SDK paths, signing keys, account cookies or user recordings. Preserve upstream
licenses and record changes to the embedded Go fork and media library.
