# AntiRL coaching and replay upgrade handoff

Prepared 2026-10-05. Planning and source inspection only; no app implementation or live provider validation was performed for this handoff.

## Start here

1. Read [product plan](01_PRODUCT_PLAN.md) for priorities, player-facing behavior, and open questions.
2. Read [current defects and screenshot review](02_CURRENT_AUDIT.md) before changing metrics or prompts.
3. Give [implementation prompt](SOL_IMPLEMENTATION_PROMPT.md) and this whole folder to the implementation agent selected by the user (6.1 Sol).
4. Paste [Gemini research prompt](GEMINI_DEEP_RESEARCH_PROMPT.md) into the user's chosen Gemini Deep Research session. It is self-contained; supplying this folder adds implementation context. This handoff does not assume availability or capabilities of a particular Gemini model name.
5. Use [data and AI contract](03_DATA_AI_CONTRACT.md) and [acceptance plan](04_ACCEPTANCE_PLAN.md) to evaluate implementation and research results.

## Recommended order

**First:** fix metric meaning, chat scrolling, boost percentage display, and arena surfaces. **Next:** durable lifetime analytics, mode-specific conversations, copy/export, verified training discovery, and a tested AI tool harness. **After research:** benchmark cohorts and experimentally validated player grades. Rank-up forecasts require a separate longitudinal validation gate.

The user asked for questions before implementation. They clarified that rank/goals/time availability should be collected in onboarding. Their self-reported ranks are Plat 1 in 1s and Diamond 2 in 2s/3s, targeting Champ then high Champ. Priority and external-data questions remain pending. All defaults below are proposals. Preserve existing cloud consent; unanswered questions are not permission to upload data.

## Design position

The coach should help a player make one better decision in the next match. Its default answer should contain a supported observation, a replay example when available, one practical adjustment, and a short drill. Keep detailed methods and comparative statistics expandable.

Retain all imported gameplay data locally and make it queryable. Supply the model with recent relevant evidence and lifetime summaries, then let it retrieve more when needed. Do not silently equate a summary with having watched every frame.

## Deliverable boundaries

- This folder is new and does not replace the original `docs/gemini-handoff` build-from-scratch brief.
- The checkout already has extensive tracked and untracked changes. The next agent must preserve them and inspect the current source again.
- Existing progress documents contain earlier PASS claims. Those claims were not rerun here.
- No benchmark corpus, training-pack catalog, player scores, or rank-up predictions have been collected or validated by this planning pass.
