#!/usr/bin/env python3
"""Drive a QA APK with real Android key events and read WebView focus through CDP."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request
from websockets.sync.client import connect


def until(probe, label, timeout=60):
    deadline = time.monotonic() + timeout
    error = None
    while time.monotonic() < deadline:
        try:
            value = probe()
            if value:
                return value
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            error = exc
        time.sleep(.4)
    raise RuntimeError(f'Timed out waiting for {label}' + (f': {error}' if error else ''))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', default=shutil.which('adb') or 'adb')
    parser.add_argument('--apk', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    report = {'apkSha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(), 'checks': []}

    def adb(*argv, timeout=120):
        return subprocess.check_output([args.adb, *argv], text=True, timeout=timeout).strip()

    def key(code):
        adb('shell', 'input', 'keyevent', str(code))

    def record(name, value):
        report['checks'].append({'check': name, 'observed': value})
        print(name, value, flush=True)

    status = args.out / 'android-device.json'
    package = 'tv.bilibs.app'
    component = package + '/.TvActivity'
    port = None
    ws = None
    try:
        report['model'] = adb('shell', 'getprop', 'ro.product.model')
        report['sdk'] = adb('shell', 'getprop', 'ro.build.version.sdk')
        report['features'] = [s for s in adb('shell', 'pm', 'list', 'features').splitlines()
                              if 'leanback' in s or 'television' in s]
        report['webview'] = [s.strip() for s in adb('shell', 'dumpsys', 'webviewupdate').splitlines()
                             if 'Current WebView package' in s]
        record('install', adb('install', '-r', str(args.apk), timeout=240))
        entry = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a',
                    'android.intent.action.MAIN', '-c', 'android.intent.category.LEANBACK_LAUNCHER', package)
        if package not in entry:
            raise AssertionError('TV launcher does not resolve to the app')
        record('TV launcher', entry.splitlines()[-1])
        adb('shell', 'am', 'force-stop', package)
        adb('shell', 'am', 'start', '-n', component, '--ez', 'demo', 'true')
        pid = until(lambda: adb('shell', 'pidof', package), 'app process')
        socket = 'webview_devtools_remote_' + pid
        until(lambda: socket in adb('shell', 'cat', '/proc/net/unix'), 'WebView inspection socket', 150)
        port = adb('forward', 'tcp:0', 'localabstract:' + socket)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def page_url():
            with opener.open(f'http://127.0.0.1:{port}/json/list', timeout=4) as response:
                urls = json.load(response)
            return next((p['webSocketDebuggerUrl'] for p in urls if '/index.html' in p.get('url', '')), '')

        ws = connect(until(page_url, 'local WebView page', 120), proxy=None, max_size=2**22)
        seq = 0

        def evaluate(code):
            nonlocal seq
            seq += 1
            ws.send(json.dumps({'id': seq, 'method': 'Runtime.evaluate',
                                'params': {'expression': code, 'returnByValue': True}}))
            while True:
                reply = json.loads(ws.recv(timeout=40))
                if reply.get('id') == seq:
                    return reply.get('result', {}).get('result', {}).get('value')

        focus = 'document.activeElement?.dataset.k'
        film = 'document.querySelector(\'[data-k="hero-primary"]\')?.dataset.film'
        until(lambda: evaluate('!!window.BiliBSTVHost && ' + focus + ' === "hero-primary"'),
              'first render with hero focus', 180)
        record('entry', evaluate('({url:location.href,mode:BS_MODE,focus:' + focus + '})'))
        img = subprocess.check_output([args.adb, 'exec-out', 'screencap', '-p'], timeout=75)
        (args.out / 'android-home.png').write_bytes(img)
        initial = evaluate(film)
        key(22)
        next_film = until(lambda: evaluate(film + ' !== ' + json.dumps(initial) + ' && ' + film), 'hero switch')
        if evaluate(focus) != 'hero-primary':
            raise AssertionError('Hero switch moved focus inside the banner')
        record('D-pad right switches hero', [initial, next_film])
        key(20)
        record('D-pad down enters recommendations',
               until(lambda: evaluate(focus + '?.startsWith("rec-") && ' + focus), 'recommendation focus'))
        key(19)
        until(lambda: evaluate(focus + ' === "hero-primary"'), 'hero after D-pad up')
        key(23)
        record('D-pad center opens detail',
               until(lambda: evaluate('document.body.dataset.surface === "detail"'), 'work detail'))
        key(4)
        record('Back restores hero', until(lambda: evaluate(focus + ' === "hero-primary"'), 'return focus'))
        key(4)
        record('Back returns to top navigation', until(lambda: evaluate(focus + ' === "nav-home"'), 'home nav'))
        key(4)
        def finished():
            result = adb('shell', 'dumpsys', 'activity', 'activities')
            resumed = [line for line in result.splitlines() if 'mResumedActivity' in line or 'topResumedActivity' in line]
            return bool(resumed and all(package not in line for line in resumed))
        record('Back exits to launcher', until(finished, 'activity exit', 60))
        report['pass'] = True
    except Exception as exc:
        report['pass'] = False
        report['error'] = str(exc)
        raise
    finally:
        if ws:
            ws.close()
        if port:
            adb('forward', '--remove', 'tcp:' + port)
        status.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
