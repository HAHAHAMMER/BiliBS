#!/usr/bin/env python3
"""Assemble the Android WebView assets in a build output or temporary directory."""
import shutil
from pathlib import Path
from build_ui import ROOT, assemble


def stage(directory):
    directory.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'index.html', directory)
    for name in ('src', 'assets'):
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, directory / name, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('node_modules', '__pycache__', '*.map'))
    (directory / 'src/runtime.js').write_text(assemble(), encoding='utf-8')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    stage(parser.parse_args().output)
