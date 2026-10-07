from pathlib import Path
import json
from auditlib import finding
ROOT=Path(__file__).resolve().parent.parent
def add(n,severity,title,path,line,problem,repro,expected,evidence,recommendation,effort='M',confidence='confirmed',lead='new',validation=None):
    lines=(ROOT/path).read_text(encoding='utf-8').splitlines()
    finding(id=f'D-{n:03}',severity=severity,category='D. AI coach',title=title,
      location={'file':path,'line':line,'quote':'\n'.join(lines[line-1:line+2])},
      problem=problem,trigger_or_repro=repro,expected_vs_actual=expected,evidence=evidence,
      recommendation=recommendation,effort=effort,confidence=confidence,lead=lead,
      validation=validation or 'Source branches and their defensive checks reviewed; scope/limitations stated in problem.')
ai='crates/coach-services/src/ai.rs';ev='crates/coach-services/src/evidence_tools.rs';retr='crates/coach-services/src/retrieval.rs';lib='crates/coach-services/src/lib.rs'
probe='review/logs/ai-probes-test.txt; crates/coach-services/tests/review_ai.rs'
add(1,'P1','All-mode context truncation discards the selected match before inference',ai,539,
 'Metric dictionary, all-mode recent match metrics, and memory precede the selected match. Tail truncation protects citation mapping but removes the match itself; has_replay remains true.',
 'review_library_context_measurement_and_truncation: 60 synthetic games (20/mode), 24 metrics. Library 72,361 chars; final context 47,673; selected match header and all event IDs gone.',
 'Selected match and focus moments should have reserved space. Actual prompt says a match is loaded but contains no match, so structured analysis cannot cite it.',probe,
 'Budget typed sections by tokens: reserve current match first, summarize baseline compactly, retrieve older detail on demand; default conversation to the selected/main mode.',lead='confirmed',validation='Single-mode alternate retains match (2v2 total 33,631 chars). All drops match; exact metric side-channel does not restore event IDs. Boundary failure reproduced without provider.')
add(2,'P1','Structured analysis accepts invented prose numbers, grades, and rank forecasts',ai,1366,
 'metric_claims=[] is valid, while arbitrary observation/title/training prose is not compared with measured data. Five substring bans do not enforce the prompt contract.',
 'review_analysis_accepts_invented_prose_numbers_grades_and_forecasts accepts average boost99.9, grade87/100, Champion in4weeks using one existing citation and no claims.',
 'Personal numerical observations must derive from metric references and prohibited forecasts/grades must fail validation. Actual validator accepts the candidate.',probe,
 'Return a typed coaching graph whose numerical text is rendered from validated metric/event references; adversarially evaluate prose separately. Make policy enforcement explicit.',effort='L',lead='confirmed',validation='Existing evidence ID and all required text fields are valid; changing numeric claims to incorrect values rejects them, but empty claims bypasses the numerical check. No real provider output claimed.')
add(3,'P1','Chat has no numerical or policy grounding gate and keeps nonexistent citations',ai,952,
 'Chat only filters pack codes and extracts known E IDs. It does not reject fabricated metrics, unknown E references, arbitrary grades, forecasts, or unsupported tactical claims; invalid citations remain visible in response text.',
 'Trace normal success and partial failure routes through filter_pack_codes/cited_ids. cited_ids("avg boost999 [E999]", one ID) returns no evidence but caller persists text.',
 'Unsupported personalized claims should be withheld or repaired before completion. Actual text survives with empty evidence metadata.',
 'ai.rs:952-983 and1598-1611; review_analysis_accepts_invented_prose_numbers_grades_and_forecasts demonstrates analogous structured gate weakness.',
 'Use the same validated claim contract for chat and analysis; show general coaching separately from personalized observations; unknown references are validation failures.',effort='L',lead='confirmed',validation='System prompts explicitly forbid these outputs, but inspected both complete and partial branches: no enforcement function exists. Probability of provider violation unmeasured; code weakness confirmed.')
add(4,'P2','Phrase blocklist rejects correct negations and educational explanations',ai,1413,
 'The validator scans serialized findings for banned substrings, including uncertainty. A correct explanation such as does not measure supersonic uptime is rejected.',
 'review_analysis_rejects_honest_negation submits a fully valid finding with an honest negation; parse_findings returns None.',
 'Correct semantic distinctions should pass. Actual validator triggers the repair/fallback for the words themselves.',probe,
 'Remove phrase bans as correctness gates; enforce typed claim categories and test negations, quoted user errors, and corrective explanations.',effort='S',lead='confirmed')
