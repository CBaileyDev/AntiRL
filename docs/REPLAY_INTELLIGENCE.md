# Replay intelligence and integration boundaries

## Implemented

- Read-only camera discovery in `%USERPROFILE%/Documents/My Games/Rocket League/TAGame/Config`. Only complete, range-checked camera sections are accepted. This machine's existing INI files do not contain a complete camera profile. AntiRL falls back to the confirmed player's most recent available replay camera, joined by exact platform identity, then to manual input or an explicitly labelled default. Replays contain camera actor presets; encrypted game saves are not changed. Chase and Ball Cam use the same FOV, distance, height, angle and stiffness. The camera controller response is AntiRL's approximation, not a clone of Rocket League's proprietary controller. Manual settings persist per account; Rediscover removes the override.
- Mistake fingerprints in **Progress & Goals**: deterministic buckets for marker category, team-relative field third/lane, boost, score margin and clock phase. Context is sampled three seconds before a marker, never from a future frame; gaps, missing telemetry and discontinuities remain unknown. Repeated context means at least two distinct imported matches. A conceded goal is a team outcome, not proof that the selected player made a mistake. Marked mistakes are user reports. The five examples prioritize different matches. No trained clustering model or calibrated blame score is claimed.
- Whole-library replay event search, including `show every OT goal I conceded`. The local form translates supported phrases into visible filters. Coach's validated read-only tool planner can call `search_replay_events`, `get_mistake_fingerprints`, and `get_opponent_history`. Identity/mode stay backend-controlled; no SQL, paths or URLs from the LLM. Pagination, total count and unknown phase coverage are explicit. Event phase is measured at the event; fingerprint phase is from the earlier lead-in. Overtime requires the named replicated flag, never an inference from replay length. Existing replay snapshots are hash-verified before enrichment. Searches cover recorded goals, player events and team review markers, not arbitrary unrecorded actions.
- Same-mode reference ghost: an overhead overlay of two actual recorded players and balls, normalized to defend the same goal. The user picks players and timing anchors. Missing time ranges/gaps are hidden. Reference rank is a self-reported label. This is an observational comparison, not an optimal-action prediction. A reference can be another imported replay; no licensed higher-rank corpus is bundled.
- Closed-loop suggestions: after mistakes are marked in two distinct matches, create a weekly drill in the existing Practice & Reassessment workflow. Practice sessions, later cue check-ins and replay comparisons remain available. Pre-game briefs show source examples. Calendar-week trends are raw counts within the imported library, with no opportunity denominator or causal improvement claim. Header-local weeks may have unknown timezone. Exported training recipes contain observed car/ball positions and source references; they are **not importable Rocket League custom training packs or generated game codes**.
- Opponent tracking uses exact replay identities and local encounters. Supported numeric Steam identities have public Tracker profile links. Opaque Epic IDs are never substituted as display names or used to invent ranks. Opponent history has no live rank data.
- External detector reports: users can open Who's Botting, explicitly upload there, and record per-player bot-likeness scores, version and source URL locally. Replay Library shows an external-report icon. Results are labelled user-entered and unverified. Unassessed players have no score, and built-in bot flags are separate. No replay is silently uploaded. No score is treated as a calibrated percentage chance of cheating.
- Optional Discord `/coach replay:<attachment> player:<exact replay ID>` server: signed interaction verification, guild allowlist, private deferred responses, bounded download/worker, coaching cards, schematic clips from actual positions, and stat deltas against that Discord user's last same-player/mode submission. No LLM/provider key or personal AntiRL database is used. See [Discord setup](../integrations/discord/README.md).

## Not implemented / required external inputs

| Requested capability | Current boundary | Required before enabling |
|---|---|---|
| Decision xG | Unavailable, no fabricated probabilities | Defined decision/outcome labels, a licensed representative corpus, held-out model calibration and coverage evaluation |
| RLGym what-if bot simulation | Unavailable | Compatible licensed checkpoint, observation/action adapter, RocketSim integration and complete initial state (angular velocity, jump flags, boost pad state, etc.) with reconstruction validation; counterfactual uncertainty evaluation |
| Verified higher-rank comparison | User-selected recorded reference only | Licensed reference corpus with source-verified ranks, comparable mode/context and documented alignment |
| Rocket League custom training pack publishing | Observed-position JSON recipe only | Supported game/editor workflow with in-game import/play testing; never manufacture pack codes |
| Automatic RL cheat detection | External, user-entered results only | Supported detector API or licensed local model plus calibrated false-positive/false-negative evaluation; public bot-likeness scores are not adjudication |
| Live Tracker ranks | Public profile link + local history | An officially supported integration/API and platform mapping |
| Live Discord delivery | Local implementation and offline validation | User-owned Discord application, public key/token for registration, allowed guilds and an HTTPS interactions endpoint |

The absence of those inputs is visible in the product. UI placeholders do not count as model implementation.

## Sources checked 2026-10-05

- [Tracker staff statement](https://feedback.tracker.gg/t/regarding-on-development-api/65636): no public Rocket League API. AntiRL does not bypass undocumented endpoints or browser protection.
- [Who's Botting](https://whosbotting.com/) and [privacy policy](https://whosbotting.com/privacy): replay-upload detector; no supported public API found. AntiRL makes no independent accuracy claim.
- [subtr-actor](https://github.com/rlrml/subtr-actor): named replay metadata and camera actor parsing; implementation uses installed 1.4.0's native player camera presets and boxcars 0.12.0 named network attributes.
- [RLGym](https://rlgym.org/Getting%20Started/introduction/), [training](https://rlgym.org/Rocket%20League/training_an_agent/), [action parsers](https://rlgym.org/Rocket%20League/Configuration%20Objects/action_parsers/): simulator and trained policy are distinct requirements.
- [Discord commands](https://docs.discord.com/developers/docs/interactions/slash-commands): attachment option type 11, avoiding privileged message-content scraping.

## Storage and verification

Schema 7 adds account-scoped camera profiles, source-revision-tagged situation caches, per-event review decisions, and external detector reports. Existing plans/logs and schema 6 transfer tracking are retained. Migration creates a backup before applying transactional steps. Replay writes invalidate derived caches. Replay deletion cascades its reviews/cache/reports. Manual camera settings are independent of individual replay deletion.

Automated checks: Rust player/mode isolation, cache replacement, before-goal score, missing/gapped telemetry, goal phase vs lead-in phase, camera parsing/ranges/account isolation, report source/URL validation and whole-library filters; browser review/search/camera/reference/report flows and narrow layouts; Discord signature/download/cohort checks. Native QA uses a database clone and immutable replay snapshots, never the primary profile. Evidence: `docs/validation/intelligence-native.json`.

Live provider planning, external detector uploads, live Discord delivery and trained model inference were not run. A human usability study was not run.

The existing AntiRL executable was running during compilation. The reviewed release is `target/release/antirl-intelligence.exe`; the active session was preserved. Close the existing application before opening the new release against the primary profile, whose migration will then run. QA used `ANTIRL_QA_DATA_DIR` and a separate WebView profile.
