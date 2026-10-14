#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
test "$(uname -s)" = Darwin || { echo 'Requires macOS.' >&2; exit 1; }
node scripts/stage-native-core.cjs --verify-only
node scripts/patch-vlc-native.cjs --check
python3 - <<'PY'
import plistlib
from pathlib import Path
p = Path('modules/zviewer-native/ios/Vendor/Bilicore.xcframework/Info.plist')
libraries = plistlib.loads(p.read_bytes())['AvailableLibraries']
assert libraries and all(lib.get('SupportedPlatformVariant') == 'simulator' for lib in libraries), 'Prepare simulator Vendor libraries first; device ARM64 cannot be linked.'
PY
test -d ios/ZViewer.xcworkspace || { echo 'Generate the iOS project and install Pods first.' >&2; exit 1; }
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
xcodebuild -workspace ios/ZViewer.xcworkspace -scheme ZViewer -configuration Debug \
  -sdk iphonesimulator -destination "${ZVIEWER_SIMULATOR_DESTINATION:-generic/platform=iOS Simulator}" \
  -derivedDataPath .native-tools/DerivedData -jobs 4 CODE_SIGNING_ALLOWED=NO ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES "$@" build