add(5,'P2','Rounded metric presentation and exact claim schema disagree',ai,433,
 'Player table rounds values to one decimal while validation demands1e-9. Analysis also supplies an exact metric side-channel, which mitigates but does not remove contradictory instructions to copy values from the context.',
 'review_exact_claim_passes_but_context_rounded_claim_fails: exact31.4444444444 passes; displayed31.4 fails.',
 'Use a metric ID with explicit display precision and canonical value; actual two representations require model precision discipline.',probe,
 'Have the model reference metric IDs; let the app render rounded numbers. Keep exact source values out of prose copy requirements.',effort='S',lead='confirmed',validation='Prior lead overstated inevitable rejection: ai.rs1007-1018 sends exact permitted metrics separately. Marking this P2 rather than P1 reflects the mitigation.')
add(6,'P1','Unverified training codes appear while streaming and variants bypass final filter',ai,910,
 'Callback forwards deltas before final pack filtering. Filtering only catches single19-character hyphenated alphanumeric tokens; spaced groups and adjacent prefix/suffix bypass it.',
 'review_stream_displays_unverified_codes_before_final_filter and review_spaced_pack_codes_and_extended_tokens_pass_filter.',
 'Only retrieved codes should ever display as recommendations. Actual provisional text exposes a code that final completion removes; variants persist.',probe,
 'Render training recommendations by catalog ID outside free text; prevent raw code emission in provisional content or buffer recognized code prefixes until validated.',lead='confirmed',validation='Canonical final code is correctly withheld; spaced/extended alternatives were then tested and pass unchanged. Streaming probe reproduces pre-filter visibility.')
add(7,'P0','Prompt-text parsing can report a false deterministic library count',ai,1480,
 'local_library_answer parses the first Library: substring anywhere in rendered context. User profile precedes real library, and player_name is unescaped text.',
 'review_prompt_delimiter_player_name_corrupts_local_count uses player_name=Library:999 analyzed replays. and library_count1. Local answer reports999.',
 'A deterministic count must read the structured manifest. Actual app gives a wrong number without any AI provider.',probe,
 'Pass typed library_count and library evidence into offline/local responders. Never parse rendered prompts as application state.',effort='S',lead='new',validation='A normal profile reports1; replacing only player_name causes999. No model/network/credential access involved. Explicit profile field accepted by save_settings schema.')
add(8,'P1','Untrusted replay/profile/memory content is interpolated into a system message',ai,902,
 'Player names, map names, coverage/event descriptions, profile strings and notes are embedded in the same system-role message as policies. Prose reminders that data is untrusted do not establish a role boundary or escape delimiters.',
 'Replay player name containing system-like instructions is appended raw at403; memory raw at550; entire ctx becomes system content904. Deterministic delimiter collision independently reproduced in D-007.',
 'Untrusted data should remain structured lower-priority content, bounded and escaped. Actual source gives it a system-role channel.',
 'ai.rs303-347,401-415,548-552,902-905; review_prompt_delimiter_player_name_corrupts_local_count',
 'Separate policy from JSON evidence in user/tool messages; use typed delimiters and reject control tokens; add injection corpus with malicious names/maps/notes.',effort='L',confidence='likely',lead='confirmed',validation='Structural boundary confirmed; a successful model instruction override or data exfiltration was not tested because providers are stubbed. Therefore P1 likely, not asserted privacy breach.')
add(9,'P2','Saved coaching memory is unscoped and oldest alphabetical notes win',ai,176,
 'All notes enter every mode and player identity. Notes are alphabetical, and sixKB budget admits early filenames first; old advice can crowd out recent notes and import mode-specific tactics into another mode.',
 'get_memory sorts by filename lib.rs506; memory_section176-193 consumes first names without mode/player/version filters.',
 'Memory should be scoped by stable player/mode with recency/relevance. Actual1v1 and3v3 get the same notes, despite mode isolation claims.',
 'ai.rs176-193,548-552; lib.rs482-507',
 'Store typed authored notes with player/mode/applicability/time/version and retrieve by relevance. Add visible scope and archive controls.',lead='confirmed')
add(10,'P2','Coach persona contradicts calibration and priority policies','app/src/data/coach-prompts.json',44,
 'System chat describes GC/SSL expertise and comparing to rank expectations, then leads1–3 issues. Common/harness prohibit uncalibrated rank judgment and prefer one default focus. Users get conflicting tone and unmeasured rank comparisons.',
 'Read complete combined chat+harness prompt; no comparable rank cohort is available.',
 'One consistent policy should distinguish general expertise from measured benchmarks; actual prompt invites benchmark-like conclusions without data.',
 'coach-prompts.json system.chat, common.guidance, system.harness; docs/archive/reviews/RESEARCH_AUDIT.md rejected unsupported benchmarking.',
 'Write one coach contract with a single actionable focus, strengths and counterexample. Rank is self-reported difficulty context, never an implied measured benchmark.',effort='S',lead='confirmed')
