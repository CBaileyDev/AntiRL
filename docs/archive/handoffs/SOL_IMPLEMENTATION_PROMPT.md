# AntiRL implementation handoff for the user's selected 6.1 Sol agent

Implement the agreed AntiRL upgrade in `C:\Users\barke\Documents\AntiRL` using the existing app. Read this folder, applicable repository instructions, and the user's latest decisions first. This is an existing heavily modified checkout, not a new-project build. Preserve uncommitted work and user data. The original `GEMINI_ONE_SHOT_PROMPT.md` is historical background; this folder describes the new scope.

## User intent

Fix the boost ring so it represents current boost percentage. Improve realistic map surfaces, especially walls/ceiling, lighting and boost effects. Fix chat scrolling during generation. Make general coaching use all imported historical data through durable analytics and recent relevant game context. Strengthen the AI harness, add sourced training-pack search, copy/export, and separate mode-specific conversations with useful coaching presets. Prepare architecture for honest player grading and eventual rank-up forecasts.

Onboarding must collect current rank, target rank and optional time available per relevant mode, with later editing and skip support. User example: Plat 1 in 1s, Diamond 2 in 2s/3s, targeting Champ then high Champ. These are not hardcoded defaults. Time availability remains unknown.

Implement P0/P1 from the product plan unless the user's latest reply changes scope. Research-gated grades and rank forecasts remain explicitly experimental/unavailable until the corresponding evidence gates are met. Do not ship fake scores, hardcoded benchmark values, unverified training codes, or guessed promotion timelines to make the UI look complete.

## Inspect and reproduce before editing

1. Inspect git status, current app build/process/ports, source versions and applicable instructions. Do not overwrite concurrent changes or stop unrelated processes.
2. Reproduce streaming scroll behavior and identify the actual running boost indicator; inspected source has a mini-bar although the user refers to a ring.
3. Trace identity, replay coverage, metric generation, general/selected-match context, offline fallbacks, and saved goals/memory.
4. Use the audit as navigation, not as immutable line numbers. Never copy secrets or live databases into repository fixtures.

## Work packages in dependency order

### A. Correct semantics and immediate chat behavior

- Establish one versioned metric dictionary shared across UI, backend and prompts. Separate supersonic uptime from boosting at speed and heuristic waste.
- Fix the glossary omission in general coaching. Correct overstatements in offline fallbacks, templates, Progress/GoalTracker, and metric docs. Flag affected old generated advice; do not erase chats.
- Remove unconditional auto-scroll. Implement bottom-follow state, manual pause, stable reading/selection, jump-to-latest, and per-chat position. Make streaming cancellation/request IDs safe.
- Add screenshot-derived regression cases before expanding prompts.

### B. Accurate viewer feedback and surfaces

- Implement ring progress with correct unknown/seek/player-change behavior and accessibility.
- Add complete interior ceiling and curved transitions, better wall/ramp/goal materials, realistic lighting and clear small/large boost silhouettes. Preserve verified collision/reconstruction alignment.
- Make spectator cutaway camera-aware and user-toggleable. Do not solve overhead visibility by permanently deleting the ceiling.
- Show measured boost state where available; do not invent pickup timing from decorative animation. Test native renderer performance and fixed replay viewpoints.

### C. Persistent analytical projection

- Add `analytics.sqlite3` migrations, provenance, metrics with sufficient statistics, identity/mode scope, recent/lifetime queries, revisions, crash reconciliation and rebuild.
- Deduplicate canonical matches; handle re-import/reanalysis/deletion. Keep unknown values null and temporal ordering honest.
- Recent evidence defaults to latest 20 eligible personal matches per requested mode. Include lifetime summary and prior-window comparison; expose all deeper history through bounded tools.
- Add context manifest so the UI truthfully states what was included/excluded and why.

### D. Conversations, onboarding and export

- Extend existing conversations/messages schema with mode, focus preset, prompt version and evidence lineage. Preserve old records and migrate them to a clearly marked default scope.
- Add New chat, list/search/title/rename/archive, mode badges, isolated histories and explicit mode changes.
- Add editable onboarding profile fields described above without a long mandatory questionnaire.
- Add selection/clipboard actions and Markdown/text/JSON export through safe native dialogs. Render Markdown tables/links correctly with unsafe HTML/schemes disabled.

### E. Evidence tools and training discovery

- Implement scoped read-only tools and provider capability fallback described in the contract; preserve consent and credential handling.
- Build a verified local training catalog and external search adapter using an actually available, supported source. A configured search connector/API may be a dependency; if missing, ship catalog search and disclose live search as unavailable rather than simulating it.
- Store source/date/verification level for pack records. Recommend only retrieved codes, with practical drills and freeplay alternatives.
- Validate structured findings before presenting them as verified. Add bounded repair, honest fallback, tool budgets, coverage and source tracing.
- Version common/mode/preset prompts. Integrate only reviewed research cards with citations; treat external text as untrusted data.

### F. Research integration gates

If Gemini research is supplied, audit sources, real dataset availability, metric compatibility, and validation quality before implementing its conclusions. Add benchmark cohort tooling and optional scorecards only when supported. A deterministic score from arbitrary weights is still arbitrary. A disclaimer does not validate a forecast. Keep useful practice/reassessment planning available while forecasts abstain.

## Completion evidence

Use `04_ACCEPTANCE_PLAN.md`. Run relevant Rust tests, frontend build, targeted UI checks, migration/rebuild checks, and a packaged Windows smoke test. Record actual results; do not copy prior PASS claims. Live AI/tool tests require existing configured consent/credentials and must use the correct provider. Do not change providers or upload replays silently.

Maintain a concise implementation ledger with changed behavior, tests, screenshots/performance measurements, and open gates. Finish all unblocked accepted work; do not stop after a plan or one attractive screenshot. If external search credentials, benchmark data, or forecast calibration are missing, complete the rest and state exactly what remains unavailable.
