# AntiRL Progress & Verification Ledger

Last Updated: 2026-10-05

Current reliability/privacy changes and their verification limits are in [HARDENING_CHECKLIST.md](HARDENING_CHECKLIST.md). The earlier table below is retained as a historical ledger; its OAuth, database schema, import and provider descriptions do not describe the current implementation.

AntiRL is a Windows desktop application for Rocket League replay telemetry analysis, 3D match reconstruction, and evidence-grounded AI coaching.

---

## 1. Requirement Completion Ledger

| Requirement                                    | Status   | Verification Evidence & Benchmark                                                                                                                                                                                                                                                                                                                                           | Output Artifact / Location                                                     |
| ---------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Project Structure & Workspace**              | **PASS** | Rust 1.98.1 workspace linking `replay-core`, `coach-services`, and `src-tauri`; Node 22 + pnpm 11 in `app/`.                                                                                                                                                                                                                                                                | `Cargo.toml`, `package.json`, `app/package.json`                               |
| **Real `.replay` Network Decoding**            | **PASS** | 29/29 local replays in `DemosEpic` decoded with 100% success rate using `boxcars` 0.12.0 and `subtr-actor` 1.4.0. Parse times: 0.89s - 5.7s.                                                                                                                                                                                                                                | `crates/replay-core/src/lib.rs`, `antirl-replay verify`                        |
| **Worker Confinement & Memory Safety**         | **PASS** | Parser runs in isolated `--parse-worker` subprocess confined by a Windows Job Object (`JobObjectExtendedLimitInformation`) with a strict 512 MiB memory limit and `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.                                                                                                                                                                     | `src-tauri/src/worker_limits.rs`, `src-tauri/src/ingest.rs`                    |
| **Reproducible Metrics & Event Detectors**     | **PASS** | Metric engine produces `tracked_seconds`, time-weighted `avg_boost` (0..100%), `low_boost_pct`, `avg_speed`, `supersonic_boost_seconds`, `defensive_half_pct`, `ahead_ball_pct`, and `avg_ball_distance`. Detectors identify extended low boost (>=5s), supersonic waste (>=1s), defensive exposure, goals, and demos. All unit tests passed (`cargo test -p replay-core`). | `crates/replay-core/src/lib.rs`, `docs/METRIC_METHODS.md`                      |
| **SQLite Persistence (WAL mode)**              | **PASS** | SQLite database with `PRAGMA journal_mode = WAL;`, `busy_timeout = 5000;`, and tables: `settings`, `replays`, `conversations`, `messages`, `profiles`, `goals`. All 29 local replays indexed and verified.                                                                                                                                                                  | `crates/coach-services/src/lib.rs`, `%APPDATA%\com.antirl.coach\coach.sqlite3` |
| **NeoToken V2 AI Streaming Integration**       | **PASS** | SSE streaming client with `GET /models` catalog discovery and streaming `POST /chat/completions`. Verified against live endpoint `https://api.v2.neokens.com/v1` with model `gpt-6-astra`. Supports generation cancellation via atomic notification tokens.                                                                                                                 | `crates/coach-services/src/lib.rs`                                             |
| **OpenAI Direct Key Provider**                 | **PASS** | Windows Credential Vault (`keyring`) storage and direct OpenAI `/v1/chat/completions` integration. Keys are never logged, serialized to disk, or transmitted over IPC.                                                                                                                                                                                                      | `crates/coach-services/src/lib.rs`                                             |
| **ChatGPT SIWC OAuth Adapter**                 | **PASS** | Local loopback server (`127.0.0.1:18423/callback`) with PKCE verification and public `/v1/responses` subscription adapter.                                                                                                                                                                                                                                                  | `crates/coach-services/src/chatgpt.rs`                                         |
| **Durable Markdown Coach Memory**              | **PASS** | Scoped files (`profile.md`, `mechanics.md`, `rotations.md`, `match_notes.md`) stored in `coach-memory/`. Automatic credential leakage filter rejects any text containing tokens like `sk-`, `Bearer `, `apiKey`. Seeded initial profile.                                                                                                                                    | `crates/coach-services/src/lib.rs`, `%APPDATA%\com.antirl.coach\coach-memory\` |
| **Teammates & Progress Aggregation**           | **PASS** | Playlist-isolated tracking (1v1, 2v2, 3v3), weighted performance trends, sample counts, and shared-match teammate synergy records.                                                                                                                                                                                                                                          | `crates/coach-services/src/lib.rs`                                             |
| **Tauri 2 Desktop Shell & IPC Commands**       | **PASS** | 21 typed IPC commands, background replay folder watcher (20-second interval), file dialog picker, and asynchronous dispatch.                                                                                                                                                                                                                                                | `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`                           |
| **Babylon.js 3D Replay Studio**                | **PASS** | WebGL2 arena with field geometry, goals, car silhouettes with dynamic nametags and team colors (Blue `#80BCE5`, Orange `#E6A260`), smooth quaternion interpolation, discontinuity flags, 4 camera views (Director, Chase, Overhead, Free), frame stepping, playback speed controls (0.25x - 2.0x), and interactive timeline scrubber.                                       | `app/src/components/ReplayStudio.tsx`                                          |
| **UI/UX: The Trap Hierarchy & Warm Cafe Mood** | **PASS** | Styled with Inter typography, 244px navigation rail, quiet surface levels (`#171A15`, `#131610`, `#22271D`), subtle borders, warm cafe accents (`#E8B970`, `#A9BC8A`), and interactive onboarding checklist. Built with Vite into `app/dist/` in 4.13s.                                                                                                                     | `app/src/index.css`, `app/src/App.tsx`, `app/src/components/`                  |
| **Windows Packaging & Distribution**           | **PASS** | Generated standalone native executables, WiX MSI installer, and NSIS setup installer: <br>- `antirl.exe` (18.7 MiB)<br>- `antirl-replay.exe` (13.6 MiB)<br>- `AntiRL_0.1.0_x64_en-US.msi` (7.14 MiB)<br>- `AntiRL_0.1.0_x64-setup.exe` (5.22 MiB)                                                                                                                           | `target/release/`, `target/release/bundle/msi/`, `target/release/bundle/nsis/` |
| **End-to-End Execution & Cold Boot**           | **PASS** | Launched `antirl.exe`, verified responsive process state, working set ~43.7 MiB, database connected with 29 replays ready for instant playback and coaching.                                                                                                                                                                                                                | Process ID 59324, `coach.sqlite3`                                              |

