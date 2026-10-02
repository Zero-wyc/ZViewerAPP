# ZViewer mobile porting guide

The repository root contains the React/Vite client used by the Capacitor Android
host and the completed HarmonyOS ArkWeb host. `ZV-iOS/` is a separate Expo/React
Native project that is still receiving product features.

## Shared and native ownership

Shared by the existing Vite client and its native hosts:

- `src/`: login, rooms, Socket.IO, playback, chat, danmaku, subtitles, music, voice
- `public/`: bundled web assets and workers
- `vendor/`: patched media dependencies
- `docs/`: platform maintenance notes and release records
- Vite and TypeScript configuration

Owned by each native host:

- Android: `ZV-Android/` and its Java plugins
- iOS: `ZV-iOS/`, a separate Expo/React Native project
- HarmonyOS: `ZV-HarmonyOS/`, an ArkTS/ArkWeb shell that packages `dist/`

Native access from the Vite client goes through `src/platform/`. The
Keep direct Capacitor imports within `src/platform/`; verify this boundary
when reviewing shared code and before building both native packages.

## iOS project

`ZV-iOS/` is an Expo/React Native project. Run `npm start` from that directory
to start development. It now implements server login, room navigation, chat and
basic single-track video playback; the remaining product features still require
native iOS implementations and device tests. See `ZV-iOS/README.md` and
`docs/ios-windows-acceptance.md`. Do not run `cap add ios` or `cap sync ios`
against `ZV-iOS/`.

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
4. Run `npm run build` before syncing native assets, then perform the platform's device acceptance checklist.
5. Test media, microphone, rotation, backgrounding, and safe areas on real devices.
