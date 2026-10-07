from auditlib import ROOT, finding
import json

def loc(path, needle, count=3):
    lines=(ROOT/path).read_text(encoding='utf-8').splitlines()
    i=next(i for i,s in enumerate(lines) if needle in s)
    return {'file':path,'line':i+1,'quote':'\n'.join(lines[i:i+count])}

def add(id,severity,title,path,needle,problem,trigger,expected,evidence,recommendation,effort='M',confidence='confirmed',lead='new'):
    finding(id=id,severity=severity,category='3D viewer' if id.startswith('H-') else 'Frontend architecture and correctness',title=title,location=loc(path,needle),problem=problem,trigger_or_repro=trigger,expected_vs_actual=expected,evidence=evidence,recommendation=recommendation,effort=effort,confidence=confidence,lead=lead)

ui='review/UI_VALIDATION.json; review/logs/ui-characterizations.txt'
ssr='review/frontend-probe-results.json; review/logs/review-frontend-probes-future-gap.txt'
before='review/screenshots/before/'

add('G-001','P0','Overview assigns another player’s result and invents scores','app/src/pages/Overview.tsx','const p = r.players',
 'A missing confirmed identity falls back to the first player and defaults its team to Blue. Unknown scores become zero; ties and unknown results become DEFEAT. The resulting win rate is presented as the selected player’s own performance.',
 'SSR characterizations: selected player absent, first player Blue wins 1-0 -> 100% and VICTORY; scores null -> DEFEAT 0-0.',
 'Expected exclude unknown identity/results and show missing score honestly; actual fabricated own result and numeric score.',ssr,
 'Use one typed identity/result resolver shared with Progress and backend. Represent win/loss/draw/unknown explicitly; calculate denominator only from eligible matches.','M',lead='confirmed')
add('G-002','P1','Overview and Progress silently start in 2v2 regardless of primary mode','app/src/pages/Overview.tsx','const primaryRank = settings.rank_2v2',
 'The hero rank/mode, progress summary and sample have different scopes: Overview says 2v2 Competitive while win rate covers the whole library; Progress initializes 2v2. A 1s main sees a 2s identity and mixed-mode headline.',
 'Fresh harness primary_mode=1v1; Overview screenshot still Diamond II / 2v2 Competitive; inspect mode=progress.modes[2v2] and totalMatches=replays.length.',
 'Expected selected primary mode consistently applied to rank, sample, form and metrics; actual mismatched scopes.',before+'overview-1440x900.png; '+before+'progress-goals-1440x900.png',
 'Add one mode scope in URL/session; default to profile primary mode and display per-mode sample prominently. Separate All-library counts from mode coaching.','M',lead='confirmed')
add('G-003','P0','Progress turns absent measurements into measured zero percentages','app/src/pages/Progress.tsx','defensive_half_pct: 0',
 'Missing report and null values yield 0% Defensive Half Presence and Low Boost Exposure through fallback zeros and clampPct(n||0). Zero is a claim about play, not absence of observations.',
 'Render Progress with progress=null; original real component SSR prints both metrics as 0%. Same clamp coerces explicit null from IPC.',
 'Expected a no-sample state or em dash; actual factual zero percentages.',ssr+'; '+before+'progress-goals-empty-1280x720.png',
 'Keep optional values through formatting; require coverage/sample before rendering a Stat. Test null, zero and nonzero separately.','S',lead='confirmed')
add('G-004','P1','A slower replay request overwrites the later user selection','app/src/App.tsx','const handleSelectReplay = async',
 'Concurrent getReplay promises have no request identity or cancellation; each resolution replaces selectedReplay. Navigation and seek values can consequently apply to the wrong match.',
 'Root harness delays first 1v1 request, resolves second 2v2 immediately, then first; final Studio is 1v1 instead of selected 2v2.',
 'Expected latest selection owns state; actual last network/IPC completion wins.',ui,
 'Route by replay ID, use query cache keyed by ID, and guard asynchronous selection with a generation/abort token. Add loading/error state per requested replay.','M')
