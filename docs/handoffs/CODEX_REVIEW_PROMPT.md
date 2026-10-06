# Codex prompt — strict full-app review, test run and redesign plan

Prepared 2026-10-06 against commit `6762f8c`. Paste everything below the line into Codex.

**Operator notes (for you, not Codex):**

- **Best surface: local Codex on Windows, at the repo root.** That's the only place the real Tauri app, WebView2, the job-object sandbox and the `scripts/test-native-*.mjs` checks can run. Codex cloud and Linux can run most of the suite; see "How to test" for what they can't.
- **Run it as a long job.** Use `/goal` in the CLI, or `codex exec --sandbox workspace-write -o review/FINAL.md "<prompt>"`. The default read-only sandbox can't run tests. Use `gpt-6.1-sol` (or GPT-6 Astra) with high reasoning effort. Turn on live web search (`--search`) if you want it to check current model IDs and competitor features.
- **Branch first:** `git switch -c review/codex-audit`. The prompt only lets Codex write under `review/` plus new `review_*` test files, so the review is easy to diff and throw away.
- **Don't use `/review` or `@codex review` for this.** Both only look at diffs; save them for the PRs that implement the fixes.
- **Screenshots in `docs/validation/` are partly stale.** The prompt tells Codex to re-capture them. If you're in the ChatGPT desktop app, you can also let it drive the real window with Computer Use.
- **Follow-up prompt.** A short one for the implementation phase is at the bottom of this file.

---

## Goal

You are a principal engineer and senior product designer doing a hostile pre-launch review of **AntiRL**. AntiRL is a Windows desktop app (Tauri 2 + Rust + React 19 + Babylon.js + SQLite). It parses Rocket League `.replay` files locally, computes player metrics, plays matches back in 3D, and offers an evidence-grounded AI coach chat (OpenAI Responses API, or the third-party NeoToken proxy, or offline).

Produce three things:

1. **An exhaustive, evidence-backed list of everything wrong or improvable.** That covers bugs, wrong or misleading numbers, performance, security and privacy, architecture, tests, docs, UX, copy, accessibility and visual design. Be strict and picky. The owner explicitly wants nits, things that could be optimized, and things that should be done differently, not just blockers.
2. **A real test report** from actually building and running everything you can.
3. **A big-swing redesign and improvement plan** with mockups. The owner wants **big** changes, not polish. They like the current colour theme; keep it. Everything else (layout, IA, components, typography, flows, features, architecture) is open.

This pass is **review-only**: find, prove, and plan. A separate run will implement. Do not settle for a partial or "helpful enough" review. Don't stop to ask clarifying questions; make a reasonable assumption, note it in the report, and keep going.

## Context

- **Map.**
  - `crates/replay-core`: boxcars/subtr-actor decoding, validation and metrics.
  - `crates/coach-services`: SQLite storage and migrations, analytics projection, AI providers and prompt assembly (`ai.rs`), retrieval and evidence tools, xG, the bot-likeness detector, the RLTRAIN_2 what-if sim, practice/transfer tracking, camera import, and the disabled ChatGPT sign-in adapter.
  - `src-tauri`: async IPC commands, import pipeline, folder watcher, and the Windows job-object parser worker.
  - `app/src`: React pages and components, the Babylon viewer (`viewer*.ts`), `styles.css`, and `data/*.json` (metric dictionary, prompts, research cards, training packs).
  - `integrations/discord`: a Node bot.
  - `scripts/`: manual native checks.
  - `docs/`: architecture, metric methods, hardening checklist.
- **The user.** One serious ranked player (for example Plat 1 in 1s, Diamond 2 in 2s and 3s, aiming for Champion). They want the app to tell them *what to fix next*, backed by their own replays, and to help them practise it.
- **History you need to know.** The app was built by several AI agents under prompts that heavily stressed "never overclaim." The result is mostly honest, but it reads like an audit log, not a coach: walls of disclaimers, "unavailable" everywhere, raw evidence dumps. **Treat over-hedging as a defect class.** Honesty stays non-negotiable: no fake grades, no invented numbers, no rank forecasts without calibration. But express it through design (confidence levels, "based on N games", a "how we measure" popover), not paragraphs. Judge every caveat on whether it earns its space.
- **The research spec.** `AntiRL Coaching Evidence Research.md` sits at the repo root. Read at least sections 00, 02, 03 and 08 and the self-critique.
  - The exact thresholds are in embedded formula images.
  - About 60% of its citations point back to the repo itself, so treat it as hypotheses, not authority.
  - `docs/archive/reviews/RESEARCH_AUDIT.md` records which parts were deliberately rejected.
  - Judge both directions: where the code deviates from the spec, *and* where the spec is wrong or so conservative that it blocks valuable coaching.
- **Don't trust docs or screenshots.** The code is the source of truth.
  - Docs contradict each other (e.g. `docs/PROGRESS.md` vs `docs/HARDENING_CHECKLIST.md`).
  - Some screenshots in `docs/validation/` predate the code.
