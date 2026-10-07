from pathlib import Path
import json
R=Path(__file__).resolve().parent
files={
'crates/coach-services/src/ai.rs':('reviewed','Full context/provider/stream/grounding/offline code and embedded tests; source-extracted executable probes.'),
'crates/coach-services/src/evidence_tools.rs':('reviewed','Full retrieval tool/scoping/budget code; real public timeline retrieval probe.'),
'crates/coach-services/src/retrieval.rs':('reviewed','Full strict plan validator and dispatcher; SQL/identity/path allowlist and limits.'),
'crates/coach-services/src/conversations.rs':('reviewed','Full scopes/history mutation/migration tests; persistent conversation metadata.'),
'crates/coach-services/src/research.rs':('reviewed','Complete tag/mode retrieval implementation.'),
'crates/coach-services/src/lib.rs':('reviewed','Full AI-facing settings, model/key APIs, identity, memory, conversations and fallback; storage details jointly reviewed by storage agent.'),
'crates/coach-services/Cargo.toml':('reviewed','Provider feature/dependency boundaries and test dependencies.'),
'app/src/data/coach-prompts.json':('reviewed','Every system/common/mode/preset prompt and conflicts.'),
'app/src/data/metrics.json':('reviewed','Authoritative prompt dictionary; unavailable research metric and semantics.'),
'app/src/data/research-cards.json':('reviewed','All three reviewed cards, lineage, limitations and coaching usefulness.'),
'app/src/data/training-packs.json':('reviewed','20 records: source confirmation/untested gameplay labels; retrieval fit and taxonomy.'),
'docs/validation/coaching-corpus.json':('reviewed','All30 declarative expected-limit entries; no executable adversarial inputs/assertions.'),
'docs/archive/reviews/RESEARCH_AUDIT.md':('reviewed','Full deliberate rejection rationale; do not revive unsupported tactical thresholds.'),
'AntiRL Coaching Evidence Research.md':('skimmed','Read00/02/03/08/self-critique in full as hypotheses; formula image review delegated parser agent.'),
'crates/coach-services/tests/review_ai.rs':('reviewed','Added10 review probes; exact copied helper semantics plus real public APIs.'),
'crates/coach-services/tests/fixtures/README.md':('skimmed','Fixture inventory; only public synthetic JWKS tracked; real replay absent.'),
'crates/coach-services/tests/fixtures/synthetic-oidc-jwks.json':('skimmed','Synthetic public JWKS; detailed sign-in security delegated storage agent.')}
(R/'coverage-ai.json').write_text(json.dumps([{'path':p,'status':s,'reason':reason} for p,(s,reason) in files.items()],indent=2),encoding='utf-8')
leads=[
(1,'confirmed','D-001: exact current builder loses match in All after heavy mode summaries; citation mapping is safely truncated, but current evidence disappears.'),
(2,'confirmed','D-004/D-005: negation rejection confirmed; rounding is partial because exact permitted metric values separately supplied1007-1018, so inevitable rounding fallback refuted.'),
(3,'confirmed','D-002/D-003/D-006: prose numbers/policy unenforced, provisional pack leakage and spaced-code bypass reproduced.'),
(4,'confirmed','D-011: keyword pseudo-planner confirmed; prose-scraping subclaim refuted, current retrieval.rs strictly parses JSON with optional fences.1000 reasoning-inclusive output cap risk, not live-starvation proof.'),
(5,'confirmed','D-012: first120 rows at15Hz=7.933s, no continuation; whole oversized result dropped by16KB dispatcher.'),
(6,'confirmed','D-008: raw metadata and notes in system role confirmed; model exploitation untested, likely. Opener scope delegated M storage/security.'),
(7,'confirmed','D-010: GC/SSL/rank-expectations/1-3 priorities conflict with calibration/default-one guidance.'),
(8,'confirmed','D-009 unscoped memory; D-024 All default. xG pooling/playlist mapping assigned experimental/parser agents.'),
(9,'confirmed','D-015-018/D-022-023: protocol/model guesses, defaults conflict, fresh clients, top-level error mishandled, proxy handling unverified. Docs live-verification contradiction confirmed by source-doc comparison, delegated N.'),
(10,'confirmed','D-007/D-020: prompts parsed as count/offline data bus; deterministic count corrupted by profile delimiter.')]
(R/'leads-ai.json').write_text(json.dumps([{'lead':n,'status':s,'evidence':e} for n,s,e in leads],indent=2),encoding='utf-8')
with (R/'AI_REVIEW.md').open('a',encoding='utf-8') as f:
 f.write('''
## Verdict and validation

D: **needs work**, with core grounded coaching **broken for selected-match evidence when All-mode summaries saturate the budget**.27 findings D-001–D-027 cover measured defects, policy gaps and smaller design/architecture debt. P0 D-007 is deterministic and reproduced without cloud inference. P1 D-001/D-002/D-006/D-012 survived alternate valid-input checks; D-003 is a confirmed missing gate, not a claimed live hallucination; D-008 remains likely because model instruction override was not exercised. Truncation mitigations preserve correct citation mappings, exact metric values are separately supplied to analysis, scoped consent prevents unauthorized provider calls, strict tool allowlists prevent model-supplied SQL/paths/identities, stream limits bound output, cancellation covers awaited network operations, and hidden think tags are tested. Those protections are real and were not ignored while adjudicating defects.

## Research spec judgment

Keep operationally neutral metric definitions, explicit identity, distinct measured versus interpreted evidence, mode separation and practice checkpoints. Keep the research audit's rejection of fabricated grade weights, benchmark/promotion models and absolute tactical rules. The spec's no-flip defensive rule, never-cross-midfield cue,36-boost guarantees and exact outcome thresholds are unvalidated and can teach bad play. Reject its claim that an esports cognition study proves all future rank forecasts impossible; current calibration is absent, so abstain now. Reject describing15Hz render rows as high-resolution contact evidence. Broad bans on mentioning unavailable concepts should not suppress a useful coach: it can give a visibly labelled interpretation, a counterexample and a short drill from measured windows, without claiming causation. Default one focus is strong; forcing an uncertainty paragraph into every card is counterproductive. Cap visible caveats and move details into confidence/how-measured UI.

## Provider and cost verification boundary

No requests made to OpenAI or NeoToken. No credential API, keyring value or real profile read. Official OpenAI docs checked for the event contract and reasoning-inclusive max_output_tokens: [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events), [Create a model response](https://developers.openai.com/api/reference/python/resources/responses/methods/create). API live compatibility, account model availability, tariffs and actual proxy retention remain unverified. No token-cost number is invented. The app cannot currently measure cost because usage is discarded; recommended measurement separates input, cached input, visible output, reasoning and retries.

## Suggested architecture swing

One immutable typed CoachingRequest with player/mode/replay/window scope; token-budgeted EvidenceBundle; stable replay/event/window citations; typed numerical claim references; explicit provider adapters; a compact local coach for offline use; and one shared validation/render contract for cloud/local/analysis/chat. Reserve selected moments before historical aggregates. Retrieval returns actual spans, omitted counts and pagination rather than dumping raw timelines. Record request-level usage and failure cause. The visual product should show one focus, a moment that plays, a drill and the next-match cue; the evidence details and confidence live alongside, expandable.
''')
print('AI ledger/leads/report finalized')
