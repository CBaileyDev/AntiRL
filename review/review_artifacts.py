import collections
import json
import pathlib
import re
import subprocess
from auditlib import ROOT

out=ROOT/'review'
findings=[json.loads(line) for line in (out/'findings.jsonl').read_text(encoding='utf-8').splitlines()]
ids={row['id'] for row in findings}
assert len(ids)==len(findings)
required_fields='id severity category title location problem trigger_or_repro expected_vs_actual evidence recommendation effort confidence lead'.split()
for row in findings:
    assert all(field in row for field in required_fields), row['id']
    assert row['severity'] in ['P0','P1','P2','P3']
    assert row['effort'] in ['S','M','L']
    assert row['confidence'] in ['confirmed','likely','speculative']
    assert row['lead'] in ['confirmed','refuted','new']
    location=row['location']; quote=location['quote'].splitlines()
    source=(ROOT/location['file']).read_text(encoding='utf-8-sig').splitlines()
    assert len(quote)<=5 and 0<location['line']<=len(source), row['id']
    assert quote[0].strip()==source[location['line']-1].strip(), row['id']
    assert location['quote'].strip() in '\n'.join(source), row['id']
    for evidence in re.findall(r'review/[\w./-]+\.(?:txt|json|md|png|rs|tsx|ts|mjs|py)',str(row['evidence'])):
        assert (ROOT/evidence).exists(), (row['id'],evidence)
ledger=json.loads((out/'coverage-final.json').read_text(encoding='utf-8'))
required=sorted(p.relative_to(ROOT).as_posix() for directory in ['crates','src-tauri/src','app/src','integrations'] for p in (ROOT/directory).rglob('*') if p.is_file() and not any(part in ['node_modules','target','.git'] for part in p.parts))
assert {row['path'] for row in ledger}==set(required)
coverage=(out/'COVERAGE.md').read_text(encoding='utf-8')
assert all('`'+path+'`' in coverage for path in required)
assert all(re.search(r'\| '+letter+r'\.',coverage) for letter in 'ABCDEFGHIJKLMNO')
leads=(out/'LEAD_VERDICTS.md').read_text(encoding='utf-8')
assert all(re.search(r'^\| '+str(i)+r' \| (confirmed|refuted) \|',leads,re.M) for i in range(1,49))
validation='\n'.join((out/file).read_text(encoding='utf-8') for file in ['VALIDATION.md','VALIDATION_EXPERIMENTAL.md','VALIDATION_DESIGN_INDEPENDENT.md','VALIDATION_FINAL_FLOOR.md'])
high=[row['id'] for row in findings if row['severity'] in ['P0','P1']]
assert all(id in validation for id in high)
roadmap=(out/'ROADMAP.md').read_text(encoding='utf-8')
assert len(re.findall(r'^## \d+\.',roadmap,re.M))==15
assert set(re.findall(r'\b[A-O]-\d{3}\b',roadmap))<=ids
assert all(id in roadmap for id in ['A-026','G-021','I-008','K-011'])
screens={}
for group in ['before','mockups']:
    manifest=json.loads((out/f'screenshots/{group}/manifest.json').read_text(encoding='utf-8'))
    entries=[row for row in manifest if row.get('file')]
    assert len(entries)==(66 if group=='before' else 18)
    for row in entries:
        data=(ROOT/row['file']).read_bytes()
        assert data[:8]==b'\x89PNG\r\n\x1a\n' and len(data)>1000,row['file']
    screens[group]=len(entries)
for name in ['match-report','today','replay-studio','coach','progress','onboarding']:
    html=(out/f'mockups/{name}.html').read_text(encoding='utf-8')
    assert not re.search(r'(?:src|href)=[\"\']https?://',html),name
    assert 'data:' in html,name
    for size in ['1280x720','1440x900','1920x1080']:
        assert (out/f'screenshots/mockups/{name}-{size}.png').exists()
design=json.loads((out/'DESIGN_SUMMARY.json').read_text(encoding='utf-8'))
assert design['mockup_console_errors']==0 and design['horizontal_overflow']==0
assert design['control_contrast_checks']==156 and design['control_contrast_failures']==0
assert not (ROOT/'.vite').exists() and not (out/'snapshot').exists()
assert not (out/'metrics-probe/target').exists() and not (out/'frontend-probes.cjs').exists()
diff=subprocess.run(['git','diff','--exit-code'],cwd=ROOT,capture_output=True)
assert diff.returncode==0,'Tracked production files changed'
status=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).decode('utf-8')
for line in status.splitlines():
    path=line[3:].replace('\\','/')
    assert line.startswith('?? '),line
    assert path.startswith('review/') or re.search(r'/(?:tests/)?review_[^/]+$',path) or path=='src-tauri/tests/',line
report={
    'findings':len(findings),'severities':dict(collections.Counter(row['severity'] for row in findings)),
    'required_files':len(required),'coverage_statuses':dict(collections.Counter(row['status'] for row in ledger)),
    'coverage_areas':15,'lead_groups':48,'validated_high_severity':len(high),'roadmap_epics':15,
    'screenshots':screens,'mockup_control_contrast_checks':156,'mockup_control_contrast_failures':0,
    'source_quotes_exact':True,'explicit_evidence_paths_exist':True,'tracked_diff_exit':diff.returncode,
    'untracked_paths_only_authorized':True,'temporary_snapshot_and_build_caches_removed':True,
    'limits':'Artifact checks establish completeness and evidence links, not correct tactical metrics, live provider behavior or native GUI/installer proof.'}
(out/'ARTIFACT_VALIDATION.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
