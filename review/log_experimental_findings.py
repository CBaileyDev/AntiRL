from pathlib import Path
from auditlib import finding

ROOT=Path(__file__).resolve().parent.parent
PROBES='review/logs/experimental-final-validation.txt; crates/coach-services/tests/review_experimental.rs'
def add(n,sev,title,path,line,problem,repro,expected,rec,effort='M',confidence='confirmed',lead='new',validation='Source contract inspected; no real policy, provider, user data or real replay used.'):
    lines=(ROOT/path).read_text(encoding='utf-8').splitlines()
    finding(id=f'E-{n:03}',severity=sev,category='E. Experimental models',title=title,
      location={'file':path,'line':line,'quote':'\n'.join(lines[line-1:line+2])},
      problem=problem,trigger_or_repro=repro,expected_vs_actual=expected,
      evidence=PROBES if n in [1,3,4,5,7,11,12,27] else f'{path}:{line}; review/EXPERIMENTAL_REVIEW.md',
      recommendation=rec,effort=effort,confidence=confidence,lead=lead,validation=validation)

add(1,'P1','Bot heuristic gives digital keyboard input a maximum index at the actual parser rate','crates/coach-services/src/detector.rs',228,
 '15 Hz render frames cannot resolve the required roughly 35 ms cadence. Missing cadence weights are renormalized, leaving digital steer/throttle cardinality and analog absence. A 15 Hz keyboard-style trace scores 100. The named player gets a bot icon at >=80 in the library and this result enters coaching tools. Caveats correctly say uncalibrated, but do not make the person-oriented signal useful or discriminative.',
 'review_fifteen_hz_keyboard_scores_maximum_without_cadence: 1,200 samples, steer 0/128/255, throttle255; index100, cadence_resolvable=false, basis=discreteness only.',
 'Expected insufficient evidence for bot identity from keyboard-shared signals; actual maximum bot-likeness index on an explicitly digital-input fixture.',
 'Delete named-person badges and LLM detector tool. Keep only an opt-in input-pattern research diagnostic until raw actor cadence, verified labels, keyboard strata and held-out player evaluation exist.','L',lead='confirmed',
 validation='Actively checked the fallback rather than assuming unavailable: synthetic fixture at parser15Hz returns statusok and100. The UI labels it uncalibrated and does not publicly accuse a person, so P0/public-cheating exposure is not claimed.')
add(2,'P2','Detector calibration lets contradictory identities count in both classes','crates/coach-services/src/detector.rs',448,
 'The same identity can be labelled bot in one replay and human in another. Both sets count toward the ten distinct players per class gate; conflicting players are reported but not excluded. A player with many replays weights AUC/thresholds repeatedly. These are descriptive in-sample statistics, not calibration.',
 'Save opposite confirmed labels for the same ten identities across twenty replays; inspect bot_calibration_report set insertion and gate.',
 'Expected mutually exclusive verified evaluation labels and player-balanced statistics; actual overlapping classes and replay-weighted counts.',
 'Reject conflicting labels, group by identity and segregate training/evaluation. Rename the report Label separation until a real calibration study exists.','M')
add(3,'P1','xG features labelled metres are ten times smaller than metres','crates/coach-services/src/xg.rs',186,
 'Distance and height are divided by1000 while named distance_to_goal_m and ball_height_m. Rocket League1uu=1cm, so metres require /100. The standardization means this alone need not change probabilities, but reported feature values and per-unit coefficients have the wrong scientific units.',
 'review_xg_metres_are_off_by_ten:1000uu produces distance1m instead of10m;100uu produces height0.1m instead of1m.',
 'Expected accurately named units; actual kilo-uu supplied as metres to coefficient and evidence consumers.',
 'Rename to kilo-uu or convert to metres, bump feature/model version and recompute. Add explicit typed units in extraction and exported feature dictionaries.','S',lead='confirmed',
 validation='Confirmed from the exact production extraction helper and official RLGym game-values documentation. Does not assert existing xG probabilities are ten times wrong: standardization cancels a fixed scale.')
add(4,'P2','Shot outcome labels can attach a later possession goal to an earlier shot','crates/coach-services/src/xg.rs',140,
 'A same-team goal within8s is assigned to an unflagged shot, preferring the same scorer, without checking intervening opponent touches, new possessions or discontinuities. The UI simplifies this surrogate to Goal/No goal.',
 'review_goal_after_opponent_touch_still_labels_old_shot_goal: shot1s, opponent touch4s, same-team goal8s => original shot labelled goal.',
 'Expected shot-conversion attribution or clearly named team-conversion surrogate; actual later team goal treated as that shot outcome.',
 'Build possession/touch-chain labels or name the target team goal within8s throughout. Validate against manually labelled shots before using finishing comparisons.','L',lead='confirmed')
