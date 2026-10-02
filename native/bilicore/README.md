# Embedded Bilibili core

`core/resolver.go`, `core/wbi.go` and `core/bilibili.go` derive from
[Zero-wyc/ZViewerCLI](https://github.com/Zero-wyc/ZViewerCLI), local 4.1.2 snapshot.
The original MIT license is retained in `UPSTREAM-LICENSE`.

The embedded fork changes the package, suppresses signed URL logging, limits
API retries, adds standard-track/capability selection, reports actual selected
track IDs, and adds cancellable playurl requests. The mobile facade owns a
loopback listener with a random path capability, validates issued CDN targets,
supports Range/HEAD and fallback CDN requests, and closes streams on cancellation.
Fallback candidates are deduplicated and prefer ordinary CDN mirrors over edge
and mcdn nodes. Issued mountaintoys HTTPS URLs may use port 4483; other nonstandard
ports remain blocked. Account cookies are never sent to media CDNs.
It has no server registration, command-line launcher or desktop config file.

Android's Capacitor plugin stores login cookies with Android Keystore AES-GCM
in `noBackupFilesDir`. Cookie-bearing QR poll results only cross the Go/Java
boundary; the plugin removes cookies before responding to JavaScript.

Requirements: Go 1.26.8+, Node 24, JDK 21, Android SDK 36 and NDK r30.
Set `ANDROID_HOME` and `ANDROID_NDK_HOME` for a nonstandard NDK location.

```sh
npm run native:android
npm run android:sync
```

Gradle's `preBuild` rebuilds `app/libs/bilicore.aar` when native sources change.
The AAR and its generated source JAR are ignored; fresh clones build them from
the checked-in Go sources and pinned generator dependencies. The first build
needs network access to fetch Go modules. Android ABIs: arm64-v8a and x86_64.
32-bit-only Android devices are outside this initial adaptation.
