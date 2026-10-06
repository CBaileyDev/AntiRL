# Practice transfer loop

Implemented in Practice & reassessment on Progress & Goals. One tracking cycle is active per confirmed player and mode; starting another closes the old active cycle without deleting its plan, sessions, cue snapshot or reflections. All saved cycles remain viewable. No dependencies were added.

## Using it

1. Save a drill, success criterion and next-match cue, then expand Track this cue in matches.
2. Choose self-report only, or select a supported replay measurement and a reference replay. The reference fixes the exact recorded playlist, match type and mutator context.
3. Leave replay timezone unknown unless you know the UTC offset of the original replay clock. An explicit offset assumption includes daylight saving time and applies only to offset-free headers in this cycle. Do not combine offset-free replay clocks from different offsets in one comparison.
4. Record actual practice completion time. Blank means now. Backdated times include an explicit completion offset. Logging time is stored separately. Existing logs remain marked as legacy logging times and do not establish a practice boundary.
5. Review the earliest ten eligible later matches. Used means at least once during the match. Missed, no opportunity, unsure, skipped and unanswered remain separate. Notes are optional; responses can be edited. Open replay uses the existing Replay Studio navigation.

An initial cycle anchors to the earliest known actual completion for that plan, independent of the recent-session display limit. If none exists, it waits for the first recorded actual completion. Subsequent cycles wait for a completion after the cycle starts. Anchors and cue/metric/context snapshots do not change when older logs or new imports arrive.

## Comparison policy: transfer-1

- Confirmed player must participate; other modes, bots as the focus player, and benchmark datasets are excluded.
- Require replay status ready. Explicit incomplete/unknown completion metadata and recorded nonempty mutators are excluded. Older records without completion metadata are accepted based on ready status; AntiRL cannot certify match completion from missing metadata.
- Measurement comparisons require exact reference context. Self-report cycles can include different match contexts but make no measured comparison.
- RFC3339 dates normalize to UTC. Offset-free replay clocks require the recorded cycle offset assumption. Malformed, date-only and unresolved clocks are excluded from windows but can receive a manual reflection after practice is logged. Manual reflection never establishes that a match followed practice.
- Equal timestamps, future-dated matches and matches overlapping the practice boundary are excluded. Baseline matches need a known positive replay duration to establish that they ended before the boundary.
- Select the closest ten before and earliest ten after the anchor, by replay date with replay ID as deterministic tie-breaker, BEFORE metric validation. Missing observations do not cause replacement with farther-away matches.
- Supported metrics: average boost, low boost percentage, average speed, supersonic threshold percentage, defensive half percentage, ahead-of-ball percentage, and average ball distance. Only compatible metrics-2 observations with finite value/numerator and positive finite denominator enter the weighted aggregate. No inferred cue-to-metric mapping or fallback averaging of legacy weights.
- Aggregate = summed metric numerators / summed valid seconds. Percentage numerators already include the factor 100. Show selected and usable counts, valid seconds, measured player seconds when available, exclusion reasons, match dates/IDs and source fingerprints. Missing results and differences remain null/Unknown, never zero.
- Numerical differences are contextual observations. They do not establish better play, cue use, causation, statistical significance, skill or rank predictions. Small windows are exploratory.
- Windows recalculate as the library changes. Reflections remain keyed to their original cycle and canonical replay ID; displaced or deleted replays retain readable history. Existing replay tombstones continue blocking automatic reimport. Source revisions change after reparsing.

## Persistence and privacy

Schema 6 adds logged_at/completion_source to practice sessions, plus transfer_cycles and transfer_checkins. It preserves existing plans and logs and uses the existing backup and transactional migration machinery. Active-cycle uniqueness is enforced per player/mode; check-in uniqueness per cycle/replay. Writes revalidate identity, mode, game context, chronology and state on the backend. Archive operations atomically close active tracking.

Transfer check-ins, notes and summaries are stripped from get_training_history before cloud retrieval. Existing practice plans and practice sessions retain their established Coach retrieval behavior. This feature adds no automatic remote transfer tracking or analytics. User-authored transfer notes are treated as data and bounded to 2000 characters.

## Validation

PASS: workspace Rust tests including migration/reopen, scope isolation, weighted zero values, selection before missingness, incompatible versions, date ambiguity/ties/overlaps, editable check-ins, durable history/deletion, and cloud retrieval exclusion. Full populated transfer IPC contract decoding is covered.

PASS: browser workflow checks for waiting/empty/pending/completed states, delayed practice completion with an explicit offset, reference selection, unknown measurement values, edits, skips, manual reflections, save failures, replay navigation callback, mode switching, keyboard focus, and no horizontal overflow at 600px. Desktop and narrow screenshots inspected. Browser tests use synthetic IPC fixtures; backend tests use real temporary SQLite databases.

PASS: frontend lint/type checks, production frontend build, Clippy with warnings denied, and native release build. Isolated release WebView validation passed against a copy of the schema-5 local database: migration, actual IPC, persisted form submission, reopening Replay Studio, navigation persistence, no WebView errors, and cloud transfer exclusion. See validation/transfer-native.json. The QA process was stopped after testing.

NOT RUN: five-player usability study, human hands-on interaction, display/DPI hardware checks, clean-machine installer. These require people or environments outside the automated fixture checks; no participant result is inferred.

The existing local library was inspected read-only: 29 replay records, all with known match context and none with offset-aware dates. Its dates therefore require an explicit replay offset assumption for automatic windows. Its stored metric observations also predate metrics-2 and lack compatible weights; they correctly remain Unknown in transfer comparisons. Newly parsed compatible observations can contribute without substituting legacy averages. Personal data was not modified to manufacture practice or transfer results.