add(5,'P2','xG complete defender features tolerate missing opponents and invalid nearby state','crates/coach-services/src/xg.rs',78,
 'Feature extraction succeeds when any positioned opponent exists, ignoring an absent second defender. It chooses the nearest frame within0.5s without checking live_play/discontinuity; defender height and demolished status do not affect the 2D goal triangle.',
 'review_missing_one_defender_treated_as_complete_feature: two opponents in roster, only one positioned car => Some(1), complete feature row.',
 'Expected missing-state coverage and no cross-discontinuity inference; actual incomplete roster state counted as complete.',
 'Require a valid continuous live state and classify absent/demolished defenders explicitly. Version the proxy, record coverage and test corners, goal-line geometry and airborne blocks.','M')
add(6,'P2','Every xG request decompresses the entire library and refits the model','crates/coach-services/src/xg.rs',492,
 'xg_rows gets every replay including full frames. Each public endpoint extracts all rows and independently runs five grouped-fold fits plus a full fit; per-replay scoring additionally refits. Progress requests model status and player summary concurrently, doubling the pipeline. No persisted features, watermark or shared cached assessment exists.',
 'Open Progress xG details or repeatedly open shotxG; XgPanels.tsx155 calls both endpoints in Promise.all.',
 'Expected one versioned feature projection and reusable fit per library revision; actual repeated decompression/extraction/fitting per endpoint.',
 'Persist shot features and model lineage, cache assessment keyed by feature schema/library/mode and use one combined endpoint. Measure heavy-library latency before assigning a seconds-of-jank claim.','L',lead='confirmed',validation='Confirmed duplicate source paths; unmeasured real-library latency is not promoted to P1. Existing synthetic probes are too small to establish real workload timing.')
add(7,'P2','xG pools modes and replays where the confirmed player never participated','crates/coach-services/src/xg.rs',482,
 'The training population is every non-benchmark current-version replay, across1v1/2v2/3v3 and match types; configured-player participation is not checked. Evidence get_xg_summary ignores its mode scope. This contradicts the personal mode-specific coaching model and exposes population shift.',
 'review_xg_status_pools_modes_and_nonpersonal_matches saves1v1 and3v3 replays containing other identities only; configured playerme gets n_shots2,n_matches2.',
 'Expected explicit mode and population scope; actual cross-mode/all-import population without player filter.',
 'Add mode/playlist/population scope to features, endpoints, model keys and UI. Either require personal matches or truthfully label an imported-library model.','M',lead='confirmed')
add(8,'P2','xG availability gate has no uncertainty or temporal/player generalization test','crates/coach-services/src/xg.rs',437,
 '150shots/15matches/20per-class and a strict any-size improvement over base-rate Brier/log loss unlock xG. Match grouping is good, but no confidence interval, time-held-out test, player stratification or calibration uncertainty gates exist. Five reliability bins and four-decimal aggregates suggest more precision than these samples support.',
 'Read assess, available report and per-shot UItoFixed2; sample thresholds are handwritten rather than validated against a golden corpus.',
 'Expected prediction uncertainty and future-match validation; actual fixed gates plus one pooled grouped-fold comparison.',
 'Keep behind Lab until a labelled corpus supports uncertainty, rolling time evaluation and mode-specific calibration. Show sample/band instead of a probability with unsupported precision.','L')
add(9,'P2','xG returns a fit even when its iteration limit does not converge','crates/coach-services/src/xg.rs',283,
 'Newton iterations break on small step, but exhausting50iterations also returns Some(Model). Callers equate None with did not converge, so solver semantics do not match those status messages.',
 'Inspect loop257-287 and error strings405-407/443-444; no explicit convergence flag.',
 'Expected a checked convergence result and numerical diagnostic; actual finite parameters accepted at iteration cap.',
 'Return fit diagnostics, require a finite objective decrease and convergence flag; add separation/collinear/extreme-scale tests.','S')
add(10,'P1','What-if tool runs an unknown policy for every car, not an action counterfactual','crates/coach-services/src/evidence_tools.rs',266,
 'There is no candidate player action intervention, controlled comparison or policy matched to this player/opponent. The engine controls every car using a policy of unknown skill from estimated state. Tool name run_counterfactual and the product panel imply a useful what-if despite an honest usage_note denying recommendation and what-would-have-happened.',
 'Inspect sim_what_if options steps/deterministic/checkpoint, policy controls all cars, and tool registrationrun_counterfactual.',
 'Expected a testable player alternative holding a defined opponent policy/baseline fixed; actual one arbitrary multi-agent rollout.',
 'Remove from Coach tools and main Studio. Retain an explicit opt-in Lab policy sandbox with baseline/intervention protocol only if it serves research.','L',lead='confirmed',validation='Actively looked for action intervention, paired baseline or known-skill checkpoint selection; none in API/runner. Correct unknown-skill labels and ball-only safety gate mitigate overclaiming but do not supply coaching value.')
