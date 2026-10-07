from auditlib import ROOT, finding
import json
seen={json.loads(line)['id'] for line in (ROOT/'review/findings.jsonl').read_text(encoding='utf-8').splitlines()}
def add(id,severity,title,file,line,problem,repro,actual,evidence,recommendation,effort):
    if id in seen: return
    source=(ROOT/file).read_text(encoding='utf-8-sig').splitlines()
    finding(id=id,severity=severity,category=id[0],title=title,location={'file':file,'line':line,'quote':'\n'.join(source[line-1:line+2])},problem=problem,trigger_or_repro=repro,expected_vs_actual=actual,evidence=evidence,recommendation=recommendation,effort=effort,confidence='confirmed',lead='confirmed')
add('G-021','P2','Replay table renders the entire filtered library and has no sortable or bounded view',
    'app/src/pages/Replays.tsx',333,
    'Every matching replay becomes a full DOM row with inline styles, participant chips and actions. Filtering is the only navigation strategy; there is no column sorting, pagination or virtual window. Detector and label fetches also depend on whole replay-array identity. The40-match harness cannot establish large-library jank, so this is a scaling/UX gap, not a measured seconds-of-freeze claim.',
    'Inspect filtered.map and static column headers; no sort/offset/virtualization state exists. Current40-match capture shows the unbounded table.',
    'Expected clear sort and bounded rendering for a ranked player accumulating thousands of matches; actual renders all matching records at once with no sort control.',
    'app/src/pages/Replays.tsx:332-517; review/screenshots/before/replay-library-1440x900.png',
    'Add stable sorting and typed filters, then virtual rows or cursor pagination with preserved focus, row accessibility and meaningful result counts. Measure500/5000-record search/render costs before choosing thresholds.', 'M')
add('I-008','P3','Rank PNGs consume9.70MB while most badges are displayed at40px',
    'app/src/components/RankBadge.tsx',44,
    'The23 local rank PNGs total9,695,742bytes,58.5% of the16,568,921-byte dist. Badges default to40CSSpx and common surfaces use36–64px. This is measurable packaging/asset overhead; it is not proof all23 decode at startup or that these assets currently cause UI jank. Existing checks deliberately preserve artwork quality.',
    'Run review/measure_bundle.py and inspect RankBadge size/src and its callers. Largest PNG790,677bytes.',
    'Expected appropriate image formats/densities for rendered dimensions without losing high-DPI quality; actual one original PNG resolution serves every size.',
    'review/measurements-bundle.json; review/logs/measured-bundle.txt; app/src/components/RankBadge.tsx:26-52',
    'Produce reviewed transparent WebP/optimized PNG density variants, keep originals/provenance, and compare1x/2x/3x appearance. Update deliberate checksum tests only after visual acceptance. Do not replace rank identity with generic icons.', 'M')
add('K-011','P3','Overview uses a native decorative button inside another button role',
    'app/src/pages/Overview.tsx',184,
    'The whole match strip has role=button and keyboard activation, but its play decoration is another native button with tabIndex=-1 and no handler. This creates redundant nested interactive semantics for one action. Library rows are native table rows with guarded keydown and child click stopPropagation, so a blanket claim that every library action causes nested-button keyboard collisions is refuted.',
    'Inspect Overview match-strip and its inner Launch3DReplayStudio button. Root activation is the actual action; child button only bubbles clicks. No screen-reader speech or second-action bug is claimed.',
    'Expected one semantic activation control per action; actual parent button role contains an unfocusable native button.',
    'app/src/pages/Overview.tsx:180-229; app/src/pages/Replays.tsx:334-345,472-504; review/screenshots/before/overview-1440x900.png',
    'Use a real link/button for the match opening action with a decorative aria-hidden icon. Keep secondary actions as sibling controls. Preserve the existing library keydown target guard.', 'S')
patch=[{'id':'G-001','patch':{
    'title':'Overview result fallbacks and partial library scores invent match outcomes',
    'problem':'Overview falls back to players[0] when selected identity is absent and treats missing scores as0, showing another player\'s win or an invented0-0defeat. Library teamScores correctly shows dashes when both sides are absent, but substitutes0 when exactly one score is missing. Nullable score sides are allowed by the DTO; a missing side must remain unknown rather than a measured zero.',
    'evidence':'review/logs/review-frontend-probes-storage.txt; review/frontend-probe-results.json; review/SCORE_VALIDATION.json; review/logs/library-score-characterization.txt; app/src/pages/Replays.tsx:33-37',
    'validation':'Independent original-component control confirms absent identity and both missing scores in Overview. Final exact-source library helper controls: known1/3->1/3; bothmissing->dash/dash; one-sidedmissing->0/3or3/0 ratherthanunknown. No actual partial-score realfixture asserted. Existing P0 is wrong personalized/displayed numbers, not replay corruption.'}}]
(ROOT/'review/validation-final-floor-adjustments.json').write_text(json.dumps(patch,indent=2),encoding='utf-8')
print('Three known-floor nits/scaling findings and partial-score scope saved.')