- **Market context (Oct 2026).**
  - Rocket League's Easy Anti-Cheat (Apr 2026) ended BakkesMod-based automatic uploads to ballchasing, so local automatic ingest is now a differentiator.
  - Competitors to compare against: ballchasing.com (reference stat set: boost, movement, positioning tabs, heatmaps), calculated.gg (Paragon: turns moments into free-play drills), BLAST's RL rating (published components incl. 50/50s, kickoffs, pressure; xG-weighted goals), DataCoach, trophi.ai, Leetify (CS2: percentile colour bands, win-probability impact).
  - P4cely shut down in Sep 2026 because per-report AI costs were never covered, so cost per coaching answer matters.

## Constraints

- **Writes are limited.** Do not modify existing source, config, lockfiles, CI or docs. You may create files only under `review/`, plus new test files whose names start with `review_` (e.g. `crates/replay-core/tests/review_metrics.rs`, `app/tests/review_*.spec.ts`) to prove findings. Failing tests that demonstrate a bug are welcome; mark them clearly.
  - You may also create gitignored inputs a check needs to run (e.g. the missing test key below).
  - Delete untracked build output afterwards (e.g. `src-tauri/gen/schemas/linux-schema.json`).
  - Work around broken config with CLI flags, environment variables, or wrapper configs under `review/`. Don't edit the config itself; log the breakage as a finding.
- **Never touch real user data.** Never run `scripts/populate_db.mjs`. Never touch `%APPDATA%`, a real AntiRL profile, or the user's replay folders. Use a temporary profile directory and synthetic or copied fixtures.
- **No real provider calls.** Make no network calls to OpenAI or NeoToken, and don't read, print or commit any credential. Stub the providers.
- **Keep the palette** in Appendix B: dark navy/near-black surfaces, indigo/violet accent, team blue/orange. You may add tints, semantic aliases and separate team-vs-status colours. Don't replace the identity.
- **Use subagents.** Use them for the coverage areas below; at minimum split parser and metrics, storage/import/security, the AI coach layer, the experimental models, frontend and viewer, and design. Each writes to the shared findings file. Then run one validation pass over everything.

## How to test

Run every command you can and record each one in `review/TEST_REPORT.md` with its exit code, duration, a short summary, and the root cause of any failure. If something can't run here (no Windows, a missing system library, no network), say exactly why and keep going.

**Run the repo's own commands first, unmodified, and record their real result.** CI (`.github/workflows/quality.yml`) has never passed on GitHub, so each breakage below is a finding in its own right. Then apply the workaround and continue.

The commands below were checked on Ubuntu 24.04 at `6762f8c`. The `pnpm` on PATH switches itself to 11.3.0 through the `packageManager` field.

| Step | Repo command | Known result | Workaround |
| --- | --- | --- | --- |
| Install | `pnpm --dir app install --frozen-lockfile` | **Fails** with `ERR_PNPM_IGNORED_BUILDS esbuild`. `app/pnpm-workspace.yaml` still has pnpm's placeholder `allowBuilds: esbuild: set this to true or false`. CI dies here too. | Add `--config.strict-dep-builds=false` |
| Frontend checks | `pnpm --dir app build`, `lint`, `format:check`, `test:unit` | Pass. The main chunk is 1.77 MB (467 kB gzip) and `dist` is 17 MB. | — |
| Playwright | `pnpm --dir app exec playwright test` | **Fails** if the bundled browser revision is missing. Two specs then struggle: `frontend-security.spec.ts` needs about 66 s on software WebGL (the limit is 45 s), and `coaching.spec.ts` is a real timing race that fails about 2 runs in 5. The fake stream in `tests/harness.tsx` ends before the test clicks Stop. | A wrapper config under `review/` that spreads the repo config and sets `use.launchOptions.executablePath` to an installed Chromium. Run with `--workers=1 --timeout=180000 --retries=2`. Treat the race as a finding, not noise. |
| Rust format | `cargo fmt --all -- --check` | Pass | — |
| Rust tests | `cargo test -p replay-core --locked` / `-p coach-services --locked` | Pass: 6 tests, and 75 pass with 2 ignored. | — |
| `--all-features` builds | `cargo test`/`clippy … --all-features` | **Won't compile on any fresh clone.** `coach-services/src/chatgpt.rs:733` uses `include_bytes!` on `tests/fixtures/synthetic-oidc-test-key.pem`, which `.gitignore:26` (`*.pem`) kept out of git. | Generate a throwaway key at that path with `openssl genrsa -out … 2048`; it is gitignored. Then 79 pass, and clippy is clean. |
| Workspace / `src-tauri` | `cargo test --workspace --all-features --locked` (build `app/dist` first) | On Linux it needs `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev libxdo-dev libssl-dev`. After that, `generate_context!` panics because `tauri.conf.json` lists `32x32.png`/`128x128*.png`/`icon.icns`, and only `icon.ico` and `icon.png` exist. | `TAURI_CONFIG='{"bundle":{"icon":["icons/icon.png","icons/icon.ico"]}}'`. Then 93 tests pass and clippy reports 0 warnings. Afterwards check `git diff --exit-code -- app/src/bindings.ts`. |
| Other | `node --test integrations/discord/test.mjs`, `node scripts/test-replay-studio.mjs` (no package script runs it), `pnpm --dir app outdated`, `pnpm --dir app audit`, `cargo tree -d` | Pass, 0 vulnerabilities. Major versions are behind: Babylon 8→9, Vite 6→8, TypeScript 5→7, plugin-react 4→6. `cargo tree -d` shows about 11 real version splits. | — |

