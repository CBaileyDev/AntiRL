# Product plan: reliable coaching that leads to useful practice

## Problem and intended outcome

Players need trustworthy advice tied to their own play, a usable replay viewer, and a manageable practice plan. The supplied screenshot demonstrates a serious metric interpretation error, unsupported causal claims, and overly rigid training targets. Streaming also prevents comfortable reading of earlier chat messages.

The first release should make coaching accurate, understandable, and easy to act on. More detailed grading is valuable only if it measures decisions fairly and does not turn arbitrary statistics into supposed skill rankings.

## Goals and proposed success criteria

These are product targets, not measured results:

- No critical metric inversions, wrong-player attribution, invented pack codes, or fabricated rank forecasts in the release regression suite.
- A player can read and select older text during streaming without being pulled to the bottom.
- Every personalized recommendation identifies its evidence scope and separates observation from interpretation.
- A normal coaching response proposes at most three priorities; the default practice card emphasizes one priority, one drill, and one next-match cue.
- A usability pilot should have at least 4 of 5 players identify what to practice next and why without an explanation from the developer. This is a small formative test, not statistical proof.
- Track plan completion and changes in reviewed behaviors over subsequent same-mode matches. Win rate and rank are lagging outcomes; neither proves the coaching caused improvement.

## Main player journeys

| Player need | Proposed behavior | Why it helps |
|---|---|---|
| Review recent play | Open Coach, choose 1v1/2v2/3v3/All, ask for review | Avoids mixing incompatible tactical contexts |
| Understand an issue | Expand evidence and jump to an exact replay window | Lets the player challenge the coach's interpretation |
| Practice effectively | Save one short drill with a success condition and verified pack | Reduces decision load and vague practice |
| Track improvement | Compare recent valid same-mode play to a previous window and lifetime baseline | Makes progress visible without chasing raw averages |
| Read or reuse advice | Scroll freely, select text, copy a reply, export a conversation | Fixes friction in the existing workflow |
| Inspect play clearly | Accurate boost ring, believable walls/ceiling, readable ball/car lighting | Supports spatial understanding rather than decoration alone |

## P0: immediate correctness and usability

### Metric semantics and legacy advice

Use separate concepts for time traveling supersonic, time boosting while supersonic, and suspected unnecessary boost use. Never label the second as automatically wasted. Put metric definitions into every AI route, including general chat and offline analysis. Review old generated goals and coaching memories for the same inversion; mark affected generated advice stale with an explanation rather than silently rewriting user text.

Acceptance: the exact screenshot regression must never yield a target to increase `supersonic_boost_seconds` as though it were supersonic uptime. Do not replace it with an unsupported universal target to minimize that metric either.

### Streaming chat

Follow the bottom only while the reader is already near it. Scrolling up or selecting text pauses following. Show a quiet `Jump to latest` control when new content arrives. Resume on explicit click or return to the bottom. Preserve position through markdown reflow and resizing, and restore each conversation's position.

Acceptance: wheel, scrollbar drag, touchpad, Page Up, and text selection remain usable during a long streamed response. Cancelled/failed replies remain visible and labelled partial. A late stream must never appear in another conversation.

### Boost percentage indicator

The requested ring's active arc must equal `clamp(boost, 0, 100) / 100` of its available sweep. Use the same timestamp and selected player as the number. Prefer an SVG track plus progress arc with an accessible numeric label. Display `--` and a neutral track for unknown data; do not portray missing boost as zero. Scrubbing should update immediately rather than animate through incorrect intermediate values.

Acceptance: inspect 0, 25, 50, 75, 100, unknown, player changes, seeks, and resize. The inspected source currently has a horizontal mini-bar, not an obvious ring; reproduce the actual running UI before deciding which component to replace.

### Arena realism and clarity

Preserve verified geometry and coordinate transforms. Add a complete visible ceiling and correct curved wall-to-ceiling transitions where the source geometry supports them. Differentiate turf, lower ramp, wall panels/netting, goal frame, and structural ceiling; avoid making every surface luminous metal. Use consistent texture scale, roughness, normal detail, modest environmental lighting, restrained bloom, and grounded contact shadows.

Full surfaces should be visible from chase/interior cameras. Offer an automatic spectator cutaway for overhead/exterior cameras, with a simple toggle. Camera obstruction handling must not change collision reference geometry. Boost pads need recognizable small/large silhouettes and controlled emissive cores; car boost effects should originate from exhaust and reset correctly after seeks. Animate collection/cooldowns only if supported by reliable replay state, otherwise label the representation decorative/unknown in the viewer help.

Acceptance: compare fixed replay moments at midfield, corner ramp, goal/backboard, wall, and ceiling in chase/free/overhead. Inspect in the packaged Windows app at low/high quality. Record p95 frame time and device/resolution against the existing baseline; proposed target is 60 fps at 1080p on the chosen reference PC, with graceful lower-quality fallback. Confirm actual hardware before promising this target.

## P1: trustworthy coaching platform

### Conversations, roles, and export

Add a compact conversation list with `New chat`, title, mode badge, rename, archive, and search. New chat asks for mode with the user's last choice as default. Offer coaching focus presets: Balanced, Mechanics practice, Decision review, and Match breakdown. Mode and focus are different controls; hide advanced custom instructions behind an expandable settings area.

Shared account identity and preferences carry across chats. Same-mode progress and training adherence can carry across chats. Assistant guesses and another mode's tactical rules do not become permanent facts. Changing a chat's mode should create a new chat or explicitly reset its evidence scope; old replies retain their original scope label.

