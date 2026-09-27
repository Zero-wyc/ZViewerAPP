# ZViewer mobile porting guide

The React application is the shared product. Native projects are hosts that package
`dist/` and implement a small platform contract. Do not fork application features by
copying `src/` into separate Android, iOS, and HarmonyOS repositories.

## Shared and native ownership

Shared across every client:

- `src/`: login, rooms, Socket.IO, playback, chat, danmaku, subtitles, music, voice
- `public/`: bundled web assets and workers
- `vendor/`: patched media dependencies
- `tests/`: unit and browser regression coverage
- Vite and TypeScript configuration

Owned by each native host:

- Android: `ZV-Android/` and its Java plugins
- iOS: the future `ZV-iOS/` Xcode project and Swift plugins
- HarmonyOS: `ZV-HarmonyOS/`, an ArkTS/ArkWeb shell that packages `dist/`

All native access from shared code goes through `src/platform/`. The
`platform-boundary` unit test prevents direct Capacitor imports elsewhere.

## iOS host contract

Install the iOS package at the same version as Capacitor core, add the platform on a
Mac. Capacitor is configured to create the native project in `ZV-iOS/`:

```sh
npm install @capacitor/ios@8.5.2
npx cap add ios
npm run build
npx cap sync ios
```

Implement a Swift Capacitor plugin named `PlayerDisplay` with these methods:

- `toggleOrientation()`
- `setImmersive({ enabled })`
- `unlockOrientation()`

The shared caller does not need to change. Add an iOS audio adapter in
`src/platform/audioRouting.ts` only if AVAudioSession behavior requires native
control. Microphone capture continues through `permissions.requestMicrophoneStream`;
the Xcode project must provide the usage description and WKWebView permission setup.

## HarmonyOS host contract

Package the same `dist/` in an ArkWeb component. Expose a JavaScriptProxy named
`zviewerNative` with `platform: 'harmony'`. Its optional methods are documented by
`HarmonyNativeBridge` in `src/platform/contracts.ts`:

- `toggleOrientation()`
- `setImmersive(enabled)`
- `unlockOrientation()`
- `setMediaPlaybackPreferred(enabled)`
- `minimizeApp()`
- `requestMicrophonePermission()`

When the system back action should be offered to the page, evaluate:

```js
window.dispatchEvent(new Event('zviewer:native-back'))
```

Keep server protocol and UI behavior in React. Add ArkTS code only for platform
permissions, lifecycle, display, audio session behavior, and capabilities ArkWeb
cannot provide.

## Change workflow

1. Implement product behavior once in shared TypeScript.
2. Extend a contract in `src/platform/contracts.ts` only for a real native need.
3. Implement that contract per host; unsupported optional capabilities degrade safely.
4. Run `npm test`, `npm run build`, and `npm run test:e2e` before syncing native assets.
5. Test media, microphone, rotation, backgrounding, and safe areas on real devices.
