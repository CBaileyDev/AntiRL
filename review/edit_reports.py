from pathlib import Path
import re, json
R=Path(__file__).resolve().parent
test=R/'TEST_REPORT.md'
coverage=R/'COVERAGE.md'
old_test=test.read_text(encoding='utf-8')
old_coverage=coverage.read_text(encoding='utf-8')

def replace_section(text,start,end,new):
    a=text.index(start);b=text.index(end,a)
    return text[:a]+new.rstrip()+'\n\n'+text[b:]

t=replace_section(old_test,'# Actual test and measurement report','## Original commands, workarounds and every recorded attempt','''# Actual test and measurement report

Target: `6762f8c`, reviewed on Windows/PowerShell on 6 October 2026 local time. Later command timestamps fall on 7 October UTC. The machine already had developer dependencies and an ignored synthetic RSA test fixture, so cached passes were challenged with a clean git archive. Existing production source, configuration, lockfiles and docs were not modified. Providers were mocked; external requests from the real-App capture harness were blocked. No real user profile, vault credential or clipboard content was read, and populate_db was never executed.

Environment: Microsoft Windows NT 10.0.26300.0; Node 22.23.2; pnpm 11.3.0; Rust and Cargo 1.98.1; Python 3.12.10. See [environment log](logs/environment-versions.txt).

## Results that matter

- Cached frontend build, lint, formatting and unit checks passed, as did Rust formatting, core/services tests, all-features tests, workspace tests and clippy. Original Playwright: 8 passed, 1 failed because of the Stop timing race. The serial wrapper using installed Chrome passed all 9. Five later Stop runs passed; the software WebGL security test also passed within 45 s.
- A clean archived checkout failed frozen install because esbuild builds were ignored. The CLI override passed. Fresh all-features compilation then failed because the PEM fixture was missing. A random key alone produced 78 passes and 1 JWT failure; a matching synthetic key and public JWKS in the review snapshot produced 79 passes and 2 ignored tests.
- Original Windows Tauri release packaging passed in 75.234 s. It produced a 19.90 MiB MSI and a 17.50 MiB NSIS installer. Neither installer nor the normal native GUI was launched: eager AI-status loading accesses the real global vault even when QA data is isolated.
- Final workspace run: 131 passed, 4 ignored. Nine additional characterizations executed the exact native collector source outside the workspace. Final formatting, clippy and generated-binding checks passed. A passing bug characterization proves the current defect; it does not prove correct product behavior.
- Four Discord unit tests, the local signed HTTP integration, and a copied-replay parse/schematic clip passed. Actual Discord registration, delivery and upload were not run. The original experimental React components also passed a characterization that demonstrates stale results after a replay change.
''')
t=replace_section(t,'The rows retain first failures','| Check / exact command','''The ledger retains initial failures and review-scaffolding failures alongside subsequent passes. Durations are wall-clock seconds, including process/Cargo startup and possible contention. Source-inspection and generator commands are retained too. Each row links complete stdout/stderr; commands.jsonl is the machine-readable ledger.

Fresh install and initial fresh compilation ran from review/snapshot with a shared build cache. The paired fixture workaround used an explicit snapshot manifest. Browser and output wrappers live entirely under review and leave repo configuration unchanged.
''')

