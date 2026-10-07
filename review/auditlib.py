"""Review-only shared evidence helpers. No application data is read."""
from pathlib import Path
import json, os, subprocess, time, datetime
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / 'review'

def append_json(path, value):
    lock = Path(str(path) + '.lock')
    deadline = time.monotonic() + 60
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            break
        except FileExistsError:
            if time.monotonic() > deadline: raise TimeoutError(str(lock))
            time.sleep(.05)
    try:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(value, ensure_ascii=False) + '\n')
    finally:
        lock.unlink()

def finding(**item):
    required = ['id','severity','category','title','location','problem','trigger_or_repro','expected_vs_actual','evidence','recommendation','effort','confidence','lead']
    assert all(k in item for k in required), item
    append_json(REVIEW / 'findings.jsonl', item)

def run(command, name=None, env=None, cwd=None, timeout=1800):
    name = name or ('check-' + str(int(time.time())))
    logs = REVIEW / 'logs'
    logs.mkdir(exist_ok=True)
    start = time.monotonic()
    proc_env = dict(os.environ)
    if env: proc_env.update(env)
    try:
        result = subprocess.run(['powershell','-NoProfile','-Command',command + '; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }'], cwd=cwd or ROOT, env=proc_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
        output=result.stdout.decode('utf-8', errors='replace')
        code=result.returncode
    except subprocess.TimeoutExpired as e:
        output=(e.stdout or b'').decode('utf-8',errors='replace')+'\nREVIEW TIMEOUT'
        code=124
    duration=round(time.monotonic()-start,3)
    (logs / (name+'.txt')).write_text(output,encoding='utf-8')
    item={'name':name,'command':command,'exit_code':code,'duration_s':duration,'log':str((logs/(name+'.txt')).relative_to(ROOT)).replace('\\','/'),'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    append_json(REVIEW/'commands.jsonl',item)
    print(json.dumps(item),flush=True)
    print(output[-3500:],flush=True)
    return item

if __name__ == '__main__':
    import sys
    run(sys.argv[2], sys.argv[1])
