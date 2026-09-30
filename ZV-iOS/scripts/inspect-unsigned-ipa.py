"""Offline device IPA inspection. Does not run or sign the app."""
import hashlib, json, plistlib, struct, sys, zipfile
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
        return dict(bundleId=info['CFBundleIdentifier'], version=info['CFBundleShortVersionString'], build=info['CFBundleVersion'], app=app, frameworks=frameworks, nativeBridges=bridges, jsBytes=archive.getinfo(root + 'main.jsbundle').file_size, background=info.get('UIBackgroundModes'), ats=info.get('NSAppTransportSecurity'))

if __name__ == '__main__':
    path = Path(sys.argv[1]); result = inspect(path)
    result['bytes'] = path.stat().st_size; result['sha256'] = hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
    print(json.dumps(result, indent=2, ensure_ascii=False))