add(11,'P2','Keyword pseudo-planner adds cost for both/bottom and misses normal questions',ai,783,
 'Substring tool gating matches bot in both/bottom, goal in user goals, every in everyday, but cannot discover useful evidence for unlisted phrasing. Native tools/structured outputs are unused.',
 'message both recoveries -> needs_tools=true from bot. A narrow question why am I late? -> no planner even when event retrieval is useful.',
 'Retrieval should use explicit intent/current evidence, not accidental substrings. Actual adds an extra request20s budget and1000 tokens.',
 'ai.rs783-884; retrieval.rs6-110 validates full JSON (not prose scraping).',
 'Use capability-declared structured tools or a deterministic intent layer; one bounded retrieval loop with explicit evidence gaps; record why each call was selected.',effort='L',lead='confirmed')
add(12,'P1','Timeline tool silently returns eight seconds from a30-second request',ev,155,
 'All frame rows are capped120; at15Hz only about8s of the requested window survives. No last_time, actual coverage or next_cursor is returned; larger multi-car rows are dropped entirely by dispatcher16KB budget.',
 'review_real_timeline_window_is_first_eight_seconds_without_continuation returns120 of450 frames, last7.933s,11,367B. Normal multi-car telemetry increases size.',
 'A bounded window should cover its whole span or return explicit continuation/actual span. Actual nominal start/end request implies more coverage than supplied.',probe,
 'Return compact time-stratified event features or paginate frame windows with actual span/count/omissions; truncate fields before discarding a result.',lead='confirmed',validation='Probe uses real CoachService public APIs and full450-frame fixture. Short8s window needs120 rows and fits; request30s provably loses tail.16KB drop source-verified, not full4-car benchmarked here.')
add(13,'P2','Evidence events omit team-level causes and analysis ignores selected review focus',ev,146,
 'get_evidence_events filters only player_id==configured player, removing team-level defensive exposure and unknown-scorer goals. Context keeps first chronological non-goal/demo events, not the moment the user selected.',
 'Request a defensive team event with player_id:null/team:0 or a late challenge after100 early events.',
 'Review should retain relevant team context and selected focus moment. Actual tools suppress team events and temporal cap favors early mistakes.',
 'evidence_tools.rs141-153; ai.rs347-379,491-519',
 'Represent explicit player/team scope and relevance ranking; reserve selected timestamp neighborhood and retain counterexamples. Expose event pagination.',lead='new')
add(14,'P2','Tool scope can differ from the player chosen in the current chat',ev,57,
 'build_context and analytics_context honor explicit player_id, but execute_evidence_plan calls evidence_tool, which always reads settings.player_id. Selected-player context and tool metrics can describe different people.',
 'Chat with explicit player B while configured identity A; get_match_metrics tool retrieves A. Both participate in same replay so scope check passes.',
 'All evidence must use one immutable request scope. Actual tool results can change the subject mid-answer.',
 'ai.rs753-756,884; evidence_tools.rs57-64,141-145',
 'Construct immutable RequestScope(player_id,mode,replay_id,time) once and pass it to every tool; never re-read mutable settings inside dispatch.',confidence='likely',lead='new',validation='Source paths confirmed; real cloud pipeline not run. Existing scope gates prevent arbitrary IDs but do not enforce consistency with explicit caller identity.')
add(15,'P2','Responses error event loses its specific provider cause',ai,1117,
 'Decoder handles an error member, response.failed and response.incomplete, but official Responses error event uses type:error with top-level code/message/param. It is ignored and later appears as generic incomplete stream.',
 'review_provider_error_event_is_silently_ignored injects documented top-level event; push returns Ok; finish says ended before completing.',
 'Retain provider code and message for correct retry guidance. Actual hides cause and may keep stale partial text.',
 probe+'; https://developers.openai.com/api/reference/resources/responses/streaming-events',
 'Deserialize tagged provider events; classify retryable errors, preserve request ID/code, and test completed/failed/incomplete/error/refusal cases.',effort='S',lead='confirmed')
