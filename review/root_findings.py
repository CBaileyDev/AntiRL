from auditlib import finding, ROOT
def add(id,severity,category,title,file,line,problem,repro,actual,evidence,recommendation,effort='M',lead='new'):
    lines=(ROOT/file).read_text(encoding='utf-8-sig').splitlines()
    quote='\n'.join(lines[line-1:line+1])[:900]
    finding(id=id,severity=severity,category=category,title=title,location={'file':file,'line':line,'quote':quote},problem=problem,trigger_or_repro=repro,expected_vs_actual=actual,evidence=evidence,recommendation=recommendation,effort=effort,confidence='confirmed',lead=lead)
add('L-001','P1','Tests and CI','A clean checkout cannot pass the very first CI install step','app/pnpm-workspace.yaml',1,
 'The committed allowBuilds value is a sentence instead of a boolean. Cached node_modules hides the failure on a developer machine. CI installs from scratch and exits before any checks.',
 'git archive HEAD into review/snapshot, then original pnpm --dir app install --frozen-lockfile. Exit1 ERR_PNPM_IGNORED_BUILDS esbuild@0.25.12. Original cached install exit0.',
 'Expected deterministic frozen install from clean source; actual requires an undocumented CLI override.',
 'review/logs/fresh-install-original.txt; review/logs/fresh-install-workaround.txt; .github/workflows/quality.yml:26',
 'Replace placeholder with explicit reviewed esbuild:true policy, verify a clean CI checkout, and keep frozen install as the release gate.','S','confirmed')
add('L-002','P1','Tests and CI','The all-features test target includes a private file missing from git','crates/coach-services/src/chatgpt.rs',733,
 'include_bytes requires a synthetic RSA key ignored by *.pem. Existing machine has a pre-existing ignored fixture, masking clean-clone failure.',
 'Original cargo test -p coach-services --all-features --locked against git-archive snapshot exits101 missing synthetic-oidc-test-key.pem; throwaway openssl key in snapshot makes target pass.',
 'Expected self-contained tests; actual CI compile fails after install is repaired.',
 'review/logs/fresh-all-features-original.txt; review/logs/fresh-all-features-workaround.txt; .gitignore:26',
 'Generate a clearly non-secret test key at test runtime or commit an explicitly synthetic fixture with an exact ignore exception. Do not depend on local vault or ignored inputs.','S','confirmed')
add('L-003','P2','Tests and CI','Coach cancellation test races a stream that ends after 3.6 seconds','app/tests/harness.tsx',126,
 'The stream lifetime is wall-clock coupled to multiple scroll, resize and screenshot assertions. Stop can click after final completion, then the expected partial-cancelled status never appears. Broad retries conceal the regression signal.',
 'Original pnpm --dir app exec playwright test:8pass/1fail, coaching.spec.ts:50 waits for cancelled partial response. Serial installed-Chrome workaround9pass.',
 'Expected deterministic gate on an open stream; actual load-dependent failure.',
 'review/logs/playwright-original.txt; review/logs/playwright-workaround-2.txt; app/tests/coaching.spec.ts:49-50',
 'Use a controllable stream barrier and wait for explicit callback acknowledgements; test Stop before separately releasing completion. Keep timing-sensitive performance tests separate.','S','confirmed')
add('L-004','P2','Tests and CI','The adversarial coaching corpus has no executable assertions or runner','docs/validation/coaching-corpus.json',1,
 'The corpus is prose expected_limit strings and fixture labels, with no associated actual inputs, output assertions, provider stub replay or CI runner. It cannot enforce the coaching honesty contract.',
 'Search all tracked references to coaching-corpus and inspect package scripts/CI; no runner found. Review probes accept invented numbers and forecasts.',
 'Expected runnable adversarial contracts across offline/stream/analysis routes; actual documentation-only intentions.',
 'docs/validation/coaching-corpus.json; .github/workflows/quality.yml; review/logs/ai-probes-test-final.txt',
 'Turn each row into concrete fixture + structured expected assertions. Run against deterministic stubs, validate streamed and final content, and retain tactical human evaluation separately.','M','confirmed')
add('L-005','P2','Tests and CI','Platform-neutral Rust crates have no Linux/macOS CI proof',' .github/workflows/quality.yml'.strip(),9,
 'One windows-latest job mixes platform-neutral computation, browser behavior and native packaging. It prevents cheap fast Linux core checks and leaves non-Windows compile/config differences undiscovered.',
 'Inspect the single jobs.windows runner, no other CI workflows cover these crates.',
 'Expected core/parser/service tests across supported compilation platforms and dedicated Windows native release gates; actual Windows-only combined job.',
 '.github/workflows/quality.yml:9-13; review/logs/cargo-duplicates.txt',
 'Split cross-platform Rust/parser/service and frontend gates from Windows job-object/WebView2/installer lanes. Do not claim full desktop Linux support until a package is validated.','M','confirmed')
