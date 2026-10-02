# Development

The shared frontend lives in `src/`, native adapters in `src/platform/`, and
Android's host in `ZV-Android/`. Keep Capacitor imports inside the platform
boundary. iOS and HarmonyOS retain independent host directories.

Install Node 24, Go 1.26.8, JDK 21, Android SDK 36 and NDK r30. Configure
`ANDROID_HOME`, `ANDROID_NDK_HOME` and `JAVA_HOME` for your machine. Run:

```sh
npm ci
npm run android:sync
cd ZV-Android
./gradlew assembleDebug
```

On Windows use `gradlew.bat`.
The native AAR is generated automatically by Gradle; do not commit it.
Debug uses package `com.zviewer.mobile.debug`, so it can coexist with release.

Use the Android and HarmonyOS device acceptance checklists in `docs/` for native
verification. Do not commit build outputs,
SDK paths, signing keys, account cookies or user recordings. Preserve upstream
licenses and record changes to the embedded Go fork and media library.