- **Windows only:**
  - `./scripts/tauri.ps1 build`
  - the `scripts/test-native-*.mjs` checks. They need the release app with WebView2 remote debugging (CDP ports 9236/9239/49187). Some write into the tracked `docs/validation/`; point them at an isolated profile and output folder, and read each script first.
- **Can't run on Linux:** the job-object limits in `worker_limits.rs`, the native and `.ps1` scripts, `test-coaching-ui.mjs` / `test-frontend-security.mjs` (they need `channel: "msedge"`), and `test-discord-local.mjs` (it needs `antirl-replay.exe`).
- **Codex cloud:** put the apt packages and the install workaround in the environment setup script, because the agent phase is offline and secrets are removed.
- **Prove findings with tests.** Write characterization or failing tests for metric math (`EvidenceCollector`, aggregation), context assembly and truncation, the validator, migrations, and import edge cases. There are no real `.replay` fixtures in the repo. If a local Rocket League demos folder exists, copy a few replays into a temp dir (never commit them). Otherwise build synthetic frame data.
- **Measure, don't guess.** Measure the bundle size, the IPC payload size for one opened replay, the context size per mode, and the viewer frame time if you can.
- **See the UI yourself.**
  - Use `@tauri-apps/api/mocks` (`mockIPC`) and the existing `app/tests/*-harness.tsx` files as a model. Build a browser harness under `review/harness/` that renders the **real `App`** with realistic synthetic data: about 40 replays across all three modes, several conversations, practice plans, and both a new user and a heavy user.
  - Capture Playwright screenshots of every page and key state (empty, loading, error, populated, streaming chat, delete dialog, onboarding steps) at 1280×720, 1440×900 and 1920×1080 into `review/screenshots/before/`.
  - Base your design critique on these captures, not the stale ones.

## Coverage — every area needs a verdict

For each area: list what you checked, give a verdict (`healthy` / `needs work` / `broken` / `cut or rework`), and log the findings. "Nothing found" is acceptable only if you list what you examined.

- **A. Replay parsing and metric correctness**
  - Thresholds and hysteresis, time weighting, kickoffs, goal replays and discontinuities, overtime, forfeits and leavers, private and tournament playlists, team/side handling, unit labels.
  - Does every number shown in the UI mean what its label says?
- **B. Storage, migrations, analytics projection, performance**
  - Query patterns, duplicated blobs, indexes, re-derivation and versioning of metrics, startup robustness against bad rows.
- **C. Import pipeline and parser isolation**
  - Watcher cost, tombstones, every code path that decodes a replay, re-validation of worker output, limits.
- **D. AI coach layer**
  - Context assembly and token budgeting, truncation order, grounding enforcement (numbers, citations, training codes), the tool-use and planner design, prompt-injection surface (player names, map names, memory notes), persona and policy conflicts, mode isolation, provider abstraction and default model IDs, streaming and cancellation, the offline fallback quality, cost per answer.
- **E. Experimental models: xG, bot-likeness, what-if sim, transfer, intelligence**
  - Scientific validity, sampling rate vs what's claimed, calibration, harm to third parties (flagging real players as bots), and whether each earns its UI space.
  - Give a verdict per model: keep, rework, hide behind a flag, or delete.
- **F. IPC, types and errors**
  - Untyped `serde_json::Value` domain, generated bindings vs ad-hoc `invoke`, error classification, payload sizes.
- **G. Frontend architecture and bugs**
  - God components, state ownership, routing, data fetching and caching, effects, races, stale closures, memoization during streaming.
- **H. 3D viewer**
  - Bundle splitting, idle rendering, per-frame allocations and raycasts, remount and disposal, controls and keyboard UX, camera rigs.
- **I. Design system and visual design**
  - Tokens, type scale, spacing, dead and duplicated CSS, inline styles, native controls leaking through, numerals, iconography, consistency across pages.
- **J. UX, information architecture and copy**
  - Navigation model, first-run flow, empty, loading and error states, every disclaimer string (inventory them), jargon, dev-status text leaking into the product, and whether each page answers "what should I do next?"