summaries={
'install-original':'Cached workspace passed; this is not clean-clone proof.',
'rust-replay-core':'All 6 original tests passed.',
'rust-coach-services':'75 original tests passed; 2 ignored.',
'frontend-build':'TypeScript/Vite passed. Main chunk: 1767683 B; large-chunk warnings remain.',
'frontend-lint':'ESLint passed.',
'frontend-format':'Prettier passed.',
'frontend-unit':'All 23 rank-artwork checksums plus mapping and refresh-budget assertions passed. This is not general React unit coverage.',
'rust-coach-all-original':'79 passed; 2 ignored. The existing ignored fixture masked the clean-clone failure.',
'playwright-original':'The Stop click in coaching.spec occurs after its fake stream finishes: 8 passed, 1 failed. The browser was installed, so the missing-revision failure did not occur here. L-003.',
'discord-unit':'All 4 Node tests passed; actual Discord delivery was not tested.',
'studio-unit':'Frame, camera, score, perspective and asset assertions passed. This command is not wired into CI.',
'frontend-outdated':'Expected exit 1 because updates exist. Major Babylon, Vite, TypeScript, plugin-react and lucide versions are behind. N-003.',
'rust-workspace-original':'94 original tests passed; 2 ignored on Windows: 9 Tauri + 79 services + 6 core.',
'frontend-audit':'Registry audit reported no known vulnerabilities; this is not proof of security.',
'parser-characterization':'Review generator failed to parse an array-return signature; this is not a production compile defect.',
'parser-characterization-2':'Review generator omitted a digit-bearing method name; this is not a production defect.',
'parser-characterization-3':'Review generator swallowed an adjacent method signature. The corrected exact-source probes subsequently passed.',
'before-screenshots':'Review harness could not resolve the Playwright package. Only the review script was repaired.',
'fresh-install-original':'CI/product failure: allowBuilds contains placeholder text for esbuild, causing ERR_PNPM_IGNORED_BUILDS. The cached install passed. L-001.',
'fresh-install-workaround':'Passed with the strict-dep-builds=false CLI override; source unchanged.',
'fresh-all-features-original':'CI/product failure: include_bytes requires the ignored, missing synthetic-oidc-test-key.pem. L-002.',
'before-screenshots-2':'Review harness React CJS named exports required explicit aliases. The fix stayed in the review Vite config.',
'native-build-original':'Original Windows release build passed; MSI 19.90 MiB and NSIS 17.50 MiB produced. App and installers were not launched.',
'playwright-workaround':'Review wrapper required a local ESM manifest for its TypeScript config. This was not an app defect.',
'playwright-workaround-2':'All 9 Playwright tests passed using installed Chrome, 1 worker, a 180 s timeout and 2 retries.',
'before-screenshots-3':'66 fresh real-App/mockIPC captures at 3 sizes passed; 0 page errors.',
'review-real-replay-payload':'The relative fixture path resolved from the Cargo crate directory. An absolute review-owned path succeeded.',
'fresh-all-features-workaround':'A throwaway key fixed compilation but did not match the committed JWKS: 78 passed, 1 signature failure, 2 ignored. L-002.',
'manual-edge-coaching':'Review-owned Edge/output-path wrapper passed. The original script would write tracked validation artifacts.',
'manual-edge-security':'Review-owned Edge/output-path wrapper passed, using provider mocks.',
'discord-local-synthetic':'Local signed HTTP integration passed with synthetic input. No actual guild message or upload.',
'ui-characterizations':'The 6 targeted UI defects were characterized successfully. Paused-render CPU submissions and counters were measured.',
'review-frontend-static-probes':'Review bundler could not resolve esbuild from the sibling entry path; dependency resolution was corrected under review.',
'review-frontend-static-probes-fixed':'Review probe had a missing JSX closing brace before playerId. The review-only syntax was corrected.',
'review-frontend-static-probes-final':'Review entry could not resolve react/jsx-runtime. The subsequent dependency-resolution fix passed.',
'experimental-probes':'Review-generated Rust had invalid leading-dot float literals and an unparenthesized array-index expression inside json!. Corrected review probes passed.',
'review-typescript-strict':'Additional strict diagnostic found nullable App/Coach/Progress/Overview/Transfer values and future-ball errors. Normal config disables strict mode and its build passes. F-051/G-019.',
'fresh-all-features-paired-workaround':'79 passed; 2 ignored with a matching throwaway key/public JWKS only in the review snapshot. Original fixtures untouched.',
'release-worker-three-fixtures':'Three release Windows worker parses passed in 0.981/3.641/1.793 s. Direct worker invocation does not exercise parent containment.',
'coach-race-five-runs':'All 5 subsequent runs passed. The original failure remains evidence; the supplied 2-in-5 failure frequency was not reproduced.',
'security-software-webgl':'SwiftShader/software WebGL passed in 11.2 s under the original 45 s timeout. The supplied Ubuntu 66 s result was not reproduced.',
'review-frontend-probes-storage':'All 6 original-component bug characterizations passed, including restricted localStorage and nullable future ball.',
'discord-local-real-clip':'Copied fixture CLI parse and a 242195 B schematic WebM passed. Signed HTTP ran locally only.',
'experimental-ui-state':'Review wrapper could not resolve its Playwright ESM entry; the index.mjs import fixed it.',
'experimental-ui-state-fixed':'Review Vite filesystem allowance excluded sibling HTML. No production component loaded.',
'experimental-independent-controls':'11 model controls passed; 2 internal child helpers ignored in the main run.',
'experimental-ui-state-allowfs':'Review React dependency alias was missing. No production-bug conclusion from this attempt.',
'experimental-ui-state-react':'Review /@fs HTML bypassed the React Refresh preamble. An explicit preamble fixed the harness.',
'experimental-ui-state-preamble':'The original component replay-switch characterization passed: old A results remain on replay B.',
'final-controls-rust-format':'Formatting passed, including the new review tests.',
'final-controls-workspace-tests':'131 passed; 4 ignored, including 37 review-wrapper passes (3 contract tests duplicate original modules). The optional payload probe skips parsing without its environment input; the absolute-fixture run is recorded separately.',
'final-controls-workspace-clippy':'Passed with warnings denied across the workspace, all targets and all features; no warnings.',
'final-controls-bindings-diff':'No tracked binding differences. Only an LF/CRLF advisory.',
}
pattern=re.compile(r'^(\| \*\*([^*]+)\*\*<br>.*? \| [0-9]+ \| [0-9.]+ \| )(.*)( \| \[log\]\(.*\) \|)$')
lines=[]
for line in t.splitlines():
    m=pattern.match(line)
    if m:
        summary=summaries.get(m[2],m[3])
        if summary=='PASS; full command output contains assertions/counts/source evidence.':summary='Completed; see the linked output for assertions, counts or source evidence.'
        line=m[1]+summary+m[4]
    lines.append(line)
