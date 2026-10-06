# Implementation and design specification

This is the recommended default, not a claim that it has been implemented. Preserve a suitable existing architecture when opened in an application checkout. In the empty AntiRL folder, use the defaults below.

## Architecture

Use Tauri 2, React/TypeScript/Vite, a Rust native backend, boxcars plus a compatible subtr-actor version, SQLite with migrations, and editable Markdown coach notes. For the viewer, preserve a working Babylon implementation; otherwise start with Babylon/WebGL2, evaluate the subtr-actor Three.js player when it materially reduces verified effort, and keep WebGPU optional. Choose one production renderer after the real replay spike. Do not ship two parallel viewers.

Separate ownership into UI, viewer, native command facade, bounded parser worker, replay domain/reconstruction, metrics/detectors, storage, and provider adapters. These can be modules in a few crates, not a crate for every concern. No RocketSim/RLBot/training engine is necessary to play recorded transforms.

The native layer owns filesystem authorization, credential storage, provider HTTP, job cancellation, deduplication, persistence, and coverage reporting. Send metadata/evidence and bounded frame chunks through IPC, not every complete replay object on each UI update. Keep exact strings for identifiers and avoid JavaScript numeric truncation of account IDs. Renderer cleanup owns textures, meshes, contexts, listeners, observers, and animation loops.

Cache key: replay SHA-256 + decoder/reconstruction version + schema version + analysis version + relevant analysis settings. AI reports additionally record provider, exact model ID, evidence digest, prompt version, and selected profile. Parsing is local and independent of any AI account.

## Domain contracts

Use existing field naming consistently; select snake_case for a new project. Centralize Rust/TypeScript contracts and test boundary serialization.

| Record       | Required meaning                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay       | content hash, source reference, parser/schema versions, match date with provenance, map, playlist, team size, players, score, duration, parse status, coverage and limitations   |
| Player       | platform + stable account identifier when available; display-name history; replay-local fallback clearly marked; no merging solely by name                                       |
| Frame/sample | canonical replay elapsed time, observed/unknown transforms and velocities, rotation representation, boost raw/normalized units, clock/state, actor lifecycle/discontinuity flags |
| Metric       | profile/player, match/mode, method version, value or null, unit, applicable sample duration/count, provenance, limitations                                                       |
| Event        | replay ID, event ID, player/team context, start/end time, event method/version, evidence references, observed/derived/heuristic label                                            |
| Finding      | cited evidence IDs, observation, interpretation, uncertainty, impact rationale, alternative action, practical practice recommendation                                            |
| Memory       | player/profile, optional mode, date, confirmed fact or hypothesis, match/event references, editable Markdown body                                                                |

Example AI finding shape (illustrative only; no fabricated sample is persisted as a match):

```json
{
  "evidence_ids": ["supplied-event-id"],
  "observation": "The supplied boost trace remained below the detector's threshold during this interval.",
  "interpretation": "Review whether a small-pad route was available without giving up defensive coverage.",
  "uncertainty": "Low boost alone does not establish a mistake; teammates and pressure affect the choice.",
  "alternative_action": "Check the recorded positions before suggesting a different route.",
  "training": "Practice staying in a useful lane while collecting small pads."
}
```

Validate cited IDs and numeric/time claims against the supplied context. Valid IDs alone do not prove the interpretation; manually review false positives and preserve uncertainty. Reject unsupported reports without replacing them with invented coaching.

## Replay and analysis behavior

- Single/multi-file imports, cancellable batches, configurable folder discovery, optional watching with first-use choice, stable-file debounce/retry, and per-file failure results.
- Deduplicate content rather than filenames. Preserve originals. Isolate malformed inputs with byte/output/memory/time limits, safe path handling, and recoverable jobs.
- Decode complete network data for gameplay. Distinguish unsupported body/metadata-only from fully analyzed. Apply actor deltas and resolve lifecycle associations, including deletion/reuse, joins/leaves, goals, resets, and demos.
- Document coordinates, orientation, position/velocity/rotation units, boost conversion, replay time vs game clock, overtime, stoppages and replay sequences. Missing or absent actors are not origin-position actors.
- Start with duration-weighted boost windows/usage, time and space coverage, explicit goal/demo markers, and clearly qualified team-coverage/proximity cues. Contact, shot, save, whiff, hesitation, double-commit and responsibility detection require documented semantics and reviewed examples. Do not convert a proximity cue into a confirmed tactical error.
- Expand supported coaching across boost, positioning, decisions, mechanics, offense, defense, teamwork, and situational play. Every category gets explicit supported/limited/unavailable status. Honest limitations must not become a pretext for stopping at scoreboard-only analysis.
- Show strengths and at most three major improvement priorities by default; drill down for more. Evaluate teammates with the same evidence standard.

