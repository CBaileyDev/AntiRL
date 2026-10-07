# AI coaching hostile review

Review only. No live provider calls, credential reads, or real profiles. All stored data in probes is synthetic and lives in `tempfile` directories. Code read is the source of truth; research sections 00, 02, 03, 08 and self-critique and `docs/archive/reviews/RESEARCH_AUDIT.md` were reviewed as hypotheses.

## Status

Complete: context assembly, providers, stream decoder, grounding validators, pack retrieval, evidence dispatch, conversation persistence, prompts/catalog/research and the adversarial corpus reviewed. D-001–D-027 are appended to shared findings. coverage-ai.json and leads-ai.json record final source coverage and known-lead adjudication. Eleven executable probes passed, including an actual offline CoachService call with a synthetic profile. The generator extracts exact private helper code; public APIs supply analytics and frame retrieval. Source SHA/method: review/ai-probes-source.json. Independent high-severity validation is consolidated by the storage/security agent. No remaining D-area source work is pending.

## Final measured evidence

`cargo test -p coach-services --test review_ai --locked -- --nocapture`: exit 0; 11 passed, 0 failed, 0 ignored; 4.656 s wall clock, 0.37 s test execution. See `review/logs/ai-final-validation.txt`.

With 60 synthetic matches (20 per mode, 24 metrics), each single-mode library consumes 24,564 characters. Final context sizes: 1v1 = 32,776; 2v2 = 33,759; 3v3 = 32,776. All-mode library consumes 72,361 characters, trimmed to 47,801, with no selected-match header or evidence IDs. The selected fixture is 2v2, so other isolated modes correctly have no selected event. Single-mode isolation works, but defaults choose All. Earlier 10-probe / 47,673-character evidence remains in the initial command log; the added real-service fixture slightly changed serialized metadata, not the conclusion.

A requested 30-second timeline at 15 Hz returns only the first 120 frames (0–7.933 s), 11,367 JSON bytes, with no continuation field. Larger frame rows exceed the second 16 KB dispatcher cap and then the entire result is dropped.

Confirmed executable defects: honest negations rejected by blocklist; invented prose numbers, arbitrary grades and rank timelines accepted by structured analysis; spaced pack codes bypass filtering; unverified codes visible in streamed deltas; Responses `type:error` event ignored until generic incomplete-stream error; profile player-name delimiter can make the deterministic library-count answer report 999 games instead of 1; unknown team labelled Blue; tied final score labelled LOST.

Rounding lead is partial: exact claims supplied separately at `ai.rs:1007–1018` pass validation. A rounded claim fails, but the prompt gives exact permitted values, so rounding alone is not proof of inevitable fallback.

## Verdict and validation

D: **needs work**, with core grounded coaching **broken for selected-match evidence when All-mode summaries saturate the budget**. 27 findings D-001–D-027 cover measured defects, policy gaps and smaller design/architecture debt. P0 D-007 is deterministic and reproduced without cloud inference. P1 D-001/D-002/D-006/D-012 survived alternate valid-input checks; D-003 is a confirmed missing gate, not a claimed live hallucination; D-008 remains likely because model instruction override was not exercised. Truncation mitigations preserve correct citation mappings, exact metric values are separately supplied to analysis, scoped consent prevents unauthorized provider calls, strict tool allowlists prevent model-supplied SQL/paths/identities, stream limits bound output, cancellation covers awaited network operations, and hidden think tags are tested. Those protections are real and were not ignored while adjudicating defects.

## Research spec judgment

Keep operationally neutral metric definitions, explicit identity, distinct measured versus interpreted evidence, mode separation and practice checkpoints. Keep the research audit's rejection of fabricated grade weights, benchmark/promotion models and absolute tactical rules. The spec's no-flip defensive rule, never-cross-midfield cue,36-boost guarantees and exact outcome thresholds are unvalidated and can teach bad play. Reject its claim that an esports cognition study proves all future rank forecasts impossible; current calibration is absent, so abstain now. Reject describing15Hz render rows as high-resolution contact evidence. Broad bans on mentioning unavailable concepts should not suppress a useful coach: it can give a visibly labelled interpretation, a counterexample and a short drill from measured windows, without claiming causation. Default one focus is strong; forcing an uncertainty paragraph into every card is counterproductive. Cap visible caveats and move details into confidence/how-measured UI.

## Provider and cost verification boundary

No requests made to OpenAI or NeoToken. No credential API, keyring value or real profile read. Official OpenAI docs checked for the event contract and reasoning-inclusive max_output_tokens: [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events), [Create a model response](https://developers.openai.com/api/reference/python/resources/responses/methods/create). API live compatibility, account model availability, tariffs and actual proxy retention remain unverified. No token-cost number is invented. The app cannot currently measure cost because usage is discarded; recommended measurement separates input, cached input, visible output, reasoning and retries.

## Suggested architecture swing

One immutable typed CoachingRequest with player/mode/replay/window scope; token-budgeted EvidenceBundle; stable replay/event/window citations; typed numerical claim references; explicit provider adapters; a compact local coach for offline use; and one shared validation/render contract for cloud/local/analysis/chat. Reserve selected moments before historical aggregates. Retrieval returns actual spans, omitted counts and pagination rather than dumping raw timelines. Record request-level usage and failure cause. The visual product should show one focus, a moment that plays, a drill and the next-match cue; the evidence details and confidence live alongside, expandable.
