#!/usr/bin/env bash
set -euo pipefail
# Runs only on the EAS macOS worker. CNG owns ios/, no local generated project.
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
for symbol in ZViewerNativeModule ZVBiliBridge ZVVoiceCodec; do
  strings "$app/ZViewer" | grep "$symbol" > /dev/null || { echo "Missing native bridge: $symbol"; exit 1; }
done
# Prevent a simulator archive from being presented as a device IPA.
xcrun vtool -show-build "$app/ZViewer" | grep -q 'platform IOS$'
xcrun lipo -archs "$app/ZViewer" | grep -q 'arm64'
test ! -f "$app/embedded.mobileprovision"
if codesign -dv "$app" > /dev/null 2>&1; then
  echo 'Unexpected app signature in unsigned device build.' >&2
  exit 1
fi
mkdir -p ios/build/unsigned-package/Payload
cp -R "$app" ios/build/unsigned-package/Payload/
(cd ios/build/unsigned-package && zip -qry ../ZViewer-unsigned.ipa Payload)
shasum -a 256 ios/build/ZViewer-unsigned.ipa
