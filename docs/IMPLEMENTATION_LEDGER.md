# AntiRL upgrade implementation ledger

Status: accepted P0/P1 source changes implemented; local automated and packaged smoke checks completed. External research/provider and release-quality gates remain open as listed below. Existing uncommitted work and user storage are preserved.

## Behavior delivered

- One metrics-2 dictionary across backend, UI and prompts. Canonical `boost_active_at_supersonic_speed_s` has an explicit legacy adapter; threshold uptime is separate. No universal waste targets or arbitrary scores. Old assistant messages and affected memory notes carry review warnings without deletion. Parser observations preserve null, measured zero and duration-weighted sufficient statistics.
- Bottom-follow pauses on manual reading/selection; Jump to latest, per-chat reading positions, resize anchors, cancelled/error partial replies and request guards. Mode/preset conversations support creation, search, rename, archive and isolated histories. Existing records migrate to marked All/legacy scope with SQLite-aware backup.
- Optional editable rank/target/long-term target and practice/match hours per mode, onboarding skip/completion persistence, primary-mode and queue preferences. No seeded personal ranks, fabricated MMR or default hours. Saved practice plans/completion reports and rank observations are explicitly self-reported; they do not imply improvement or forecast accuracy.
- Boost percentage ring represents current observed state, including neutral unknown, seeks and player changes. Full interior ceiling and upper transitions remain for player views. Camera-aware spectator cutaway is toggleable. Wall/ramp/goal materials, restrained lighting, trim depth bias, small/large pad silhouettes and low/high quality settings preserve reconstruction transforms. Pad glows are decorative; exhaust inference requires continuous observations and resets on seeks.
- Analytics schema v2 persists canonical matches, participants, metric provenance/sufficient statistics, evidence events, projection watermark and versioned aggregate snapshots. Queries scope to explicit personal identity/mode; latest 20 eligible dated games, prior 20 and lifetime are disclosed with exclusions. Unknown dates remain lifetime-only; timezone uncertainty and legacy equal-match aggregation are explicit. Revision/re-import/deletion reconciliation and transactional rebuild are tested.
- Deeper-history browser and bounded read-only tools expose paged matches, metrics, events/timeline windows, practice history and honest benchmark unavailability. Provider-neutral JSON query-plan validation supports up to six reads and 16 KB output; native function-calling capability is unconfirmed and is not claimed. Provider planning failure uses disclosed deterministic retrieval. Scope, identities, paths, URLs and SQL cannot be supplied by the model.
- Common/mode/preset prompt modules are versioned. Three independently reviewed limited research cards include citations and lineage. Structured analysis checks exact metric values, citation existence, required fields and prohibited claims, with one repair attempt and honest fallback/abstention. Tactical prose remains unreviewed. External text is treated as untrusted data.
- Catalog contains 20 codes independently confirmed against seven official published pack tables, with source/date/verification metadata. Missing rank labels remain unspecified; authored drill suggestions are not validated interventions. Pack codes must come from retrieved records. Live search reports unavailable because no supported connector is configured.
- Safe Markdown tables/links; selection and clipboard actions; visible-snapshot Markdown/text/JSON export through native dialogs, including partial status and bounded allowlisted data.

## Actual validation — 2026-10-05

