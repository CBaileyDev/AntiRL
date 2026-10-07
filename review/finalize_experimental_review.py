from pathlib import Path
import json
R=Path(__file__).resolve().parent
rows=[]
def add(path,reason,status='reviewed'): rows.append(dict(path=path,status=status,reason=reason))
for p,r in {
 'detector.rs':'Full segmentation/signals/label/calibration/tests; exact-source15Hz keyboard probe.',
 'xg.rs':'Full extraction/fit/folds/assessment/population/endpoint/tests; geometry,label,missingdefender and actualtemp-profile population probes.',
 'sim.rs':'Full checkpoint discovery/reconstruction/physics gate/process/output/rollout/tests; exact-source timeout,coverage,output probes with safe testchildren.',
 'transfer.rs':'Full timestamp/context/window/ownership/reflection/tests; metric version and weights gates, selection-before-coverage verified.',
 'intelligence.rs':'Full indexing/search/fingerprints/drills/opponent/externalreports/tests; cache revision and user-review guards inspected.',
 'practice.rs':'Full personal scope/plan/sessions/archive/tests; provenance and transfer anchoring checked.'}.items():add('crates/coach-services/src/'+p,r)
for p in ['BotLikenessPanel.tsx','XgPanels.tsx','CounterfactualPanel.tsx','ReferenceComparison.tsx','SimSettings.tsx','GhostOverlay.tsx','IntelligencePanel.tsx','PracticePanel.tsx','TransferPanel.tsx','DetectorPanel.tsx']:
 add('app/src/components/'+p,'Full component/state/async guards/copy/fields/control flow reviewed; screenshot critique consolidated by root design pass.')
add('app/src/pages/ReplayStudio.tsx','Experimental panel order, seektime props and component identity inspected; full page owned by frontend agent.','skimmed')
add('app/src/pages/Replays.tsx','Bot badges/stored score threshold and label-fetch handling inspected; full page owned by frontend agent.','skimmed')
add('app/src/pages/Progress.tsx','xG/intelligence/practice integration inspected; full page owned by frontend agent.','skimmed')
add('src-tauri/src/commands.rs','Experimental native IPC routes and blocking wrapper call paths inspected; entire file owned root/storage.','skimmed')
add('crates/coach-services/src/evidence_tools.rs','Fully read in D pass; xG scoping and synchronous sim invocation reviewed again for E.')
add('crates/coach-services/tests/review_experimental.rs','Created exact-source and public-service probes;11passing,2internalignored helpers; independent controls.')
(R/'coverage-experimental.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
leads=[
 dict(lead=16,status='confirmed',evidence='3slookback/10+10window/no210s blanketfilter confirmed. These unvalidated research thresholds are not automatically defects; RESEARCH_AUDIT deliberately rejects unsupported tactical cutoffs. E-019–E-023 explain the actual missing decision model and usable feedback.'),
 dict(lead=17,status='confirmed',evidence='E-001/E-002:15Hz digitalinput scores100 with cadenceunresolved; handpickedweights/LLMtool/library>=80 confirmed; realreplaytest prints only. No actual public person accused; P0publicbot exposure not claimed.'),
 dict(lead=18,status='confirmed',evidence='E-003–E-009:150shotgate,8s surrogate,wrongmetrelabels,full-library repeated extraction/refits. Mitigation: whole-match grouped folds/out-of-fold and heldout targetreplay exclusion exist; not an in-sample-only xG model.'),
 dict(lead=19,status='confirmed',evidence='E-010–E-016: authorpath/unknownpolicy/allcarrollout/toolname confirmed. Native sim IPC blocking-runtime subclaim refuted: proper blockingwrapper. Coach planner tool path remains synchronous/noncancellable. Engine deadline readerjoin and duplicateball false-pass independently reproduced.'),
 dict(lead=8,status='confirmed',evidence='xG mode/nonpersonal pooling confirmed with real publictemp-profile probeE-007. Parser playlist bucket claims delegated parser agent; D-009 confirms memory scope.')]
(R/'leads-experimental.json').write_text(json.dumps(leads,indent=2),encoding='utf-8')
with (R/'PLANS.md').open('a',encoding='utf-8') as f:f.write('\n## AI / experimental agent handoff\nDone: D-001–D-027 and E-001–E-027; source/lead ledgers, model verdicts,11AI +8experimental probe tests pass;2ignored internal safe child tests. No existing source/config/docs modified. Next: root P0/P1 validation merge and fresh screenshot/design integration. Boundaries: no live providers, real replay fixtures or real RLTRAIN model.\n')
print('Wrote experimental ledgers and progress log')
