#!/usr/bin/env python3
"""Build a signed Android TV APK using the Android SDK and JDK, without Maven."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

from stage_android_web import stage

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / 'android'
MAIN = ANDROID / 'app/src/main'
PACKAGE = 'tv.bilibs.app'


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def program(directory, name):
    file = name + ('.exe' if os.name == 'nt' else '')
    path = directory / file
    if path.is_file():
        return path
    raise SystemExit(f'Missing required executable: {path}')


def jdk_program(name):
    if os.environ.get('JAVA_HOME'):
        return program(Path(os.environ['JAVA_HOME']) / 'bin', name)
    path = shutil.which(name)
    if not path:
        raise SystemExit(f'Install a JDK and add {name} to PATH or set JAVA_HOME.')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', default=os.getenv('ANDROID_HOME') or os.getenv('ANDROID_SDK_ROOT'))
    parser.add_argument('--out', type=Path, default=ANDROID / 'build/outputs/apk/BiliBS.apk')
    parser.add_argument('--keystore', type=Path, help='Signing keystore (uses BILIBS_STORE_PASSWORD).')
    parser.add_argument('--alias', default='androiddebugkey')
    parser.add_argument('--debuggable', action='store_true', help='Enable adb WebView inspection for QA.')
    args = parser.parse_args()
    if not args.sdk:
        parser.error('Set ANDROID_HOME or pass --sdk pointing to an Android SDK.')
    sdk = Path(args.sdk).resolve()
    platform = sdk / 'platforms/android-35/android.jar'
    bt = sdk / 'build-tools/35.0.0'
    if not platform.is_file() or not (bt / 'lib/d8.jar').is_file():
        parser.error('Install platforms;android-35 and build-tools;35.0.0 with Android SDK Manager.')
    if args.keystore and not os.getenv('BILIBS_STORE_PASSWORD'):
        parser.error('Set BILIBS_STORE_PASSWORD for a custom signing keystore.')
    java = jdk_program('java')
    keytool = jdk_program('keytool')
    aapt = program(bt, 'aapt2')
    apk = args.out.resolve()
    apk.parent.mkdir(parents=True, exist_ok=True)
    keystore = (args.keystore or (Path.home() / '.android/bilibs-development.keystore')).resolve()
    if args.keystore and not keystore.is_file():
        parser.error('Custom signing keystore does not exist.')
    if not args.keystore and not keystore.exists():
        keystore.parent.mkdir(parents=True, exist_ok=True)
        run(keytool, '-genkeypair', '-keystore', keystore, '-storepass', 'android', '-keypass', 'android',
            '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
            '-dname', 'CN=BiliBS Development, O=BiliBS')
    password = 'env:BILIBS_STORE_PASSWORD' if args.keystore else 'pass:android'
    with tempfile.TemporaryDirectory(prefix='bilibs-build-') as wd:
        tmp = Path(wd)
        assets = tmp / 'assets'
        shutil.copytree(MAIN / 'assets', assets)
        stage(assets)
        manifest = tmp / 'AndroidManifest.xml'
        manifest.write_text((MAIN / 'AndroidManifest.xml').read_text(encoding='utf-8').replace(
            '<manifest ', f'<manifest package="{PACKAGE}" ', 1), encoding='utf-8')
        resources = tmp / 'res.zip'
        run(aapt, 'compile', '--dir', MAIN / 'res', '-o', resources)
        raw = tmp / 'unsigned.apk'
        run(aapt, 'link', '-I', platform, '--manifest', manifest, '-A', assets, '-o', raw,
            *(['--debug-mode'] if args.debuggable else []), resources)
        classes = tmp / 'classes'
        classes.mkdir()
        sources = sorted((MAIN / 'java').rglob('*.java'))
        # Use the JDK compiler module. This also supports JDK runtime bundles without a javac launcher.
        run(java, '-m', 'jdk.compiler/com.sun.tools.javac.Main', '-encoding', 'UTF-8',
            '-source', '8', '-target', '8', '-Xlint:-options', '-bootclasspath', os.pathsep.join(map(str, [bt / 'core-lambda-stubs.jar', platform])),
            '-d', classes, *sources)
        jar = tmp / 'classes.jar'
        with zipfile.ZipFile(jar, 'w') as dest:
            for cls in sorted(classes.rglob('*.class')):
                dest.write(cls, cls.relative_to(classes).as_posix())
        dex = tmp / 'dex'
        dex.mkdir()
        run(java, '-cp', bt / 'lib/d8.jar', 'com.android.tools.r8.D8', '--min-api', '26',
            '--lib', platform, '--output', dex, jar)
        with zipfile.ZipFile(raw, 'a') as dest:
            for item in sorted(dex.glob('classes*.dex')):
                dest.write(item, item.name, zipfile.ZIP_STORED)
        aligned = tmp / 'aligned.apk'
        run(program(bt, 'zipalign'), '-f', '4', raw, aligned)
        signed = tmp / 'signed.apk'
        signer = bt / 'lib/apksigner.jar'
        run(java, '-jar', signer, 'sign', '--ks', keystore, '--ks-key-alias', args.alias,
            '--ks-pass', password, '--key-pass',
            'env:BILIBS_KEY_PASSWORD' if args.keystore and os.getenv('BILIBS_KEY_PASSWORD') else password,
            '--v4-signing-enabled', 'false', '--out', signed, aligned)
        run(java, '-jar', signer, 'verify', '--verbose', '--print-certs', signed)
        run(program(bt, 'zipalign'), '-c', '4', signed)
        shutil.copyfile(signed, apk)
    print(f'{apk}  SHA-256 {hashlib.sha256(apk.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
