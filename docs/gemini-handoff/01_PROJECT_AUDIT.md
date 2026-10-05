# Project and reference audit

Inspection date: October 5, 2026. This is a source and artifact audit for prompt preparation. It is not a release review.

## Application target

The opened `AntiRL` directory had no files, application, instructions, or Git metadata before this handoff was written. There is no existing architecture to preserve there. Do not describe it as an audited working replay app.

The user subsequently confirmed a from-scratch build in AntiRL. `C:\Users\barke\Desktop\ZensCoach` is an additional read-only reference, not the implementation target.

## RLTRAIN_2: actual AI integration and renderer reference

The requested Downloads location contains only `engine/build/CMakeFiles`; it is insufficient to inspect the integration. A fuller checkout was located at `C:\Users\barke\Desktop\Projects\RLTRAIN_2`.

Inspected files:

- `app/src-tauri/src/assistant.rs`: `credentials`, `provider_from_config`, `client`, `assistant_settings`, `chat`.
- `app/src/lib/state/assistant.svelte.ts`, `app/src/pages/Settings.svelte`, `app/src/pages/Assistant.svelte`.
- `app/package.json`, `app/src-tauri/Cargo.toml`, `docs/assistant-models.md`, `LICENSE`.
- `app/src/lib/viewer/playback.ts`, viewer modules, and `app/src/lib/MatchView.svelte`.

Source-derived findings:

- Desktop shell is Tauri 2 with Rust services and a Svelte 5/TypeScript interface. Viewer modules use Three.js.
- The app's provider is **NeoToken V2**, base URL `https://api.v2.neokens.com/v1`.
- Native code reads provider options from `~/.config/opencode/opencode.json`, supports a literal key or `{env:VARIABLE}`, and restricts the credential to that exact endpoint. Credentials themselves were not read.
- Catalog retrieval is authenticated `GET /models`, parsed from `data[].id`.
- Inference is authenticated `POST /chat/completions`; the selected `model` is passed in the request. This path sends a JSON body and reads a complete JSON response, rather than implementing streaming.
- Connection timeout is 10 seconds; requests have a configured timeout and redirects are disabled. Returned usage is exposed when available.
- The source default is `gpt-6-astra`. That is a local default, not evidence of current account access or a requirement to make it the new coach's default.
- Playback separates snapshots from a playhead and includes discontinuity handling. Its 120-tick RocketSim conventions and viewer scaling must not be applied blindly to genuine replay network frames.

Reuse the adapter boundary, catalog behavior, secret separation, timeout handling, and playback lifecycle ideas. Do not copy its credentials, training-specific prompts, autopilot actions, fabricated live catalog access, or assumptions about request streaming. Working-tree changes exist; this reference was not edited or built.

## The Trap / Keyline: strongest design reference

Location: `C:\Users\barke\Desktop\Projects\The Trap`.

Inspected `package.json`, `web/src/styles.css`, `web/src/App.tsx`, `web/src/pages/OverviewPage.tsx`, and saved images `dashboard.png` and `.playwright-cli/v3-admin-demo.png`.

Current source uses React/TypeScript/Vite, Inter Variable, a 244px sidebar, a 63px contextual top bar, 14px body text, dark neutral surface layers, subtle separators, 8/10/12px radii, and violet accents. It provides visible focus treatment, breakpoint rules, page headings with focused actions, loading/empty states, and an actionable setup checklist. The earlier `dashboard.png` is green-accented; the later saved admin demo and current CSS are violet. Preserve its design principles instead of conflating historical palettes.

Useful translation: consistent navigation, generous content gutters, restrained borders, clear page hierarchy, small contextual badges, and useful next-step guidance. In a replay coach, the largest surface should be evidence playback; avoid importing a licensing dashboard's metric-card hierarchy unchanged.

The saved demo screenshot is dated September 24, 2026. It was viewed in this session, but the app was not relaunched or interactively tested. The checkout has extensive dirty/untracked work. No backend or production database was accessed.

## PrettyDesk: Windows behavior and architecture

Location: `C:\Users\barke\Desktop\PrettyDesk`. No Git metadata was available.

Read `AGENTS.md` and `docs/ARCHITECTURE.md`; viewed `TestResults/ui-quality-2026-10-02/Main-Home-Dark.png`.

Useful patterns: separate portable domain/presentation logic from native Windows adapters and shell composition; dispose background workers; preserve native dialogs, keyboard access, system themes/high contrast, and ordinary window behavior; maintain versioned docs and explicit verification evidence. Its WPF tray/wallpaper product is a reference for desktop reliability, not a reason to add wallpaper, tray, registry, or process-scanning features to the replay coach.

Saved screenshot inspected; current build, installer, lifecycle, and native behavior NOT RUN.

## Ejector: local-file workflows

