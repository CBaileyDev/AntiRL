# AntiRL Execution Plan

## 1. Project Overview & Target
- **Target**: `C:\Users\barke\Documents\AntiRL`
- **Goal**: Windows Rocket League replay analysis & AI coaching desktop application built from scratch.
- **Tech Stack**: Tauri 2 (Rust 1.98+) + React 19 / TypeScript / Vite + Babylon.js 8 (WebGL2) + SQLite (WAL mode) + boxcars 0.12.0 & subtr-actor 1.4.0.

## 2. Architecture & Modules
- `crates/replay-core`:
  - boxcars + subtr-actor parser pipeline.
  - Full network frame extraction, actor delta resolution, 3D rigid body extraction (Unreal units Z-up).
  - Normalization of boost (0..255 -> 0..100%), discontinuity boundary detection.
  - Metrics engine: time-weighted boost, supersonic waste, positioning/coverage, ball distance, contact analysis.
  - Event detectors: goals, demolitions, defensive exposure, extended low-boost, supersonic boost waste.
  - Comprehensive unit and fixture test suite.
- `crates/coach-services`:
  - SQLite persistence: settings, replays, conversations, messages, profiles, goals.
  - AI Providers:
    - NeoToken V2 (`https://api.v2.neokens.com/v1`) with full SSE streaming, model catalog, and cancellation.
    - OpenAI direct API key (Windows keyring).
    - ChatGPT SIWC OAuth flow architecture & public `/v1/responses` adapter.
  - Durable Markdown coach memory: scoped by profile and mode, atomic writes, credential leak guards.
  - Analytical coaching & evidence synthesis: prompt templates, cited findings validation, grounded coaching generation.
  - Progress tracking: playlist/mode isolation (1v1, 2v2, 3v3), weighted aggregates, sample sizes, teammate tracking.
- `src-tauri`:
  - Tauri 2 desktop shell, native file dialogs, background watcher, worker boundaries.
  - Typed IPC command handlers with resource limits and cancellation.
- `app`:
  - React 19 + TypeScript + Vite frontend.
  - Design system: The Trap structural hierarchy + warm cafe mood palette (`#171A15`, `#131610`, `#22271D`, `#E8B970`, `#A9BC8A`, `#80BCE5`, `#E6A260`).
  - Babylon.js 3D Replay Studio: pitch geometry, car silhouettes with team colors and dynamic nametags, ball rendering, smooth quaternion interpolation, discontinuity handling, 4 camera perspectives, frame stepping, playback speeds, marker timeline navigation.
  - Views: Overview, Replays library, Match Analysis / Replay Studio, Coach Chat, Progress, Teammates, Settings, Onboarding wizard.

## 3. Milestones & Gates
1. **Stabilize Target & Contracts**: Document architecture, initialize workspace, pin dependencies, write contracts.
2. **Real-data Decoder Spike**: Build and test `replay-core` against real replays in `C:\Users\barke\Documents\My Games\Rocket League\TAGame\DemosEpic`. Benchmark parsing and verify actor transforms, boost, and discontinuity detection.
3. **Core Services & AI Integration**: Build `coach-services`, SQLite database, NeoToken V2 streaming client, Markdown memory manager, progress calculator, and teammate aggregator.
4. **Desktop Shell & IPC**: Build `src-tauri` with Tauri 2, background ingest worker, folder watching, native dialogs.
5. **Replay Studio & Frontend Application**: Build React frontend with Babylon.js viewer, timeline markers, coach chat, progress visualizations, and settings.
6. **End-to-End Verification & Windows Packaging**: Validate end-to-end workflow, test with real replays, capture UI screenshots, run test suites, verify performance budgets, build Windows package.