add(11,'P1','Simulation deadline can be bypassed after the parent exits','crates/coach-services/src/sim.rs',724,
 'run_engine enforces timeout while waiting on the direct child. If that child exits normally but a grandchild retains stdout/stderr, unconditional reader joins wait beyond the deadline. The code explicitly avoids this after failures but not successful parent exits.',
 'review_engine_timeout_does_not_cover_readers_after_parent_exit uses safe test child that exits after spawning a900ms pipe-holder;100ms timeout actually takes915ms.',
 'Expected total wall-clock deadline over child and pipes; actual indefinite joins once direct child exits.',
 'Put the whole tree in a Windows job object, enforce one end-to-end deadline, and make pipe readers cancellable/bounded. Kill all descendants and close readers on timeout.','M',validation='Reproduced on Windows using only the current test executable, no RLTRAIN engine. Proof holds finite child for900ms to avoid hanging audit; an indefinitely open pipe would extend the same joins indefinitely.')
add(12,'P1','Ball-only reconstruction gate accepts duplicate samples with no time coverage','crates/coach-services/src/sim.rs',605,
 'compare_ball_path needs eight matched rows but does not require increasing engine times, a distinct sample count or coverage of the requested window. Eight identicaldt0 samples match the start perfectly and return zero max/mean error even when the rest of the replay ball path differs.',
 'review_ball_validation_accepts_eight_duplicate_start_samples: expected frames0..1.933s, eight enginedt0 identical points => max0 mean0 n8.',
 'Expected validated ball trajectory across the free-flight leg; actual repeated start positions can pass.',
 'Validate finite monotonic distinct times, interval coverage, maximum gaps and expected output density before error calculation; require horizon-aware sampling.','S',validation='Verbatim helper probe demonstrates false-pass without running a real engine. Correct engine output may be dense, but malformed/stale output is specifically the trust boundary of this gate.')
add(13,'P1','LLM simulation tool synchronously blocks chat and ignores cancellation during engine work','crates/coach-services/src/evidence_tools.rs',249,
 'The AI planner calls execute_evidence_plan synchronously from chat_stream; run_counterfactual enters sim_what_if and run_engine directly. Ball validation and policy rollout can each consume a60s timeout. Cancellation is checked outside this blocking work, so Stop cannot interrupt it. Native sim IPC correctly uses the blocking wrapper; this finding is limited to the Coach tool route.',
 'Follow ai.rs884 -> retrievalexecute_evidence_plan -> evidence_tools tool_counterfactual -> sim_what_if -> run_engine60s; cancel checks bracket rather than enter execution.',
 'Expected cancellable bounded subprocess work off the async runtime; actual synchronous blocking tool route.',
 'Remove low-value sim tool or dispatch through spawn_blocking with a cancellation token passed into engine/job-tree ownership.','M',lead='confirmed',validation='Actively inspected src-tauri native sim commands631-644 and refuted the broad claim that native sim IPC blocks an async worker. AI tool path is distinct and remains direct; real120s engine run not performed.')
add(14,'P2','Simulation defaults to a developer personal checkout','crates/coach-services/src/sim.rs',21,
 'Fresh installs derive engine readiness from C:\\Users\\barke\\Desktop\\Projects\\RLTRAIN_2 when no user path is saved. This path is machine-specific, leaks development assumptions and makes a premium app feature unavailable by default.',
 'sim_status -> rltrain_root fallback with default_source; no bundled engine or checkpoint.',
 'Expected optional dependency discovery/install flow or explicit Lab setup; actual author checkout fallback.',
 'Delete personal fallback, feature-flag Lab and model engine/checkpoint compatibility as explicit optional dependencies.','S',lead='confirmed')
add(15,'P2','Air time since jump is guessed from last grounded frame','crates/coach-services/src/sim.rs',514,
 'air_time starts at the most recent grounded state rather than a recorded jump onset, subtracting0.2s; falling off a wall/ceiling or leaving an edge can be treated as a jump. This estimated engine variable affects a policy rollout but is not validated by the ball-only gate.',
 'Inspect air_time and carairTimeSinceJump reconstruction; no observed jump-edge condition in helper.',
 'Expected observed jump history or explicit refusal for essential unknown state; actual grounded-to-air estimate supplied as engine jump timing.',
 'Use decoded jump actor transitions and prove timing uncertainty, or mark unknown and refuse policies whose observation depends on it.','M')