| Check | Actual result |
|---|---|
| `cargo test --workspace` | PASS: 25 tests, 1 opt-in live-provider test ignored in standard suite. Includes legacy populated-schema migration/backup, weighted observations/null/zero, canonical reconciliation, failed-rebuild rollback, actual child-process exit during projection, startup reconciliation and practice restart/scope isolation. |
| Frontend TypeScript/Vite production build | PASS. Existing mixed-import/chunk-size warnings remain (main chunk approximately 561 KB uncompressed). |
| `node scripts/test-coaching-ui.mjs` | PASS: synthetic ring percentages/unknown, safe Markdown, wheel/PageUp streaming pause, selection/resize anchor, late callbacks, cancellation, visible export snapshot and optional onboarding fields. |
| Replay Studio, rank artwork/quality and mesh regression scripts | PASS: `test-replay-studio.mjs`, `test-ranks-quality.mjs`, `test-studio-meshes.py`. |
| `./scripts/tauri.ps1 build --bundles nsis` with isolated target directory | PASS: final packaged executable and 15.78 MiB NSIS installer built. Bundled executable was smoke-tested, not installed over the user's app. |
| `test-native-upgrade.mjs` | PASS in packaged WebView2: analytics rebuild, assets, chase/overhead/broadcast/orbit; ceiling restored when cutaway disabled; boost 0/25/50/75/100/null after seeks and 80 after player switch; floor/corner/goal/wall/ceiling screenshots captured. |
| `test-native-workflows.mjs` | PASS: mode/preset/rename/archive, offline message persistence, source-backed catalog, denied wrong-mode retrieval, practice completion/isolation, deeper-history UI and metric table. |
| `test-native-export.mjs` | PASS: actual Windows Markdown/text/JSON Save As and cancellation; response copied to Windows clipboard, previous clipboard restored; dummy private fields excluded. |
| `test-native-restart.mjs` | PASS: actual QA process restart retains messages/practice; analytics reconciles and skipped onboarding does not repeat. |
| Screenshot inspection | Inspected native floor/corner/goal/wall/ceiling, overhead, evidence table, practice and prior chat/onboarding screenshots. Found and fixed trim overlap and evidence-table spacing. |
| Native performance | Synthetic two-player/six-frame fixture, 759x474 render, 2-second playback samples. Actual values recorded in `docs/validation/native-performance.json`; CPU/driver wall time is not GPU time. High/low throughput is measured against 90/30 FPS targets. This does not certify full-match, six-car or lower-end hardware performance. |
| Live provider | FAIL/external gate: latest configured NeoToken `glm-5.3-flash` synthetic request returned HTTP 504 before any streamed content, after two earlier 504 attempts. Consent/provider/model checked without printing credentials; no provider switch or raw replay upload. |
| Research | Independently checked sources and all 20 official codes. Corrections/rejections and remaining evidence gates are documented in `docs/RESEARCH_AUDIT.md`. |

Native JSON results and synthetic screenshots are in `docs/validation`. Thirty authored synthetic coaching expectations are not thirty live or human-reviewed model outputs.

## Remaining gates and precise limitations

- Live provider streaming, provider-selected tool behavior and tactical output quality require a working configured endpoint. No supported live-search connector is configured; local catalog search works. Codes remain source-confirmed, not in-game tested.
- Comparable benchmark data, independent annotations, held-out grading validation and longitudinal forecast calibration were not supplied. Grades, benchmark percentiles and weeks-to-rank forecasts remain unavailable. Practice/reassessment works without them. The research report's arbitrary grading weights and promotion claims were rejected.
- Qualified human review of actual coaching outputs, a full real-replay release corpus, longer six-car/native GPU performance and lower-end hardware checks remain unrun. The original live scroll/ring problem was not captured before edits; source and synthetic post-change regression evidence are available, not invented before screenshots.
- Analytics rebuild uses one verified SQLite transaction in the existing WAL database rather than a temporary-file swap: readers observe old or committed-new state, with rollback/crash recovery demonstrated. Historical missing denominators cannot be reconstructed by migration; a fresh replay reanalysis is required for those measurements.
- Evidence planning uses one bounded validated query-plan phase, not a claimed native function-calling loop. The deeper-history UI remains available independently of provider availability. Within-match prose/interpretation validation is not proof of tactical truth.
- Clean-machine installer behavior was not tested. The packaged executable smoke test and actual native dialogs are completed; installer creation alone is not clean-machine installation proof.

## Publication privacy

The public snapshot excludes private local Git history, machine-local agent files, downloaded research tools, raw replays, runtime databases, keys and personal handoff/profile examples. The raw Gemini report stays local; its generic reviewed audit is published. Only synthetic screenshots/results are included. Original files and user data remain in the working checkout.
