# Execution order and acceptance

The implementation is authorized by the final prompt. The agent should write its plan and proceed without an audit-only approval stop. These gates are requirements for the implementation agent, not completed checks from this preparation task.

## Milestones

| Step                          | Runnable result                                                                        | Acceptance                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Stabilize target/contracts | Project identified; existing work preserved; commands and module boundaries documented | No changes to reference projects or originals; source builds if present; scope ledger covers all requirements                                    |
| 2. Real-data spike            | Current 2s/3s files decoded and one segment rendered                                   | Network parsing succeeds or failures are visible; clock/orientation/identity checked; real decoded motion, seek and discontinuities demonstrated |
| 3. End-to-end coaching        | Import → profile → findings → playback → discussion → saved context                    | Same evidence IDs across report/chat/viewer; offline report works; connected-provider results distinguished from mocks                           |
| 4. Full product workflow      | Library/watch, profiles, teammates, progress, goals, scoped chat/memory and settings   | Each workflow works with real or explicitly isolated test data; corrections/deletion/export survive restart                                      |
| 5. Viewer/design quality      | Comfortable evidence studio and complete visual states                                 | Screenshots inspected at target sizes, keyboard/DPI tested, playback and marker behavior measured                                                |
| 6. Package/review/repair      | Windows package, maintenance docs and validation ledger                                | Bundled worker/resources run outside checkout; meaningful review findings fixed; unrun account/hardware/signing gates declared                   |

The first slice is not the end of the requested scope. Continue through all unblocked requirements. Voice, video, calibrated numeric rank estimates and unsupported game modes are explicitly later; essential replay reconstruction, progress, teammate review, actual model routing and Markdown memory are not optional demo polish.

## Functional completion checklist

- Genuine `.replay` decoding, single/batch/folder import, content deduplication, unsupported/corrupt/incomplete handling, cancellation, job progress and optional watching.
- Verified participant/playlist/clock coverage; no raw substring TeamSize inference, fake JSON parser, missing-to-zero coercion, or scoreboard-derived detailed events.
- Confirmable identities and multiple profiles; teammates ranked by shared-team appearances; independent mode/date filters.
- Reproducible metrics and timestamped observations with documented inputs/methods/limits; strengths, actionable priorities, alternatives and practice steps; fair treatment of player and teammates.
- Real smooth reconstructed playback, accurate seeks/markers, camera and speed controls, visual information tied to playhead, discontinuity handling and resource cleanup.
- Coach conversations for event/match/session/teammate/progress; evidence retrieval and citations; durable conversations and relevant profile/mode memory; review/edit/export/delete.
- Functional NeoToken and optional OpenAI routes, exact provider/model selection, provider-aware streaming and terminal validation, cancellation, timeouts, rate limits, retry and usage state.
- Official ChatGPT adapter implemented when permitted, with correct account catalog, consent/callback validation, renewal, sign-out and plan-use UX. Live eligibility may remain blocked; hide or explain unavailable action honestly.
- Offline use, first-use disclosure of cloud context, protected secrets, safe imports/Markdown/paths, bounded workers, migrations and reliable recovery.
- Onboarding, overview, library, replay analysis, chat, teammates, progress and settings; empty/loading/error/offline states and accessible resizable layouts.
- Reproducible start/build/package instructions, dependency/asset notices, module/public API explanations, privacy/deletion instructions and complete progress ledger.

## Validation matrix

Record each check as PASS, FAIL, NOT RUN, or NOT APPLICABLE, with the actual command or manual procedure, date, environment and evidence artifact.

| Area            | Meaningful checks                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser          | Real current 2s/3s, available 1s and older fixtures; truncated/corrupt/version failure; actors deleted/reused; score/timestamp agreement                                                           |
| Timeline        | Linear playback vs seek at identical time; goal/reset/demo boundaries; overtime/stoppage; marker click and lead-in; score-at-playhead                                                              |
| Metrics         | Known numeric inputs, missing coverage, irregular sampling/duration weighting, unknown values; labelled true/false/ambiguous detector cases                                                        |
| Identity        | Duplicate names, renamed IDs, recurring friends, missing IDs, joins/leaves, user correction, profile separation                                                                                    |
| Import/storage  | Repeat content with renamed file, incomplete watched files, cancellation/restart, migration, atomic note replacement, export/delete/reimport behavior                                              |
| AI              | Outgoing model ID, distinct catalogs, split SSE packets/UTF-8, absent completion, cancellation, timeout, 401/429/5xx, unknown evidence ID, unsupported numeric claim, adversarial player/note text |
| Memory/progress | Profile/mode isolation, evidence relevance, trend sample sizes, weighted aggregates, corrections, restart and deletion                                                                             |
| UI              | Full core workflow, actual screens, narrow window, long strings, native file selection, keyboard/focus, scaling, reduced motion, contrast                                                          |
| Package         | Start outside repo, import/view local file, worker/assets/runtime included, no developer secrets or private fixtures, log/error location documented                                                |

Tests need independent expected behavior. Do not generate tests that merely repeat the implementation or assert button existence while skipping the action. Use synthetic inputs and mocks for boundary tests, genuine replays for compatibility, manually reviewed native-game moments for accuracy, and authorized real-provider requests for network proof.

## Proposed performance budgets

Treat these as initial targets to measure and refine, not measured claims: usable cold start within 5 seconds on the documented Windows machine; cached match seek within 150ms for ordinary clips; 1080p playback targeting 60fps, p95 frame time <=22ms, with an explicit 30fps fallback when needed; no unbounded memory growth across repeated replay changes; no UI lock during parsing/AI; bounded per-file worker time and memory.

Measure a representative five-minute real match and larger batch, document binary build/profile, file size/network frame count, playback sampling, renderer mode, window scale, GPU and percentile frame times. The parser probe in this handoff may expose a slow/stale reference artifact; retest the exact production binary instead of importing its old benchmark. Never claim a smooth viewer from a still image.

## Completion ledger format

```text
Requirement | Implemented | Evidence/check | Result | Blocker or remaining work
```

Every requirement gets a row. External blockers include user credential/consent steps, actual account eligibility, signing identities, undistributed proprietary assets, unavailable fixtures and hardware. Continue independent work when one route is blocked. Do not call unimplemented product work an external blocker or silently reclassify it as future.

Final agent response: runnable path/commands, changed behavior, package path if produced, actual tests/results, implemented scope, specific limitations and required human steps. No claims of perfection or full verification while material checks remain unrun.