add(16,'P2','Ball reconstruction validation does not establish decision fidelity','crates/coach-services/src/sim.rs',1016,
 'Passing free-flight ball error thresholds does not validate car dynamics, input state, collisions, boost-pad cooldowns or opponent policy. It also refuses contact-adjacent moments where many coaching decisions occur. The thresholds are explicitly uncalibrated; a passed gate should not imply counterfactual validity.',
 'sim_validate_state gate and sim_what_if subsequentpolicyrollout; compare only engine ball track on previous0.75-2s free flight.',
 'Expected separate state/physics/policy validity claims and a useful decision domain; actual one ball-only gate unlocking a whole multi-agent rollout.',
 'Keep one narrow physics diagnostic in Lab; validate car/input/contact state and paired interventions before productizing action recommendations.','L',lead='confirmed')
add(17,'P2','Experimental panels retain previous results when replay identity changes','app/src/components/XgPanels.tsx',72,
 'ShotXgPanel and BotLikenessPanel retain data/result state across replay prop changes; key={id} is on innerdetails, not the React component. Their open handler skips fetching when data is truthy. Counterfactual resets state in an effect but old asynchronous requests can write results back afterward.',
 'Render the same component with replayA, open/load, then update prop to replayB; inspect data/result state and fetch condition; an in-flight sim result can complete after ID change.',
 'Expected results keyed to immutable replay/library revision; actual previous data survives prop updates.',
 'Key cache/query by replayid+revision and cancel/ignore stale generation results. Add a real component test before promoting to user-pathP1.','S',confidence='likely',validation='Source-supported prop-state defect; normal App navigation may unmount Studio between different IDs. A live cross-ID product path was not proved, so downgraded toP2likely rather than claiming reproduced player misattribution.')
add(18,'P2','Reference panel repeats a false blanket unavailability claim','app/src/components/ReferenceComparison.tsx',135,
 'Footer always says RLGym what-if unavailable with no adapter/complete state, even though the current repository ships an RLTRAIN engine adapter and conditional reconstruction. It duplicates long model disclaimers rather than deriving status.',
 'Open ReferenceComparison with or withoutconfiguredRLTRAIN; constant footer135-138.',
 'Expected actual feature status or a compact measured/estimated badge; actual stale unconditional development-status wall.',
 'Delete this footer and move actual model capability/context into the Lab status and measurement popover.','S')
add(19,'P2','Mistake fingerprints collapse tactics into one coarse snapshot','crates/coach-services/src/intelligence.rs',154,
 'Fingerprint is only mode,eventkind,fieldzone,lane,boostbucket,scorestate,phase sampled3s before a marker. Distinct recoveries, double commits, shadow defence, touches and correct challenges collapse together. It retrieves repeated situations but cannot identify the repeated decision mechanism.',
 'Compare fingerprints for different ball velocity/teammate/opponent structures within the same seven coarse buckets; those quantities are absent from key.',
 'Expected discoverable recurring decision situations; actual broad contextual counts with user review labels.',
 'Keep the user-confirmed candidate workflow, replace keys with typed window features and paired success examples. Do not blindly change3s to the spec6s; neither establishes fault.','L',lead='confirmed')
add(20,'P2','Intelligence trend counts cannot answer whether the recurring problem improved','crates/coach-services/src/intelligence.rs',367,
 'Weekly trend counts candidates and manually marked mistakes in imported replays, with no comparable opportunity denominator or consistency of review coverage. More imports or more diligent review increases counts regardless of skill. Honest caveats do not provide a useful progress signal.',
 'Change import or review volume betweenweeks; sameunderlying mistake rate yields different visiblecounts.',
 'Expected per-opportunity or per-comparable-match rates and review coverage; actual raw counts with a disclaimer.',
 'Define measurable opportunities and coverage, show rates/bands and link confirmed examples to the practice goal. Until then call this Review queue, not progress.','L')
add(21,'P2','Recurring-drill generator has only two generic recipes','crates/coach-services/src/intelligence.rs',419,
 'After two manually confirmed matches the generator chooses only lowboost vsotherwise and emits fixed8/10reps,3sessions/week,15minutes. Richly different situations receive the same pad/clear or recovery/touch recipe and a generic cue; not grounded in the actual available alternative.',
 'Create drills from differently classified confirmed fingerprints with the same boostbucket; drilltext identical exceptsourceID/title/modecue.',
 'Expected a practice setup reproducing the observed decision constraint; actual boilerplate from one threshold.',
 'Keep confirmation gate; author skill-specific drills with source snapshots, difficulty variants and explicit transfer opportunities. Treat fixed repetition targets as editable practice instructions.','M')
