#!/usr/bin/env bash
set -euo pipefail
# Simulator-only helper; retain the locked source and download integrity checks.
# Generated Vendor output is simulator-only. Run from any working directory.
cd "$(cd "$(dirname "$0")/.." && pwd)"
test "$(uname -s)" = Darwin || { echo 'Requires macOS.' >&2; exit 1; }
command -v python3 >/dev/null
case "$(uname -m)" in
  arm64) sim_arch=arm64; sim_host=aarch64-apple-darwin; sim_clang_target=arm64-apple-ios16.4-simulator ;;
  x86_64) sim_arch=amd64; sim_host=x86_64-apple-darwin; sim_clang_target=x86_64-apple-ios16.4-simulator ;;
  *) echo 'Unsupported host architecture.' >&2; exit 1 ;;
esac
node scripts/stage-native-core.cjs
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
  # Explicit opt-in for a locally installed toolchain of the exact pinned version.
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
gomobile bind -target=iossimulator/$sim_arch -iosversion=16.4 -trimpath -ldflags="-s -w" -o "$vendor/Bilicore.xcframework" ./mobile
cd "$work"
curl --fail --location --retry 3 --max-time 300 https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz -o opus.tar.gz
echo '6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1  opus.tar.gz' | shasum -a 256 --check
tar -xzf opus.tar.gz
cd opus-1.6.1
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
export CC="$(xcrun --sdk iphonesimulator --find clang)" AR="$(xcrun --sdk iphonesimulator --find ar)" RANLIB="$(xcrun --sdk iphonesimulator --find ranlib)"
export CFLAGS="-target $sim_clang_target -isysroot $sdk -O2"
export LDFLAGS="-target $sim_clang_target -isysroot $sdk"
export CPPFLAGS=""
export SDKROOT="$sdk"
unset IPHONEOS_DEPLOYMENT_TARGET MACOSX_DEPLOYMENT_TARGET || true
./configure --host="$sim_host" --disable-shared --enable-static --disable-extra-programs --disable-doc --disable-intrinsics --disable-asm
make -j4
cp .libs/libopus.a "$vendor/libopus.a"
cp include/opus*.h "$vendor/opus/"
cp COPYING "$vendor/OPUS-LICENSE"
cp "$root/.native-staging/bilicore/UPSTREAM-LICENSE" "$vendor/BILICORE-LICENSE"
cp "$root/.native-staging/bilicore/source-manifest.json" "$vendor/bilicore-source-manifest.json"
cp "$root/.native-staging/bilicore/source-provenance.json" "$vendor/bilicore-source-provenance.json"
echo 'Prepared iOS Simulator Bilicore and Opus libraries.'
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

cd "$root"
python3 - <<'PY'
import plistlib
from pathlib import Path
p = Path('modules/zviewer-native/ios/Vendor/Bilicore.xcframework/Info.plist')
libs = plistlib.loads(p.read_bytes())['AvailableLibraries']
assert libs and all(x.get('SupportedPlatform') == 'ios' and x.get('SupportedPlatformVariant') == 'simulator' for x in libs), 'Expected simulator-only Bilicore slices'
print('Bilicore simulator platform metadata verified.')
PY
xcrun lipo -archs modules/zviewer-native/ios/Vendor/libopus.a
echo 'Simulator dependencies prepared; this output must not be used for a device IPA.'
