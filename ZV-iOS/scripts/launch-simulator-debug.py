#!/usr/bin/env python3
"""Install and launch a local Debug build with a private test session."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--session-file', type=Path, required=True, help='Private JSON with server/serverUrl, accessToken, refreshToken, user; never commit it')
parser.add_argument('--room-id', required=True)
parser.add_argument('--device', default='booted')
parser.add_argument('--metro-url', default='http://127.0.0.1:8081')
parser.add_argument('--native-log', type=Path, help='Optional private native stdout/stderr log; may contain media URLs')
parser.add_argument('--app-path', type=Path, help='Debug simulator app produced by Xcode or XcodeBuildMCP')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
app = args.app_path or root / '.native-tools/DerivedData/Build/Products/Debug-iphonesimulator/ZViewer.app'
if not app.is_dir():
    parser.error('Build the simulator Debug app first with scripts/build-ios-simulator.sh')
try:
    with urlopen(args.metro_url.rstrip('/') + '/status', timeout=5) as response:
        if response.read(256) != b'packager-status:running':
            parser.error('Metro is not ready; start expo start --dev-client --localhost --port 8081 first')
except OSError:
    parser.error('Metro is unreachable; start expo start --dev-client --localhost --port 8081 first')
raw = json.loads(args.session_file.read_text())
session = {key: raw[key] for key in ('accessToken', 'user')}
session['refreshToken'] = raw.get('refreshToken', '')
session['serverUrl'] = raw.get('serverUrl') or raw['server']
env = dict(os.environ)
env['SIMCTL_CHILD_ZVIEWER_DEBUG_CONFIGURATION'] = json.dumps({'session': session, 'roomId': args.room_id})
subprocess.run(['xcrun', 'simctl', 'install', args.device, str(app)], check=True)
launch = ['xcrun', 'simctl', 'launch', '--terminate-running-process']
if args.native_log:
    log = args.native_log.expanduser().resolve()
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('a'):
        os.chmod(log, 0o600)
    launch += [f'--stdout={log}', f'--stderr={log}']
subprocess.run(launch + [args.device, 'com.zviewer.mobile', '--initialUrl', args.metro_url], env=env, check=True)
print('Simulator launched with a local Debug session; no credentials were printed.')
