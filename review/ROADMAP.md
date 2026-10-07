# AntiRL: rebuild the coaching loop, preserve the identity

Review target `6762f8c`, 6 October 2026. This is a proposal; no production implementation was made. The navy/near-black, indigo/violet, team blue/orange palette stays. A serious player should finish a session knowing **one thing to practise, why, and which later moments will show whether it transferred**. The detailed layouts and tokens are in [DESIGN_REVIEW.md](DESIGN_REVIEW.md); six runnable visual proposals are in [mockups/](mockups/).

The order below separates trustworthy foundations from surfaces that depend on them. Epics 8–11 can run in parallel once identity/evidence contracts stabilize. Effort: S = several focused days; M = roughly one to two engineering weeks; L = multiple weeks or coordinated work. These are planning ranges, not delivery promises.

## 1. Make a fresh checkout a release gate

**Problem:** local caches hide an install policy failure and missing paired RSA test fixture. Manual QA depends on a personal machine and reads state outside its QA profile.

**Proposal:** repair the esbuild build policy; generate a synthetic key/public-JWKS pair reproducibly at test time; check declared icon paths; run neutral Rust/frontend checks on a small platform matrix; keep a separate Windows lane for job objects, WebView2 and packaging. Promote Studio math and executable adversarial contracts to default checks. Give native QA an isolated credential backend, explicit profile/fixtures/output paths and owned ephemeral CDP ports.

**Resolves:** L-001–L-008, N-005, M-002. **Risk:** a passing mock suite can still conceal installer/runtime failure. **Effort:** M. **Dependencies:** none. **Acceptance:** clean archived source installs and passes without local secrets; native QA can assert its profile/vault identity before work; installer launch on an isolated Windows account is a separate recorded gate.

## 2. One typed identity, result and measurement contract

**Problem:** unknown identity becomes another player's win; absent measurements become zero; settings can be persisted before DTO rejection. Flexible JSON and substring errors hide these mismatches.

**Proposal:** introduce typed PlayerScope, MatchResult (win/loss/draw/unknown), PlaylistScope, Measurement (value/unit/numerator/denominator/coverage/method/version), DateProvenance and SettingsPatch. Resolve identity once, by stable platform ID, and pass it through every report/context. Replace bare domain Values incrementally at IPC boundaries; return typed error codes with recoverable action. Turn on strict null checking after auditing consumers.

**Resolves:** G-001–G-003, B-005–B-007, F-001–F-003, F-050/F-051, D-025, A-006–A-009, A-016/A-026, H-006. **Risk:** old profiles need compatibility mapping and explicit unknown states. **Effort:** L. **Dependencies:** 1. **Acceptance:** all three modes, ties, absent identities and missing telemetry produce correct results in backend, frontend, exported reports and coach context; real zero remains distinct from missing.

## 3. Repair the event collector and prove continuity

**Problem:** overlapping detectors reject a replay, while event intervals include absent actors or deliberately excluded timing gaps. Existing tests do not exercise collector frames.

**Proposal:** give events stable unique identities including detector type; close active windows at missing/discontinuous observations; expose omitted-time coverage; define kickoff/goal replay/overtime phases using decoder constants. Add synthetic property/sequence tests and an independently annotated fixture corpus with permissions, covering forfeits/leavers/private/tournament modes. Preserve the correctly named 2200-threshold metric; add exact-state hysteresis only as a separately validated metric.

**Resolves:** A-001–A-010, A-017–A-021, C-001. **Risk:** changing event IDs breaks historical citations unless versioned/mapped. **Effort:** L. **Dependencies:** 2. **Acceptance:** each event interval is supported by contiguous observations; sum/coverage invariants hold; replay output validation rejects impossible ranges and statistics; old citations remain identifiable or explicitly stale.

## 4. Make profiles resilient and metric upgrades real

**Problem:** one malformed coach row aborts startup; metrics never re-derive; copies and backups retain deleted content.

