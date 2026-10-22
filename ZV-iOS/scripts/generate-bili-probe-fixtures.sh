#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
xcrun clang -fobjc-arc -framework Foundation -framework VideoToolbox -framework CoreMedia -framework CoreVideo scripts/generate-bili-probe-fixtures.m -o "$work/generate"
"$work/generate" > "$work/fixtures.json"
python3 - "$work/fixtures.json" <<'PY'
import json, sys
from pathlib import Path
fixtures=json.loads(Path(sys.argv[1]).read_text())
lines=['// Generated synthetic 30fps, 8-bit 4:2:0 SDR keyframes. No external media.', '// Regenerate with scripts/generate-bili-probe-fixtures.sh on macOS.', 'static NSArray<NSDictionary *> *ZVBiliDecoderProbeFixtures(void) {', '  return @[']
for f in fixtures:
    params=', '.join('@"'+v+'"' for v in f['parameters'])
    lines.append('    @{ @"codec": @"%s", @"width": @%d, @"height": @%d, @"fps": @30, @"parameters": @[%s], @"sample": @"%s" },' % (f['codec'], f['width'], f['height'],params,f['sample']))
lines+=['  ];','}']
Path('modules/zviewer-native/ios/ZVBiliProbeFixtures.h').write_text('\n'.join(lines)+'\n')
print(len(fixtures),'owned fixtures generated')
PY