Allow plain text selection and normal copy/paste shortcuts. Add Copy response and Copy pack code. Export full conversation as Markdown or plain text and optionally structured JSON, including timestamps, mode, sources, evidence references, and partial/error labels. Snapshot the current state if exporting during generation. Do not export credentials or hidden provider/system content. Render tables, links, lists, and code blocks properly; disable raw HTML and unsafe link schemes.

### All-history analytics with recent evidence

Maintain a separate rebuildable `analytics.sqlite3` containing all imported match metrics, numerator/denominator data, and lifetime/rolling summaries. Preserve original replay/cache data and current chat/settings storage. Latest 20 means latest valid matches for the chosen player AND mode, ordered by played time, not merely the latest library uploads.

Default context: current identity/goals, authoritative metric definitions, latest 20 qualifying matches, previous 20 for trend where available, lifetime per-mode summaries, selected match evidence, relevant training history. For All mode, show separate summaries and retrieve the recent slice in each relevant mode under a disclosed budget. Older detailed events remain retrievable.

Clearly state `12 recent 2v2 matches used; 148 lifetime 2v2 matches; 6 excluded for missing identity/coverage`, or the actual equivalent. Imported history is not necessarily all games the user has ever played.

### Training packs and practical plans

Use a locally cached, source-backed catalog with live search fallback. Every recommended code must come from a retrieved record, with title/creator/source and verification status. Search by skill, prerequisites, difficulty, time available, and intended transfer to matches. Recommend 1-3 packs at most, and a no-pack drill when search fails.

A drill has setup, duration/reps, success criterion, progression/regression, and a next-match cue. Record optional completion and difficulty feedback. Review transfer in later matches; successful training-pack shots alone are not proof of match improvement.

### AI harness

Use a deterministic context builder, read-only scoped evidence tools, typed response validation, and versioned role instructions. A more elaborate prompt is insufficient by itself. Details and tools are in [the contract](03_DATA_AI_CONTRACT.md).

## P2: research-gated grading and forecasts

### Benchmark comparisons

Collect GC/SSL reference replays in each mode, but also collect the user's current and next rank band. Pro coordinated 3v3 is a separate cohort from solo-queue ranked. Use distributions, confidence intervals, and contextual comparison rather than a single supposed ideal speed or boost level. Show `how comparable is this sample?` next to benchmarks.

### Player grades and rankings

Aim to evaluate every participant in each replay with sufficient coverage, using mode-specific dimensions: threat creation/finishing, possession and touches, challenge decisions, defensive coverage, off-ball support, resource efficiency, and recovery execution. These require validated event/context features; scoreboard stats alone do not establish them.

Present a 1-100 **match performance estimate**, dimension explanations, supporting clips, uncertainty, and coverage. Ranking participants within a match is a different task from estimating rank/MMR or ranking players across matches. Keep persistent player rankings within comparable mode/cohort and require adequate samples/opponent adjustment. Allow ties and `insufficient evidence`. Never force six precise scores when data cannot support them.

Weights and score calibration must be learned or validated against independently reviewed examples, not invented by the language model. The LLM explains a deterministic/versioned result; it does not improvise the number. Research must specify what a score of 50, 80, or 95 means. Do not ship a universal league table based on this initial replay library.

### Time to next rank

Useful first version: a training schedule and reassessment checkpoint, e.g. review after a user-agreed block of practice and new matches. That checkpoint is not a promotion forecast.

A later forecast needs current rank/MMR with provenance, mode, past progression, practice adherence, match volume, and a calibrated longitudinal cohort. Report a broad interval and assumptions, show when it was last updated, and explain that following the plan is not a guaranteed causal improvement. Abstain when evidence is insufficient. GC/SSL cross-sectional averages cannot supply a credible number of weeks to improve.

## Ideas challenged before inclusion

| Idea | Helpful version | Failure to prevent |
|---|---|---|
| Feed ALL data to AI | Store everything; retrieve exact relevant evidence | Huge truncated prompts that imply complete review |
| Increase average boost/speed | Study whether resources/movement served the play | Hoarding boost, chasing, or rushing useful possession |
| Copy pro habits | Find principles and exceptions in comparable situations | Treating coordinated pro play as solo-queue prescriptions |
| Score every player | Contextual dimensions, calibrated score, abstention | Blame leaderboard and goal/points dominance |
| Many AI roles | A few presets sharing one evidence contract | Conflicting coaches and excessive configuration |
| Rank-up deadline | Calibrated interval after longitudinal validation | Motivational fiction presented as a solid estimate |
| Better graphics | Clear contact surfaces and believable lighting | Glare, ceiling obstruction, or slow playback |

## Questions for the user

Asked in chat:

Profile requirements: collect current and target ranks and optional practice/match hours per mode; allow skip and later editing. No hardcoded personal defaults.
2. Prioritize reliable coaching/chat/viewer first, or include experimental grading in the first release?
3. Permit scoped cloud telemetry and public pack search while keeping raw replays local, or a different data policy?

Additional nonblocking choices for review:

4. Which mode matters most, and do you mainly solo queue or play with a fixed team?
5. Should the coach favor short/direct feedback or explain the tactical reasoning more fully?
6. Should grades initially be private learning aids, or do you intend a shared leaderboard? Recommend private initially.
7. What rank/MMR history and training-completion information are you willing to provide for eventual forecasts?

No timeline has been promised. Sol can implement P0/P1 while Gemini researches P2; model grades and forecasts wait for evidence.