- **K. Accessibility (WCAG 2.2 AA)**
  - Contrast, focus visibility, keyboard paths, dialogs, live regions, labels, hit targets, reduced motion.
- **L. Tests and CI**
  - Missing golden/real-replay and property tests, Windows-only CI, manual native scripts, the adversarial coaching corpus (`docs/validation/coaching-corpus.json`) that has no runner.
- **M. Security and privacy**
  - CSP and capabilities (opener scope), credential storage, the third-party proxy, the Discord bot, path handling, hardcoded personal paths.
- **N. Repo hygiene and docs**
  - Stale and contradictory docs, the root-level research file, dead code (e.g. unused components), dependency health (`pnpm outdated`, `cargo tree -d`, audit if available).
- **O. Product and coaching value**
  - Judge it as a player would. Which coaching features are missing even though the parser already decodes the data?
  - Candidates: kickoff analysis; rotation roles and double commits; boost pathing and steals from pad pickups; 50/50 outcomes; touch quality from the change in ball velocity; recovery speed; shadow defence; positioning heatmaps; goalside time; you-vs-opponent deltas.
  - Compare with the competitors above.

Also account for every file under `crates/`, `src-tauri/src`, `app/src` and `integrations/` in `review/COVERAGE.md`, marked reviewed, skimmed or not reviewed (with a reason).

## Known leads

Appendix A lists leads from a quick prior pass. **Confirm or refute each one** with your own evidence and record which in the finding. They are a floor, not a ceiling; the prior pass was shallow and you're expected to find a lot more.

## Redesign brief

1. **Critique** each page and flow against the fresh screenshots: hierarchy, density, what's above the fold, empty states, consistency, and whether it feels like a premium esports coaching product or an internal tool.
2. **Propose a redesign** with big swings. Take a position; you can reject any starting idea below if you have a better one.
   - **A real design-token and primitive layer.** Replace the 4,000-line `styles.css` and the inline styles: spacing and type scales, elevation, motion, and accessible primitives (Button, Select, Switch, Segmented, Dialog, Popover, Tooltip, Tabs, Toast, Slider, Stat).
   - **A router with deep links** (`/replays/:id?t=`) and a Ctrl+K command palette.
   - **A post-match "Match Report" as the hero surface.**
     - Your result, framed as you vs. them, plus 2–3 timestamped focus moments.
     - One written verdict, and a stat strip against your own recent baseline.
     - Every claim jumps the 3D viewer to its moment.
   - **"Today" instead of Overview:** this week's single focus, recent matches, trend sparklines, and calls to action instead of empty KPI tiles.
   - **A timeline-first Replay Studio:**
     - A full-width canvas with transport controls overlaid on it.
     - A multi-lane, team-coloured event timeline and a minimap.
     - A docked rail with Review / Events / Stats / Lab tabs. Experimental models live in Lab.
   - **A full-height Coach workspace:**
     - A conversation list, and a readable thread with an auto-growing composer and context chips.
     - An evidence side panel whose citations play the moment.
     - Consent once, then a cost chip instead of a preview wall before every message.
   - **Progress as real analytics:** trend charts over 10/25/50 games per mode, goals that are real objects tracked from data, and practice linked to measured change.
   - **A confidence system instead of disclaimers.** Measured / Estimated / Experimental badges, a "how we measure" popover backed by the metric dictionary, and a disclaimer budget.
   - **A 60-second onboarding:** pick your player, main mode and rank, first import. Profile the rest progressively.
3. **Deliver the spec and mockups.**
   - Write `review/DESIGN_REVIEW.md` with the critique, the token spec, the component inventory, page-by-page layouts, and interaction notes.
   - Build static, self-contained HTML mockups in `review/mockups/` using the Appendix B palette and realistic Rocket League data, for at least: Match Report, Today, Replay Studio, Coach workspace, Progress, and onboarding.
   - Screenshot them into `review/screenshots/mockups/`.

## Output

Write files incrementally so you can resume after context compaction. Never hold findings only in memory.

- **`review/findings.jsonl`** (append as you go) and **`review/FINDINGS.md`** (rendered at the end, grouped by severity then area). Each finding has:
  - `id` (e.g. `D-007`), `severity`, `category`, `title`
  - `location`: file:line plus a quote of 5 lines or fewer
  - `problem`, `trigger_or_repro`, `expected_vs_actual`
  - `evidence`: a command output, test name or screenshot path
  - `recommendation`, `effort` (S/M/L)
  - `confidence`: confirmed / likely / speculative
  - `lead`: confirmed / refuted / new
- **`review/COVERAGE.md`:** area verdicts plus the per-file ledger.
- **`review/TEST_REPORT.md`:** every command and its result, the measurements, and what couldn't run and why.
- **`review/DESIGN_REVIEW.md`**, **`review/mockups/`** and **`review/screenshots/`**.
- **`review/ROADMAP.md`:**
  - 10–15 big epics. Each has the problem, the proposal, the finding IDs it resolves, risk, effort and dependencies, in a sensible order.
  - A **delete list** (features or code to cut, with justification).
  - A **quick-wins list** (each 1 day or less).