t='\n'.join(lines)+'\n'

t=replace_section(t,'## Measurements','### Three copied replay fixtures','''## Measurements

| Measurement | Actual result | Method / limitation |
|---|---|---|
| Frontend dist | 16,568,921 B / 218 files; JS 3,078,374 B | Filesystem after the original production build; decimal bytes. |
| Startup main chunk | 1,767,683 B; Python gzip 464,141 B | Vite reported 467.16 kB gzip with its settings. The dynamic viewerEngine wrapper imports core constructors from main; some Babylon assets remain lazy. |
| Rank artwork | 23 PNGs, 9,695,742 B; largest 790,677 B | Displayed at 36–64 px; original quality checks pass. |
| Opened real replay IPC | 9,323,673 B typed JSON for 3,803 frames / 6 players | Actual storage/get-replay serialization, not native CDP tracing. Frames: 12,542,191 B JSON / 2,033,274 B zstd. Compact body and coach body: 160,468 B each; summary: 1,765 B. |
| IPC materialization | Debug inflate/Value 332 ms; Value→typed 133 ms; serialize 222 ms | One copied 3v3 fixture; not release or native IPC latency. |
| Warm unchanged analytics | 40 matches ≈97–104 ms; 400 ≈991–1265 ms | Synthetic compact records of 83,762 B, reconciled before timing. Independent rerun: 1053 ms for 400. Not a production percentile. |
| Library context, one mode | 24,564 characters for each of 1v1 / 2v2 / 3v3 | 60 synthetic matches, 20 per mode, 24 metrics; exact builder. |
| Final context per mode | 1v1: 32,776; 2v2: 33,759; 3v3: 32,776; All: 47,801 characters | All-mode library is 72,361 characters; selected match header and all evidence IDs are cut. Approximately 4 characters/token is not billed-token measurement. |
| Timeline tool | 30 s request → 120 rows spanning 0..7.933 s / 11,367 B | 15 Hz synthetic public-service frames; no actual-span or continuation metadata. A separate 16 KB dispatcher cap can drop oversized results. |
| Paused viewer | 25 renders / 4 s; CPU mean 2.412 ms, p95 3.2 ms, max 7.9 ms | Headless Chrome on Windows; foreground WebGL/high quality; 110 meshes; 774×483 canvas. CPU submission timing, not GPU timing or power. |
| Playing diagnostics | Cumulative 389 CPU samples: mean 1.177 ms, p95 1.8 ms; 388 intervals: p95 66.6 ms | Buffer includes earlier paused frames. Do not convert this to pure playback FPS. |
| Simulation runner deadline | 100 ms budget → ≈914–916 ms return | Safe synthetic parent exits; a finite child holds inherited pipes for 900 ms. No real RLTRAIN checkpoint. |
| Cost per answer | **Unverified; not currently measurable** | No provider calls; the app drops usage. Include planner, answer, repair, reasoning and cache costs using configured prices with provenance. Do not invent tariffs. |
''')
t=t.replace('Only copied snapshots under review/fixtures were parsed. Original files were not modified. Raw player identities/JSON were not persisted in the logs. There is no independently annotated goldentruth; allthree are2v2/3v3, with no real1v1/overtime/private/tournament corpus coverage.',
 'Only copied snapshots under review/fixtures were parsed; original files were not modified. Raw player identities and replay JSON were not persisted in logs. There is no independently annotated ground truth. All three fixtures are 2v2/3v3, leaving real 1v1, overtime, private and tournament coverage unverified.')