add(16,'P2','Provider capability and protocol selection are string heuristics',ai,615,
 'Exact base URL decides Responses versus Chat Completions. Model prefix decides token parameter/temperature, plus glm-5.3 special case. Provider model catalogs do not supply verified capability data.',
 'A newly listed non-text model passes name blacklist; renamed reasoning model does not match prefixes; trailing slash would change protocol.',
 'Provider adapter should specify wire API/capabilities per supported model. Actual identifier guesses dictate request validity.',
 'ai.rs615-626,1273-1308; lib.rs127-147,348-367',
 'Explicit adapters and tested model allowlists/capability metadata; handle catalog availability separately from chat support. Add fake HTTP wire tests.',lead='confirmed')
add(17,'P2','Provider-independent defaults contradict OpenAI catalog default',lib,71,
 'Saved/global defaults use gpt-6-astra for every provider while get_ai_status OpenAI declares gpt-4o. Switching providers retains shared chat/analysis model strings, potentially unsupported for that account.',
 'New profile defaults71-72; status catalog311; provider changes only consent, no capability negotiation.',
 'Each provider/account should choose a supported verified default. Actual default metadata and selected model disagree.',
 'lib.rs71-72,245,290-315; ai.rs771-774,1002-1005',
 'Store provider-scoped model selections, validate against tested capability catalog, and use affordable coaching defaults with explicit escalation.',effort='S',lead='confirmed')
add(18,'P2','Cost preview cannot measure the cost of an answer and usage is discarded',ai,136,
 'Preview uses chars/4 and a40K-character retrieval allowance with no tariff, tokenization, planned extra request or reasoning budget accounting. Stream completed usage is discarded and no answer usage/cost is persisted.',
 'Planner1000 tokens plus chat2500; analysis can retry another3000. Inspect response.completed branch1124-1126: only done=true.',
 'A coaching product must measure input/output/reasoning tokens and provider cost per successful answer. Actual displays Price unavailable and has no unit economics.',
 'ai.rs83-150,822,925,1045,1124-1126; https://developers.openai.com/api/reference/python/resources/responses/methods/create',
 'Record provider usage/cached/reasoning tokens per attempt and answer, price against timestamped tariffs, budget by model tokens, track fallback and retry costs. Use small structured models for planning.',effort='L',lead='new')
add(19,'P2','Analysis repair pays for a retry without showing the failed candidate or diagnosis',ai,1037,
 'Repair repeats original prompt and a generic failed-validation message; the candidate and validation reason are never supplied. parse_findings returns only Option, collapsing every error into one path.',
 'Valid negation or rounding rejection triggers same costly3000-token retry as malformed JSON; it cannot know what to repair.',
 'Validation should produce typed diagnostics and a targeted repair, or render safe partial findings. Actual random reattempt then generic fallback.',
 'ai.rs1034-1054,1340-1460',
 'Use Result with JSON path/error class; structured outputs; pass bounded rejected candidate and diagnostics only when a repair can resolve them.',effort='S',lead='new')
add(20,'P2','Offline coach ignores the question and attached match and dumps raw aggregates',ai,1577,
 'offline_chat receives only context, never user message; extracts library section while discarding match. Every tactical/drill request produces the same raw5000-char metric ledger and generic recovery drill.',
 'Offline ask review this kickoff versus make a shooting plan: same function/output source. library empty but match attached still not discussed.',
 'Offline should provide a useful focused deterministic review and a drill, with honest capability labels. Actual reads like an audit log and wastes core coach space.',
 'ai.rs776-780,1577-1595; lib.rs618-625',
 'Build typed offline coaching policies for measured events, curated drill templates, strengths/counterexamples and one next-match cue; confidence UI carries limitations.',effort='L',lead='confirmed')
add(21,'P2','Mandatory uncertainty paragraphs and generic templates institutionalize over-hedging',ai,1384,
 'Each finding requires six non-empty prose fields including uncertainty. Offline template repeats not proof/missing/scalar/not forecast caveats for every answer instead of confidence metadata.',
 'Any measured goal finding without uncertainty text is rejected. Review templated_analysis output622-625.',
 'Confidence, sample size and measurement help should carry caveats; actionable findings should earn visible text. Actual schema enforces a disclaimer paragraph per finding.',
 'ai.rs1384-1395; lib.rs618-625; coach-prompts.json system.analysis',
 'Use Measured/Estimated/Experimental confidence and an expandable How measured popover; optional limitations by evidence class, one visible cue+drill per focus.',effort='M',lead='new')