**Proposal:** open source storage independently of analytics; quarantine individual bad records with a repair/export action; version source capture and derived metrics; add a resumable re-derivation job through the isolated worker. Normalize durable replay metadata so compact coaching views and projection tables do not duplicate whole blobs. Document deletion scope and backup retention; let users remove retained copies deliberately.

**Resolves:** B-001/B-003/B-008/B-009, A-015, M-007, L-008. **Risk:** migration/data loss is the highest implementation risk; use snapshot backups plus rollback and fault-injection tests. **Effort:** L. **Dependencies:** 1–3. **Acceptance:** a bad replay cannot deny access to healthy library/settings; an interrupted upgrade resumes; metric-version eligibility is explicit; deletion/backup policy matches actual files and chat lineage.

## 5. One bounded ingestion service for every decoder

**Problem:** camera/intelligence/re-enrichment and remote Discord parse routes bypass desktop worker containment; unchanged folders emit repeated per-file work/events.

**Proposal:** route every network decode through a common bounded worker protocol with typed output revalidation, minimal environment, job/process-tree cleanup, memory/output/time limits and cancellation. Use file-change notifications plus a debounced reconciliation scan, cached identities and one summarized progress event. Make queued cancellation and fairness explicit. Keep saved-replay detection honest: it does not automatically save the game.

**Resolves:** C-001–C-005, M-004–M-006, F-004, A-018/A-019. **Risk:** filesystem notifications can drop events; reconciliation remains necessary. Discord deployment needs its own OS containment strategy. **Effort:** L. **Dependencies:** 2–4. **Acceptance:** every decoder call has containment and cancellation proof; unchanged 1,000-file folders produce bounded work/events; adversarial inputs cannot hold an unbounded busy lock.

## 6. Incremental SQL analytics with explicit cohorts

**Problem:** each query rebuilds/checks the whole library under locks, and aggregation mixes versions, modes, date grammars and unequal match exposure.

**Proposal:** derive projections at import/change time, read indexed numeric tables for query-time analytics, and repair only revision-mismatched records. Add messages(conversation_id, sequence/time) index. Use one date parser and completion/roster eligibility model. Offer same-mode/player/version 10/25/50-game cohorts, exposure-weighted rates where appropriate, and correctly labelled equal-match means where useful.

**Resolves:** B-002/B-004–B-007, A-014/A-020/A-026, G-014, E-023. **Risk:** projection invalidation must be correct before caching. **Effort:** M–L. **Dependencies:** 2–4. **Acceptance:** warm queries over 40/400/4,000 unchanged records do not parse frame/coach blobs; SQL plans use indexes; independent known-cohort calculations match displayed values.

## 7. A playback transport that scales and idles

**Problem:** a real replay opens with 9.32 MB JSON and repeated materialization; Babylon leaks into startup, while a paused foreground viewer keeps rendering.

**Proposal:** lazy-load Studio and all value-level Babylon dependencies; keep compact match metadata separate from frame access. Benchmark chunked binary or compressed frame transport with typed decoding and bounded caches. Retain one viewer engine where practical, reuse scene assets, and render on demand when paused; invalidate on seek, resize, camera or visual changes. Cache stationary collision work and prefer typed buffers over per-frame allocations.

**Resolves:** F-005, H-001–H-005, H-007/H-008, I-002/I-008. **Risk:** camera damping and async assets must still trigger rendering; batching must not introduce timing drift. **Effort:** L. **Dependencies:** 2–3. **Acceptance:** measure first-open IPC, peak memory and response latency on representative six-player matches; settled paused scene submits zero frames until invalidated; long replay switching releases resources; report CPU and GPU separately.

## 8. Explicit provider adapters and cost accounting

**Problem:** provider protocol/capabilities are guessed from strings; errors lose detail; usage is discarded; timeout/cancellation and third-party retention are ambiguous.

**Proposal:** define adapters with verified protocol, model catalog, reasoning/stream/error/usage capabilities and persistence controls. Reuse HTTP clients; separate connection, inactivity and overall deadlines; propagate cancellation through retrieval/tools. Record planner, answer, repair and reasoning/cache usage plus configured price provenance. Offer a request budget and cost chip only when a trustworthy estimate exists. Treat NeoToken as a named third party with a visible data contract.