t=t.replace('| Copiedfixture | InputB | Frames/players | DebugCLIs | Releaseworkers | ReleaseoutputB | Replayelapsed/live s |','| Copied fixture | Input B | Frames / players | Debug CLI s | Release worker s | Release output B | Replay elapsed / live s |')
t=t.replace('Windows is available. The block is the reviewconstraint: QAdata does not isolate the realWindowsvault, and unmodifiednative scripts write tracked docs/validation or touchclipboard/processstate. Their source was read; browser-onlyEdge and localDiscordchecks were copied toreview-ownedwrappers andexecuted. No normalnativeApp was started. No additional approval was requested because the task expressly forbids credential reads.',
 'Windows is available. The review constraint blocks native launch: QA data does not isolate the real Windows vault, and unmodified native scripts write tracked docs/validation or access clipboard/process state. Their source was read. Browser-only Edge and local Discord checks were copied into review-owned wrappers and executed. No normal native App was started; the explicit credential-read prohibition applies.')
t=t.replace('| Originalcommand | Exit / duration | Exact reason |','| Original command | Exit / duration | Exact reason |')
t=t.replace('NOTRUNoriginal','NOT RUN original').replace('NOTRUN','NOT RUN')
t=t.replace('NeedsreleaseAppCDP and realstartupvaultread; writestrackedvalidation/fixedfixtures andcannotrununchanged underwriteconstraint.',
 'Requires release App CDP and startup vault access. Writes tracked validation artifacts and assumes fixed fixtures; cannot run unchanged under the write constraint.')
