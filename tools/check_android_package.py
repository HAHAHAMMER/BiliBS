#!/usr/bin/env python3
"""Verify signing, TV launcher declaration and the installed WebView payload."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile
from build_android import ROOT, MAIN, program, jdk_program
from build_ui import assemble


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    parser.add_argument('--apk', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--debuggable', action='store_true')
    args = parser.parse_args()
    if not args.sdk:
        parser.error('Set ANDROID_HOME or pass --sdk.')
    bt = Path(args.sdk) / 'build-tools/35.0.0'
    def capture(*cmd):
        return subprocess.check_output([str(part) for part in cmd], text=True)
    badge = capture(program(bt, 'aapt2'), 'dump', 'badging', args.apk)
    signed = capture(jdk_program('java'), '-jar', bt / 'lib/apksigner.jar',
                     'verify', '--verbose', '--print-certs', args.apk)
    capture(program(bt, 'zipalign'), '-c', '4', args.apk)
    checks = {
        'tvLauncher': "leanback-launchable-activity: name='tv.bilibs.app.TvActivity'" in badge,
        'leanbackRequired': "uses-feature: name='android.software.leanback'" in badge,
        'touchscreenOptional': "uses-feature-not-required: name='android.hardware.touchscreen'" in badge,
        'api26To35': "minSdkVersion:'26'" in badge and "targetSdkVersion:'35'" in badge,
        'internetOnly': re.findall(r"uses-permission: name='([^']+)'", badge) == ['android.permission.INTERNET'],
        'debuggableMatchesBuild': ('application-debuggable' in badge) == args.debuggable,
        'tvBanner': "banner='res/drawable-nodpi-v4/tv_banner.png'" in badge,
        'v2Signature': 'Verified using v2 scheme (APK Signature Scheme v2): true' in signed,
        'v3Signature': 'Verified using v3 scheme (APK Signature Scheme v3): true' in signed,
        'zipAligned': True,
    }
    sources = [('index.html', ROOT / 'index.html')]
    for folder in ('src', 'assets'):
        for item in sorted((ROOT / folder).rglob('*')):
            if (item.is_file() and item.suffix != '.map' and
                    not {'node_modules', '__pycache__'}.intersection(item.parts)):
                sources.append((item.relative_to(ROOT).as_posix(), item))
    for item in (MAIN / 'assets').rglob('*'):
        if item.is_file():
            sources.append((item.relative_to(MAIN / 'assets').as_posix(), item))
    verified = {}
    with zipfile.ZipFile(args.apk) as archive:
        checks['dex'] = archive.read('classes.dex')[:4] == b'dex\n'
        for name, item in sources:
            expected = assemble().encode() if name == 'src/runtime.js' else item.read_bytes()
            actual = archive.read('assets/' + name)
            verified[name] = {'bytes': len(actual), 'sha256': digest(actual), 'sourceMatch': expected == actual}
        checks['payloadMatchesSources'] = all(item['sourceMatch'] for item in verified.values())
    report = {'apkSha256': digest(args.apk.read_bytes()), 'apkBytes': args.apk.stat().st_size,
              'package': 'tv.bilibs.app', 'debuggable': args.debuggable,
              'certificateSha256': re.search(r'certificate SHA-256 digest: ([0-9a-f]+)', signed).group(1),
              'checks': checks, 'assets': verified, 'pass': all(checks.values())}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(checks, indent=2))
    if not report['pass']:
        raise SystemExit('APK verification failed')


if __name__ == '__main__':
    main()
