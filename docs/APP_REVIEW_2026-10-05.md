# AntiRL app review — 2026-10-05

The running app was inspected with Computer Use. Changes preserve the existing uncommitted work and add no dependencies.

## Findings and changes

- The Progress win-rate icon was invisible because `--sage` was undefined. Defined the theme colors and used a trophy icon, also restoring win chips and AI/assistant status colors.
- Replaced approximate rank drawings with all 22 ranked emblems plus Unranked from Rocket League Tracker's linked artwork. Bundled source images preserve reference pixels without AI-generation drift and work offline. Asset URLs and SHA-256 hashes are in `app/public/ranks/sources.json`. Game materials belong to Psyonix/Epic Games; attribution is not a license grant.
- Explicit player identity is retained when absent from the selected replay; the recorder is no longer silently substituted. The library aggregate continues to use the configured account.
- Coach context includes library count, per-mode aggregates, up to 20 named recent matches with identifiers, profile/ranks/focus/persona, tracked goals, memory, selected-match players/metrics, coverage, goal timeline, and bounded event descriptions. Current evidence overrides earlier assistant answers. Library and memory precede bounded match events.
- Added the definition of boost used while already supersonic: this measures boost waste, not total supersonic uptime. Restricted unsupported causal claims from average speed or defensive-half share.
- Exact library-count questions use a deterministic local answer without a provider request.
- Added streamed replies through Tauri Channels, excluding reasoning text. Cancellation remains active during response reading. Incomplete/invalid streams report errors.
- GLM 5.3 chat uses low reasoning effort; structured analysis uses high. Preserved the configured model/provider and parameters for other model families.
- Stored each answer's replay identity so changing the match picker cannot rebind citations. Legacy answers without stored replay identity have no inferred citation target.
- Added a compact SQLite coaching projection, backfilled once and refreshed on replay save. Render frames remain in full replay bodies for Studio. Library/player/progress/teammate scans and citation loading use the compact projection.
- Removed hard-coded recurring strengths/priorities presented as evidence-derived findings.
- Fixed composer layout, user-label contrast, no-data win-rate/goals states, and draw counts.

## Validation

- PASS: TypeScript and production Vite build.
- PASS: workspace Rust tests, 12 passed; the opt-in live test is excluded from the default suite.
- PASS: separately executed synthetic-provider test correctly answered library count, focus identity, and 31.4 versus 40 average boost. It sent synthetic replay data only.
- First synthetic request: first answer chunk 8736 ms, completion 8820 ms. With low reasoning effort: first chunk 2601 ms, completion 3531 ms. Two individual requests, not a typical-latency guarantee.
- Local 29-replay probe: full JSON 135,289,093 bytes versus compact JSON 1,043,410 bytes. Python/SQLite full read+parse 1381.8 ms; SQL projection+parse 246.7 ms; persisted compact projection in-memory read+parse 4.2 ms. Single-run local measurements, not end-to-end chat timing.
- PASS: all 23 PNGs decode and their hashes are recorded.
- PASS: desktop screenshots show Diamond II artwork, a visible trophy/green win rate, green recent wins, and the composer within a 1440×900 window.
- PASS: native release executable built with `cargo build -p antirl --release --features custom-protocol`.
- PASS: migrated live store retains 29 full replay bodies and 102,171 render frames; all 29 coaching projections exclude frames.
- PASS: reopened release and submitted the exact library-count question through the desktop UI; it reports 29 analyzed replays via the local path.
- Tests cover configured-user absence, projection refresh while preserving full frames, citation mapping, UTF-8 stream boundaries, excluded reasoning, incomplete/error streams, and local count routing.

## Remaining limits and next steps

- Deep mechanics review needs validated ball-touch/contact sequences or a visual clip. Positions/boost/goals alone cannot establish double taps, flip resets, or touch quality.
- Cross-match context is bounded. Add mode/date/player-filtered retrieval for specific older matches instead of sending the whole library.
- Derive recurring patterns from sample-aware measurements, distinguishing coverage and competitive/private matches. Preserve the distinction between suggested and adopted goals.
- Parser/3D rendering and OAuth were not newly validated end to end. Full DPI, zoom, keyboard, and resized-window matrices were not run.
- Existing saved answers remain intact and may contain older incorrect advice. New requests treat current evidence as authoritative.
- Direct native builds do not refresh installer bundles.

Sources: [Rank artwork](https://rocketleague.tracker.network/rocket-league/distribution), [Tauri Channels](https://v2.tauri.app/develop/calling-frontend/#channels), [GLM reasoning effort](https://docs.z.ai/api-reference/llm/chat-completion).