t=t.replace('Also readsrealclipboard.','Also reads the real clipboard.')
t=t.replace('StopsstoredpriorPID andexpectsupgrade-qa binary.','Stops a stored prior PID and expects the upgrade-qa binary.')
t=t.replace('Requiresfixtureupgradeversions/profileworkflow, notjustcurrentbinary.','Requires fixture upgrade versions and the profile workflow, beyond the current binary.')
t=t.replace('Writestrackedvalidation; review-ownedEdgewrapperpasses.','Writes tracked validation artifacts; the review-owned Edge wrapper passed.')
t=t.replace('Writes.local/validation andinheritsenvironment; review-ownedminimal-envwrapperpasses syntheticandcopiedfixture.','Writes .local/validation and inherits environment variables. The review-owned wrapper with a minimal environment passed synthetic and copied fixtures.')
t=t.replace('ExplicitlyremovesQAisolation andopensnormalprofile; outsideauthorizedscope.','Explicitly removes QA isolation and opens the normal profile; outside the authorized scope.')
t=t.replace('Userexplicitlyprohibits it; sourceonly inspected.','Explicitly prohibited by the user; inspected source only.')
t=t.replace('CurrenthostWindows; missingdeclaredicons sourceconfirmed. Linuxsystemlibraries/buildpanic/schema generation notreproduced. Cloudsetupscriptprovidedbutnotexecuted.','Current host is Windows. Missing declared icons are source-confirmed; Linux system-library requirements, build panic and schema generation were not reproduced. Cloud setup script provided, not executed.')
t=replace_section(t,'## Ignored tests and open verification gates','## Reproduction and cleanup','''## Ignored tests and open verification gates

Two existing tests remain ignored: ai::tests::live_synthetic_coach_stream requires a real provider, which was expressly forbidden; reenrich::tests::real_snapshot_reenrichment_end_to_end requires a separate snapshot fixture/environment. The two ignored review pipe tests are internal child helpers invoked by the deadline characterization, not skipped validation cases. Native job-object tests ran among the 9 Tauri unit tests with synthetic children. Direct release fixture-worker invocation did not test its parent limits.

Still unverified: live OpenAI/NeoToken/SIWC compatibility, actual usage/cost and proxy retention; native GUI/WebView2 interaction; clean-machine installer/upgrade; real RLTRAIN model/checkpoint fidelity; malicious OOM replay; GPU energy, real hardware, DPI, high refresh rates and long sessions; NVDA/JAWS; independent tactical/metric ground truth and 1v1/unusual-playlist fixtures; actual Discord delivery. Security findings do not assert a completed exploit. Competitor features are primary vendor claims, not hands-on performance evidence.

Fresh screenshots: 66 real-App/mockIPC before captures and 18 mockup captures at 1280×720, 1440×900 and 1920×1080. Additional validation screenshots isolate defects. Static mockups use synthetic data and inline assets; they are design proposals, not implemented production features.
''')
t=t[:t.index('## Reproduction and cleanup')]+'''## Reproduction and cleanup

After installing app dependencies, run review/serve_harness.mjs, then capture_before.mjs or validate_ui.mjs. The harness renders the real App through @tauri-apps/api/mocks and never starts Tauri or accesses the vault. Wrapper configurations and generators are review-owned. The parser generator copies the exact production collector into a separate review crate and records its method. AI/model generators extract exact private functions; public service probes use temporary directories. Logs retain failed attempts. Source and generated-binding diffs were checked after testing.

The fresh archive, dependency tree, throwaway private key and generated review bundler caches are temporary inputs/build outputs, removed after evidence capture. Logs, generators, review tests, screenshot manifests and mockups remain. No real profile or original replay was removed. See PLANS.md for the final cleanup/check state.
'''