**Resolves:** D-015–D-019, D-022/D-023, E-013, G-015/G-016, M-002. **Risk:** actual APIs/account capabilities require a separately authorized live validation run. **Effort:** M. **Dependencies:** 1–2. **Acceptance:** deterministic fixtures cover every SSE event/error and partial cancellation; usage sums all calls; model defaults are provider-specific; no invented dollar quote or retention promise.

## 9. Typed evidence bundles and one grounded coaching pipeline

**Problem:** historical prose crowds out the selected match; prompt text doubles as a database; streamed content is displayed before gates; validators reject honest explanations yet accept invented prose values.

**Proposal:** make CoachingRequest immutable and scoped. Reserve budget for the selected match/player/windows before optional history. Use a tokenizer or verified provider budget with omission metadata. Return typed numerical/evidence references and approved drill IDs; render prose around those references. Validate final and provisional content, normalize training codes, preserve citation timestamps and history lineage. Replace substring planner with bounded native tool/structured selection; paginate timeline windows. Build a useful deterministic offline answer that responds to the question and attached moment.

**Resolves:** D-001–D-014, D-020/D-024–D-027, D-018/D-019, M-003, E-013, L-004. **Risk:** excessive gates can recreate generic fallback/over-hedging. **Effort:** L. **Dependencies:** 2–3, 6, 8. **Acceptance:** malicious names/notes cannot change typed counts/scope; chosen match survives heavy-library budgets; valid negations pass; unsupported claims/codes never reach the visible stream; offline answers offer one evidence-linked action.

## 10. Tokens, accessible primitives and a confidence budget

**Problem:** thousands of override styles, tiny low-contrast labels, inconsistent colors, native controls and broken dialogs make the product feel improvised.

**Proposal:** implement the token specification and Button, Select, Switch, Segmented, Dialog, Popover, Tooltip, Tabs, Toast, Slider, Stat and chart primitives. Keep Inter, use tabular numerals, semantic team/status aliases, verified contrast, visible keyboard focus, managed dialog focus/inertness, streaming announcements and app-wide reduced motion. Replace repeating caveat paragraphs with Measured/Estimated/Experimental badges and method popovers. Set a visible disclaimer budget per surface.

**Resolves:** I-001–I-007, J-007/J-009/J-012/J-014, K-001–K-011, D-021, A-011/A-013. **Risk:** a visual rebuild without keyboard/screen-reader testing repeats accessibility debt. **Effort:** L. **Dependencies:** 2, stable claim labels from 9. **Acceptance:** keyboard-only completion of onboarding/import/review/chat/delete; contrast across normal/hover/disabled states; zoom/reflow and reduced-motion checks; no duplicate headings or unneeded developer-status text.

## 11. Routes, explicit state ownership and a command palette

**Problem:** navigation, replay requests, drafts and generation live in one App component; navigation cancels answers and late requests change the user's selection.

**Proposal:** add deep links such as /replays/:id?t=84.6, /coach/:conversation and /progress?mode=2v2. Give the active replay and playback clock explicit owners, key fetch/cache entries by identity, ignore stale responses and preserve settings drafts. Keep conversation generation outside page lifetime; route changes can reveal a background answer status. Ctrl+K opens a keyboard-accessible command palette for match/moment/action navigation.

**Resolves:** G-004–G-012/G-016–G-018, G-020/G-021, F-050, K-006. **Risk:** routing/back behavior and persisted selection need native/browser parity. **Effort:** M–L. **Dependencies:** 2, 7, 10. **Acceptance:** deferred-response race tests pass; links restore the correct player/match/time; drafts survive unrelated refreshes; navigating to evidence keeps generation alive unless Stop is explicit.

## 12. Match Report and Today become the product's center

**Problem:** Overview offers calibration/KPIs rather than a verdict; data exists but does not become a default evidence-to-practice sequence.

