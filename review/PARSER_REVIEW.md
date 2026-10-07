# Parser, metrics and research review

Area A verdict: **needs work**, with release-blocking parser continuity and event-identity defects. Aggregation needs work (B-005 mixed versions and B-006 chronology grammar are independently proved by storage review). Research is a hypothesis collection, not a production contract.

## Checked

Full replay-core lib.rs/types.rs/main.rs/Cargo.toml; native metric accumulation, threshold/time weighting, kickoff and post-goal phase gates, discontinuities, team orientation, stable IDs, overtime flag capture, scores, goal/demo/touch attribution, boost normalization, pad/stat capture, validator, profile metadata, discovery/CLI, six original tests. Full analytics.rs and semantics.rs; capture-only re-enrichment; selective Progress/Overview/Studio and service projection paths; metric dictionary and metric methods docs. Read research sections00/02/03/08/self-critique plus benchmark/progression sections relevant to leads. Extracted all80formula PNGs and visually inspected their actual numeric values; several formulas are clipped in the originals.

## Confirmed executable defects

- A-001: two detector types starting at the same time create equal boost-event IDs. Validation rejects the entire otherwise valid replay. The 33boost control passes; 0boost with identical positions/timing fails.
- A-002: six observed low-boost seconds plus six absent-player seconds yields event0..12; tracked_seconds stays6. The event description asserts an observed continuous window that did not occur.
- A-003:1.2seconds defensive exposure plus a3.8second rejected gap yields exposure event0..5. The live denominator correctly stays1.2.
- Remaining characterization tests prove kickoff omission, gap handling, invalid sufficient-statistic acceptance, impossible range/team/frame acceptance, and overcounted supporting samples.

All9review_characterization tests pass because they assert the current bug behavior. They are characterization proofs, not regression expectations. Exact source is copied into review/metrics-probe/src/lib.rs by review/review_metric_probe.py; only original include paths become absolute, then a synthetic ProcessorView test module is appended. No application source is modified. Every unused processor query panics, so tests cannot silently invent missing state. Tests do not inspect credentials, real profiles or external providers.

Early parser-characterization/2/3 runs failed in the review wrapper generator, respectively array-return parsing, an omitted digit-bearing method name, and swallowing a default method into another signature. These are review scaffolding failures, not repo build findings. Fixed generator produced parser-characterization-4(5tests), parser-characterization-validation(8tests) and parser-characterization-final(9tests), all exit0. Command durations and sanitized output are in shared commands.jsonl/logs.

## Important lead corrections

A raw2200cut is correct for the explicitly named threshold metric. Do not silently replace it with state hysteresis; if exact supersonic state is desired, add a separately named validated measurement. Psyonix v1.78 lists2200entry,2100immediate exit and one-second grace between them as unchanged; its patch was June16,2020 and new collision checks were reverted June30. Reference: https://www.rocketleague.com/news/patch-notes-v1-78?lang=en (verified during this review).

The research low-boost image28 agrees with implementation: denominator is valid boost time. docs/METRIC_METHODS.md is wrong. Duration/count equal-match means are not automatically arithmetic bugs; comparing rates across unequal match lengths requires another measurement. The research210second cutoff,20match reassessment requirement and numeric tactical thresholds have no empirical justification in this repo and were deliberately rejected in RESEARCH_AUDIT.md. intelligence.rs3second matching context is not fault attribution; research6second goal outcome heuristic is not the same contract.

The produced boost-at-speed metric is neutral. Progress danger colour/flame and parser otherwise-release-boost sentence still frame it as waste despite an honest disclaimer. Prefer design confidence and contextual play rather than adding further prose.

## Coaching opportunity

The native decoder already exposes pads, shot geometry, replicated controllers, goals and player motion. Stage practical kickoff outcomes, player-versus-opponent deltas, pad-route opportunities and recovery windows before broadening uncalibrated models. Derived50/50 wins/touch quality/rotation roles require explicit state definitions and annotated validation, not rank grades. Do not reject all useful observations until an entire benchmark science program exists.

## Real fixture scope and outstanding verification

review/review_real_parser.py runs the actual Rust CLI against three review-owned copied snapshots and logs only sizes/counts/coverage/metric-key inventories. Complete replay JSON is held in process memory and not persisted; names/IDs/source paths are not written. This is narrow parser execution and payload measurement, not golden metric validation. Independent kickoff/goal/shot truth, private/tournament/mutator/forfeit/overtime coverage and ordinal replay timing still need a diverse annotated fixture corpus. No real gameplay/personality accuracy claim is made.

Findings are appended in findings.jsonl; leads-parser.json explains all assigned lead groups and their refuted subclaims; coverage-parser.json gives file evidence. Source implementation remains untouched.

## Actual three-fixture measurements

| Fixture | Mode | Bytes in | Debug CLI wall seconds | Replay elapsed / live seconds | Render frames | Parser JSON bytes |
|---|---|---:|---:|---:|---:|---:|
| sample-1.replay | 2v2 | 778,674 | 11.093 | 201.98 / 135.15 | 1,883 | 3,229,466 |
| sample-2.replay | 3v3 | 2,175,975 | 43.015 | 403.05 / 303.47 | 3,803 | 9,323,941 |
| sample-3.replay | 3v3 | 1,352,884 | 23.985 | 254.90 / 170.15 | 2,364 | 5,780,608 |

All three parser exits0; no duplicate IDs in this narrow corpus. That does not disprove A-001: precise overlapping detector state is exercised in the synthetic test. These are complete parser output sizes, not final Tauri get_replay serialization measurements; storage/root will measure that boundary. Debug build wall time includes cargo/process startup and is not release throughput. All fixtures are2v2/3v3;1v1, overtime and unusual playlists remain untested in the real corpus.

## Final hostile challenge corrections

A-010 is P3 terminology precision only: >=2200 is sufficient for supersonic state entry, and the correctly named threshold metric intentionally omits lower-speed grace. Missing hysteresis is not a numerical bug. A-024 is narrowed to research line450 declaring forecasting statistically infeasible without a suitable longitudinal calibration study. Current forecast abstention is correct. ENG-03 explicitly requires personal rolling summaries, and one highest-priority observation can use several supporting moments; the earlier allegation that the spec prohibits those is withdrawn. Final patches are in validation-parser-final-adjustments.json for root merge.
