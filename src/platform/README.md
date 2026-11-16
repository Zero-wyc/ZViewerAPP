# Platform boundary

Android and HarmonyOS share the React Web UI and business code in `src/mobile`
and `src/upstream`. This directory defines their capability contracts, runtime
detection and host adapters. Keep new Capacitor imports and native bridge calls
here; the existing direct Capacitor import in `src/mobile/useAppVisibility.ts`
is a known boundary exception to migrate during lifecycle work.

## Android

`runtime.ts` selects Capacitor plugins registered by `MainActivity.java` under
`ZV-Android/app/src/main/java/com/zviewer/mobile/`. Plugins handle server
connections, Bilibili Go integration, MediaProjection/WebRTC, media sessions,
audio routing, display and external links. Android builds target ARM64 only.

## HarmonyOS

`ZV-HarmonyOS/scripts/sync-web.mjs` copies the same Vite output and injects
`bridge-bootstrap.js`. Its `zviewerNative` adapter sends requests through
`zviewerHost.request` to `Index.ets` and ArkTS services. Update `contracts.ts`,
bootstrap, host dispatch and service together when changing a bridge contract.

Screen sharing uses ArkWeb `getDisplayMedia` / `RTCPeerConnection` plus native
permission and capture policy. Bilibili resolving and proxying use ArkTS; this
host does not package the Android Go AAR or its native WebRTC library.

Native back dispatches `zviewer:native-back`. Optional capabilities can degrade
to Web behavior, but required operations must surface errors. Preserve request
cancellation, event teardown, permission gates and orientation restoration.
`toggleOrientation({ isLandscape })` requests the specified direction, rather
than toggling it; fullscreen follows actual decoded video dimensions.

## iOS

The shipping `ZV-iOS` application uses React Native / Expo, its own UI and Expo
native modules. The historical Capacitor `ios` runtime branch here is not its
implementation. Share platform-independent DTOs, state machines and protocol
tests incrementally; DOM/CSS components and native media backends remain separate.
The iOS Go source baseline requires review before the next native build.

See the [Android architecture and package audit](../../docs/android-maintenance-architecture.md),
[HarmonyOS guide](../../docs/harmonyos-maintenance-architecture.md) and
[iOS guide](../../docs/ios-maintenance-architecture.md) for current boundaries.