- **`review/PLANS.md`:** a living progress log (done / next / blocked) so a resumed run knows where it stands.

**Severity rubric**

| Level | Meaning |
| --- | --- |
| **P0** | Won't launch or crashes; data loss or corruption; a security or privacy exposure; the coach or UI shows a wrong number, misattributes a player, or publicly labels a real person a bot. |
| **P1** | A core feature is broken or misleading; serious performance problems (multi-MB IPC, seconds of jank, GPU never idles); an accessibility blocker; a design flaw that makes a core flow confusing. |
| **P2** | An edge-case bug; debt that blocks the roadmap; design inconsistency; copy that undermines trust. |
| **P3** | Nits and polish. Report them; the owner asked for picky. |

## Stop rules

You're done only when **all** of these hold:

- Every coverage area has a verdict, and every file is in the ledger.
- Every Appendix A lead is marked confirmed or refuted.
- Every test command has been run, or has a documented reason it couldn't be.
- Every P0 and P1 has survived a validation pass where you actively tried to disprove it. Downgrade or mark it speculative if you couldn't reproduce it.
- The before-screenshots and the mockup screenshots exist.
- `ROADMAP.md` references finding IDs.

Hitting a context or budget limit is not completion; update `PLANS.md` and continue. If something is blocked, log it and move on to everything else.

Final message: the 15 most important findings (one line each, with ID), the 5 biggest recommended changes, a test summary, and what you could not verify.

---

## Appendix A — Known leads (verify each; line numbers are at `6762f8c`)

**Coaching correctness and AI layer**

1. **Truncation drops the selected match's evidence.**
   - `build_context` writes the metric dictionary, profile, library (about 18k chars per mode), memory, and *then* the match body. It then truncates from the end at `MAX_CONTEXT_CHARS` (`crates/coach-services/src/ai.rs:531-563`).
   - Chats default to mode "All" (`ai.rs:728`).
   - In analysis, findings whose evidence was cut get rejected, and the result falls back to the template (`ai.rs:1397-1410`).
2. **The validator rejects valid answers.**
   - Banned-phrase checks also match negations (`ai.rs:449`).
   - Metric values must match to 1e-9, but the context shows rounded values (`ai.rs:33-39`).
   - The result is the generic fallback with empty strengths and priorities (`lib.rs:601-627`).
3. **Grounding is mostly prose.**
   - Chat only extracts cited IDs (`ai.rs:953`); numbers written in prose are never checked.
   - Analysis uses a 5-phrase blocklist (`ai.rs:1413-1425`).
   - Unverified training-pack codes stream to the UI before the final filter (`ai.rs:910-916` vs `952`), and spaced codes slip past the pattern.
   - Chat has no code-level block on grades or rank forecasts.
4. **Tool use is a keyword-gated pseudo-planner** (`ai.rs:783-806`; "bot" also matches "both"/"bottom").
   - The JSON plan is scraped from prose (`retrieval.rs:9-16`).
   - The planner's `max_output_tokens` is 1000, which is likely starved by reasoning tokens (`ai.rs:822`).
   - No native function calling or structured outputs.
5. **`get_timeline_window` is crippled.** It caps at 120 rows (`evidence_tools.rs:155`), and tool results over 16 KB are dropped (`retrieval.rs:144`).
6. **Prompt injection.**
   - Player names (up to 2,048 bytes, `replay-core/src/lib.rs:463`), map names and memory notes are interpolated into the **system** message (`ai.rs:303-347, 401-415, 902-905`).
   - The opener capability allows any `http(s)` URL (`src-tauri/capabilities/default.json:24-31`).
7. **The persona conflicts with the rules.**
   - The chat prompt casts the model as a "Grand Champion / SSL-level analyst", says to compare against "rank expectations", and to "lead with the 1-3 highest-impact issues" (`app/src/data/coach-prompts.json:44`).
   - The harness forbids rank judgments, and the spec says one issue.
8. **Mode isolation leaks.**
   - Memory notes go into every mode (`ai.rs:176-193, 548`).
   - xG pools all modes (`xg.rs:478-505`).
   - Casual and ranked share a bucket (`replay-core/src/lib.rs:227-239`).
   - The playlist whitelist `1|2|3|10|11|13` turns private and tournament matches into "unknown" and drops their rotation events (`lib.rs:228, 256-258`).
9. **Provider and model defaults.**
   - `gpt-6-astra` is the default chat/analysis model for *every* provider (`coach-services/src/lib.rs:71-72`, `app/src/App.tsx:64-65`).
   - The OpenAI catalog default is `gpt-4o` (`lib.rs:311`).
   - Capabilities are guessed from name prefixes, with a `glm-5.3` special case (`ai.rs:1275-1306`).
   - Responses vs Chat Completions is chosen by comparing the base-URL string (`ai.rs:615`).
   - A new `reqwest::Client` is created per call (`ai.rs:611`).
   - The Responses `error` event may be mis-parsed (`ai.rs:1117`).
   - NeoToken is a hardcoded third party (`lib.rs:84`) with no `store:false` equivalent.
   - The docs disagree on whether any live call was ever verified.