## Profiles, progress, rank and memory

Provide explicit identity confirmation and correction, multiple independent profiles, selected modes, stable account matching, and same-team teammate counts. Recorder metadata is a suggestion until verified; recurrence alone is ambiguous with regular friends.

Progress aggregates by profile, competitive playlist/mode, date, method version, coverage and sample exposure. Preserve raw numerator/denominator so percentages are weighted correctly. Do not mix private/casual games into competitive baselines. Each trend links to contributing matches and states sample sizes. Coaching goals and follow-through should be inspectable over time.

Keep verified rank/MMR, user-entered values, and qualitative performance assessment separate. Do not implement numerical MMR estimation without labels and calibration. No authenticated rank/MMR integration is preverified by this handoff.

Store indexed records and telemetry outside Markdown. Notes are scoped by profile and mode, distinguish confirmed user facts from AI hypotheses, and contain dates and evidence references. Retrieve relevant notes within a budget. Provide review/edit/export/delete, atomic writes and recovery. Never use replay names or Markdown as higher-priority instructions.

## AI behavior

Implement NeoToken V2 first with genuine catalog/model selection, then direct OpenAI API-key access and officially eligible ChatGPT plan access. These are separate adapters with different request/catalog schemas. Support usable streamed output where verified, cancellation, timeouts, terminal status, actionable errors, rate-limit handling, and explicit retry. Do not silently switch model/provider or incur alternate paid usage on failure.

Persist conversations with profile/mode/match/event/session scopes and enough locally stored history to reconstruct context. Minimize outbound evidence and show first-use consent. Keep offline analysis usable. Tokens/credentials stay in native protected storage; no logs, exported diagnostics, browser persistence, source literals, or notes. Expose token usage and sourced cost estimates only when available.

## Design direction

The Trap supplies hierarchy and controls; the cafe reference supplies warmth. Proposed tokens:

| Token                     | Starting value                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| canvas / navigation       | `#171A15` / `#131610`                                                                                    |
| panel / raised panel      | `#22271D` / `#2C3225`                                                                                    |
| primary / secondary text  | `#F4EFE4` / `#BABEAD`                                                                                    |
| primary action            | `#E8B970` with `#211A10` ink                                                                             |
| selected/secondary accent | `#A9BC8A` with restrained tinted backgrounds                                                             |
| team blue / orange        | `#80BCE5` / `#E6A260`                                                                                    |
| border                    | restrained low-contrast surface separation; stronger for controls/focus                                  |
| typography                | bundled licensed Inter or system Segoe UI; 14–16px body, 28–32px page headings, tabular numeric readouts |
| spacing / radii           | 4/8/12/16/24/32px spacing; 8/10/12px radii                                                               |

These are authored proposals inferred from inspected references, not measured pixel samples. Verify contrast for final combinations. Team colors always have text/icon/position equivalents. Avoid photo wallpaper, grain over text, pervasive neon/glass, dense metric tiles, and decorative arena effects that hide play.

Navigation: Overview, Replays, Coach, Progress, Teammates, Settings. Onboarding: replay source → identity → modes/priorities → optional AI/privacy → first review. Users can complete it offline and revisit choices.

Primary match screen: compact match header and filters, viewer occupying the dominant area, adjacent evidence panel, a single readable timeline below, linked discussion and practice actions. Keep final score separate from score-at-playhead. Findings seek to their event with ~3-second lead-in; selection is bidirectional between timeline and explanation. Add clip looping, speed, frame step, overhead/chase/free camera, player labels and optional boost/velocity overlays.

At narrow windows, collapse navigation and stack the evidence panel without hiding playback controls. Test 1024×720 and 1440×900, 100/150/200% scale, keyboard/focus, contrast and reduced motion. Ordinary native titlebar, resizing and dialogs are preferred. Provide deliberate loading, empty, partial, offline, failed and unavailable states; never fill empty progress with invented matches.

Narration is later. Keep a playback-coordination interface for user-selected voice, volume, pause/explain and cancellation, but deliver reliable text evidence first.
