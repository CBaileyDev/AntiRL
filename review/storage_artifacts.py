from pathlib import Path
import json, re
ROOT=Path(__file__).resolve().parent.parent
cmd=(ROOT/'src-tauri/src/commands.rs').read_text(encoding='utf-8')
functions=re.findall(r'pub async fn (\w+)\([\s\S]*?\) -> Result<([^\n{]+)',cmd)
census={'commands':len(functions),'bare_value_commands':[name for name,result in functions if result.strip().startswith('Value,')], 'string_key_lookups_coach_services':sum(len(re.findall(r'\["[^"\n]+"\]', p.read_text(encoding='utf-8'))) for p in (ROOT/'crates/coach-services/src').glob('*.rs'))}
(ROOT/'review/storage-census.json').write_text(json.dumps(census,indent=2),encoding='utf-8')
paths=['crates/coach-services/Cargo.toml']+[str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'crates/coach-services/src/migrations').glob('*')]
paths += ['crates/coach-services/src/'+s+'.rs' for s in ['lib','storage','analytics','migrations','conversations','camera','reenrich','semantics']]
paths += [str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'src-tauri/src').glob('*')]
paths += ['src-tauri/build.rs','src-tauri/Cargo.toml','src-tauri/tauri.conf.json','src-tauri/capabilities/default.json']
paths += [str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'integrations').rglob('*') if p.is_file()]
ledger=[]
for path in paths:
    status='reviewed'
    reason='Full source/schema read; traced call sites and relevant regression tests. Runtime proof uses only temporary synthetic profiles.'
    if path.endswith('semantics.rs'):
        status='skimmed'; reason='Normalization boundary inspected; detailed metric semantics belongs parser/AI reviewer.'
    ledger.append({'path':path,'status':status,'reason':reason})
(ROOT/'review/coverage-storage.json').write_text(json.dumps(ledger,indent=2),encoding='utf-8')
leads={
 '6-opener':{'status':'confirmed','findings':['M-001'],'detail':'Blanket HTTP/HTTPS/mailto capability confirmed; no automatic exfiltration proven. Prompt injection assessed by AI reviewer.'},
 '13-version':{'status':'confirmed','findings':['B-005'],'detail':'Executable weighted mixed-version proof; code ignores metric version.'},
 '15':{'status':'confirmed','findings':['B-006'],'detail':'Executable date-only/ISO-local mismatch proof.'},
 '20':{'status':'confirmed','findings':['B-001'],'detail':'Invalid JSON and NULL coach_body each prevent temp profile open. populate_db was inspected only, never run.'},
 '21':{'status':'confirmed','findings':['B-002'],'detail':'Full parse/hash/query on every request; projection tables are written, source_matches.body used to aggregate instead. 400-match unchanged query ~1s.'},
 '22':{'status':'confirmed','findings':['F-004'],'detail':'Direct async chat/analyze still run blocking context/storage/vault work before provider awaits.'},
 '23':{'status':'confirmed','findings':['B-003','B-004'],'detail':'Identical body/coach_body plus projection copy, manifest per message, absent messages index proven.'},
 '24':{'status':'confirmed','findings':['F-005'],'detail':'Storage zstd JSON -> Value; IPC Value -> ReplayAnalysis -> Tauri JSON; synthetic payload benchmark logged.'},
 '25':{'status':'confirmed','findings':['C-003'],'detail':'Stat-only full-folder rescan with per-file unchanged events every 20s confirmed; no full hash/parse repeat on unchanged files.'},
 '26-decode':{'status':'confirmed','findings':['C-002'],'detail':'In-process network decoding in camera/intelligence/reenrichment confirmed.'},
 '26-validation':{'status':'confirmed','findings':['C-001'],'detail':'Parent lacks typed domain revalidation; worker itself validates and parent hash-checks.'},
 '26-output-bound':{'status':'refuted','findings':[],'detail':'stdout take(MAX_OUTPUT_SIZE+1), oversize atomic flag, kill and final byte-size check enforce 128MiB bound. Output JSON materialization still high memory but not unbounded.'},
 '27':{'status':'confirmed','findings':['M-004','M-005'],'detail':'execFile no memory sandbox/minimal env; Playwright devDependency path import confirmed.'},
 '28':{'status':'confirmed','findings':['F-001','F-002','F-003'],'detail':'JSON domain, open merge, substring errors, string enums/version literals and unconditional SIWC dependencies confirmed. Detailed metric/app include concern covered parser reviewer.'},
 '47-icons':{'status':'confirmed','findings':[],'detail':'Only icon.ico/icon.png exist; config lists absent PNG sizes and icns. Root records actual build portability failure.'},
 '47-schema':{'status':'confirmed','findings':[],'detail':'Linux schema not ignored; Linux generation not executed on Windows. Root tracks portability lead.'}}
