from auditlib import ROOT, REVIEW
import subprocess,time,json
out=[]
for n in [1,2,3]:
    start=time.perf_counter()
    result=subprocess.run([str(ROOT/'target/release/antirl.exe'),'--parse-worker',str(REVIEW/f'fixtures/sample-{n}.replay'),'review-fixture.replay'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=50)
    item={'fixture':n,'source_bytes':(REVIEW/f'fixtures/sample-{n}.replay').stat().st_size,'exit_code':result.returncode,'duration_s':round(time.perf_counter()-start,3),'stdout_bytes':len(result.stdout),'environment':'Release Windows parser-worker branch; no GUI, service, vault or provider initialized. Invoked directly, so job-object parent limits not measured.'}
    if result.returncode==0:
        a=json.loads(result.stdout);item.update(frames=len(a['frames']),players=len(a['players']),events=len(a['events']),metric_count=len(a['metrics']),duration_seconds=a['summary']['duration_seconds'],live_play_seconds=a['coverage']['live_play_seconds'],mode=a['summary']['mode'])
    else:
        item['error']='Worker failed; private metadata intentionally omitted.'
    out.append(item);print(json.dumps(item),flush=True)
(REVIEW/'measurements-release-worker.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
