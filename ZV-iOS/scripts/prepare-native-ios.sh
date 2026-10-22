#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
test "$(uname -s)" = Darwin || { echo 'Requires macOS.' >&2; exit 1; }
mkdir -p .native-tools
xcrun clang -fobjc-arc -framework Foundation \
  -I modules/zviewer-native/ios modules/zviewer-native/ios/ZVBiliSigning.m \
  scripts/bili-signing-smoke.m -o .native-tools/bili-signing-smoke
.native-tools/bili-signing-smoke
root="$PWD"
vendor="$root/modules/zviewer-native/ios/Vendor"
work="$root/.native-tools"
mkdir -p "$vendor/opus" "$work"
test -f "$root/.native-staging/bilicore/mobile/mobile.go" || { echo 'Run node scripts/stage-native-core.cjs before uploading.'; exit 1; }
case "$(uname -m)" in
  arm64) arch=arm64; hash=ee215d57e0ec269c60cc9ceca68e6bda321ba9ee5afe24f4b0988703c2d87d12 ;;
  x86_64) arch=amd64; hash=8f8f52c6649542cf027bbc9b9c68d1ec042f9f34808a40413f0b8b3f66f3caa4 ;;
  *) echo 'Unsupported macOS architecture'; exit 1 ;;
esac
if [ "${ZVIEWER_USE_SYSTEM_GO:-0}" = 1 ]; then
  # Match the Simulator helper's explicit, exact-version local toolchain path.
  test "$(go version | awk '{print $3}')" = go1.27.1 || { echo 'System Go must be exactly 1.27.1.' >&2; exit 1; }
  toolchain_root="$(go env GOROOT)"
  echo 'Using explicitly selected local Go 1.27.1 toolchain.'
else
  if ! test -f "$work/go.tar.gz"; then
    curl --fail --location --retry 3 --max-time 300 "${ZVIEWER_GO_DOWNLOAD_BASE:-https://go.dev/dl}/go1.27.1.darwin-$arch.tar.gz" -o "$work/go.tar.gz"
  fi
  echo "$hash  $work/go.tar.gz" | shasum -a 256 --check
  tar -xzf "$work/go.tar.gz" -C "$work"
  toolchain_root="$work/go"
fi
export PATH="$toolchain_root/bin:$work/bin:$PATH" GOBIN="$work/bin"
cd "$root/.native-staging/bilicore"
go install golang.org/x/mobile/cmd/gomobile golang.org/x/mobile/cmd/gobind
gomobile init
gomobile bind -target=ios/arm64 -iosversion=16.4 -trimpath -ldflags="-s -w" -o "$vendor/Bilicore.xcframework" ./mobile
cd "$work"
curl --fail --location --retry 3 --max-time 300 https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz -o opus.tar.gz
echo '6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1  opus.tar.gz' | shasum -a 256 --check
mkdir -p "$work/opus-device"
tar -xzf opus.tar.gz -C "$work/opus-device"
cd "$work/opus-device/opus-1.6.1"
sdk="$(xcrun --sdk iphoneos --show-sdk-path)"
export CC="$(xcrun --sdk iphoneos --find clang)" AR="$(xcrun --sdk iphoneos --find ar)" RANLIB="$(xcrun --sdk iphoneos --find ranlib)"
export CFLAGS="-arch arm64 -isysroot $sdk -miphoneos-version-min=16.4 -O2"
export LDFLAGS="-arch arm64 -isysroot $sdk -miphoneos-version-min=16.4"
export SDKROOT="$sdk" CPPFLAGS=""
unset MACOSX_DEPLOYMENT_TARGET IPHONEOS_DEPLOYMENT_TARGET || true
./configure --host=aarch64-apple-darwin --disable-shared --enable-static --disable-extra-programs --disable-doc --disable-intrinsics --disable-asm
make -j4
cp .libs/libopus.a "$vendor/libopus.a"
cp include/opus*.h "$vendor/opus/"
cp COPYING "$vendor/OPUS-LICENSE"
cp "$root/.native-staging/bilicore/UPSTREAM-LICENSE" "$vendor/BILICORE-LICENSE"
cp "$root/.native-staging/bilicore/source-manifest.json" "$vendor/bilicore-source-manifest.json"
cp "$root/.native-staging/bilicore/source-provenance.json" "$vendor/bilicore-source-provenance.json"
echo 'Prepared device ARM64 Bilicore and Opus libraries.'
mkdir -p "$work/opus-host"
tar -xzf "$work/opus.tar.gz" -C "$work/opus-host"
cd "$work/opus-host/opus-1.6.1"
export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
unset IPHONEOS_DEPLOYMENT_TARGET
export MACOSX_DEPLOYMENT_TARGET=13.0
export CC="$(xcrun --sdk macosx --find clang)" AR="$(xcrun --sdk macosx --find ar)" RANLIB="$(xcrun --sdk macosx --find ranlib)" CFLAGS="-O2 -isysroot $SDKROOT -mmacosx-version-min=13.0" LDFLAGS="-isysroot $SDKROOT -mmacosx-version-min=13.0" CPPFLAGS=""
./configure --disable-shared --enable-static --disable-extra-programs --disable-doc --disable-intrinsics --disable-asm
make -j4
"$CC" -isysroot "$SDKROOT" -mmacosx-version-min=13.0 -I"$work/opus-1.6.1/include" "$root/scripts/opus-smoke.c" .libs/libopus.a -lm -o opus-smoke
./opus-smoke
