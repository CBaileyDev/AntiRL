# Experimental models: a coaching product, not a lab console

E verdict: **cut or rework**. The valuable core is user-confirmed situation review and practice transfer. Named-person bot classification should leave the product. Shot xG needs a real population/feature/label contract before earning a core surface. The RLTRAIN bridge is a policy sandbox with little direct coaching value and belongs behind an opt-in Lab flag.

Scope: detector.rs, xg.rs, sim.rs, transfer.rs, intelligence.rs, practice.rs, their embedded tests, evidence tool and IPC call paths, and all associated React panels. Source is authoritative. No real replay, RLTRAIN engine, provider call, credential or user profile was used. Synthetic frames and temporary profiles only.

## Per-model decision

| Model / feature | Decision | Reason and useful replacement |
| --- | --- | --- |
| Local bot-likeness index | **Delete from product** | At parser15 Hz, cadence signals are unresolved and keyboard-style inputs score100. Disclaimers do not create discriminatory validity. Cut library person badges and Coach tool. Raw input-pattern research may remain in a separate developer diagnostic. E-001/E-002. |
| External bot-report notebook | **Hide behind a flag or delete** | It correctly does not upload files, validates HTTPS/source/roster and labels scores user-entered/unverified. It still encourages naming other people in an unsupported cheat-adjacent workflow unrelated to improving this player. Keeping a separate local note is defensible; a prominent Studio panel is not. |
| Per-shot xG | **Rework; Lab until validated** | Whole-match held-out prediction and base-rate checks are good. Units, surrogate labels, incomplete defender features, mode scope, fitting lineage and uncertainty require a coherent contract. E-003–E-009. |
| RLTRAIN what-if | **Hide behind an opt-in flag; remove from Coach tools** | The policy controls all cars, has unknown skill and accepts no candidate player action. It is not a causal counterfactual. Its pipe timeout and reconstruction gate also have executable defects. E-010–E-016/E-027. |
| Reference ghost comparison | **Keep as an optional qualitative review tool; rework** | Manual anchors, same-mode filtering and honest unverified rank labels are useful. Two unrelated trajectories cannot establish a better decision without matching ball/opponent state. Add source moments, camera synchronization and typed alignment, not another statistical claim. E-018. |
| Intelligence / mistake fingerprints | **Keep workflow, rework model** | Personal/mode scoping, explicit user decisions, source moments and two confirmed matches before a drill are good. Coarse3-second buckets and raw weekly counts do not identify mechanisms or progress. E-019–E-021/E-026. |
| Practice transfer | **Keep and substantially rework UX / features** | Correctly preserves self-report vs measured boundaries, requires weighted metrics, scopes mode/player/context, retains reflections, excludes local notes from cloud and chooses windows before checking metric coverage. It needs opportunity-specific evidence and a lighter workflow. E-022/E-023/E-025. |

## Executed characterization

`cargo test -p coach-services --test review_experimental --locked -- --nocapture` ran within a generator/rustfmt wrapper. Final command: exit0, wall6.406 s; tests8 passed,0 failed,2 ignored internal helper subprocess tests, actual execution0.92s. See `review/logs/experimental-final-validation.txt`. The first generator run failed because review-only wrapper syntax used invalid Rust decimal literals and a JSON array expression; corrected only review artifacts. This is recorded as an audit-harness failure, not an AntiRL defect.

The test generator extracts exact production helpers and records source SHA256 in `review/experimental-probes-source.json`; public-service tests use actual CoachService with tempfile profiles. Private helper extraction makes the access boundary explicit: it proves current helper behavior without pretending these are production integration tests. The internal ignored tests are invoked solely by the safe inherited-pipe timeout probe. They spawn the current test executable, wait900ms and exit; no external policy executable is run.

| Probe | Actual result | Implication |
| --- | --- | --- |
| Fifteen-Hz digital steer/throttle,1,200 samples | statusok, index100, cadence_resolvablefalse, basisdiscretenessonly | The fallback gives a human-shared pattern the maximum named-person bot index. |
| xG distance1000uu / height100uu | Features named metres are1 /0.1 | Should be10m /1m; standardization means the probability itself need not change. |
| Shot1s, opponent touch4s, goal8s | Original shot markedgoal | Target is later same-team conversion, not reliably direct shot conversion. |
| Two roster opponents, only one positioned | Complete feature, defender count1 | Missing defender state is silently treated as present feature coverage. |
| Configured player absent; imported1v1 and3v3 | n_shots2,n_matches2 | Population spans modes and nonpersonal matches. |
| Eight identical engine samples atdt0 | max0,mean0,n8 against1.933s replay | Ball-only gate can pass without checking trajectory coverage. |
|100ms timeout; parent exits while descendant holds pipes900ms |916ms elapsed, exit0 | Timeout ends before reader joins; indefinite inherited pipes can hang indefinitely. |
| Start/end JSON plus negative-step decision with nullball | EngineOutcomeOk | Output envelope does not validate decision state. |