add('L-006','P2','Tests and CI','Manual native QA writes tracked evidence and depends on machine state','scripts/test-native-hardening.mjs',1,
 'Manual scripts use fixed CDP ports, old fixture paths and docs/validation output. Some read the real clipboard. They are not isolated reproducible regression gates and cannot safely run unchanged under this review constraint.',
 'Read every test-native script; native App eager AI-status calls Windows keyring even with QA profile. Original scripts NOT RUN. Browser/Discord-only scripts run through review output-path wrappers.',
 'Expected fresh profile/fixture/output parameters plus test credential backend; actual hardcoded machine integrations.',
 'review/STORAGE_SECURITY_REVIEW.md; review/manual_wrappers.py; review/manual-output/',
 'Provide a first-class test mode with memory-only vault/provider stubs, argv/env profile and output paths, owned ephemeral CDP ports and deterministic fixture manifests; add Windows CI automation.','L','confirmed')
add('L-007','P2','Tests and CI','Replay Studio math checks never run from pnpm test or CI','app/package.json',11,
 'test:unit is rank artwork/refresh-budget checks. The independent replayMath suite covers frame indexing, camera geometry, score and perspective but no package or CI script runs it.',
 'node scripts/test-replay-studio.mjs passes; inspect pnpm scripts and workflow. No reference to the script in runner configuration.',
 'Expected important pure logic tests in the default check; actual manually discoverable script.',
 'review/logs/studio-unit.txt; app/package.json:11; .github/workflows/quality.yml',
 'Wire all pure math/contract suites into a named unit test runner. Keep asset checks but label them correctly.','S','confirmed')
add('L-008','P2','Tests and CI','Rust tests regenerate production IPC source as a side effect','src-tauri/src/main.rs',147,
 'export_ipc_bindings writes app/src/bindings.ts inside an ordinary unit test and normalizes it after export. Test execution should not change production files, race a frontend build or require repository write permissions.',
 'Workspace tests include export_ipc_bindings; source shows export to the production path. This session resulting git diff is empty, so no contract drift found.',
 'Expected generate-to-temp and compare; actual test writes live source even when output is identical.',
 'src-tauri/src/main.rs:147-171; review/logs/rust-workspace-original.txt; review/logs/bindings-diff.txt',
 'Separate explicit types:generate from a test that generates to a temporary file and compares bytes/schema.','S','new')
add('N-001','P2','Repo hygiene and docs','Launch and provider validation ledgers contradict each other','docs/PROGRESS.md',20,
 'PROGRESS marks NeoToken live streaming PASS; HARDENING says no live paid OpenAI/NeoToken calls performed. README says all DB/vault commands offload blocking work although chat/analyze call the synchronous service directly. Schema/test/build artifact counts also vary.',
 'Compare docs/PROGRESS.md:20,28 vs HARDENING:40,51; inspect commands.rs chat/analyze. This session builds MSI19.90MiB/NSIS17.50MiB, not historical7.14/5.22.',
 'Expected dated evidence and one current release-status source; actual mutually incompatible current-looking assertions.',
 'review/logs/native-build-original.txt; docs/HARDENING_CHECKLIST.md:40-55; README.md:33; src-tauri/src/commands.rs:184,209',
 'Archive historical status explicitly; publish a single commit/platform/date-linked validation manifest with PASS/FAIL/NOT RUN and artifact hashes. Correct architectural claims from code.','M','confirmed')
add('N-002','P2','Repo hygiene and docs','Research is a root-level prose specification with image-only formulas and circular authority','AntiRL Coaching Evidence Research.md',1,
 'The large root research file mixes hypotheses, recommendations and alleged engine truths. Thresholds are embedded PNG formulas, hard to search/diff or use as machine contracts; much authority resolves back to this repo. Self-critique and rejected decisions are separated from main normative text.',
 'Read sections00,02,03,08+self-critique and RESEARCH_AUDIT; inspect image1..image80 definitions. Parser exposes approximation rather than game supersonic state; several recommendations deliberately rejected.',
 'Expected plain-text mathematical definitions with independent citations and accepted/rejected status; actual easy-to-misapply proposal.',
 'review/PARSER_REVIEW.md; docs/archive/reviews/RESEARCH_AUDIT.md; AntiRL Coaching Evidence Research.md',
 'Move to dated research archive, transcribe equations and units into versioned data contracts, retain uncertainty/counterexamples, link accepted decisions to tests.','M','confirmed')
