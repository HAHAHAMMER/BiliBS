"""Assemble the frozen interaction shell and its live-service integrations."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ('discovery', 'personal', 'player')
INSERT = "window.addEventListener('pagehide',rememberPlayback);"

def assemble():
    original = (ROOT / 'src/app.js').read_text(encoding='utf-8')
    if original.count(INSERT) != 1:
        raise ValueError('Expected one application startup block')
    modules = []
    for name in FEATURES:
        source = ROOT / 'src/features' / (name + '.js')
        modules.append(f'\n// {source.relative_to(ROOT).as_posix()}\n' + source.read_text(encoding='utf-8'))
    return original.replace(INSERT, '\n'.join(modules) + '\n\n' + INSERT)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = assemble()
    dest = ROOT / 'src/runtime.js'
    if args.check:
        if not dest.exists() or result != dest.read_text(encoding='utf-8'):
            raise SystemExit('src/runtime.js is out of date')
    else:
        dest.write_bytes(result.encode('utf-8'))
