# AntiRL

Windows Rocket League replay analysis and evidence-grounded coaching, built with Tauri, Rust, React and Babylon.js.

Replays and account data stay in local app storage. Cloud coaching requires explicit consent and configured credentials. Credentials belong in the Windows credential vault, never in this repository.

## Development

Prerequisites: Windows, Rust/MSVC, Node.js, pnpm and WebView2.

```powershell
pnpm --dir app install
cargo test --workspace
pnpm --dir app build
./scripts/tauri.ps1 dev
./scripts/tauri.ps1 build --bundles nsis
```

The source contains no replay corpus, runtime databases, account profile, credential export or machine-specific agent state. Test fixtures are synthetic. Game artwork and geometry have attribution manifests in `app/public`; attribution does not imply an independent license grant.

## Current upgrade

Correct boost percentage ring, retained ceiling with spectator cutaway, corrected boost/speed semantics, durable analytical projection, mode-specific chat scopes, coaching presets, streaming scroll pause, editable onboarding goals/time, safe Markdown and native conversation export, persistent practice reports, deeper-history browsing and bounded evidence retrieval. Pack search uses source-confirmed local records; live search is unavailable without a supported connector. Source-confirmed codes have not been tested in game.

Grades and rank-up forecasts remain unavailable pending validated datasets and calibration. See `docs/IMPLEMENTATION_LEDGER.md` for actual checks and outstanding gates.

Research source checks and rejected grading/forecast assumptions are documented in [the research audit](docs/RESEARCH_AUDIT.md).