add('G-005','P1','Coach evidence chips open the match at 0:00 instead of their cited time','app/src/pages/Coach.tsx','onOpen={() => onSelectReplayStudio',
 'buildChips has the event timestamp but the chip invokes a zero-argument callback. Parent can accept time, so the citation loses evidence navigation at the final UI boundary.',
 'Click fresh real-App 1:24 boost citation; viewer slider is 0 instead of event time 84.6.',
 'Expected citation deep link seeks to cited moment; actual opens beginning.',ui+'; '+before+'coach-chat-1280x720.png',
 'Carry replayId, evidenceId and time through a typed MomentLink; use /replays/:id?t=84.6 and focus the selected event.','S',lead='confirmed')
add('G-006','P1','Automatic library refresh discards unsaved Settings edits','app/src/pages/Settings.tsx','setFolder(settings.replay_folder);',
 'Settings copies every prop into local form state whenever settings identity changes. An import refresh changes the profile identity object in App even if settings values are unchanged, wiping a dirty form.',
 'Type Unsaved Draft in player-name field, emit mock import update causing library/settings refresh; field becomes Nova.',
 'Expected preserve dirty draft or explicit conflict resolution; actual draft loss.',ui,
 'Use a form draft initialized once per explicit settings revision; update pristine fields only. Save each section independently and expose dirty/conflict state.','M',lead='confirmed')
add('G-007','P1','Navigating away from Coach cancels a reply without user intent','app/src/pages/Coach.tsx','cleanupActions.current.onCancelAi?.()',
 'Coach unmount cleanup cancels global backend generation and drops late completion through requestRef. Messages/loading belong to App, but operation lifetime belongs to the page. Reviewing a cited moment or Progress interrupts coaching.',
 'Start mock streamed reply, navigate Progress; cancel_ai count becomes1. Root confirmed after attempting normal navigation.',
 'Expected chat generation continues in conversation with visible background status; actual page navigation cancels it.',ui,
 'Own request lifecycle in a conversation service/store above route; Stop explicitly cancels. Restore complete/partial/cancelled state on return.','M',lead='confirmed')
add('G-008','P2','A consumed Ask Coach prompt returns every time Coach remounts','app/src/App.tsx','const [coachInitialPrompt',
 'App never clears coachInitialPrompt after Coach consumes it; Coach initial state and effect reapply it on mounting. Edited or cleared drafts are replaced by an old replay instruction.',
 'Studio Ask Coach; clear composer; navigate Overview and Coach; old prompt reappears.',
 'Expected one-shot intent seeds draft once; actual persistent stale instruction.',ui,
 'Pass a uniquely identified compose intent and acknowledge consumption; keep drafts per conversation instead of page-local initialization.','S',lead='confirmed')
add('G-009','P2','One God component mixes routes, import state and chat operation ownership','app/src/App.tsx','const [currentPage, setCurrentPage]',
 'App has roughly25 independent state cells, imperative page strings and render branches, owns conversation messages and selection, and couples library refresh to settings. No addressable replay/time/conversation routes or history; Studio nav silently opens first replay.',
 'Inspect App route branches and Studio click replays[0]; reload/back cannot preserve a match moment or selected conversation.',
 'Expected route-owned resource identity and scoped stores; actual implicit page state with interdependent effects.', 'app/src/App.tsx:53-116,420-427,522-627',
 'Introduce router/deep links and domain query caches; isolate import, identity/settings, replay selection and chat stores. Keep coordinator thin.','L',lead='confirmed')
add('G-010','P2','Every cited assistant bubble independently reloads the same compact replay','app/src/pages/Coach.tsx','loadReplayRef',
 'CitedMoments effect fetches once per bubble even when ten bubbles cite the same replay. It is get_coach_replay, not full frames: the original lead overstates the payload. Copied real fixture compact record is160,468 bytes, still repeated parsing/IPC/storage work with no cache.',
 'Load thread with several messages whose replay_id is identical; each mounted CitedMoments invokes onLoadReplay. App binds it to get_coach_replay.',
 'Expected one shared compact replay query per ID/revision; actual N independent requests and local copies.', 'Coach.tsx:229-248; App.tsx:603; review/logs/review-real-replay-payload-absolute.txt',
 'Cache compact event indexes keyed by replay ID/revision; fetch only cited evidence details if possible.','M',lead='confirmed')
