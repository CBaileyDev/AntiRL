# Feasibility and primary-source research

Sources checked October 5, 2026. Recheck transport and eligibility details at implementation time. Repository documentation establishes intended capabilities; it does not replace local compatibility tests.

## Replay decoding and reconstruction

[Boxcars](https://github.com/nickbabcock/boxcars) is a Rust decoder with serde output, network decoding, CRC options, and fuzzing. Its default can return header information despite network errors, so require full network parsing for gameplay analysis and report metadata-only imports distinctly. Header success alone does not prove telemetry success. The upstream manifest inspected here is 0.12.0, MIT, Rust 1.88.

[rrrocket](https://github.com/nickbabcock/rrrocket) provides a CLI over boxcars. GitHub's release API returned v0.11.6, published September 28, 2026, with a Windows MSVC archive. That official release was downloaded and used after the older local high-level artifact exceeded the research budget. Fresh CRC/full-network checks passed 29/29 files; two current 2v2/3v3 outputs contained real rigid-body frame updates. See the audit and `evidence/rrrocket-probe.json` for scope and limitations.

[subtr-actor](https://github.com/rlrml/subtr-actor) reconstructs actor state above boxcars and offers structured frame/event collectors. Its current manifest is 1.4.0, MIT, Rust 1.88. Report raw boost units correctly: its bindings expose 0–255 rather than percent. Treat each event according to its actual extraction/derivation method; library output is not automatically ground truth. Validate current replays, actor lifetimes, identities, and discontinuities before depending on derived detectors.

[The reusable Three.js player](https://github.com/rlrml/subtr-actor/blob/master/js/player/README.md) offers normalization, worker loading, camera/playback APIs, plugins, and timeline markers. It is a credible alternative to custom rendering. The local RLTRAIN and ZensCoach viewers offer implementation references. Compare reconstruction/seek fidelity and GPU behavior before replacing an existing viewer.

[Rattletrap](https://github.com/tfausak/rattletrap) and [Carball](https://github.com/SaltieRL/carball) are alternative ecosystems. Do not select them on reputation or assume present game-version compatibility without fixtures. A Rust pipeline fits the current local implementation and reduces an extra production Python runtime.

Unavailable by assumption: verified MMR, intent, communication, awareness, exact tactical responsibility, calibrated skill estimates, and replay-recorder semantics. Preserve explicit unknowns. [Ballchasing's API](https://ballchasing.com/doc/_api) documents tokens, rate limits, player identifiers, and upload visibility; it is not a default permission to upload private replays or a verified MMR integration. No external MMR source was authenticated in this task.

## Rendering and packaging

[Tauri security](https://v2.tauri.app/security/) and [capabilities](https://v2.tauri.app/security/capabilities/) support restricted native operations, but domain commands still need their own input/path validation. [Windows distribution guidance](https://v2.tauri.app/distribute/windows-installer/) must inform worker bundling and WebView/runtime handling. Building the web frontend alone is insufficient.

[Babylon's WebGPU guidance](https://doc.babylonjs.com/setup/support/webGPU) and [Three.js documentation](https://threejs.org/docs/) establish credible graphics options. Preserve Babylon where it already works. For a new app, Babylon with WebGL2 baseline and optional measured WebGPU is a reasonable default; Three.js plus the reusable subtr player is an alternative if a real replay spike demonstrates lower risk. Do not require high-end game-engine assets or copy proprietary Rocket League assets. Original procedural arena/car silhouettes can be polished and readable.

Proposed stack comparison:

| Stack | Best fit | Tradeoff |
|---|---|---|
| Tauri 2 + Rust + React + web renderer | Local Rust parsing, rich evidence UI, modest packaged shell | IPC/security and system WebView/GPU require Windows QA |
| WPF/WinUI + Rust worker + viewer integration | Windows-native controls and accessibility | Additional graphics/interop ownership; larger migration from existing React |
| Electron + Rust worker | Predictable bundled Chromium | Higher download/memory/update footprint |

Preserve working code in an existing app. A framework change requires concrete parity and measurement benefits.

## AI provider parity

Local source establishes NeoToken V2's `GET /models` and `POST /chat/completions` flow. [NeoToken documentation](https://v2.neokens.com/docs) is the public source to recheck supported formats, streaming, usage, and model capabilities. No live account/model/price or streaming test was performed here. Do not silently route this adapter through Responses because another client uses that transport. Require independent capability flags and tests per provider/authentication route.

New keys belong in the Windows credential vault. Reuse the reference integration design, not its secret values. On a new installation, require the user to connect their own provider. Optional explicit connection to an existing credential source must not print/copy it into a prompt, repository, frontend, or Markdown.

## Official ChatGPT plan usage

[Overview](https://developers.openai.com/siwc/token-sharing-open-source): official documentation provides a plan-usage route for open-source and locally hosted apps; paid or remotely hosted distribution has a separate interest route. Identity login and inference permission are distinct. Do not label the feature inherently impossible, universally available, or already live-tested.

[Registration/sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in): initial dynamic registration uses `dynamic_agent_client`; persist the issued account/workspace-bound client ID, a stable opaque host ID, and use the documented loopback callback. Generate fresh state, nonce, and PKCE; validate the ID token and granted inference scopes. No secret extraction or browser-session scraping. An account's actual authorization remains a live gate.

[Models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference): use the authenticated account catalog, visible entries from `models[]`, `slug`/`display_name`, and public `POST /v1/responses`. Requests require `store:false`, `stream:true`, and an input array. Consume stream terminal status; text arrival alone is not successful completion.

[Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): this adapter has different accepted fields from an ordinary API-key Responses request. Use instructions/developer context, send needed history locally, and omit unsupported fields. Audio/video, transcription, and Files upload are unavailable on this route. Encode these differences in its adapter rather than a shared generic payload.

[UI guidance](https://developers.openai.com/siwc/ui-ux-guidelines): show first-use confirmation, current plan use, and Manage usage. Handle limits visibly. Switching to a paid API route is an explicit user action, never an invisible fallback. Current account eligibility, successful sign-in, model access, renewal, and inference remain NOT RUN in this task.

## trophi.ai competitor findings

The [Rocket League product page](https://www.trophi.ai/rocket-league-coaching) advertises session analysis, prioritized moments, interactive timelines, coaching plans, drills, and automatic replay detection. These indicate a strong session-to-practice workflow. They are marketing claims, not independently tested accuracy, product access, or install behavior. Its public connect/login flow does not establish that every feature requires a particular linked platform account.

The [April 28 EAC update](https://www.trophi.ai/post/easy-anti-cheat-is-coming-to-rocket-league-in-april-2026-what-ranked-players-need-to-know) says overlay features were removed while replay analysis/coaching/performance tracking continued, and describes Live Game Insights. Older pages still advertise overlay training, so availability claims need qualification. Do not claim EAC made all of trophi.ai unusable.

[Rocket League's official announcement](https://www.rocketleague.com/news/easy-anti-cheat-comes-to-rocket-league-on-pc-today?lang=en) states EAC is required for PC online play and restricts mods when enabled. Standalone saved-file analysis avoids a dependency on live injection, but this is an architecture inference, not blanket certification of an app.

Differentiation hypotheses: local/offline import and deterministic metrics; transparent evidence and uncertainty; fair teammate review; durable editable Markdown goals; provider choice; coherent multi-mode progress; and a pleasant replay studio. They are opportunities, not verified competitor omissions. No paid competitor account or feature was exercised.

## Gemini prompting implications

[Google's prompt-design guidance](https://ai.google.dev/gemini-api/docs/prompting-strategies) supports explicit instructions, supplied context, consistent output contracts, and examples. This handoff supplies a prioritized task, defaults, evidence model, execution order, and completion ledger. It avoids requiring the model to rediscover the entire product brief or stop for routine planning approval.

[Google's model documentation](https://ai.google.dev/gemini-api/docs/generate-content/latest-model) was checked for the requested Gemini 3.8 Flash target. The handoff is written for a coding-agent environment. A model name does not provide local tools, credentials, browser access, infinite context, or a guarantee of a complete product in one run.

## Remaining feasibility gates

1. Decode real current files with the exact shipped parser; retain failures and coverage. Spot-check native game replay moments.
2. Render the same decoded segment; validate orientation, clock, seek/discontinuities, and frame timing.
3. Test the selected provider/account catalog and streaming transport when authorized.
4. Exercise official OAuth consent/renewal/sign-out with a real eligible account.
5. Review detector false positives with labelled moments; defer unsupported precision.
6. Test the Windows package outside the development folder with worker/runtime resources included.
