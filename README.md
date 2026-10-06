# AntiRL

Windows Rocket League replay analysis and evidence-grounded coaching with Tauri 2, Rust, React and Babylon.js.

Replay parsing, playback, evidence, practice tracking and offline coaching run locally. New installations start with **no cloud provider**. Cloud requests require choosing OpenAI or NeoToken, entering an AntiRL credential, and consenting to that specific provider. NeoToken is a third party at `api.v2.neokens.com`. A per-message preview describes the data, estimated input size and additional retrieval allowance before sending. Exact costs depend on the provider; the app does not invent prices. Original replay files are never uploaded, but consented cloud prompts can include player names, match metrics, saved notes and chat history.

## Import and storage

The configured folder uses native filesystem notifications with a settling delay and a 20-second stat reconciliation fallback. An indexed import manifest skips unchanged successes and failures before reading replay bytes. Changed files are hashed once; existing and deleted hashes are checked before making a parser snapshot. Failures retain their reason until the file changes or **Retry failed files** is selected. Only new matches refresh the library and progress views.

Parsing runs in a separate hidden Windows process, suspended until its 512 MiB job boundary is installed. Inputs, output, frame timings and execution time are bounded. Imported files retain their original name. Deleting a replay records both hash and match-ID tombstones; the original game file stays intact, and snapshot removal is selected by default with an option to retain it.

SQLite schema 5 uses numbered transactional migrations and a pre-upgrade backup. Indexed metadata and participants serve library and identity queries. Playback frames live in a separate zstd-compressed table and are inflated only for playback. The analytics database is a rebuildable projection. Fonts and original rank badges are local assets.

## Development and checks

Prerequisites: Windows, Rust/MSVC, Node.js 24, pnpm 11 and WebView2.

```powershell
pnpm --dir app install --frozen-lockfile
pnpm --dir app build
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
pnpm --dir app lint
pnpm --dir app format:check
pnpm --dir app exec playwright install chromium
pnpm --dir app test
./scripts/tauri.ps1 dev
./scripts/tauri.ps1 build --bundles nsis
```

Build the frontend before all-feature Rust tests: Tauri's `custom-protocol` feature embeds `app/dist`. `pnpm --dir app types:generate` regenerates checked-in Specta IPC bindings; CI checks for drift. Generated wrappers use Tauri's default camelCase arguments. The dynamic evidence-tool adapter converts only top-level legacy snake_case arguments, preserving nested evidence JSON. All database/vault IPC commands are async and offload blocking work. IPC failures have stable `{code,message}` fields.

GitHub Actions runs formatting, tests, Clippy, TypeScript, ESLint with React Hooks checks, a production build, and Playwright on `windows-latest`. Tests use synthetic fixtures; native import verification uses replay copies and an isolated profile.

## ChatGPT plan sign-in

OpenAI now documents [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). The previous fixed placeholder client is replaced by an optional official dynamic-registration adapter with PKCE, secure state/nonce, signed identity verification and rotating refresh tokens. It is **disabled in default builds until a real sign-in and inference flow is verified**. Test the experimental build with `cargo build -p antirl --release --features custom-protocol,chatgpt-siwc`; synthetic callback, signed-claims and refresh tests do not prove account eligibility or live access.

OpenAI direct requests use the Responses API with `store:false`. Streaming sends visible deltas. Known evidence citations are extracted into metadata, and final/partial text filters training codes against retrieved records. Free-form model prose still requires review: an invented citation can remain visible in its text. Cloud cancellation is durable; an already accepted refresh-token rotation finishes within its bounded timeout to preserve the session before cancellation is observed.

Grades, MMR/rank forecasts and confident tactical judgments remain unavailable without calibration. Training catalog codes have source attribution but have not all been tested in game. Geometry/model licenses are in `app/public/viewer`. Historical handoffs and audits are preserved in `docs/archive`.

See [architecture](docs/ARCHITECTURE.md), [hardening checklist and validation](docs/HARDENING_CHECKLIST.md), and [metric methods](docs/METRIC_METHODS.md). The executable is `target/release/antirl.exe`; portable folders/installers require their own packaging and clean-machine checks.