add('G-011','P2','Streaming reparses and rerenders the entire conversation on every delta','app/src/pages/Coach.tsx','{messages.map((m) => (',
 'Each delta replaces the App message array; every assistant Markdown component reruns splitting/rendering for historical messages. No memoized Message boundary, virtualization or delta publication cadence. This scales with full history as the answer grows.',
 'Source trace Channel onmessage -> onUpdate full text -> setCoachMessages -> messages.map -> Markdown(text). Runtime long-thread jank not measured, so this is debt rather than proven serious jank.',
 'Expected only active message publishes bounded UI updates; actual whole thread work per delta.', 'App.tsx chat Channel/onUpdate; Coach.tsx:119,1104,1152',
 'Memoize immutable Message objects, batch text deltas to30Hz or slower, virtualize long threads and separate active generation state. Benchmark long histories.','M')
add('G-012','P2','Plain-text conversation export depends on current rendered DOM','app/src/pages/Coach.tsx','?.innerText || m.content',
 'TXT export scrapes .coach-markdown innerText if the bubble is mounted and otherwise uses original markdown. Export format therefore depends on visibility/render state and will change under virtualization; evidence captions are outside the scraped text.',
 'Export the same transcript with a bubble present versus unmounted; branch changes markdown handling. Source proof; no unsafe content execution.',
 'Expected canonical deterministic transcript serializer including citations; actual DOM-dependent serialization.', 'app/src/pages/Coach.tsx:446-455',
 'Export from structured conversation data using a shared Markdown-to-text formatter and explicit citation/moment appendix.','S',lead='confirmed')
add('G-013','P2','Progress goals are static examples permanently marked incomplete','app/src/pages/Progress.tsx','ok: false,',
 'Three hardcoded milestones are always false and disregard progress.goals returned by the backend. Every player gets the same impossible-to-complete dashboard with no trend graph despite a library of samples.',
 'Fresh heavy-user screenshot shows all goals In Progress; source literals and no progress.goals use.',
 'Expected persisted scoped targets, measured status and linked practice; actual static checklist.',before+'progress-goals-1440x900.png; Progress.tsx:258-280',
 'Replace with goal objects containing scope, metric/support, baseline, target, review window and status. Show trend and practice transfer; remove placeholders until functional.','L',lead='confirmed')
add('G-014','P2','Recent form is sorted lexically instead of by normalized match time','app/src/pages/Progress.tsx','.sort((a, b) => (a.at < b.at ? 1 : -1))',
 'Raw played_at strings with mixed offsets/formats are resorted by lexicographic comparison. Example 2026-01-01T01:00:00+02:00 is earlier than 2025-12-31T23:30:00Z but sorts later; form then takes12, potentially discarding truly recent games.',
 'Apply the comparator to the two ISO timestamps; storage normalizes them but frontend discards that ordering.',
 'Expected numeric normalized played_at sorting with deterministic ID tie-break; actual representation ordering.', 'app/src/pages/Progress.tsx:58; B-006 date-normalization proof',
 'Expose canonical timestamp/played_sort in ReplaySummary; do not independently reparse/reorder timestamps.','S')
add('G-015','P2','Saving general settings overwrites the separate analysis model','app/src/pages/Settings.tsx','analysis_model: chatModel,',
 'The backend supports separate chat_model and analysis_model, but Save assigns both from one chatModel draft. A user-configured analysis model is silently overwritten while changing a folder, rank or consent.',
 'Start with different saved model IDs; change unrelated general field and save; payload sets analysis_model=chat_model.',
 'Expected unrelated save preserves independent analysis setting or explicit shared-model product contract; actual hidden overwrite.', 'app/src/pages/Settings.tsx:191-211; bindings SettingsDto',
 'Either expose both model roles or remove the separate setting through migration; send section-specific patches only.','S')
