"""Offline device IPA inspection. Does not run or sign the app."""
import argparse, hashlib, json, plistlib, struct, zipfile
from pathlib import Path

def macho(blob):
    # A real device ARM64 app must have LC_BUILD_VERSION platform IOS (2).
    # ARM64 by itself is insufficient: Apple Silicon simulators are ARM64 too.
    magic = struct.unpack_from('<I', blob)[0]
    if magic != 0xfeedfacf:
        raise ValueError('Expected a thin 64-bit Mach-O binary')
    cpu, subtype, kind, count, size, flags, reserved = struct.unpack_from('<7I', blob, 4)
    platform = None; signed = False; encrypted = False; cursor = 32
    for _ in range(count):
        command, length = struct.unpack_from('<2I', blob, cursor)
        if command == 0x32: platform = struct.unpack_from('<I', blob, cursor + 8)[0]
        if command == 0x1d: signed = True
        if command == 0x2c: encrypted = struct.unpack_from('<I', blob, cursor + 16)[0] != 0
        if length < 8 or cursor + length > len(blob): raise ValueError('Invalid load command')
        cursor += length
    return dict(arm64=cpu == 0x100000c, platform=platform, signed=signed, encrypted=encrypted)

def inspect(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        roots = {name.split('/')[1] for name in names if name.startswith('Payload/') and len(name.split('/')) > 2}
        assert len(roots) == 1, 'Expected one Payload app'
        root = 'Payload/' + roots.pop() + '/'
        info = plistlib.loads(archive.read(root + 'Info.plist'))
        binary = archive.read(root + info['CFBundleExecutable'])
        app = macho(binary)
        assert app['arm64'] and app['platform'] == 2, 'Not an iOS device executable'
        assert not app['signed'] and not app['encrypted'], 'App is signed or encrypted'
        assert root + 'embedded.mobileprovision' not in names, 'Unexpected provisioning profile'
        assert not any(name.startswith(root + '_CodeSignature/') for name in names), 'Unexpected app signature directory'
        assert archive.getinfo(root + 'main.jsbundle').file_size > 100_000, 'Missing embedded release JS'
        frameworks = sorted({name[len(root):].split('/')[1] for name in names if name.startswith(root + 'Frameworks/') and '.framework/' in name})
        assert 'VLCKit.framework' in frameworks, 'Missing sole VLC media kernel'
        bridges = {name: name.encode() in binary for name in ['ZViewerNativeModule', 'ZVBiliBridge', 'ZVVoiceCodec']}
        assert all(bridges.values()), 'Missing linked native Bilibili/voice bridge classes'
        assert info.get('NSMicrophoneUsageDescription'), 'Missing microphone permission description'
        continuation = {}
        extensions = [name for name in names if name.startswith(root + 'PlugIns/') and name.endswith('.appex/Info.plist')]
        if int(info['CFBundleVersion']) >= 34:
            assert len(extensions) == 1, 'Missing or duplicate broadcast extension'
            extension_root = extensions[0].removesuffix('Info.plist')
            extension_info = plistlib.loads(archive.read(extensions[0]))
            extension_binary = archive.read(extension_root + extension_info['CFBundleExecutable'])
            extension_macho = macho(extension_binary)
            assert extension_macho['arm64'] and extension_macho['platform'] == 2 and not extension_macho['signed'], 'Invalid broadcast extension executable'
            assert extension_info['CFBundleIdentifier'] == info['CFBundleIdentifier'] + '.BroadcastUpload', 'Broadcast identifier mismatch'
            assert extension_info['CFBundleVersion'] == info['CFBundleVersion'], 'Broadcast build mismatch'
            assert extension_info['NSExtension']['NSExtensionPointIdentifier'] == 'com.apple.broadcast-services-upload', 'Wrong broadcast extension point'
            assert extension_info['NSExtension']['RPBroadcastProcessMode'] == 'RPBroadcastProcessModeSampleBuffer'
            assert b'ZVShareSender' in extension_binary and b'SampleHandler' in extension_binary, 'Missing native broadcast sender'
            assert b'ZViewerNativeModule' not in extension_binary and b'ZVBiliBridge' not in extension_binary, 'Host runtime leaked into extension'
            assert not any(name.startswith(extension_root) and any(engine in name for engine in ('VLCKit.framework/', 'hermes.framework/', 'React.framework/', 'Bilicore.framework/')) for name in names), 'Heavy host dependencies leaked into extension'
            assert info.get('ZViewerShareKeychainGroup') == extension_info.get('ZViewerShareKeychainGroup'), 'Shared keychain group mismatch'
            assert 'screen-capture' in info.get('UIBackgroundModes', []), 'Missing modern screen capture background mode'
            continuation['screenShareExtension'] = dict(bundleId=extension_info['CFBundleIdentifier'], build=extension_info['CFBundleVersion'], **extension_macho)
        if tuple(map(int, info['CFBundleShortVersionString'].split('.'))) >= (1, 5, 0):
            assert set(info.get('UIDeviceFamily', [])) == {1, 2}, 'Missing iPhone or iPad device family'
            assert b'ZVSystemMedia' in binary and b'ZViewerVlcCommand' in binary and b'ZViewerVlcProgress' in binary, 'Missing system media integration'
            assert 'audio' in info.get('UIBackgroundModes', []), 'Missing background audio declaration'
            manifests = [name for name in names if name.startswith(root) and name.endswith('/bilicore-source-provenance.json')]
            assert len(manifests) == 1, 'Missing bundled shared source provenance'
            provenance = json.loads(archive.read(manifests[0]))
            baseline = json.loads((Path(__file__).parent / 'native-core-baseline.json').read_text(encoding='utf8'))
            assert provenance['referenceCommit'] == baseline['referenceCommit'], 'Unexpected shared Go reference'
            assert provenance['files'] == baseline['files'], 'Unexpected shared source manifest'
            source_manifest = json.loads(archive.read(manifests[0].replace('source-provenance.json', 'source-manifest.json')))
            assert provenance['files'] == source_manifest, 'Source manifests disagree'
            assert any(name.endswith('/OPUS-LICENSE') for name in names) and any(name.endswith('/BILICORE-LICENSE') for name in names), 'Missing native dependency licenses'
            continuation.update(systemMedia=True, sharedSource=provenance, deviceFamilies=info.get('UIDeviceFamily'), minimumOS=info.get('MinimumOSVersion'), interfaceStyle=info.get('UIUserInterfaceStyle'))
        if tuple(map(int, info['CFBundleShortVersionString'].split('.'))) >= (1, 7, 5):
            rtc = {name: name.encode() in binary for name in ['LivekitReactNativeModule', 'WebRTCModule', 'LiveKitExpoAppDelegate']}
            assert all(rtc.values()), 'Missing LiveKit native RTC modules or Expo startup registration'
            assert 'LiveKitWebRTC.framework' in frameworks, 'Missing LiveKit WebRTC engine'
            assert 'WebRTC.framework' not in frameworks, 'Conflicting original WebRTC engine'
            assert info.get('NSLocalNetworkUsageDescription'), 'Missing local Bilibili proxy permission description'
            continuation['livekitNative'] = rtc
            js = archive.read(root + 'main.jsbundle')
            features = {name: name.encode() in js for name in ['/api/voice/token', 'voicePermission', 'voiceSessionActive', 'adminMuted', 'search-bangumi', 'search-ft', 'cliOnly', 'epId', 'seasonId']}
            assert all(features.values()), 'Missing expected Bilibili/LiveKit release JS contracts'
            continuation['releaseContracts'] = features
        return dict(bundleId=info['CFBundleIdentifier'], version=info['CFBundleShortVersionString'], build=info['CFBundleVersion'], app=app, frameworks=frameworks, nativeBridges=bridges, jsBytes=archive.getinfo(root + 'main.jsbundle').file_size, background=info.get('UIBackgroundModes'), ats=info.get('NSAppTransportSecurity'), requiresFullScreen=info.get('UIRequiresFullScreen', False), orientations=info.get('UISupportedInterfaceOrientations'), ipadOrientations=info.get('UISupportedInterfaceOrientations~ipad'), **continuation)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ipa', type=Path)
    parser.add_argument('--skip-sha256', action='store_true', help='Reuse the SHA-256 already emitted by the build script')
    args = parser.parse_args()
    path = args.ipa; result = inspect(path)
    result['bytes'] = path.stat().st_size
    if not args.skip_sha256:
        digest = hashlib.sha256()
        with path.open('rb') as archive:
            for chunk in iter(lambda: archive.read(1024 * 1024), b''):
                digest.update(chunk)
        result['sha256'] = digest.hexdigest()
    print(json.dumps(result, indent=2, ensure_ascii=False))
