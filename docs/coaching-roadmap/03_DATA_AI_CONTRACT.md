# Data, metrics, AI harness, and research integration contract

Status: proposed design for implementation; not an assertion of existing functionality.

## 1. Storage and lineage

Keep `coach.sqlite3` authoritative for existing application/chat/settings state and replay catalog. Add a separately versioned `analytics.sqlite3` under the same app data root. It is a rebuildable analytical projection, not an independently edited copy of the replay source. Keep full parsed timelines in indexed local cache files or existing replay storage rather than bloating model prompts.

Proposed analytical entities:

| Entity                 | Required data                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_matches`       | canonical match ID, content hash, replay ID, played/imported time, time provenance, mode/playlist, team size, season/mutators, source revision, parser version, completion state |
| `participants`         | match ID, stable platform-qualified player ID, team, observed display name, identity confidence                                                                                  |
| `metric_observations`  | match/player/key/version, value/unit, numerator, denominator, denominator unit, eligible/observed duration, sample count, coverage, measured/heuristic status                    |
| `evidence_events`      | stable ID, match/player/team, elapsed start/end, category, detector/version, support fields, uncertainty, source timeline reference                                              |
| `aggregate_snapshots`  | player/mode/window/key/version, sums and weights, count, date range, coverage, source revision/watermark, query definition                                                       |
| `rank_observations`    | player/mode, rank/MMR when known, observed time, season, source, self-reported/verified status                                                                                   |
| `training_sessions`    | player/mode/plan/drill, intended and completed duration, result/self-report, difficulty feedback                                                                                 |
| `benchmark_membership` | cohort/version, replay/player, verified rank-at-match and source, eligibility/exclusion reason                                                                                   |

Use canonical deduplication across renamed/copied replay files. Distinguish file duplicate, same match recorded by multiple players, and genuinely separate match. Re-import/reanalysis should replace one match revision transactionally within the analytics DB, not add a second contribution.

Do not assume cross-file atomic commits under WAL. Publish an import/reanalysis revision in the source DB; project it idempotently into analytics; then record the processed watermark. Crash between these stages must be recoverable by reconciliation. Queries show analytics lag if the source revision is newer. Rebuild into a temporary DB and swap only after verification with readers closed/reopened safely.

Back up existing stores using a SQLite-aware method before migration. Retain schema/version migration ledger and rollback path. Replay deletion invalidates its aggregate contribution. Keep or remove historical statistics according to an explicit user action; do not silently retain supposedly deleted matches in lifetime totals. Changes to account identity, metric version, and source exclusions trigger recomputation.

## 2. Metric dictionary

One machine-readable versioned dictionary must drive UI labels, SQL projections, prompt glossary, exports, and validation. Each entry includes key, plain-language meaning, units, formula, eligibility, coverage, limitations, comparison direction (`contextual` unless established), and available evidence types.

| Proposed key                                | Meaning                                                             | Interpretation constraint                                                      |
| ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `time_at_or_above_supersonic_threshold_s`   | Eligible duration where measured speed >= defined threshold         | Measured speed approximation; not proof of decision quality or exact game flag |
| `time_at_or_above_supersonic_threshold_pct` | Above duration / valid speed-observation duration *100              | Never divide by all time if velocity is missing for part of it                 |
| `boost_active_at_supersonic_speed_s`        | Eligible duration with speed >= threshold AND observed boost-active | Compatibility successor to `supersonic_boost_seconds`; not all wasted          |
| `suspected_unnecessary_boost_s`             | Only windows matching a separately validated contextual detector    | Heuristic; nullable/unavailable until implemented and validated                |
| `avg_boost`                                 | Integral of valid normalized boost / valid boost duration           | Higher is not automatically better; avoid hoarding targets                     |
| `low_boost_pct`                             | Valid duration below threshold / valid boost duration *100          | Threshold and denominator explicit; no universal ideal                         |
| `avg_speed`                                 | Speed integral / valid velocity duration                            | Movement, not decision quality; keep mode/context separate                     |
| `defensive_half_pct`                        | Eligible time in own half / valid position duration *100            | Position, not last-man responsibility or quality                               |

Retain legacy fields via explicit adapters while migrating consumers; store version and provenance. Do not relabel old values into a newly different formula. Recompute from original data when semantics change. Unknown must remain null, with coverage reason; genuine measured zero must remain distinguishable.

Lifetime average of a time-varying measurement = SUM(integral) / SUM(valid seconds). Percentage = 100 * SUM(numerator seconds) / SUM(eligible seconds). A separate equal-match mean may be useful but must say so. Counts/rates need defined per-match or per-five-live-minute units. Do not average percentages without weights. If old data lacks numerators/denominators, reconstruct from valid sources or label a legacy equal-match estimate; do not invent weights.

Sampling must exclude invalid/discontinuous intervals, replay stoppages where applicable, and missing flags. Decide and test interval integration convention. Add coverage denominator for joint speed/boost observation. Keep measured condition duration separate from event minimum-window thresholds. Independent reference comparisons must align definitions first.

## 3. Context selection and query tools

General coaching is a first-class data route. Every request includes verified account identity, mode, metric definitions for included fields, coverage, latest relevant summaries, and source/version metadata, even with no selected replay.

Recent default: latest 20 valid matches for that player/mode; compare previous 20 if present. Also include lifetime summaries and a disclosed date window. A small sample remains a small sample, not a padded 20-match claim. Sort by parsed played time with stable tie-breaker; unknown dates are flagged and not presented as newest merely because just imported. Require a normalization/migration for sortable timestamps.

All mode preserves mode-specific sections; it never averages tactical thresholds across modes. Imported non-user replays remain available for comparison but do not occupy the user's recent slice. Exclude benchmarks from personal totals by dataset role.

Proposed read-only typed tools:

```text
get_player_overview(player_id, modes, as_of_revision)
list_matches(player_id, mode, date_range, cursor, limit)
get_match_metrics(replay_id, player_ids, metric_keys)
get_evidence_events(replay_id, player_ids, categories, time_range, cursor)
get_timeline_window(replay_id, start_s, end_s, fields, max_samples)
compare_windows(player_id, mode, metric_keys, recent_window, baseline_window)
search_training_packs(skill_tags, difficulty, mode, query, limit)
get_training_pack(pack_id)
get_benchmark_summary(cohort_id, metric_keys)
get_training_history(player_id, mode, window)
```

Backend resolves authorized identity/scope and validates args, ranges, row limits, and units. No arbitrary SQL, shell execution, unrestricted filesystem access, or model-controlled arbitrary URL fetches. Timeline tools disclose sampling/downsampling and missing fields. Tool results include stable evidence IDs, coverage, source revision, and whether more results exist.

Start with a proposed per-answer budget of 6 tool calls, bounded row/window sizes, provider-token-aware input budget, output reserve, and explicit timeout. Tune using measured usefulness/latency/cost. Stop with an honest partial answer if exhausted. No silent truncation of metric definitions or cited events. Retrieve disconfirming examples as well as problem examples to avoid cherry-picking.

Tool-calling capability must be detected per provider/model. A text-only provider uses backend intent-based retrieval with the same typed contracts and validators; it must not pretend it searched. Existing consent controls remain authoritative. Default external pack queries contain skill/topic text, not player IDs, raw match names, or full replay content.

## 4. Prompt and response harness

Layer instructions in this order: evidence and data rules; metric dictionary; mode-specific tactical guidance; coaching focus preset; player preferences/goals; current retrieved evidence; user request/history. Keep untrusted replay names, web pages, player names, and memory text in clearly delimited data/tool fields. They cannot change permissions or instruction priority.

Shared rules:

- State what was observed before interpreting it. Cite exact metric/query/event evidence for personalized claims.
- Do not infer a mechanic, intention, available alternative, or causation from a scalar average.
- A detector suggestion is a review candidate. Consider score/time, teammates, opponents, orientation, and recovery before judging.
- Never promote resource hoarding, constant speed, minimum shots, or blame from unsupported thresholds.
- Prefer one actionable priority with a counterexample/exception, a short drill, and a next-match cue.
- Use retrieved pack codes only. General no-code drills can be offered as general coaching knowledge.
- Rank comparisons, match grades, and promotion forecasts are separate products with separate evidence gates.
- If evidence cannot answer, explain the specific missing data and offer the next useful review step.

Mode guidance seed, to be refined by sourced research:

| Mode | Attention areas                                                                                               | Avoid                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1v1  | Possession risk, controlled challenges, shadowing, kickoffs, recovery and boost tradeoffs                     | Importing teammate rotation/back-post rules            |
| 2v2  | First/second-player relationship, support distance, recoverability, possession, last-player challenge context | Treating every retreat or forward position as an error |
| 3v3  | Role transitions, coverage, pressure/support, recovery lanes, opportunities for useful passes/demos           | Inferring roles solely from defensive-half percentage  |
| All  | Mode-separated trends, shared execution habits, realistic practice allocation                                 | One blended ranking/target for different playlists     |

Use one model with versioned presets initially; a simulated committee of coaches adds latency and disagreement without evidence of benefit. Allow custom tone/instructions, but they cannot override data correctness. Store prompt version, provider/model, mode, tool manifest, and source revision per response.

Structured coaching output proposal:

```json
{
  "scope": {
    "mode": "2v2",
    "recent_count": 12,
    "lifetime_count": 148,
    "revision": "..."
  },
  "findings": [
    {
      "observation": "...",
      "evidence_ids": ["..."],
      "interpretation": "...",
      "confidence": "limited",
      "alternative_explanation": "...",
      "next_match_cue": "...",
      "drill": {
        "pack_id": null,
        "setup": "...",
        "minutes": 10,
        "success_criterion": "..."
      }
    }
  ],
  "limitations": ["..."]
}
```

Numbers above are illustrative schema values, not this user's measurements. Validate syntax, count limits, identity/mode, evidence existence, referenced values/units, pack records, and prohibited forecast/grade claims. Referencing a real event ID alone does not prove a claim is supported; use semantic evaluation and human review on difficult examples. Permit one bounded repair; otherwise show a safe evidence summary with a specific limitation.

Avoid streaming unchecked numerical claims and then calling them verified. Recommended architecture: stream a small retrieval/progress status, generate and validate each structured finding, then reveal it. General conversational prose may stream with clear partial state. Raw candidate text remains internal. Cancellation must persist only the appropriate partial state and never continue tool work unnecessarily.

## 5. Training catalog and research knowledge

Store: stable pack ID, exact code, title, creator, source URL, source excerpt/hash/date, last checked date, verification level, skill tags, prerequisites, estimated difficulty, applicable modes, drill protocol, and license/redistribution notes where relevant. Difficulty is advisory; test fit using the player's feedback.

Verification levels: `source_confirmed`, `in_game_tested`, `stale`, `unverified`, `unavailable`. Source-confirmed does not mean tested in game. Never silently change an exact code based on plausible formatting. Deduplicate by code and reconcile conflicting titles/authors. Cache last useful records when offline; display freshness.

Research guidance becomes versioned cards: claim, applicable mode/rank/context, supporting source, contradictory evidence, limitations, practical cue, measurable outcome, and review date. Do not paste an entire research report into every prompt. Retrieve relevant cards and preserve distinction between coach opinion, empirical description, and demonstrated causal benefit.

## 6. Onboarding and profile

The user explicitly requested that current ranks, target ranks, and training availability be onboarding questions. Ask once per relevant mode and make answers editable later. Allow skip/unknown; do not require exact MMR. Include primary mode, solo/fixed-team preference, short-term target, longer-term target, optional weekly hours split, coaching tone, and existing cloud consent. Explain why time availability helps make a feasible plan. Avoid a long mandatory questionnaire.

User-supplied planning example: 1v1 Platinum 1; 2v2 Diamond 2; 3v3 Diamond 2; goal Champion, ultimately high Champion. These are self-reported, not replay-verified. Clarify mode-specific goal applicability inside onboarding; never hardcode this user's ranks as application defaults. Weekly availability is unknown and should be collected there, not invented.