add('G-016','P2','Provider model lists can be overwritten by stale asynchronous requests','app/src/pages/Settings.tsx','const models = await onLoadModels(provider);',
 'Changing provider triggers handleFetchModels but no generation/abort token tracks which provider owns its result. A slower previous catalog can replace the current catalog; errors only go to console and leave stale list visible.',
 'Resolve provider A list after selecting provider B and resolving B. Source-derived race; provider calls were forbidden and not made.',
 'Expected current-provider query keyed/cancelled and visible failure; actual last completion owns list.', 'app/src/pages/Settings.tsx:154-178',
 'Use query key provider/model-catalog revision and ignore obsolete requests; clear list on switch and show retry. Test with deterministic local deferred mocks.','M',confidence='likely')
add('G-017','P2','Reference replay selection has the same stale-request race as main selection','app/src/components/ReferenceComparison.tsx','const r = await ipc.getReplay(id);',
 'choose clears state then asynchronously sets reference/player/anchors without checking requested ID or current main replay. A late response can replace a newer reference or resurrect a reference after main replay changes.',
 'Defer reference A, choose B or change main replay, then resolve A. Source-derived; not separately runtime reproduced.',
 'Expected only current selection/scope may publish; actual any completed promise publishes.', 'app/src/components/ReferenceComparison.tsx:24-40',
 'Use cached resource queries with cancellation/generation and reset all reference form state per main replay ID.','M',confidence='likely')
add('G-018','P1','Lab actions use the last external seek instead of the visible live playhead','app/src/pages/ReplayStudio.tsx','currentAnchor={seekTime}',
 'ReplayViewer maintains its own clock and internal scrub state. Parent seekTime changes only from external event/initial seek, yet reference anchor and sim defaultTime receive it. Play or scrub to a moment and Lab starts from an older time, undermining comparison.',
 'Source dataflow: parent passes seekTime to viewer; no onTimeChange prop; ReferenceComparison and CounterfactualPanel get seekTime. Fresh Studio transport exists below fold; native simulation not run.',
 'Expected explicit Run from current time captures visible clock; actual stale parent anchor.', 'app/src/pages/ReplayStudio.tsx:169-185; ReplayViewer.tsx internal clock/seek',
 'Publish playback clock through a scoped store/ref API; snapshot current time when Lab action runs. Display start-time chip and seek target for confirmation.','M',lead='confirmed')
add('G-019','P0','A nullable future ball frame crashes the simulation trajectory UI','app/src/components/CounterfactualPanel.tsx','ball: frames.map((f) => f.ball.position',
 'Frame.ball is nullable by generated contract. TrajectoryPlot filters time/live flags but dereferences every ball and the nearest final ball. A successful sim with valid start and a later missing ball crashes the whole application ErrorBoundary instead of omitting unsupported segments.',
 'Original component SSR characterization uses valid ball at t0 and null at t0+0.2, successful two-decision result -> Cannot read properties of null (reading position). Backend validation covers free-flight leg ending at t0, not future actual plot.',
 'Expected plot skips/splits gaps and retains app; actual render exception.',ssr+'; sim.rs:954-982; review/logs/review-typescript-strict.txt',
 'Filter typed finite ball frames, split discontinuities/gaps, compute nearest supported final sample, and contain optional Lab failures with local error boundaries.','S')
add('G-020','P2','Teammates page cannot navigate to the matches behind its statistics','app/src/pages/Teammates.tsx','onSelectTeammateMatches?:',
 'The component declares a match-selection callback but never uses it and App supplies none. A player cannot inspect the matches behind teammate win rates or shared strengths, scope by mode, or validate an odd result.',
 'Inspect rendered table and unused optional prop; fresh page has no drilldown.',
 'Expected shared-match list and filter/evidence route; actual static summary rows.',before+'teammates-1440x900.png; App.tsx:625',
 'Either fold this view into scoped replay-library people filters or add shared-match evidence links; remove unused callback.','M')