add(22,'P2','Practice transfer requires a form-heavy manual setup before useful feedback','app/src/components/PracticePanel.tsx',139,
 'A serious player manually writes priority, drill, success criterion and cue, records completion/difficulty/time/offset, selects referencecontext/metric, then self-reviews later matches. Only seven broad replay averages can be observed; none detect most tactical cues. The honest hybrid idea is valuable but buried as large Progress cards.',
 'Follow Addplan -> Recordpractice -> TransferSetup -> TransferPanel. Examine the full pages against root before captures.',
 'Expected focus -> guided practice -> next-match moment review; actual administrativeforms and summarymetrics.',
 'Keep and rework into first-class goal/practice objects, prefilled from evidence, lightweight completion, suggested comparable windows and opportunity-specific moment reviews.','L')
add(23,'P2','One fixed replay UTC offset cannot correctly span daylight-saving changes','crates/coach-services/src/transfer.rs',33,
 'Naive replayheaderdates are interpreted with a single fixed offset percycle. A library spanning a DST boundary can order and classify matches incorrectly relative to a practicecompletion with its own actualoffset. UI asks the user for the replayoffset rather than applying perdate timezone rules.',
 'A transfercycle spanning a DST transition with naive headers; choose one offset for before and aftermatches.',
 'Expected per-match timezone or explicit uncertainboundaryexclusion; actual one fixedoffset applied to everymatch.',
 'Store timezone/provenance at import, resolve perdate with an IANA/Windows zone, and exclude ambiguous boundarymatches until confirmed. Preserve manual correction.','M',confidence='likely')
add(24,'P3','Shot xG moments cannot jump to the replay','app/src/components/XgPanels.tsx',124,
 'Shot timestamp rows are plain text, while the valuable coaching interaction is to inspect the exact shot. The table exposes a probability without a way to play the evidence.',
 'Expand shotxG and try activating a timestamprow.',
 'Expected keyboard-accessible timestamp -> viewerseek; actual static timecell.',
 'Use evidence momentlinks with onSeek and playercontext; show position/shotgeometry in the docked rail.','S')
add(25,'P3','AI-created drills are labelled User-authored plan','app/src/components/PracticePanel.tsx',194,
 'Every plan shows User-authored plan, including plans saved from Coach findings and drill_from_fingerprint. Authorship and provenance are conflated.',
 'Create a weeklydrill from Replayintelligence or save a Coachpriority, then view Practiceplan smalltext.',
 'Expected origin/source evidence; actual User-authored for allplans.',
 'Persist provenance with sourcefinding/moment/version and display Coachsuggestion, librarydrill or Yourplan appropriately.','S')
add(26,'P2','Local search calls event count matches and silently approximates natural language','app/src/components/IntelligencePanel.tsx',380,
 'Search.total is the number of matching eventrows, but the UI says matches to your query across Nreplays. The parser reduces the question to regexkind/phase filters, dropping player/time/rank/semantic qualifiers. Interpreted filters are displayed, a useful mitigation, but the count label is wrong and questions can be semantically broader than returned data.',
 'Ask for severalgoals in one replay or a compound question; backendreturns one rowperevent and frontend prints Search.total matches.',
 'Expected Nmoments in Mmatches and explicit supported filters; actual eventcount called matches with crudequeryinterpretation.',
 'Use structured filterchips with autocomplete; call eventrows moments, group bymatch and show ignoredclauses or send broaderquestion to Coach.','S')
add(27,'P2','Simulation trusts a loose output envelope without validating decision geometry','crates/coach-services/src/sim.rs',789,
 'Output parsing requires only rollout_start and rollout_end objects. Decision rows may have negative/repeated steps, missing ball vectors or empty car arrays. sim_what_if copies those fields into statusok; observationWidth is checked only when the engine supplies it. The trajectory UI assumes ball.pos exists.',
 'review_engine_envelope_accepts_missing_decision_geometry: start/decision(step-1,ballnull,cars[])/end => EngineOutcomeOk.',
 'Expected typed, finite, monotonic, complete state output matching checkpoint observation contract; actual JSON envelopes accepted without those checks.',
 'Deserialize into validated typed output, require observationwidth and roster coverage, constrain step/time ordering and reject missing vectors before handing to UI.','M')
print('Appended E-001 through E-027')