Rocket League coordinates use1uu=1cm; see the primary [RLGym game-values reference](https://rlgym.org/Cheatsheets/game_values/). The xG unit finding concerns feature labels and coefficient units, not a claim that every displayed xG probability is numerically wrong.

## Active attempts to disprove major findings

E-001: inspected the unavailable/cadence logic and input filtering. At15Hz the code does not refuse; it keeps digital-only weights and renormalizes them. Keyboard fixture returns100. UI already says uncalibrated and not proof of cheating; no public accusation of a real person was made or claimed, so severity isP1, not a proven public-personP0.

E-003: inspected model standardization and output. Constant unit scaling is canceled by normalization, so wrong-probability claims were rejected. Wrong feature names and per-unit coefficient interpretation remain confirmed. E-010: looked for a candidate-action parameter, paired baseline or measured-skill policy; none exists. The correct unknown-skill and not-a-prediction labels remain real mitigations but do not make a one-rollout counterfactual.

E-011: the timeout failure is not merely a malicious engine running slowly. The direct parent exits0; the reader joins still wait beyond the timeout. A deliberately finite900ms descendant reproduces it without hanging the review. E-012: checked legitimate free-flight window formation and thresholds. Those validate the requested replay interval, not unique or interval-covering engine samples; duplicate start rows still pass.

E-013: the known lead broadly claimed async-runtime blocking. Native sim IPC actually dispatches through the shared blocking wrapper, so that subclaim is refuted. The AI planner path still calls the synchronous evidence dispatcher -> sim directly and only observes cancellation before/after. No live120-second RLTRAIN execution was performed; source call-path and runner behavior establish the noncancellable route.

E-017 was downgraded toP2likely: state survives a React prop ID update, but App navigation can unmount Studio between different matches. A real product path that shows old-person results on a different match was not reproduced. No resulting P0 misattribution claim is made. E-006 isP2 because repeated full-library work is confirmed but seconds of real-library jank were not measured.

## Science and specification judgment

Lead16 deviations are real: intelligence samples3s instead of research6s; transfer compares10 before/10 after instead of20; it does not exclude every match shorter than210s. Blind conformity would make the app worse. The research audit deliberately rejected unsupported spatial/time thresholds, grade weights, promotion models and absolute tactical rules. There is no empirical proof that6s assigns fault better,20 matches is adequately powered, or210s makes a replay valid. Keep explicit coverage, completion and effective exposure; validate lookback features and report uncertainty. These are design hypotheses, not release criteria inherited from self-citations.

The xG code does implement grouped whole-match folds, out-of-fold player summaries and held-out target-replay exclusion. It withholds probabilities if it does not beat a base-rate predictor. Those are substantial protections and refute a blanket accusation of in-sample leakage. They do not validate surrogate shot labels, mode transportability, future-match calibration or per-player finishing differences.

The detector has no such held-out real-player evaluation. Its real-replay test prints results, with no validity assertion. Its synthetic discriminative tests largely use30Hz rather than the parser15Hz. The numerical index should not be a person's attribute. A low-level control signal can be honest while its chosen product interpretation is wrong.

The simulation gate is engineering, not scientific calibration. It validates free-flight ball motion before the requested state, not the action outcome. The code admits pads, input history and intent are absent; it estimates jump timing and ground contact, selects newest compatible unknown-skill policy and substitutes that policy for all players. A valuable simulator would need explicit interventions, paired baseline runs, opponent-policy assumptions, contact state and empirical reconstruction/error studies. That is a separate research program, not a launch feature hidden under a disclaimer.

## Product value

Promote a single focus from confirmed moments into a persistent goal. A drill should preserve the observed constraint: e.g. last-player recovery after a missed challenge, low-boost shadow defence with a reachable pad route, or a kickoff loss into a known possession state. Show one next-match cue, then ask whether the cue had an opportunity and play supporting moments. Current lowboost/otherwise recipes and whole-match averages cannot detect that transfer.

A meaningful progress page needs comparable opportunity counts, successful counterexamples and reviewed coverage, not raw number-of-fingerprints counts. Self-report remains useful and should not be discarded for being subjective; its UI should make reviewing one source moment faster than filling a record. Use a quiet Estimated/Experimental badge, sample count and a measurement popover. Delete repeated not-a-promotion / unavailable paragraphs from the main workflow while keeping the exact limitations accessible.

## Remaining boundaries

No real replay corpus, manual tactical labels, actual RLTRAIN checkpoint, GPU policy inference, simulator fidelity study, external detector upload, provider call or longitudinal player outcome was verified. Learned model accuracy and real engine compatibility remain unknown. The review establishes local math, sample-rate, labeling, scoping, transport and timeout defects, not an empirical performance claim about actual rank improvement.

## Additional independent validation
See review/VALIDATION_EXPERIMENTAL.md. Added controls bring experimental Rust total to11passing,2internalignored. Production Bot/ShotXg browser state characterization now passes and confirms the prop-contract bug; severity staysP2 because ordinary App navigation can unmount. Evidence review/logs/experimental-independent-controls.txt and review/logs/experimental-ui-state-preamble.txt.
