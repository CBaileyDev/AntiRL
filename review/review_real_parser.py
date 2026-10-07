from pathlib import Path
import sys,json,subprocess,time,datetime,hashlib
sys.path.insert(0,str(Path('review').resolve()))
from auditlib import append_json,ROOT,REVIEW
rows=[]
for p in sorted((REVIEW/'fixtures').glob('sample-*.replay')):
 cmd=['cargo','run','-p','replay-core','--locked','--bin','antirl-replay','--','parse',str(p)]
 started=time.monotonic();r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=ROOT);elapsed=round(time.monotonic()-started,3)
 base={'fixture':p.name,'size_bytes':p.stat().st_size,'exit_code':r.returncode,'duration_s':elapsed}
 if r.returncode==0:
  a=json.loads(r.stdout);ms=a['metrics'];fs=a['frames'];es=a['events']
  base.update(mode=a['summary']['mode'],duration_replay_seconds=a['summary']['duration_seconds'],live_play_seconds=a['coverage']['live_play_seconds'],decoded_frames=a['coverage']['decoded_frames'],render_frames=len(fs),players=len(a['players']),events=len(es),event_types={k:sum(e['category']==k for e in es) for k in sorted({e['category'] for e in es})},pad_events=len(a.get('pad_events',[])),stat_samples=len(a.get('shots',[])),ipc_json_bytes=len(r.stdout),metric_keys=sorted({m['key'] for m in ms}),boost_valid_seconds_range=[min((m.get('denominator') or 0) for m in ms if m['key']=='avg_boost'),max((m.get('denominator') or 0) for m in ms if m['key']=='avg_boost')],render_discontinuities=sum(f['discontinuity'] for f in fs),duplicate_event_ids=len(es)-len({e['id'] for e in es}),metric_counts={k:sum(m['key']==k for m in ms) for k in sorted({m['key'] for m in ms})})
 else:base['error']=r.stderr.decode('utf8',errors='replace')[-1000:]
 name='parser-real-'+p.stem;log=REVIEW/'logs'/(name+'.txt');log.write_text(json.dumps(base,indent=2)+'\nFull parser JSON retained only in process memory; player names/IDs and source paths not logged.\n',encoding='utf8')
 append_json(REVIEW/'commands.jsonl',{'name':name,'command':' '.join(cmd),'exit_code':r.returncode,'duration_s':elapsed,'log':log.relative_to(ROOT).as_posix(),'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'summary':'Sanitized real-replay parser output; no golden independent oracle'})
 rows.append(base);print(json.dumps(base),flush=True)
(REVIEW/'measurements-parser.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