add(22,'P2','One global120-second request timeout and fresh client reduce responsiveness',ai,611,
 'A new HTTP client is created per planner/chat/repair call, discarding connection pooling. Connect/header timeout lacks tighter phase limits and no bounded transient retry/backoff exists.',
 'Every chat with retrieval initializes two clients; analysis repair creates another. Model listing has separate tighter8s connect/12s timeout.',
 'Reuse client pools and phase-aware timeouts; actual repeated setup/slow failures increase latency and provider overhead.',
 'ai.rs611-614,639-691; lib.rs326-331',
 'Provider clients owned by service; connect/header/first-token/idle/whole-answer budgets and retry only idempotent retryable failures; show request phases.',effort='S',lead='confirmed')
add(23,'P2','Third-party provider has no equivalent persistence control and lacks privacy contract',ai,1297,
 'OpenAI Responses sends store:false; NeoToken Chat Completions omits a persistence directive. Endpoint is hardcoded. Provider consent covers category disclosure, but the repo supplies no verified retention/subprocessor/data-location contract.',
 'Compare responses_payload1273 with completion_payload1297; endpoint lib84; provider API not contacted.',
 'The user should see provider-specific verified handling limits. Actual blanket cloud consent cannot promise proxy non-retention.',
 'ai.rs1273,1297-1309; lib.rs84; no real provider requests were made.',
 'Document and verify proxy contract, provider-specific disclosures and supported retention controls; redact stable opponent identifiers from all prompts; choose offline when consent is absent.',confidence='likely',lead='confirmed',validation='Missing request control confirmed; actual proxy retention unknown, not asserted. OpenAI store:false also does not by itself prove every retention class is absent.')
add(24,'P2','All-mode default invites evidence dilution and research retrieved by substring',ai,728,
 'New ad-hoc conversations default All, Balanced. Research retrieval matches simple tag substrings and all three eligible cards are mainly physics/limitations; it supplies no mode-specific tactical knowledge after rejected spec cards.',
 'No conversation ID: All. Question about rank/practice retrieves evidence-limit card, not an actionable review method.',
 'Main-mode coaching should answer the players next decision; broad All requires deliberate choice. Actual default increases prompt size and caveat density.',
 'ai.rs726-729; research.rs3-21; app/src/data/research-cards.json',
 'Default main mode, separate cross-mode summaries; curate reviewed contextual coaching cards with examples and counterexamples rather than only negative constraints.',effort='M',lead='confirmed')
add(25,'P2','Unknown teams default Blue and tied scores become LOST in coach context',ai,409,
 'Missing team is mapped to0 in player table; player_won returnsfalse for tied scores instead of draw/unknown. Library personal_result correctly handles draw, so coach and analytics disagree.',
 'review_unknown_team_is_blue_and_draw_is_lost.',
 'Unknown team remains unknown and tie remains draw/unfinished. Actual labels Blue and LOST.',probe,
 'Use typed Option<Team> and MatchOutcome across context/UI/analytics; never coerce identity/team/result for formatting.',effort='S',lead='confirmed',validation='Probe reproduces exact builder behavior. Severity P2 because null/tied imported rows are edge cases and no valid-parser real replay exhibiting them was observed.')
add(26,'P2','Stale conversation assistant claims are recycled without original evidence lineage',ai,171,
 'history strips messages down to role/content, dropping replay_id, evidence_ids, mode and context_manifest. Old E numbers are request-local and can refer to a different current event; prose instruction is the only safeguard.',
 'Two successive attached matches both contain E1. Old assistant E1 persists in history stripped of original replay metadata.',
 'Historical statements should retain immutable evidence references and selected scope. Actual context conflates ephemeral citation text with current numbering.',
 'ai.rs153-172,731,906; coach-prompts.json chat IDs apply only to this request',
 'Store/render citations as stable replay/event/window objects; summarize history with immutable lineage, keep current request aliases separate.',effort='L',lead='new')
add(27,'P3','Training retrieval uses unweighted substring matching and no relevance explanation',ev,22,
 'Simple terms>2 chars match title/creator/tags; no stemming, semantic skill mapping, prerequisite/rank/time fit or synonyms. Empty query picks source order; ties preserve catalog order.',
 'Recoveries can miss recovery tag; phrases trigger unrelated creator/title terms; first3 records win without score metadata.',
 'A drill recommendation should explain skill fit and prerequisites. Actual search returns records and generic verification only.',
 'evidence_tools.rs22-48; app/src/data/training-packs.json',
 'Typed skill taxonomy and mode/prerequisite/time filters; lexical synonyms before optional embeddings; return matched tags and fit explanation.',effort='S',lead='new')
print('Appended27 D findings')