add('N-003','P3','Dependency health','Several major frontend releases are behind and update policy is absent','app/package.json',21,
 'Babylon8.56.2 vs9.29.0, Vite6.4.3 vs8.3.2, TS5.9.3 vs7.0.2, React plugin4.7.0 vs6.1.2 and lucide0.468.0 vs1.52.0 are reported. Age is not evidence of a vulnerability; update testing/migration policy is the missing control.',
 'pnpm --dir app outdated returns current/latest versions; pnpm audit reports no known vulnerabilities.',
 'Expected documented support/update windows and staged perf/visual/type regression checks; actual large migration backlog.',
 'review/logs/frontend-outdated.txt; review/logs/frontend-audit.txt',
 'Schedule updates by supported security/maintenance need and measured benefit. Upgrade one major family at a time with viewer visual/performance baselines; no blanket migration.','M','confirmed')
add('N-004','P3','Dependency health','Rust dependency splits increase build/maintenance surface','Cargo.toml',1,
 'cargo tree -d lists repeated crate major/minor families from Tauri/network/crypto/parser dependencies; some are unavoidable. There is no documented audit of which can be unified versus upstream constrained.',
 'Run cargo tree -d and inspect duplicate trees. Current workspace clippy clean; no duplicate-induced runtime bug proved.',
 'Expected a bounded justified dependency graph; actual ~11 substantive version families to assess.',
 'review/logs/cargo-duplicates.txt',
 'Record required splits; align direct dependencies where compatibility permits, make disabled sign-in dependencies optional, compare binary/build-time effects.','S','confirmed')
add('O-001','P1','Product and coaching value','The app has no single evidence-to-practice path that answers what to fix next','app/src/pages/Overview.tsx',51,
 'Landing presents profile and aggregate KPI tiles; post-match review and practice are separated among Studio/Coach/Progress. Recent matches lack a concise player-relative verdict, two cited moments and a next-match cue. Experiments occupy Studio before useful review.',
 'Fresh heavy-user Overview/Studio/Progress screenshots at all3sizes; user wants one serious ranked player next focus.',
 'Expected import -> Match Report -> one focus -> drill -> check next matches; actual browse tools, infer problem, ask a question, manually construct practice.',
 'review/screenshots/before/overview-1440x900.png; replay-studio-1440x900.png; progress-goals-1440x900.png',
 'Make deterministic Match Report the hero, Today the action surface, and practice transfer a first-class loop. Reserve AI for explaining bounded evidence and options.','L','new')
add('O-002','P2','Product strategy','Automatic local ingest is valuable but no longer a unique market feature','src-tauri/src/auto_import.rs',1,
 'The supplied differentiator claim overlooks DataCoach official desktop watcher/auto-upload replacement. AntiRL must compete on private local analysis, specific next actions and provable practice transfer rather than a generic watcher.',
 'Independent public primary-source research6Oct2026: DataCoach article4May2026 describes its watcher and automatic uploader without BakkesMod.',
 'Expected defensible positioning; actual local ingest alone is insufficient differentiation.',
 'https://www.datacoach.gg/blog/bakkesmod-is-gone-your-auto-replay-uploads-dont-have-to-be; review/MARKET_REVIEW.md',
 'Position around private replay analysis and one focused practice loop; state replay saving still needed and do not claim exclusive EAC-compatible ingestion.','M','new')
add('O-003','P2','Product and coaching value','Rich decoded telemetry lacks actionable baseline analysis surfaces','crates/replay-core/src/types.rs',138,
 'Pad pickups, car/ball trajectories, stat shots and replicated controls can support more valuable review than five summary resource/location numbers. Current UI lacks pad route/steal review, positioning heatmaps, recovery comparison and you-versus-opponent baseline strips. Touch outcomes/50-50s need additional capture and human validation, not invented probabilities.',
 'Inspect ReplayAnalysis native-rate pad_events/shots and render frames; compare Studio displayed metrics and Progress cards.',
 'Expected specific spatial moments that lead to drills; actual generic averages and experimental score widgets.',
 'review/PARSER_REVIEW.md; review/EXPERIMENTAL_REVIEW.md; review/screenshots/before/replay-studio-1440x900.png; https://ballchasing.com/doc/api; https://www.calculated.gg/',
 'Prioritize pad routes, shot context, recovery time and heatmaps. Add native-rate touches before contest/touch-quality models. Ship transparent detectors with timestamp review and per-mode baselines, not a new uncalibrated rating.','L','new')
print('Root findings appended')