c=replace_section(old_coverage,'| Area | Verdict','## Experimental model decisions','''| Area | Verdict | What was checked / limits |
|---|---|---|
| A. Replay parsing and metric correctness | needs work | Native collector; phases, thresholds, continuity, units, validation and discovery. Nine synthetic probes and three copied real parses. Event intervals/IDs fail; no independent tactical goldens. |
| B. Storage, migrations, analytics and performance | needs work | All migrations, schemas, queries, projection, versioning, JSON recovery and deletion; disposable storage proofs and real serialized payload. Bad-row startup is broken; warm queries scan the library. |
| C. Import pipeline and parser isolation | needs work | Every decoder route; worker launch, job, environment, output, time and cancellation limits; parent validation, stable inputs, hashes, tombstones, watcher and queues. Windows job tests ran; adversarial OOM was not demonstrated. |
| D. AI coaching | broken | Context, manifest, token estimates, truncation, validators, prompts, tools, memory, mode/history, providers, SSE, cancellation, offline answers and cost. Saturated All-mode context loses the selected match; prose grounding gates are incomplete. No live calls. |
| E. Experimental models | cut or rework | All xG, detector, simulation, intelligence, transfer, camera and reference implementations; synthetic positive/negative controls and UI state test. Per-model decisions below. Some grouped-CV and reconstruction safeguards work. |
| F. IPC, types and errors | needs work | All 61 IPC commands, 25 bare Value outputs and 1305 string lookups; generated DTOs, nullability, error conversion, blocking routes and real 9.32 MB payload. Typed boundaries do not validate before commit. |
| G. Frontend architecture and bugs | broken | App, pages, components, data, state, effects, fetching and stream ownership. Real-App harness with 40 matches; 6 targeted UI defects and 6 original-component characterizations. Incorrect personalized numbers and request races confirmed. |
| H. 3D viewer | needs work | All viewer modules; meshes, engine lifecycle, cameras, collision, interpolation, transport, shortcuts, storage and render budget. Paused rendering and chunk sizes measured. GPU energy, long sessions and native hardware remain unverified. |
| I. Design system and visual design | needs work | 4042-line CSS, tokens, type, inline styles, native controls, dead-class candidates, assets and team/status palettes; lexical census and fresh screenshots. Preserve palette; replace the design contract. |
| J. UX, IA and copy | needs work | Every page, populated/empty/startup states, deletion, streaming and onboarding at 3 sizes; copy inventory and core journeys. Existing Review CTA works, but hierarchy, disclaimer budget and Coach thread need rework. |
| K. Accessibility | broken | Computed contrast; Tab/Escape, focus, inertness, labels, selection/current semantics, live announcements, reduced motion, target size and zoom. Dialogs and unlabelled controls block core paths. NVDA/JAWS not tested. |
| L. Tests and CI | broken | Original commands, CI, configuration, tests, manual scripts, adversarial corpus, clean archive and dependencies. Fresh install and all-features fixture fail; original Playwright Stop race failed. Final controlled tests pass. |
| M. Security and privacy | needs work | CSP, capabilities, opener, vault/QA isolation, cloud consent, notes, snapshots, deletion, backups and Discord ingress/download/render/environment. Good boundaries exist; containment and retention need work. No real credentials read. |
| N. Repo hygiene and documentation | needs work | README, status/hardening, architecture, metrics, research and validation artifacts; paths, dead code, dependencies and build icons. Contradictions and missing inputs verified. Linux bundle not executed. |
| O. Product and coaching value | needs work | Player's next-focus journey, decoded but unused features, local-ingest positioning, primary competitor sources, cost and practice value. Connect moment → drill → check-in instead of separate feature panels. |
''')
c=replace_section(c,'| Model | Decision','## Required per-file ledger','''| Model | Decision | Reason / gate |
|---|---|---|
| Named-player bot likelihood | **delete** person score, badges and tool | Keyboard controls at the actual 15 Hz rate score 100; a saved human label remains eligible. No human/bot generalization proof. |
| xG | **rework**, Lab only | Keep grouped CV and held-out exclusion. Fix units, outcome definition, possession, mode/cohort, completeness and convergence. Cache/version the model and measure uncertainty. |
| RLTRAIN what-if | **hide behind a flag**; delete current Coach tool | Unknown all-car policy rollout lacks a candidate-action intervention; geometry gate and deadline are flawed. No real checkpoint exercised. |
| Reference ghosts | **keep and rework** | Useful qualitative comparison. Synchronize scope/playhead and remove blanket claims that ignore captured controls. |
| Intelligence/fingerprints | **rework** | Keep neutral recurring-moment retrieval. Coarse single-snapshot buckets and count trends do not establish tactical error or improvement. |
| Practice/transfer | **keep and rework** | Preserve hybrid self-check plus supporting telemetry. Make setup progressive and checkpoint/cohort explicit; before/after does not prove causality. |
| External score notebook | **hide behind a flag** or remove primary panel | Manual provenance does not provide a core next action. Retain exports only if players use them. |
''')