10. **Prompt text is used as a data bus.** The library count and offline sections are re-parsed out of the rendered prompt (`ai.rs:1480-1487, 1578-1594`).

**Metrics and analytics**

11. **Metric edge cases in `replay-core/src/lib.rs`.**
    - Supersonic is a hard 2200 cut with no hysteresis (`:682, 690`).
    - Kickoffs are excluded because "live" requires the ball to have been hit (`:898-899`).
    - Gaps over 0.25 s are dropped silently (`:668`).
    - Game-state constants 53 and 67 are unexplained (`:882, 899`).
    - "Duration" is the time of the last frame (`:397`).
    - An unknown team becomes Blue (`ai.rs:409`).
12. **The headline metric is shown as waste.**
    - The new time-at-supersonic metric is computed but never surfaced (`coach-services/src/lib.rs:436-442`).
    - Overview and Progress show "Boosting at speed", styled as danger (`Overview.tsx:127-137`, `Progress.tsx:148-158`).
    - Parser event text still says "otherwise release boost and conserve it" (`replay-core/src/lib.rs:1046`).
13. **Aggregation.**
    - It mixes `metric_version`s.
    - Non-weighted metrics use a plain per-match mean that ignores match length (`analytics.rs:300-333`).
    - The `low_boost_pct` denominator differs between docs and code (`docs/METRIC_METHODS.md:33` vs `lib.rs:769`).
    - `suspected_unnecessary_boost_s` is in `metrics.json` but produced nowhere, yet it's sent to the LLM as "authoritative".
14. **Re-enrichment never recomputes metrics, and nothing calls it over IPC** (`reenrich.rs:1-8`, `src-tauri/src/main.rs:80-142`). Old libraries never get new metrics.
15. **Three different date parsers** (`storage.rs:9-28`, `analytics.rs:291-299`, `transfer.rs:28-43`) can order matches differently.
16. **Spec deviations.**
    - The fault-attribution lookback is 3 s vs 6 s in the spec (`intelligence.rs:123`).
    - Practice reassessment uses 10 matches vs 20.
    - Matches under 210 s are not excluded.

**Experimental models**

17. **Bot-likeness can't see what it claims to measure.**
    - It runs on 15 Hz render frames (`replay-core/src/lib.rs:21`), but needs 0.035 s or finer spacing to see input cadence (`detector.rs:16, 228`). So it falls back to steering/throttle discreteness, which keyboard players share.
    - It uses hand-picked weights (`detector.rs:236-243`).
    - It is shown per player in the library at an index of 80 or more (`app/src/pages/Replays.tsx:39`) and handed to the LLM (`evidence_tools.rs:184-213`).
    - The "real replay" test asserts nothing (`detector.rs:715-745`).
18. **xG.**
    - It is fitted on the user's own library with a 150-shot gate (`xg.rs:14`).
    - The label is "goal within 8 s" (`:19`).
    - Feature names say metres but the values are uu/1000 (`:22-28`).
    - It decompresses every replay's frames and refits on every call, with no cache (`:483-506`).
19. **The what-if sim** is a policy rollout, not a counterfactual.
    - The default path is hardcoded to the author's machine, `C:\Users\barke\Desktop\Projects\RLTRAIN_2` (`sim.rs:21, 328-336`), and `rl-engine.exe` is spawned from there (`:655`).
    - It blocks a tokio worker for up to 120 s (`:697-718, 929-935`).
    - It is exposed to the LLM as `run_counterfactual`.

**Stability, performance, security**

20. **One bad row bricks launch.**
    - `CoachService::open` runs `reconcile_analytics()?` (`lib.rs:201`), which requires every `coach_body` to be valid JSON (`analytics.rs:68-73`).
    - `scripts/populate_db.mjs:21-23` writes NULL `coach_body` rows into the live database.
21. **Reconcile runs on every analytics query.** It holds both mutexes and parses and SHA-256-hashes every row (`analytics.rs:52-73, 191-209`). The projection tables are written but never read (`analytics.rs:100-167, 267`).
22. **Blocking work runs on the async runtime.** `chat` and `analyze` call `chat_stream` directly (`src-tauri/src/commands.rs:184, 209`), which does synchronous SQLite and keyring work.
23. **Storage duplication.**
    - `body` and `coach_body` are written from the same blob (`storage.rs:77-80`), plus `summary_body`, plus `analytics.source_matches.body`.
    - A full `context_manifest` is stored with every message (`ai.rs:962`).
    - There is no index on `messages(conversation_id)`.
