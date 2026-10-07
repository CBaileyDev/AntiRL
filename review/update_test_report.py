import json
from auditlib import ROOT
path=ROOT/'review/TEST_REPORT.md'
report=path.read_text(encoding='utf-8')
summaries={
 'environment-versions':'Recorded Windows, Node, pnpm, Rust/Cargo and Python versions; no profile data read.',
 'review-cleanup':'Stopped only two verified review servers; removed root Vite cache, clean archive/throwaway key, separate probe target and generated JS bundle. Shared target cache and original files preserved.',
 'library-score-characterization':'Four exact-source score helper controls pass; nullable one-sided score becomes zero. Current parser fills zero-goal header scores, so partial pair is a contract/legacy edge only.',
 'validation-library-score-independent':'Independent rerun passes; nullable DTO confirmed and fresh-parser paired-score counter-control narrows claim. G-001 P0 remains Overview identity/result errors.',
 'final-artifact-validation':'Completeness checks pass:186 findings,109 files,48 leads,42 high-severity validation records,15 epics,66 before/18 mockup screenshots; exact source anchors and clean tracked diff.',
 'final-source-diff':'Tracked source/config/lockfiles/CI/docs remain unchanged; only permitted review files/tests are untracked.',
 'design-mockup-control-aa':'156 default/hover/focus control checks pass with zero failures/nested controls; not a full WCAG certification.',
 'design-stream-motion':'Real-App mocked stream confirms reduced-motion spinner continues and cancellation has a status region; source speech support narrowed.',
}
lines=[]
for row in map(json.loads,(ROOT/'review/commands.jsonl').read_text(encoding='utf-8').splitlines()):
    if '**'+row['name']+'**' in report: continue
    command=row['command'].replace('|','\\|').replace('\n',' ')
    summary=summaries.get(row['name'],'Review artifact generation, source verification or mockup capture completed; see full output.')
    if row['exit_code']!=0: summary='Failed review attempt; see the full output and subsequent corrected run. No product conclusion inferred.'
    log=row['log'].split('/')[-1]
    lines.append(f"| **{row['name']}**<br>`{command}` | {row['exit_code']} | {row['duration_s']:.3f} | {summary} | [log](logs/{log}) |")
marker='\n## Measurements'
assert marker in report
report=report.replace(marker,'\n'+ '\n'.join(lines)+'\n'+marker,1)
if 'playwright install chromium' not in report:
    report += '\n## Additional CI setup boundary\n\n`pnpm --dir app exec playwright install chromium` was not run separately: the original suite already found its bundled browser. A fresh CI browser download is unverified, and the default install writes a browser cache outside the review directory. Installed Chrome and Edge, plus software WebGL, were exercised through the recorded wrappers.\n'
if '156 default/hover/focus' not in report:
    report += '\nFinal mockup checks: 156 default/hover/focus control contrast checks passed, no nested controls or horizontal overflow, and embedded font licensing was preserved. These controls do not certify every text/gradient or screen-reader behavior.\n'
path.write_text(report,encoding='utf-8')
print('Appended '+str(len(lines))+' late command rows without regenerating edited prose.')