**Proposal:** after import, open a player-relative Match Report: result, one written verdict, same-mode personal-baseline strip, two or three timestamped focus moments and one practice CTA. Today shows the week's one focus, recent reports, short trends, pending practice/check-in and importer status. Build the first report deterministically; use AI for optional explanation. Introduce the 60-second onboarding with candidate identity, primary mode/rank and first import, progressively collecting other profile fields.

**Resolves:** O-001–O-003, J-001/J-005/J-006/J-009/J-010, G-001–G-003, A-011/A-012/A-025, E-020/E-021. **Risk:** baselines alone do not establish tactical quality; moment recommendations need reviewed definitions. **Effort:** L. **Dependencies:** 2–3, 6, 9–11. **Acceptance:** a new user reaches one reviewable moment without a provider; a returning user can start a short drill in two deliberate actions; all cohort/coverage and judgement labels are accessible on demand.

## 13. Timeline-first Studio, with experiments in Lab

**Problem:** the canvas pushes transport below the supported viewport, and experimental panels precede Review next. Lab actions use a stale clock.

**Proposal:** full-width canvas with overlaid transport, visible keyboard controls and minimap; a multi-lane team-colored timeline with accessible larger moment targets; docked Review/Events/Stats/Lab rail. Every claim uses one seek command and live playhead. Review is default. Lab holds transparently experimental xG/reference/simulation diagnostics and stays closed unless invoked.

**Resolves:** J-003/J-004, G-005/G-017/G-018, H-003–H-008, K-004/K-010, E-017/E-018/E-024. **Risk:** canvas/DOM overlays must remain usable at 720p and high DPI; team colors cannot carry meaning alone. **Effort:** L. **Dependencies:** 3, 7, 10–11. **Acceptance:** play, pause, seek, select event and change camera without scrolling at 1280×720; keyboard path and time links agree; changing replay clears scoped Lab state.

## 14. A full-height Coach with evidence beside the answer

**Problem:** conversation administration dominates the page; single-line input, raw metadata, repeated fetches and uncertainty walls hide useful advice.

**Proposal:** conversation rail, readable thread, growing composer, compact scope chips and evidence panel whose cards play the cited window. Consent is provider/scope-aware and remembered; show a compact cost/data chip with a details popover instead of repeating a preview wall. Coach answers with one focus, a concrete moment, a short drill and next-match cue; allow optional follow-up detail. Export canonical structured conversation/evidence data, not innerText.

**Resolves:** J-002/J-007/J-008/J-011/J-014, G-005/G-007/G-008/G-010–G-012, D-013/D-018/D-020/D-021/D-026/D-027, K-008. **Risk:** context changes while a request runs must not silently change its scope or consent. **Effort:** L. **Dependencies:** 8–11. **Acceptance:** composer and Stop stay reachable at 720p/zoom; citations play correct moments; the answer remains scoped and background navigation is safe; screen reader announces status/completion without every streamed token.

## 15. Progress as analytics, practice as a transfer experiment

**Problem:** goals are hardcoded; transfer setup is laborious; experimental ratings use weak proxies instead of helping the next decision.

**Proposal:** make goals real mode-specific objects with baseline, target behavior, evidence eligibility and checkpoint. Show 10/25/50-game trends and same-mode before/after practice comparisons, paired with editable self-checks and reviewable supporting moments. Start with recovery windows, pad routes/steals, player-vs-opponent deltas, goalside/shadow geometry and heatmaps. Add kickoff/50–50/touch-quality labels only after higher-resolution capture and annotated definitions. Rework xG in Lab with correct units/outcomes, per-mode cohorts, uncertainty and caching. Delete the person-level bot score. Remove actionless RLTRAIN rollouts from coaching until candidate actions and fidelity are demonstrated.

**Resolves:** G-013/G-020, A-014/A-020/A-025, O-001–O-003, E-001–E-027, D-014, J-013. **Risk:** observational change is not causal proof of a drill; tactical geometry is not intent or teammate blame. **Effort:** L, staged. **Dependencies:** 2–3, 6, 9–13. **Acceptance:** goals update from eligible data; self-check and telemetry stay distinct; practice reassessment is useful before an arbitrary fixed sample count; each model passes its stated validation gate or remains hidden.

