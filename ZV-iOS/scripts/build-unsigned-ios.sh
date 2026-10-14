#!/usr/bin/env bash
set -euo pipefail
# Runs on a local Mac or EAS macOS worker. CNG owns the generated ios/ project.
cd "$(cd "$(dirname "$0")/.." && pwd)"
node scripts/stage-native-core.cjs --verify-only
node scripts/patch-vlc-native.cjs --check
python3 - <<'PY'
import plistlib
from pathlib import Path
p = Path('modules/zviewer-native/ios/Vendor/Bilicore.xcframework/Info.plist')
libs = plistlib.loads(p.read_bytes())['AvailableLibraries']
assert libs and all(x.get('SupportedPlatform') == 'ios' and not x.get('SupportedPlatformVariant') for x in libs), 'Prepare device Bilicore before building an IPA; simulator slices are not valid.'
PY
mkdir -p ios/build
xcodebuild -workspace ios/ZViewer.xcworkspace -scheme ZViewer \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath ios/build/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  build > ios/build/unsigned-xcode.log 2>&1 || {
    tail -n 100 ios/build/unsigned-xcode.log
    exit 1
  }
app='ios/build/DerivedData/Build/Products/Release-iphoneos/ZViewer.app'
test -d "$app"
test -s "$app/main.jsbundle"
# Require the actual bridge classes in the app, not merely a successful build
# of generated vendor libraries that never entered the CocoaPods graph.
node scripts/verify-ios-native-symbols.cjs "$app"
grep -q 'livekit-react-native (3.0.0)' ios/Podfile.lock
grep -q 'livekit-react-native-webrtc (144.2.0)' ios/Podfile.lock
grep -q 'LiveKitWebRTC (144.7559.15)' ios/Podfile.lock
if grep -Eq '^  - react-native-webrtc[ /(:]' ios/Podfile.lock; then
  echo 'Conflicting non-LiveKit WebRTC pod.' >&2
  exit 1
fi
# Prevent a simulator archive from being presented as a device IPA.
xcrun vtool -show-build "$app/ZViewer" | grep -q 'platform IOS$'
xcrun lipo -archs "$app/ZViewer" | grep -q 'arm64'
test ! -f "$app/embedded.mobileprovision"
if codesign -dv "$app" > /dev/null 2>&1; then
  echo 'Unexpected app signature in unsigned device build.' >&2
  exit 1
fi
rm -rf ios/build/unsigned-package
rm -f ios/build/ZViewer-unsigned.ipa
mkdir -p ios/build/unsigned-package/Payload
cp -R "$app" ios/build/unsigned-package/Payload/
(cd ios/build/unsigned-package && zip -qry ../ZViewer-unsigned.ipa Payload)
shasum -a 256 ios/build/ZViewer-unsigned.ipa