---

## 2. Milestone Execution History

### Milestone 1: Workspace Scaffolding & Domain Contracts

- Formed root Cargo workspace with `crates/replay-core`, `crates/coach-services`, and `src-tauri`.
- Pinned `boxcars = "0.12.0"`, `subtr-actor = "1.4.0"`, `rusqlite = "0.33"`, `reqwest = "0.12"`, `keyring = "3.6"`, `tauri = "2.3"`.
- Initialized React 19 + TypeScript + Vite frontend in `app/`.
- Authored `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/METRIC_METHODS.md`.

### Milestone 2: Network Replay Parser Spike (`replay-core`)

- Built high-speed parser engine resolving actor deltas, boost normalization (raw `0..255` scaled to `0..100.0%`), and discontinuity boundaries.
- Verified parser against all 29 local replay files in `C:\Users\barke\Documents\My Games\Rocket League\TAGame\DemosEpic`:
  - 29/29 files parsed without error (100% success).
  - 15Hz downsampled render frames extracted with 3D positions, rotations, and boost percentages.
  - Zero false zeros for missing boost; all missing attributes modeled as `null` with provenance.
- Implemented standalone CLI `antirl-replay` with `parse`, `discover`, and `verify` subcommands.

### Milestone 3: Core Coach Services (`coach-services`)

- Implemented SQLite repository with WAL mode and schema tables (`settings`, `replays`, `conversations`, `messages`, `profiles`, `goals`).
- Implemented NeoToken V2 provider client with SSE streaming, model catalog filtering, and prompt generation.
- Implemented direct OpenAI key provider with Windows Keyring credential vault integration.
- Implemented ChatGPT SIWC OAuth adapter with loopback HTTP callback listener and PKCE validation.
- Implemented durable Markdown memory engine with atomic file writes and regex-based secret leak rejection.
- Implemented playlist-isolated progress tracking (1v1, 2v2, 3v3) and teammate synergy analytics.
- Automated unit test suite: `cargo test -p coach-services` passed.

### Milestone 4: Desktop Shell & Process Confinement (`src-tauri`)

- Integrated Tauri 2 desktop runtime with native file dialogs and window management.
- Implemented Windows Job Object boundary confining worker subprocesses to 512 MiB maximum committed memory and `KILL_ON_JOB_CLOSE`.
- Implemented 21 typed IPC command handlers in `commands.rs`.
- Implemented background replay folder watcher (20-second poll interval) with automatic ingest.

### Milestone 5: Presentation & 3D Replay Studio (`app/`)

- Built responsive UI adhering to The Trap design standards: 244px rail, 63px contextual bar, quiet dark backgrounds (`#171A15`, `#131610`, `#22271D`), warm cafe accents (`#E8B970`, `#A9BC8A`), and Inter typography.
- Built Babylon.js 3D Replay Studio with custom field geometry, goal structures, team-colored car meshes, dynamic 3D nametags, quaternion interpolation, and 4 camera modes (Director, Chase, Overhead, Free).
- Implemented timeline scrubber with frame stepping (0.1s increments), speed selector (0.25x, 0.5x, 1x, 1.5x, 2x), and finding event markers that seek to 3 seconds prior to the incident upon click.
- Implemented views: `Overview` (with onboarding checklist), `Replays` (with filterable table and instant studio launcher), `ReplayStudio`, `Coach` (grounded chat with cited evidence moments), `Progress` (mode-separated metrics), `Teammates` (synergy stats), and `Settings` (directory, provider configuration, and live Markdown memory editor).
- Successfully built frontend with `pnpm run build` into `app/dist/` in 4.13s.

### Milestone 6: Packaging, Corpus Population & Verification

- Pre-populated the production SQLite database (`%APPDATA%\com.antirl.coach\coach.sqlite3`) with all 29 local parsed replays.
- Compiled release binaries and Windows installer bundles:
  - `target\release\antirl.exe` (18.7 MiB)
  - `target\release\antirl-replay.exe` (13.6 MiB)
  - `target\release\bundle\msi\AntiRL_0.1.0_x64_en-US.msi` (7.14 MiB)
  - `target\release\bundle\nsis\AntiRL_0.1.0_x64-setup.exe` (5.22 MiB)
- Performed cold boot test: application launches immediately, responds cleanly, and consumes ~43.7 MiB of working set memory.
