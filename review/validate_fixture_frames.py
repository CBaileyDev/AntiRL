from auditlib import ROOT, REVIEW
import json, subprocess
rows=[]
for n in (1,2,3):
    p=subprocess.run([str(ROOT/'target/release/antirl.exe'),'--parse-worker',str(REVIEW/f'fixtures/sample-{n}.replay'),'review.replay'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
    if p.returncode:raise RuntimeError('Copied fixture parser failed; output suppressed')
    a=json.loads(p.stdout)
    frames=a['frames']
    row={'fixture':n,'frames':len(frames),'null_ball_frames':sum(f.get('ball') is None for f in frames),'live_null_ball_frames':sum(f.get('live_play') is True and f.get('ball') is None for f in frames),'positive_overtime_clock_frames':sum(f.get('overtime') is True and isinstance(f.get('match_clock_seconds'),(float,int)) and f['match_clock_seconds']>0 for f in frames)}
    rows.append(row)
(REVIEW/'FIXTURE_FRAME_VALIDATION.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(json.dumps(rows))
