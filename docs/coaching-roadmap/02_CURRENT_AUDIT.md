# Current source audit and screenshot diagnosis

Inspected 2026-10-05. Paths/line numbers are navigation hints in the existing dirty working tree; re-check before editing. This is static source inspection, not reproduction in the running app. The supplied image shows chat, not the requested boost ring or arena.

## Findings

| Finding                                             | Evidence in current source                                                                                                         | Implication                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Supersonic boost duration is not uptime             | `crates/replay-core/src/lib.rs`, accumulator around 810: speed >=2200 AND active boost flag; metric definition around 616          | Increasing this value is not a valid goal for increasing time traveling fast                                                       |
| General chat lacks the crucial glossary text        | `crates/coach-services/src/ai.rs`, `build_context`, around 380: definitions inside the loaded-replay branch                        | General chat receives similarly named aggregates without that safeguard                                                            |
| Lifetime key calls it waste                         | `crates/coach-services/src/lib.rs`, `get_progress`, around 577-605; `app/src/types.ts`                                             | A measured condition has acquired an unjustified evaluative label                                                                  |
| A physics overstatement exists in fallback and docs | `ai.rs`, `offline_chat`; `lib.rs`, `templated_analysis`, around 853; `docs/METRIC_METHODS.md` section 3B; GoalTracker instructions | They equate entering supersonic with no further speed gain; threshold and speed cap differ                                         |
| Recent 20 is already partly implemented             | `ai.rs`, `library_section`, around 140-235                                                                                         | It takes 20 latest library rows, not first filtering to the focus player and selected chat mode; each row has limited metrics      |
| Aggregates are recomputed by scanning replay JSON   | `lib.rs`, `get_progress`, around 497-606                                                                                           | Existing all-history information is real, but there is no dedicated analytics store in this path; means are equal-weight per match |
| Missing values become zero in progress              | `get_progress` output uses 0.0 when count is zero                                                                                  | Missing speed/boost must not be coached as observed zero                                                                           |
| Identity fallback can select first participant      | `get_progress` when resolved player is absent as an identity                                                                       | Add an explicit no-identity state; do not silently aggregate someone else                                                          |
| Chat forces smooth scroll                           | `app/src/pages/Coach.tsx`, around 273-279, on every messages/loading change                                                        | Streaming conflicts with reading older content                                                                                     |
| Markdown is hand-parsed                             | `Coach.tsx`, `Markdown`/`renderInline`, near start of file                                                                         | Screenshot table remains pipe-delimited text; links/tables need proper rendering                                                   |
| Conversation persistence exists                     | `lib.rs`, schema and `get_conversations`/`get_messages`; `ai.rs`, `chat_stream`                                                    | Extend existing records and migration path, do not create a disconnected second chat system                                        |
| Current harness is bounded text plus a completion   | `ai.rs`: 48,000 context characters, 14 history messages, event cap 100; `chat_stream` sends fixed messages                         | No training-pack search/evidence tool loop is present in this inspected path; cited IDs alone do not validate semantic claims      |
| Ceiling is intentionally discarded                  | `app/src/ReplayViewer.tsx`, around 556: skip triangles whose mean height >20                                                       | Full interior replay view needs a ceiling separate from optional spectator cutaway                                                 |
| Walls and boosts are mostly procedural              | `ReplayViewer.tsx`, around 563-632: emissive hex wall texture, large spheres/small cylinders                                       | Improve materials and silhouettes while keeping geometry and measured state honest                                                 |
| Inspected boost HUD is a mini-bar                   | `ReplayViewer.tsx`, around 1246; `styles.css`, telemetry boost rules                                                               | The running user's ring may be another build/component; reproduce before claiming a fix                                            |

## What is wrong with the screenshot's coaching?

**Yes: it confuses time boosting while supersonic with total supersonic time.** The screenshot says only 6.0 seconds supersonic and recommends raising it to 9+ seconds. The inspected app supplies `supersonic_boost_seconds` for that family of statistics. This strongly explains the inversion. The exact request payload, provider response trace, and build that produced the screenshot were not captured, so the precise historical execution path remains unverified.

Also, `boosting while supersonic` is not identical to proven waste. The [RLBot technical reference](https://wiki.rlbot.org/v5/botmaking/useful-game-values/) lists a 2200 uu/s supersonic threshold and a 2300 uu/s maximum car speed. The measured condition can include acceleration toward the cap and maneuvering. A detector should point to a window for review, not assert that all such boost served no purpose. Its threshold approximation should not be presented as exact replication of the game's state/hysteresis.

Other problems in that answer:

- Two low-shot losses do not establish that follow-ups or first-touch shooting are the missing cause. Match flow, possession, teammate actions, opponent pressure, and attempt quality matter.
- Defensive-half share does not prove last-man duty or a back-post weakness. It is a location statistic, not a role classifier.
- Comparing 3v3 and 2v2 average speed does not establish which one should be increased. Modes need separate tactical context and denominators.
- Pushing average boost toward 60, never going below 30, and demanding 3+ shots every match are unsupported goals. Such rules can reward hoarding, leaving useful positions, or taking bad shots.
- A high-speed freeplay drill may practice movement, but it does not establish that constant supersonic movement is desirable in matches.
- Pack names/codes come from model memory in the screenshot; this inspection has not verified those exact codes or their claimed authors. The app needs source-backed retrieval and validity states.
- The visible table rendering makes an already long prescription harder to scan.

## A safer answer shape for this same evidence

> The reported 6.0 seconds appears to measure boosting while already supersonic, not your total supersonic time. We should review those moments before treating them as wasted boost, and should not set a goal to increase that number. Your low-shot matches are worth reviewing, but the totals alone do not tell us whether the issue was shooting, possession, or positioning. Let's inspect a few attacking possessions and choose one short drill based on what they show.

This is a correction of interpretation, not a fresh diagnosis of the player's actual matches.

## Research starting points verified during this pass

- [RLBot game values](https://wiki.rlbot.org/v5/botmaking/useful-game-values/): physics and standard arena reference; independently validate operational metric definitions and mode/mutator assumptions.
- [Ballchasing API](https://ballchasing.com/doc/api): authenticated replay discovery with playlist/date/rank-related filters. The published rank enum observed in this pass ends at legacy `grand-champion`; do not assume an SSL filter string works. Research current metadata, query behavior, access, and rank-at-match verification before cohort acquisition.
- [Rocket League official training feature](https://www.rocketleague.com/news/community-spotlight--practice-makes-perfect): historical author/name/code records can seed verification. Historical publication is not proof a pack still loads or matches a user's current needs.

These sources are seeds for Gemini, not a completed literature review or validated benchmark dataset.
