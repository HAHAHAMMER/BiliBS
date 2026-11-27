"""Check the release sources and production integrations with generated/local test data."""
import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser',help='Path to Chromium or the Chrome headless shell')
    parser.add_argument('--single-process',action='store_true',help='Use a single process for visual and keyboard tests')
    parser.add_argument('--visual',action='store_true',help='Additionally compare 39 states across three viewport sizes')
    args=parser.parse_args()
    env=os.environ.copy()
    if args.browser:
        env['BILIBS_CHROME']=str(Path(args.browser).resolve())
    node=shutil.which('node')
    if not node:
        parser.error('Node.js 18 or newer is required')
    py=sys.executable
    flags=['--single-process'] if args.single_process else []
    suite=[
        ('bundle',[py,'tools/build_ui.py','--check']),
        ('js-syntax',[node,'--check','src/runtime.js']),
        ('routes',[node,'verification/routes.cjs']),
        ('edge-cases',[node,'verification/policy.cjs']),
        ('services',[node,'verification/service_contract.cjs']),
        ('transport',[py,'verification/transport_check.py']),
        ('native-image-stream',[py,'verification/native_image_stream_check.py']),
        ('discovery-routes',[node,'verification/discovery_routes.cjs']),
        ('discovery-ui',[py,'verification/discovery_check.py']),
        ('remote-refresh-replay',[py,'verification/remote_refresh_replay.py']),
        ('personal-ui',[py,'verification/personal_check.py']),
        ('streaming-and-performance',[py,'verification/streaming_check.py']),
        ('playback',[py,'verification/player_online_check.py','--out','verification/evidence/player-online.json']),
        ('ui-interaction',[py,'verification/ui_regression.py',*flags]),
        ('diagnostic-return',[py,'verification/diagnostic_return.py',*flags])
    ]
    if args.visual:suite.append(('design-pixels',[py,'verification/visual_acceptance.py',*flags]))
    evidence={'time':datetime.now(timezone.utc).isoformat(),'scope':'本地无账户回归；浏览器集成以受控的数据接口和实际媒体资源运行。','results':[]}
    for label,command in suite:
        result=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,encoding='utf-8',errors='replace')
        lines=(result.stdout+'\n'+result.stderr).strip()
        evidence['results'].append({'suite':label,'pass':result.returncode==0,'output':lines[-4500:]})
        print(label,'PASS' if result.returncode==0 else 'FAIL',flush=True)
        if result.returncode:
            print(lines[-1300:],flush=True)
    (ROOT/'verification/evidence/release-tests.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0 if all(item['pass'] for item in evidence['results']) else 1

if __name__=='__main__':
    raise SystemExit(main())