add('F-050','P2','Browser transport silently returns invalid successful values','app/src/ipc.ts','if (!isTauri()) return {} as T;',
 'Both dynamic invoke and generated command wrapper return {} cast to any expected type outside Tauri. Missing platform/harness initialization looks like success until array/object consumers fail elsewhere, obscuring contract and startup failures.',
 'Call list commands in an ordinary browser without mockIPC; Promise resolves {} rather than unsupported-platform error.',
 'Expected explicit typed unavailable transport or installed fixture transport; actual fabricated success.', 'app/src/ipc.ts:11,29',
 'Inject a Transport interface; production browser transport rejects unsupported calls. Harness explicitly installs mock transport with runtime contract checks.','S',lead='confirmed')
add('F-051','P2','TypeScript null safety is disabled despite nullable replay contracts','app/tsconfig.json','"strict": false,',
 'strict=false permits actual null-ball dereferences and mismatched nullable metric/transfer values. CLI strict check exposes errors in live components that normal build passes; generated Rust types lose much of their safety.',
 'pnpm --dir app exec tsc --noEmit --strict exits2. CounterfactualPanel lines84/102 fail null-ball safety; other App/Coach/Overview/Progress/Transfer errors logged.',
 'Expected nullability enforced across IPC domain; actual permissive build hides confirmed crash.', 'review/logs/review-typescript-strict.txt; G-019 SSR proof',
 'Enable strictNullChecks/strict incrementally with typed parsers at boundary; replace broad any/Value casts and make missing data first-class.','M')
add('H-001','P1','Static camera import pulls Babylon into the main bundle','app/src/viewerCameras.ts','import * as B from "./viewerEngine";',
 'viewerScene statically imports viewerCameras, which imports viewerEngine as a value. The dynamic import later cannot split this engine dependency. Overview imports timeLabel from ReplayViewer, also dragging viewer module graph into first page.',
 'Source graph plus root production build main chunk ~1.77MB/~467KB gzip; Vite warns viewerEngine is both dynamic and static import.',
 'Expected viewer/Babylon only loaded when opening Studio; actual app startup pays engine JS parse/bundle cost.', 'review/logs/frontend-build.txt; app/src/viewerScene.ts:8,93; Overview.tsx:4',
 'Inject Babylon constructors into camera/rig factories or import them entirely within lazy Studio module. Move timeLabel to viewerTime, lazy-load route and check chunk budget.','M',lead='confirmed')
add('H-002','P1','Paused viewer continuously submits shaded frames instead of idling','app/src/viewerScene.ts','const baseFps = playbackRef.current',
 'Fixed paused camera targets15fps, free camera targets playback rate, and runRenderLoop stays active. A stationary replay keeps shadows/glow/scene submissions working. Document-hidden early return and capped pixel ratio are good, but foreground idle never sleeps.',
 'Real-App headless Chrome paused four seconds:25 renders (~6.25fps actual), mean CPU submission2.412ms/p953.2ms with110meshes/high/WebGL774x483. This proves recurring CPU/render submissions, not GPU power or GPU timing.',
 'Expected demand-render after seek/camera/resize and stop after camera settles; actual periodic foreground frames while paused.',ui,
 'Use dirty demand rendering plus short settle loop; disable particles/glow/trails when idle. Monitor energy on laptop and WebView2 after implementation.','M',lead='confirmed')
add('H-003','P2','Stationary wall contacts and chase collision are repeatedly raycast','app/src/viewerScene.ts','const hit = mesh.intersects(camRay, false);',
 'Ground car contact uses a flat-turf fastpath, so lead per-car-per-frame is too broad. Wall/cove contact still tests all contactMeshes per qualifying car; chase collision tests meshes when pp.y<3 (most grounded play), even when paused. No cached dirty transforms or acceleration proxy.',
 'Inspect contact loops and paused render loop. Root CPU numbers include these paths but do not isolate raycast cost.',
 'Expected only changed transforms recompute contact/collision and use simpler proxies; actual repeated mesh work.', 'app/src/viewerScene.ts:979-1001,1112-1125; '+ui,
 'Cache contacts by frame/pose and use stadium collision BVH or analytic walls; profile first. Keep flat-ground fastpath.','M',lead='confirmed')