(ROOT/'review/leads-storage.json').write_text(json.dumps(leads,indent=2),encoding='utf-8')
report='''# Storage, import, IPC and security review

Reviewed HEAD `6762f8c`, Windows. No real profile, original replay, credential, clipboard or provider endpoint was read. Nine storage characterizations and two boundary characterizations use disposable synthetic profiles. The boundary wrapper includes three existing contract tests; it initially produced dead-code warnings solely from imported test modules, now scoped `allow(dead_code)` is in the review file.

## Verdicts

| Area | Verdict | Examined |
|---|---|---|
| B storage/migrations/projection | needs work | Every source/projection schema, migration transactions/backups, replay/frame/metadata storage, delete/tombstones, library/identity/teammate queries, conversation storage, analytics revision/provenance/aggregates, corrupt rows |
| C ingestion/isolation | needs work | Canonical paths, stable bounded reads, hash snapshots, duplicate/deleted records, worker launch/env/job/suspend/resume/stdout/stderr/timeouts, parent output trust, acquisition/cancellation, watcher rescans, every decoder call path |
| F IPC/types/errors | needs work | All 61 commands, generated DTO conversion, bare JSON results, validation before commit, async blocking helper coverage, stable-error conversion, full playback payload |
| M security/privacy | needs work | CSP/opener/capabilities, vault/storage roots, QA isolation, memory filenames/content/reads, snapshot hash path constraints, cloud consent scope, external links, Discord signed ingress/CDN download/worker/history/render/registration/deployment |

## Executable evidence

- `review_storage`: 9 passing characterizations. Invalid and NULL compact replay rows independently brick reopening (B-001). Unknown result plus draw becomes two teammate losses (B-007). Weighted legacy/current observations silently pool (B-005). Library dates disappear from recent analytics (B-006). Malformed settings persist (F-002). Messages SQL query is `SCAN messages` (B-004). Note loading bypasses save guards (M-003).
- Analytics already reconciled: 40 matches at 83,762 bytes compact body: 96–97ms; 400: 991–1265ms, context 7.6KB. This is synthetic and workload-specific, not a production percentile (B-002).
- `review_contracts`: actual SettingsDto conversion rejects already-committed settings; four error classifications depend on incidental text. Five tests total including three existing included-module tests pass.
- Full source output bounds refute Appendix 26's unbounded worker output claim: stdout limited to 128MiB+1, oversize detection kills worker; final length check precedes JSON parse. Parent still lacks typed output validation.

## Validation/disproof pass

- B-001: attempted disproof using healthy sibling row and both NULL/invalid text; both startup errors persist. Existing failed-rebuild transaction protects old projection but cannot help because `open` returns before exposing it.
- B-007: attempted disproof against analytics personal_result; analytics knows draws/unknown, teammate query independently classifies all nonwins as losses. Reproduction confirms false figures. P0 is wrong displayed number, not data-loss claim.
- B-002: reconciled before timing to eliminate initial projection work. Cost remains near linear on unchanged queries; expensive records are realistic synthetic evidence size. P1 performance applies large libraries, not every small library.
- B-005: supplied valid numerators/denominators and distinct versions. Result still merges and top-level labels metrics-2. Source correctness of any individual old metric was not assumed.
- F-002: actual typed boundary wrapper confirms commit occurs before IPC conversion failure. UI currently sends expected field types, so trigger is malformed/manual/old settings, but data remains unusable until repaired.
- C-002/M-004: source proves missing containment paths; no resource-exhausting replay available. Both remain `likely`, not a demonstrated crash. Recommendation is architectural containment.
- M-001 downgraded to P2: external links require clicks; unsafe schemes are filtered, native capability blocks them and noopener is set. Blanket domains are a defense-in-depth gap, not proven exfiltration.

## Healthy behavior worth preserving

Transactional numbered migrations and backups; source/projection rebuild rollback; FK cascades; startup reconciliation recovers interrupted healthy import; compressed frames are separate from coach context and bounded on decompression; hash/id tombstones survive restarts; existing corrupt-frame blobs do not brick library; source snapshots hash-verified/repaired; worker process env is cleared and minimized; suspended child cannot run before assignment; Windows 512MiB/one-process/kill-on-job-close containment; 45s parser timeout and cancellation; secret key never returned in status; provider-specific cloud consent resets across changes; model ID restricted characters; memory filenames reject traversal; Discord Ed25519 freshness/guild/app checks, duplicate interaction checks, private responses/no mentions, CDN allowlist/no redirects, bounded downloads, seven-day known-file history purge, temporary job cleanup, no LLM use.

## Native scripts: why no launch here

`ANTIRL_QA_DATA_DIR` redirects SQLite and disables auto-import, but the real App eagerly invokes `get_ai_status`, which reads the global Windows vault service `AntiRL`. QA roots do not isolate vault or USERPROFILE camera discovery. Therefore a normal native launch would violate the user's explicit no-credential-read constraint. No isolated Windows user/vault is supplied. This is a concrete constraint, not absence of Windows. Rust worker-limits test can run because it starts only a synthetic PowerShell child.

All native scripts were read. Unmodified scripts write tracked docs/validation and most assume pre-existing .local fixtures and CDP ports 9236/9239/49187; they cannot be run safely within writes-only-under-review. Export also reads real clipboard; restart stops a prior PID and expects target/upgrade-qa/release executable. `launch-test.ps1` deliberately removes QA environment and opens normal user profile: do not run.

Safe future wrapper procedure: isolated Windows test user/vault; release exe launched Hidden with ANTIRL_QA_DATA_DIR=`review/native-profile`, WEBVIEW2_USER_DATA_FOLDER=`review/native-webview`, unique CDP port. Copy each script to `review/native-scripts` and rewrite only fixture/output paths and import to absolute frontend Playwright. Point every docs/validation/.local write at review/native-output or review/native-fixtures; enforce fixture assertions/profile ID before any invoke. Replace clipboard test with synthetic write-only probe or skip. Seed synthetic profile and copied test fixtures explicitly; never use populate_db. Root build command is independent and can be run without application launch.

## Remaining limits

No real-replay IPC, real Windows vault behavior, adversarial memory-exhaustion replay, or real Discord registration/webhook/upload. Synthetic source data measures serialization shape and query scaling, not decoder runtime. Provider privacy retention needs actual policy evidence; no endpoint was called.
'''
(ROOT/'review/STORAGE_SECURITY_REVIEW.md').write_text(report,encoding='utf-8')
print(json.dumps(census))