24. **Frame IPC round-trips** zstd → `Value` → typed struct → JSON (`storage.rs:169`, `commands.rs:83-90`). Measure the size.
25. **Auto-import rescans** canonicalize every file, do a DB lookup and emit an IPC event per unchanged file every 20 s (`auto_import.rs:43-56`, `ingest.rs:380-398`).
26. **Decoding in the GUI process bypasses the worker sandbox** (`intelligence.rs:213`, `camera.rs:107`, `reenrich.rs:105-106`).
    - The parent doesn't re-validate worker output (`ingest.rs:432-444`).
    - Up to 128 MiB of worker output is parsed without a bound (`ingest.rs:203-207`).
27. **The Discord bot** parses guild-submitted replays without a memory sandbox (`integrations/discord/server.mjs:107-111`) and imports Playwright from the app's devDependencies (`render.mjs:2`).
28. **Architecture.**
    - `coach-services` is a grab-bag that passes `serde_json::Value` everywhere (about 1.3k string-keyed lookups). 25 of the 61 IPC commands return a bare `Value`.
    - Enums are strings (`replay-core/src/types.rs:21-120`), and settings is an open JSON merge (`lib.rs:226-233`).
    - IPC errors are classified by substring (`src-tauri/src/errors.rs:28-54`).
    - `replay-core` does `include_str!`s from `app/src/data` (`replay-core/src/lib.rs:5`).
    - Version strings are scattered literals (`"metrics-2"` ×10, `"coach-3"` ×16).
    - The sign-in adapter's dependencies are compiled unconditionally.

**Frontend, viewer, design**

29. **No router.** Navigation is `useState` (`App.tsx:53`), there's no `aria-current`, and Studio silently opens `replays[0]` (`App.tsx:421-427`). `App` is a god component (about 25 `useState`s) that owns Coach's state. There are two IPC styles, and outside Tauri `ipc.ts:11` returns `{}` cast to the expected type.
30. **Coach (`pages/Coach.tsx`, 1,298 lines).**
    - Cited-moment chips call `onOpen()` with no time (`:275`), so they open at 0:00.
    - `coachInitialPrompt` is never cleared (`App.tsx:116, 379`).
    - Unmounting cancels an in-flight answer (`:344-351`).
    - Every message refetches the full replay (`:229-248`).
    - Export scrapes `innerText` (`:446-455`).
    - The composer is a single-line input (`:1259`).
    - The log has `aria-live="off"` (`:1075`).
    - The page height is `calc(100dvh - 56px)`, which ignores the 38px title bar (`styles.css:3089`).
31. **"Ask Coach" from Studio pre-fills prompt-engineering text** ("Do not assume the recorder is me") into the user's input (`ReplayStudio.tsx:127-128`).
32. **Settings.**
    - It mirrors props into state and resets them on every settings change, so an auto-import mid-edit wipes unsaved edits (`Settings.tsx:89-109`, `App.tsx:73-80`).
    - One Save button covers three cards.
    - `--sage-line` is undefined (`Settings.tsx:540`).
    - Dev status leaks into the UI: "disabled pending live verification" (`:624`).
33. **Onboarding.** Esc marks it skipped and discards input (`OnboardingModal.tsx:63-69`, `App.tsx:660-666`). Save errors only go to the console. Step 2 has 15 fields.
34. **Overview.**
    - It hardcodes "2v2 Competitive" and `rank_2v2` (`Overview.tsx:27, 58`).
    - It invents fallbacks, "DFH Stadium" and `?? 4` players (`:198, 200`), directly under "Zero guessed statistics" (`:71`).
    - Its win rate falls back to `players[0]`, counts ties as losses and mixes modes (`:32`), unlike Progress (`Progress.tsx:40-58`).
    - Scores are shown Blue–Orange rather than yours–theirs.
35. **Replays.**
    - The delete dialog uses `modal-overlay`, which has no CSS (`Replays.tsx:98`): it renders inline, with no focus trap, and the destructive action is styled primary.
    - `.sr-only` is undefined, so screen-reader text renders visibly (`:363`).
    - No sorting or virtualization.
36. **Progress.** The goals are hardcoded with `ok:false` (`Progress.tsx:258-280`), missing values default to 0 (`:24-32`), and there's no trend chart.
37. **Studio.**
    - Experimental panels are stacked above "Review next" (`ReplayStudio.tsx:176-185`).
    - The what-if and reference panels get the last seek time, not the live playhead (`:180, 185`).
    - Timeline pins are 5×20px and block scrubbing (`styles.css:1632`).
    - `.marker-strength` has no colour (`:1660`).
38. **Bundle.** `viewerCameras.ts:1` imports `viewerEngine` as a value, which pulls Babylon into the main chunk (about 1.77 MB) and defeats the dynamic import (`viewerScene.ts:92-102`). The rank PNGs total 9.4 MB (about 500 KB each, displayed at 36–64px).
39. **Viewer.**
    - It renders at 15 fps while paused, with glow and shadows (`viewerScene.ts:820`).
    - It raycasts against stadium meshes per car per frame (`:999, 1123`).
    - It remounts on replay identity change (`ReplayViewer.tsx:200-214`).
    - `localStorage` is used without try/catch (`:104, 109`).
    - Shortcuts need canvas focus, and the canvas has `outline:none` (`styles.css:1429`).