## Delete list

| Cut or retire | Reason / replacement | Findings |
|---|---|---|
| Named-player bot index, library badge, calibration labels and coach tool | 15Hz digital keyboard controls can score100 without cadence evidence. No reliable accusation belongs in a coaching product. Keep anonymous offline research only if a real labelled scientific corpus is funded. | E-001/E-002 |
| run_counterfactual AI tool and default personal RLTRAIN checkout | Current rollout has no user-chosen candidate action and changes every car's policy. Keep explicitly experimental reconstruction diagnostics only behind a flag until fidelity/cancellation/deadline contracts pass. | E-010–E-016/E-027 |
| Hardcoded Progress goals and unused GoalTracker | Fake object lifecycle undermines trust; replace with persisted scoped goals and checkpoints. | G-013/I-006 |
| Primary-navigation Teammates page | Thin counts without evidence drill-down do not earn a major destination. Move relationship filters into Matches and opponent/team comparison. | G-020/J-013 |
| Prompt-as-data library count/offline section parsing | A rendered document is not a typed analytics bus. | D-007/D-020 |
| Forced uncertainty paragraphs, developer status and user-facing policy drafts | Preserve accuracy in confidence/provenance controls, not repeated walls or instructions pasted into the player's voice. | D-021/J-007/J-008/J-012/J-014 |
| Disabled ChatGPT sign-in choice in the normal flow | Keep feature code opt-in and dependencies optional until separately validated; show supported providers clearly. | J-012/F-001/L-002 |
| Duplicated source/projection bodies and per-message full manifests | Retire only through a tested migration; use immutable shared evidence snapshots and references. | B-003/M-007 |
| Dead/duplicated CSS after component migration | Candidate unused classes must be confirmed against dynamic selectors before deletion. Retire override stacks rather than building another layer. | I-001/I-006/I-007 |
| External report notebook as a main coaching panel | Hide experimental/manual notebook until it supplies a decision or useful comparison; retain user export/access where appropriate. | J-004/J-014 |

## Quick wins (each one focused day or less)

These are implementation candidates for the next run, not changes made in this review. Each includes a narrow verification gate.

1. Replace the esbuild placeholder with an explicit build policy; prove frozen install in a clean archive. **L-001**
2. Add a manifest check for every declared icon and provide the missing assets. **N-005**
3. Supply a matching synthetic key/JWKS pair through a test generator, not a random private key alone. **L-002**
4. Run Studio math in the default package/CI command. **L-007**
5. Make the fake chat stream completion controllable instead of wall-clock coupled. **L-003**
6. Pass cited timestamps through onOpen and assert the final playhead. **G-005**
7. Protect replay selection with a request-generation/ID check; test reverse completion order. **G-004**
8. Stop resetting dirty Settings fields on unchanged external updates. **G-006**
9. Format missing percentages as missing, keep actual0, and require the selected identity for results. **G-001/G-003**
10. Add the messages conversation index and verify EXPLAIN QUERY PLAN. **B-004**
11. Use an accessible dialog primitive for delete with destructive styling, initial/return focus and Escape. **K-001/I-004**
12. Associate every visible Settings label with its control; expose selected cards and current navigation. **K-002/K-005/K-006**
13. Use verified readable text tints and a darker indigo action fill/hover; check normal text contrast. **K-003**
14. Remove the hardcoded personal engine path and make configuration explicit. **E-014**
15. Move collapsed experimental controls behind one Lab entry and put Review next first. **J-004**
16. Clear the consumed Ask Coach prefill after explicit handoff; preserve the user's edited draft. **G-008/J-008**
17. Correct low-boost denominator docs and remove release-boost advice unsupported by context. **A-011/A-013**

## Release decision

Do not launch this source as an evidence-grounded coach until the confirmed P0s and the core selected-match grounding/identity failures are fixed. Re-run the review characterizations as **desired-behavior regressions**, not bug-asserting tests. The current passing probes intentionally prove incorrect behavior. Packaging success is separate from installer, native GUI, hardware, live-provider and tactical ground-truth validation.
