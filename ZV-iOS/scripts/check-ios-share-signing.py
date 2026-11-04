#!/usr/bin/env python3
"""Check a re-signed IPA/app's ReplayKit sharing entitlements on macOS."""
import argparse
import fnmatch
import plistlib
import subprocess
import tempfile
import zipfile
from pathlib import Path


def command_plist(command, description):
    result = subprocess.run(command, capture_output=True)
    if result.returncode:
        raise ValueError(description)
    try:
        return plistlib.loads(result.stdout)
    except plistlib.InvalidFileException as error:
        raise ValueError(description) from error


def check(app):
    host_info = plistlib.loads((app / 'Info.plist').read_bytes())
    extensions = list((app / 'PlugIns').glob('*.appex'))
    expected_id = host_info['CFBundleIdentifier'] + '.BroadcastUpload'
    extensions = [item for item in extensions if plistlib.loads((item / 'Info.plist').read_bytes()).get('CFBundleIdentifier') == expected_id]
    if len(extensions) != 1:
        raise ValueError('广播扩展缺失或 Bundle ID 与宿主不匹配；重签时必须保留 .BroadcastUpload 扩展。')
    group = host_info.get('ZViewerShareAppGroup', 'group.com.zviewer.mobile.broadcast')
    records = []
    for bundle in [app, extensions[0]]:
        info = plistlib.loads((bundle / 'Info.plist').read_bytes())
        signed = command_plist(['codesign', '-d', '--entitlements', ':-', str(bundle)], f'{bundle.name} 没有可读取的签名 entitlement。请传入重签后的包。')
        profile_path = bundle / 'embedded.mobileprovision'
        if not profile_path.is_file():
            raise ValueError(f'{bundle.name} 缺少安装描述文件，无法核实 App Group 授权。')
        profile = command_plist(['security', 'cms', '-D', '-i', str(profile_path)], f'{bundle.name} 描述文件无法解码。')['Entitlements']
        if info.get('ZViewerShareAppGroup', group) != group:
            raise ValueError('主程序与扩展的 ZViewerShareAppGroup 配置不同。')
        for source, entitlements in [('实际签名', signed), ('描述文件', profile)]:
            if group not in entitlements.get('com.apple.security.application-groups', []):
                raise ValueError(f'{bundle.name} 的{source}没有授权 {group}；须重新生成支持该组的描述文件并保留 entitlement。')
        team = signed.get('com.apple.developer.team-identifier')
        identity = signed.get('application-identifier', '')
        if not team or identity.split('.', 1)[-1] != info['CFBundleIdentifier']:
            raise ValueError(f'{bundle.name} 的签名 Team/应用标识不匹配。')
        if profile.get('com.apple.developer.team-identifier') != team:
            raise ValueError(f'{bundle.name} 的实际签名与描述文件 Team 不一致。')
        if not fnmatch.fnmatchcase(identity, profile.get('application-identifier', '')):
            raise ValueError(f'{bundle.name} 描述文件未授权当前应用标识。')
        keys = signed.get('keychain-access-groups', [])
        allowed_keys = profile.get('keychain-access-groups', [])
        shared = {key for key in keys if key.endswith('.com.zviewer.mobile.share')
                  and any(fnmatch.fnmatchcase(key, pattern) for pattern in allowed_keys)}
        if not shared:
            raise ValueError(f'{bundle.name} 没有获得描述文件授权的投屏共享钥匙串。')
        records.append((team, shared))
    if records[0][0] != records[1][0] or not records[0][1].intersection(records[1][1]):
        raise ValueError('主程序与广播扩展未使用同一 Team/共享钥匙串。')
    print(f'通过：主程序与广播扩展的实际签名、描述文件、{group} 和共享钥匙串一致。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path, help='Re-signed .ipa or .app, never the unsigned delivery IPA')
    args = parser.parse_args()
    try:
        if args.package.is_dir():
            check(args.package)
        else:
            with tempfile.TemporaryDirectory(prefix='zviewer-signing-') as directory:
                with zipfile.ZipFile(args.package) as archive:
                    archive.extractall(directory)
                apps = list((Path(directory) / 'Payload').glob('*.app'))
                if len(apps) != 1:
                    raise ValueError('IPA 必须包含一个 Payload 主程序。')
                check(apps[0])
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, f'投屏签名检查失败：{error}\n')