Location: `C:\Users\barke\Desktop\Projects\ejector`. No Git metadata was available.

Read `README.md`, `src/ui/theme.cpp`, and relevant `src/ui/app.cpp` sections. This is a C++/Dear ImGui local PE-file inspector, with a restrained four-pixel spacing rhythm, drop zone, import activity, status, resizable artifact tables, and privacy-aware reporting. Its current purpose is read-only inspection. Do not carry process attachment or injection assumptions into this project.

Useful translation: understandable import jobs, per-file failures, cancellable work, and clear local/offline state. Native execution and visual interaction NOT RUN.

## ZensCoach: additional implementation reference

Location: `C:\Users\barke\Desktop\ZensCoach`; files changed during this inspection.

Read `AGENTS.md`, architecture/progress docs, crate manifests, parser/service/native source, frontend controls, and corpus tooling. Viewed `.local/overview.png` and `.local/replay-latest.png`.

Existing code includes Rust `replay-core` and `coach-services`, a Tauri 2 shell, React/TypeScript, Babylon.js, SQLite-backed records, protected native credentials, provider transports, Markdown memory, real replay reconstruction, metrics/events, player selection, progress, teammates, and replay controls. The parser manifest pins `boxcars=0.12.0` and `subtr-actor=1.4.0`, requiring Rust 1.88 or later.

Useful implementation entry points:

| Concern | File |
|---|---|
| Decoding/metrics/actor state | `crates/replay-core/src/lib.rs`, `types.rs` |
| Command-line probe | `crates/replay-core/src/main.rs` (`zens-replay`) |
| Storage/AI/memory | `crates/coach-services/src/lib.rs`, `chatgpt.rs` |
| Imports and containment | `src-tauri/src/ingest.rs`, `worker_limits.rs`, `commands.rs` |
| Viewer/UI | `app/src/viewerEngine.ts`, `ReplayViewer.tsx`, `App.tsx` |
| Private corpus validation | `scripts/validate-corpus.py`, `.local/corpus-validation.json` |

Source review showed recorder selection based on `PlayerName` plus `PrimaryPlayerTeam`; that warrants semantic validation and user confirmation. Tactical events are labelled heuristics and contacts are described as estimated. These labels should survive a redesign. The examined memory retrieval selects a bounded set of prioritized/recent files; explicit player/mode scoping and evidence relevance still need verification. Do not assert all requested profile, memory, cancellation, export, or coaching features are complete merely because controls exist.

The saved corpus report says 29/29 files decoded. That is historical artifact evidence, not a fresh accuracy review. The saved viewer screen displays reconstructed replay data and clickable markers; it is not proof of smooth playback, correct orientation, accurate event timings, or final visual quality. A high-level corpus probe using the existing executable was stopped after 478.8 seconds without a completed report. The executable predates source edits observed during inspection; this result cannot certify the current source or locate the performance bottleneck. See `evidence/parser-probe-stopped.json`.

## Fresh low-level parser verification

Downloaded the official rrrocket v0.11.6 Windows MSVC release to ignored `.local/research-tools` in AntiRL. Ran a bounded read-only probe with CRC checking and network parsing on all 29 original local files. **PASS: 29/29**. Dry-run checks wrote no adjacent replay JSON. Two genuine 2v2/3v3 files were separately decoded into process memory, then discarded after aggregate structural checks. Their match dates were October 3/4, 2026; they contained 9,118/4,718 network frames and 38,010/29,374 rigid-body updates. No private raw JSON was retained or uploaded.

The two JSON-producing calls took approximately 72ms and 59ms, including process/serialization/capture overhead. This is not an isolated decoder benchmark or a reconstruction/analysis benchmark. The contrast with the stopped high-level artifact makes separate pipeline profiling an important implementation gate; the cause has not been established.

Reproducible helper and aggregate results: `evidence/probe_rrrocket.py` and `evidence/rrrocket-probe.json`. Structural compatibility does not prove identity semantics, units/orientation, native-game agreement, event accuracy, rendering, or 1v1 coverage. Those gates remain NOT RUN.

## Mood reference

The provided [image](https://i.pinimg.com/736x/d0/7d/84/d07d8466ae4b21b19cce219642addb56.jpg) was opened and visually inspected in the in-app browser after the text-fetch tool could not retrieve it. It depicts a warm cafe/classroom with amber lamps, wood tables, olive chalkboards, burgundy upholstery, cream writing, and greenery. Use that palette and calm atmosphere, without embedding the photograph or reproducing its lettering.

## Limits

No reference project was rewritten, no credential file was opened, no private replay was uploaded, and no paid AI call was made. Builds, packaged app execution, manual in-game comparison, live provider authentication, and OAuth sign-in were not tested here. This preparation supplies evidence and specific gates for Gemini to execute.