add('H-004','P2','Viewer re-creates the entire GPU scene on replay object identity changes','app/src/ReplayViewer.tsx','[replay],',
 'Scene lifetime depends on the complete replay object. Refetching the same match yields a new object and rebuilds arena/rig textures/materials/resources, resets readiness and loses camera continuity. Mesh byte fetch cache helps but does not retain GPU assets.',
 'Inspect mountReplayScene effect and App getReplay refetch paths; source lifetime proof, rebuild duration not isolated.',
 'Expected stable engine/arena keyed separately from replay data and instance IDs; actual all-resource teardown/rebuild.', 'ReplayViewer.tsx:200-214; viewerScene.ts initialization/cleanup',
 'Retain one Studio engine/arena; replace frame source/rig pool by replay ID/version. Dispose deterministically only when viewer closes, with WebGL-context tests.','L',lead='confirmed')
add('H-005','P2','Viewer quality and Coach scroll storage can throw during render/navigation','app/src/ReplayViewer.tsx','localStorage.getItem("viewer-quality")',
 'localStorage getItem in state initializer and setItem in effect are unguarded; Coach uses sessionStorage without guarding access errors. Disabled/quota/restricted storage becomes a whole-app error instead of nonessential preference failure.',
 'Source proof with standard Web Storage throwing SecurityError/QuotaExceededError; restricted-storage browser harness not yet run.',
 'Expected best-effort preferences with default/fallback; actual exception escapes component/effect.', 'ReplayViewer.tsx:104-109; Coach.tsx:559,579,1097',
 'Use safe storage utility with parse/version/try-catch and in-memory fallback. Add throwing-storage characterization.','S',confidence='likely',lead='confirmed')
add('H-006','P2','Overtime count-up is shown as a normal match clock','app/src/components/ViewerHud.tsx','currentFrame.match_clock_seconds < 0',
 'Frame carries explicit overtime flag but HUD only prefixes plus when clock value is negative. A positive overtime count-up displays MATCH CLOCK 0:01 without OT, obscuring match phase.',
 'Original ViewerHud SSR with overtime=true, match_clock_seconds=1 -> MATCH CLOCK 0:01, no+ orOVERTIME.',
 'Expected OT +0:01 using phase flag; actual ordinary countdown-like label.',ssr,
 'Format clock from phase/overtime flag and preserve replay elapsed time separately; test regulation, zero, overtime and missing clock.','S')
add('H-007','P2','Recorded boost-active telemetry is ignored when animating boost','app/src/viewerScene.ts','carB.boost < carA.boost;',
 'Exhaust is inferred from a falling boost amount between frames rather than car.boost_active, now present in the contract. A simultaneous pickup can mask usage; discontinuity/reset conditions hide exhaust even with recorded active flag. This is cosmetic evidence fidelity, not a metric.',
 'Set boost_active=true with boost amount rising after pad pickup; predicate is false. Source characterization; no visual clip captured.',
 'Expected recorded active flag drives effect when available, estimate only otherwise; actual balance delta drives effect always.', 'viewerScene.ts:1036-1043; bindings.ts:224',
 'Prefer explicit boost_active, use documented fallback when unavailable, and align effects with discontinuities.','S')
add('H-008','P3','Camera footer asserts the zen preset even after custom profile edits','app/src/ReplayViewer.tsx','Pro preset · zen',
 'Footer hardcodes110/270/100/-3/.35 for player/ball modes although CameraSettings updates stateRef.profile to user values. The visible description no longer matches camera behavior.',
 'Change camera FOV/distance in settings; source still renders same constant footer.',
 'Expected current saved profile summary or neutral controls help; actual fixed preset label.', 'ReplayViewer.tsx:408-410; components/CameraSettings.tsx',
 'Render profile name and actual values from profile; distinguish imported/custom profiles.','S')
print('Appended frontend/viewer findings')