phrases={
'Full component/state/async guards/copy/fields/control flow reviewed; screenshot critique consolidated by root design pass.':'Component state, async guards, copy, fields and control flow reviewed; fresh screenshot critique included.',
'UX/copy/ARIA/state rendering source sections checked against fresh captures; deep state/runtime ownership belongs to frontend audit.':'UX, copy, ARIA and state rendering checked against fresh captures; state and runtime ownership reviewed separately.',
'Source read and call-site/contract/lifecycle checks; fresh real-App screenshots or original component characterizations used where applicable.':'Source, call sites, contracts and lifecycle checked; fresh real-App captures or original-component characterizations used where applicable.',
'Full source/schema read; traced call sites and relevant regression tests. Runtime proof uses only temporary synthetic profiles.':'Source/schema, call sites and regression tests reviewed. Runtime proofs use temporary synthetic profiles.',
'Disclaimer/label/state copy and information hierarchy checked; model internals reviewed by experimental-model agent.':'Disclaimers, labels, state copy and hierarchy checked; model internals reviewed separately.',
'Complete4step':'Complete 4-step', 'all4 fresh':'all 4 fresh', 'Read00/02/03/08':'Sections 00/02/03/08 read',
'All30 declarative':'All 30 declarative', 'exact-source15Hz':'exact-source 15 Hz',
'Context cache lookback3':'Context cache lookback of 3 s', 'supposed6-second':'proposed 6-second',
'lead15':'lead 15', 'Added10 review probes':'Added 10 original probes, expanded to 11 in the final suite',
'11passing,2internalignored helpers':'11 passing probes and 2 internal ignored helpers',
'safe testchildren':'safe test children', 'actualtemp-profile':'actual temporary-profile',
'geometry,label,missingdefender':'geometry, label, missing-defender',
'get_progress, template analysis':'get_progress, template analysis',
'seektime props':'seek-time props', 'before/after':'before/after',
'3child':'3 child', 'AllApp':'App',
}
def clean_plain(s):
    for a,b in phrases.items():s=s.replace(a,b)
    s=s.replace('.; ','. ').replace(';; ','; ')
    return s
parts=re.split(r'(`[^`]*`)',c)
c=''.join(s if i%2 else clean_plain(s) for i,s in enumerate(parts))

# Exact original commands, paths and inline quotations are retained.
old_test_codes=re.findall(r'`([^`]*)`',old_test)
new_test_codes=re.findall(r'`([^`]*)`',t)
assert old_test_codes==new_test_codes,'Test-report code spans changed'
assert re.findall(r'`([^`]*)`',old_coverage)==re.findall(r'`([^`]*)`',c),'Coverage file identities changed'
old_test_rows=[re.match(r'^\| \*\*([^*]+)\*\*',s)[1] for s in old_test.splitlines() if s.startswith('| **')]
new_test_rows=[re.match(r'^\| \*\*([^*]+)\*\*',s)[1] for s in t.splitlines() if s.startswith('| **')]
assert old_test_rows==new_test_rows,'Command ledger row identities/order changed'
test.write_text(t,encoding='utf-8')
coverage.write_text(c,encoding='utf-8')
print(json.dumps({'edited':['TEST_REPORT.md','COVERAGE.md'],'command_rows_preserved':len(old_test_rows),'command_code_spans_preserved':len(old_test_codes),'coverage_code_spans_preserved':len(re.findall(r'`([^`]*)`',c))}))
