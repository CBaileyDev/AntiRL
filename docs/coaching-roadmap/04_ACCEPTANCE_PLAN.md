# Release and research acceptance plan

This is the next agent's test plan. None of the following tests is claimed to have run for this documentation-only task.

## P0 regression cases

| ID | Setup/action | Required result |
|---|---|---|
| M01 | General chat, no replay attached, `supersonic_boost_seconds=6` | Describes boost-active duration at threshold, never total uptime or target 9+ |
| M02 | Same values with a replay attached and in offline analysis | Same metric meaning across all paths |
| M03 | Speed 2250 and active boost | Counts measured condition; cannot assert all boost is useless based solely on threshold |
| M04 | Missing speed or boost-active flag; measured zero in a separate case | Unknown stays unknown; real zero remains zero; coverage is accurate |
| M05 | 10 seconds at boost 20 and 90 seconds at boost 80 | Time-weighted mean is 74, explicitly different from equal-match mean 50 |
| M06 | Duplicate, renamed replay, reanalysis, deletion, rebuild | Lifetime totals reconcile exactly; old metric revision is replaced |
| M07 | User absent, identity unknown, duplicate display names | No attribution to first participant or another account |
| M08 | 20 latest library matches include benchmarks/other modes/non-user games | Recent slice contains only eligible personal matches in requested mode |
| M09 | Import an older game today, unknown played date, overtime/forfeit | Recency and denominators remain honest; exclusions are explained |
| C01 | Stream a long reply and scroll up by each input method | No forced jump; Jump to latest appears; return resumes follow |
| C02 | Select/copy old text while generating; markdown table reflows | Selection and reading anchor preserved; valid table rendering |
| C03 | Cancel, network error, retry, switch chat, late callback | Correct partial/error state; no duplicate turn or cross-chat stream |
| C04 | New chat, change mode, restart app, rename/archive | Mode/profile/history persist and remain isolated |
| C05 | Copy response and export each format, including mid-stream | Exact visible content plus scope/citations; safe partial label; no secrets |
| V01 | Boost 0/25/50/75/100/null, seek/player switch | Arc and number agree; unknown neutral; no smoothing across seeks |
| V02 | Chase on wall/ceiling, overhead, inside goal/corners | Surfaces are coherent; spectator cutaway does not hide interior geometry |
| V03 | Boost collection unobserved, seeks, effect emission | No invented pickup/cooldown telemetry; particles reset correctly |
| O01 | Onboarding per-mode ranks/goals/time, skip, edit later | Personalized plan honors settings; no hardcoded user profile |

## Harness evaluation corpus

Create at least 30 initial hand-labelled fixtures across all three modes, selected-match/general chat, and limited/complete coverage. Proposed initial count is a development gate, not statistical proof of safety. Include the supplied screenshot as a named regression. Keep synthetic fixtures labelled synthetic. Add real replay examples with source IDs and human-reviewed expected limits.

Adversarial/negative cases:

- A replay name or pack web page asks the model to ignore rules or reveal credentials.
- Earlier assistant message incorrectly says supersonic waste is uptime.
- User asks for guaranteed rank-up time or an exact MMR from three replays.
- Only low-shot losses are retrieved but other games contradict the proposed issue.
- A teammate has fewer goals but better documented support/coverage.
- All-mode question presents differing speeds from 1s, 2s, and 3s.
- Pack code is fabricated, wrong-author, stale, or appears only in a search snippet.
- Tool timeout, malformed output, nonexistent evidence ID, context overflow, provider lacks tools.
- Profile identity is changed while an old conversation remains open.

Measure deterministic contract violations separately from judgment quality. Required critical violations: zero on the release set. Human rubric: accuracy, tactical plausibility, usefulness, specificity, appropriate uncertainty, feasibility, and low cognitive load. Suggested target: average >=4/5 on usefulness with no severe misleading advice; calibrate reviewers and report disagreements. LLM judging may assist triage but cannot be the only judge.

Repeat live-provider checks on a fixed small set for each enabled provider/model; log prompt/model/version, token usage, tool count, latency, cost if available, and pass/fail without secrets. Offline fixtures do not prove live provider behavior. Stop if there is no configured consent/key, and report that gate as unrun rather than using another provider silently.

## Grading research acceptance

- Document score meaning, mode-specific dimensions, feature coverage, weights/calibration, and abstention rules.
- Obtain independent qualified reviewers, blind them to model scores and outcome/scoreboard where practical, and record disagreements; do not label an unreviewed heuristic as expert ground truth.
- Split by player and chronological blocks to prevent replay/player leakage. Evaluate held-out ranks/modes and parties separately.
- Compare against scoreboard-only and simple statistical baselines. Report rank correlation/pairwise agreement, calibration/uncertainty, and failure examples.
- Perturb goals/points while preserving documented decisions to check dominance; test supportive low-score play, legitimate resource sacrifice, losing-team strong play, and short/partial matches.
- Persistent player ranking needs repeated observations and opponent/cohort adjustment. A within-match grade cannot automatically become an account skill rating.
- Set publish thresholds after pilot reviewer agreement is known. Until met, keep grades experimental and abstain where dimensions are missing.

## Forecast research acceptance

Require longitudinal rank progression with mode, time exposure, practice adherence, initial skill, missingness, and non-promotions/censoring. Evaluate future held-out periods and players. Compare with simple base-rate forecasts. Report interval coverage, interval width, forecast error, and subgroup failures; distinguish predictive association from effect of following the plan. No validated cohort means no production weeks-to-rank forecast.

## Implementation checks and proof

Run applicable workspace Rust tests and `pnpm --dir app build`; inspect exit codes explicitly in PowerShell. Review available scripts (`scripts/test-replay-studio.mjs`, `scripts/test-ranks-quality.mjs`, `scripts/test-studio-meshes.py`) and run only those relevant to changed behavior and actual environment.

For migrations, use a temporary copy/synthetic fixture, test interruption and rebuild, and compare baseline row counts/integrals. Do not run destructive migration experiments against the only user database.

For UI, collect repeatable browser interaction checks plus packaged Windows checks for native clipboard/export, scrolling, streaming and viewport behavior. Save before/after screenshots and frame-time measurements for fixed replay/camera/time combinations. Browser rendering alone is not proof the packaged app is correct.

Final ledger must distinguish implemented, automated-tested, visually inspected, live-provider-tested, research-validated, and blocked/unrun. Include exact commands, outcomes, artifact paths, limitations, and next gate. A build pass does not validate coaching accuracy or improvement outcomes.