40. **CSS.**
    - `styles.css` is 4,042 lines with an override block (`:2097`), so 57 selectors are redefined.
    - About 55 dead classes, 25 font sizes, about 156 inline style objects, and about 88 raw colour literals outside `:root`.
    - Three team palettes (`styles.css` tokens, `:2600/2604`, `viewerRigs.ts:163`); `--blue-team` equals `--cyan`.
    - Native `select`, checkbox, `details` and number controls leak through.
    - Stats use the Consolas monospace font.
    - `GoalTracker.tsx` is unused.
41. **Accessibility.**
    - Focus rings are removed on inputs and the canvas (`styles.css:1177, 1429, 1847, 3167`).
    - `--faint #64748b` is about 3.8:1 at 10–11px.
    - `--accent #6366f1` used as text is about 4:1.
    - There's no `htmlFor` anywhere.
    - Interactive elements are nested (`Overview.tsx:180-221`, `Replays.tsx:334-345`).
    - Reduced motion covers only the Studio.
42. **Copy.**
    - About 33 "unavailable" strings and about 20 hedge strings, e.g. "Legacy equal-match mean; weights unavailable", "No grade, benchmark percentile or promotion estimate is inferred from these values", "Pad glow is decorative; pickup/cooldown state unavailable".
    - The offline coach answers with raw `avg_boost: 50.0 ["time_weighted"; count=1 …]` dumps.

**Tests, CI, hygiene**

43. **No golden real-replay tests.** `EvidenceCollector::process_frame` has zero coverage. The fixtures folder holds only a JWKS file, and the real-replay tests are `#[ignore]`d or assert nothing.
44. **CI runs only on `windows-latest`,** although `replay-core` and `coach-services` are platform-neutral. The native scripts are manual. The adversarial corpus has no runner.
45. **Repo hygiene.** A 281 KB research file sits at the repo root, the status docs contradict each other, the screenshots are stale, and the author's personal path is in source.
46. **CI has never passed.**
    - Every GitHub run so far, including `main` at `6762f8c`, dies at `pnpm install`: the `allowBuilds` placeholder in `app/pnpm-workspace.yaml` was never filled in.
    - Behind that sits the `--all-features` compile failure from the missing `.pem` fixture.
    - The README's claims about CI coverage are therefore untested. Check which other checks would fail once install works.
47. **Build portability.**
    - `tauri.conf.json` references icons that don't exist (only `.ico`/`.png` are in `src-tauri/icons`), so any non-Windows build or bundle fails.
    - `src-tauri/gen/schemas/linux-schema.json` is generated, but it is neither ignored nor committed.
48. **Test reliability.**
    - `coaching.spec.ts` races its own fake stream. CI's `retries: 1` may be hiding it.
    - `frontend-security.spec.ts` exceeds its timeout on software rendering.
    - `scripts/test-replay-studio.mjs` passes, but nothing runs it.

## Appendix B — Palette to keep (from `app/src/styles.css:1-78`)

`--bg #080a0f` · `--sidebar #0c0f17` · `--surface #121722` · `--surface-raised #182030` · `--surface-soft #20293d` · `--text #f8fafc` · `--muted #94a3b8` · `--faint #64748b` (fails AA as small text; fix the usage, keep the hue family) · `--accent #6366f1` · `--accent-hover #818cf8` · `--accent-dark #4f46e5` · `--cyan #38bdf8` · `--emerald #10b981` · `--sage #34d399` · `--amber #f59e0b` · `--rose #f43f5e` · `--blue-team #38bdf8` · `--orange-team #fb923c` · lines `rgba(255,255,255,.08/.16)` · radii 8/12/16/pill. Font: Inter (bundled).

---

## Follow-up prompt (run after the review is in)

> Read `review/ROADMAP.md`, `review/FINDINGS.md`, `review/DESIGN_REVIEW.md` and the mockups. Implement the quick wins, then epics in roadmap order, one PR-sized branch per epic. Start with the P0 findings and the design-token/primitive layer, because the other UI epics build on them.
>
> For each epic:
> - Turn its `review_*` failing tests green, and add tests for the new behaviour.
> - Keep all existing checks green (`cargo fmt`, `clippy -D warnings`, `cargo test --workspace`, `pnpm lint`, `pnpm build`, Playwright).
> - Re-capture `review/screenshots/after/` for every page you touch.
>
> Keep the palette. Never touch real user data or make live provider calls in tests. Update `review/PLANS.md` as you go. Done means every P0/P1 is fixed or explicitly deferred with a reason, and the after-screenshots match the mockups.
