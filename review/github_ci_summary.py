from auditlib import REVIEW
import json,urllib.request
data=json.loads((REVIEW/'github-public-runs.json').read_text(encoding='utf-8-sig'))
out=[]
for run in data['workflow_runs']:
    with urllib.request.urlopen(run['jobs_url']) as response:
        jobs=json.load(response)
    (REVIEW/f"github-jobs-{run['id']}.json").write_text(json.dumps(jobs,indent=2),encoding='utf-8')
    item={'id':run['id'],'sha':run['head_sha'],'conclusion':run['conclusion'],'url':run['html_url'],'created_at':run['created_at'],'failed_steps':[{'job':j['name'],'step':s['name'],'conclusion':s['conclusion']} for j in jobs['jobs'] for s in j['steps'] if s['conclusion']=='failure']}
    out.append(item)
(REVIEW/'github-ci-summary.json').write_text(json.dumps({'total_count':data['total_count'],'reviewed':len(out),'runs':out},indent=2),encoding='utf-8')
print(json.dumps(out,indent=2))
