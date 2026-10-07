# AntiRL pre-launch review

**Recommendation: hold launch.** Review target `6762f8c`, Windows, 6 October 2026. Production source, configuration, lockfiles, CI and existing documentation are unchanged.

The final ledger contains **186 findings: 7 P0, 35 P1, 129 P2 and 15 P3**. All 15 coverage areas have a verdict, all 109 files in the required directories are accounted for, and all 48 Appendix A groups are adjudicated with refuted subclaims explicitly retained. Every remaining P0/P1 has an independent challenge/disproof record.

Start with [FINDINGS.md](FINDINGS.md), [TEST_REPORT.md](TEST_REPORT.md) and [ROADMAP.md](ROADMAP.md). The full design specification is [DESIGN_REVIEW.md](DESIGN_REVIEW.md). [index.html](index.html) provides an offline visual gallery.

| Artifact | Contents |
|---|---|
| [findings.jsonl](findings.jsonl) | Final machine-readable findings, source quotes, reproductions and adjudications |
| [FINDINGS.md](FINDINGS.md) | All findings grouped by severity, then area |
| [COVERAGE.md](COVERAGE.md) | Area verdicts, model decisions and complete file ledger |
| [LEAD_VERDICTS.md](LEAD_VERDICTS.md) | All 48 prior lead groups, confirmed and refuted subclaims |
| [TEST_REPORT.md](TEST_REPORT.md) | Original commands, actual failures, workarounds, timings, measurements and NOT RUN reasons |
| [VALIDATION.md](VALIDATION.md) | Independent challenge pass outside experimental models |
| [VALIDATION_EXPERIMENTAL.md](VALIDATION_EXPERIMENTAL.md) | Model positive/negative controls and narrowed claims |
| [VALIDATION_DESIGN_INDEPENDENT.md](VALIDATION_DESIGN_INDEPENDENT.md) | Independent browser/source design challenges |
| [DESIGN_REVIEW.md](DESIGN_REVIEW.md) | Fresh page critique, tokens, primitives, flows, layouts and acceptance criteria |
| [DISCLAIMER_INVENTORY.md](DISCLAIMER_INVENTORY.md) | 137 lexical candidates, with visible copy distinguished from code/policy tokens |
| [MARKET_REVIEW.md](MARKET_REVIEW.md) | Primary competitor references, local ingest positioning and cost discipline |
| [ROADMAP.md](ROADMAP.md) | 15 ordered epics, dependencies, risks, gates, delete list and quick wins |
| [PLANS.md](PLANS.md) | Final progress and verification boundaries |

Six self-contained proposals keep the palette and use an explicitly synthetic 86-match scenario. This is separate from the 40-match real-App harness used to capture the current UI.

| Proposal | HTML | 1440×900 preview |
|---|---|---|
| Match Report | [Open](mockups/match-report.html) | [Screenshot](screenshots/mockups/match-report-1440x900.png) |
| Today | [Open](mockups/today.html) | [Screenshot](screenshots/mockups/today-1440x900.png) |
| Replay Studio | [Open](mockups/replay-studio.html) | [Screenshot](screenshots/mockups/replay-studio-1440x900.png) |
| Coach | [Open](mockups/coach.html) | [Screenshot](screenshots/mockups/coach-1440x900.png) |
| Progress | [Open](mockups/progress.html) | [Screenshot](screenshots/mockups/progress-1440x900.png) |
| Onboarding | [Open](mockups/onboarding.html) | [Screenshot](screenshots/mockups/onboarding-1440x900.png) |

Screenshots also exist at 1280×720 and 1920×1080. There are 66 fresh current-App screenshots and 18 mockup screenshots, plus targeted validation captures. Mockups are design specifications, not production implementation. Default/hover/focus control contrast checks pass; that does not certify all accessibility behavior.

Tests passed after documented workarounds: final Rust workspace 131 tests, nine separate collector probes, frontend checks, nine serial Playwright tests, Discord unit/local checks and three copied real replay parses. The original fresh install, fresh all-features compilation and Playwright Stop test failures remain findings. The review probes intentionally assert existing defects; implementation must convert them to desired-behavior regressions.

Unverified gates: live providers and costs, native GUI/vault isolation, clean-machine installers, actual RLTRAIN models, GPU energy/hardware/DPI/long sessions, screen-reader speech, tactical golden truth, unusual-playlist fixtures and real Discord delivery. No real credential/provider call or user profile was used. See TEST_REPORT for precise reasons.

To reproduce the browser audit after dependencies are installed, run `node review/serve_harness.mjs`, then `node review/capture_before.mjs` or `node review/validate_ui.mjs`. Provider IPC is mocked. Model-state and parser generators are review-owned. Temporary clean-clone and generated build caches are removed at the end; the scripts and logs preserve the reproduction path.
