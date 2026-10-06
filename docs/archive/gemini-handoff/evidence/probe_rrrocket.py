"""Read-only parser research. Saves aggregate evidence, never raw replay contents."""
import hashlib
import json
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXE = ROOT / '.local/research-tools/rrrocket/rrrocket-0.11.6-x86_64-pc-windows-msvc/rrrocket.exe'
FOLDER = Path.home() / 'Documents/My Games/Rocket League/TAGame/DemosEpic'
OUTPUT = Path(__file__).with_name('rrrocket-probe.json')

def run(path, dry=True):
    args = [str(EXE), '--crc-check', '--network-parse']
    if dry:
        args.append('--dry-run')
    args.append(str(path))
    start = time.perf_counter()
    proc = subprocess.run(args, capture_output=True, timeout=30)
    row = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
           'milliseconds': round((time.perf_counter() - start) * 1000, 2),
           'exit_code': proc.returncode,
           'status': 'PASS' if proc.returncode == 0 else 'FAIL'}
    return row, proc

paths = sorted(FOLDER.glob('*.replay'))
rows = []
for path in paths:
    try:
        row, _ = run(path)
    except subprocess.TimeoutExpired:
        row = {'status': 'FAIL', 'reason': '30-second timeout'}
    rows.append(row)

decoded = []
seen_sizes = set()
for path in paths:
    row, proc = run(path, dry=False)
    if proc.returncode:
        continue
    value = json.loads(proc.stdout)
    properties = value.get('properties', {})
    if isinstance(properties, list):
        properties = dict(properties)
    size = properties.get('TeamSize')
    if size not in (2, 3) or size in seen_sizes:
        continue
    seen_sizes.add(size)
    network = value.get('network_frames') or {}
    frames = network.get('frames', []) if isinstance(network, dict) else network
    rigid_updates = 0
    for frame in frames:
        for actor in frame.get('updated_actors', []):
            attribute = actor.get('attribute', {})
            if isinstance(attribute, dict) and 'RigidBody' in attribute:
                rigid_updates += 1
    row.update(team_size=size, decoded_frames=len(frames),
               rigid_body_updates=rigid_updates,
               match_date=properties.get('Date'),
               engine_version=value.get('engine_version'),
               licensee_version=value.get('licensee_version'),
               network_version=value.get('net_version'))
    row['structural_check'] = 'PASS' if frames and rigid_updates else 'FAIL'
    decoded.append(row)
    if seen_sizes == {2, 3}:
        break

report = {'tool': 'rrrocket v0.11.6 official Windows MSVC release',
          'binary_sha256': hashlib.sha256(EXE.read_bytes()).hexdigest(),
          'files': len(paths), 'passed': sum(r['status'] == 'PASS' for r in rows),
          'checks': ['CRC', 'network parse', 'no JSON writes in batch'],
          'batch': rows, 'decoded_samples': decoded,
          'limits': ['No manual native-game comparison', 'No reconstructed scene accuracy check',
                     'No validated coaching or identity semantics', 'No 1v1 file selected']}
OUTPUT.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'batch'}, indent=2))
raise SystemExit(0 if paths and report['passed'] == len(paths) and
                 len(decoded) == 2 and all(r['structural_check'] == 'PASS' for r in decoded) else 1)
