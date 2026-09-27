# Platform boundary

Code outside this directory must not import Capacitor or call a native bridge directly.
UI and business modules use the ports exported here, while each host implements only
the capabilities it needs.

## Capacitor hosts

Android and iOS register plugins with these stable names:

- `PlayerDisplay`: `toggleOrientation`, `setImmersive`, `unlockOrientation`
- `AudioRouting`: `setMediaOnly` (currently Android only)

The Android implementations live under `ZV-Android/`. The future iOS target should use
the same plugin names and method signatures in Swift.

## HarmonyOS host

ArkWeb exposes a JavaScript proxy named `zviewerNative` with `platform: 'harmony'`.
It may implement the methods declared by `HarmonyNativeBridge` in `contracts.ts`.
For a native back action, the ArkTS host dispatches this event into the page:

```js
window.dispatchEvent(new Event('zviewer:native-back'))
```

Missing optional methods degrade to web behavior or a no-op. Media and microphone
capture remain web APIs; the Harmony bridge only handles the native permission gate.
