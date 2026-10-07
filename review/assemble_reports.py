"""Render the review ledger, reports and completion checks from persisted evidence."""
import collections
import json
import pathlib
import re
import sys
from auditlib import ROOT

OUT = ROOT / "review"
def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))
def write(name, text):
    (OUT / name).write_text(text.rstrip()+"\n", encoding="utf-8")
def cell(text):
    return str(text).replace("|", "\\|").replace("\n", " ")

findings_path = OUT / "findings.jsonl"
original = findings_path.read_text(encoding="utf-8")
if not (OUT / "findings.pre-validation.jsonl").exists():
    write("findings.pre-validation.jsonl", original)
findings = [json.loads(line) for line in original.splitlines()]
by_id = {row["id"]:row for row in findings}
for name in ["validation-adjustments.json", "validation-experimental-adjustments.json", "validation-design-adjustments.json", "validation-design-contrast-adjustments.json", "validation-parser-final-adjustments.json", "validation-final-floor-adjustments.json"]:
    if not (OUT/name).exists():
        continue
    for adjustment in read_json(OUT/name):
        item = by_id[adjustment["id"]]
        patch = adjustment.get("patch", {key:value for key,value in adjustment.items() if key in item or key == "validation"})
        patch.pop("id", None)
        item.update(patch)
        if adjustment.get("validation_note") and adjustment["validation_note"] not in item.get("validation", ""):
            item["validation"] = item.get("validation", "")+" "+adjustment["validation_note"]
        if adjustment.get("problem_addendum") and adjustment["problem_addendum"] not in item["problem"]:
            item["problem"] += " "+adjustment["problem_addendum"]
        if adjustment.get("evidence_addendum") and adjustment["evidence_addendum"] not in str(item["evidence"]):
            item["evidence"] = str(item["evidence"])+"; "+adjustment["evidence_addendum"]
by_id["L-004"]["evidence"] = "docs/validation/coaching-corpus.json; .github/workflows/quality.yml; review/logs/ai-final-validation.txt"
by_id["N-005"]["location"]["line"] = 35
by_id["N-005"]["evidence"] = "src-tauri/tauri.conf.json:35-38; src-tauri/icons/icon.png; src-tauri/icons/icon.ico; review/logs/native-build-original.txt; .gitignore"
write("findings.jsonl", "\n".join(json.dumps(item,ensure_ascii=False) for item in findings))
counts = collections.Counter(row["severity"] for row in findings)
area_names = {
 "A":"Replay parsing and metric correctness", "B":"Storage, migrations, analytics and performance",
 "C":"Import pipeline and parser isolation", "D":"AI coaching", "E":"Experimental models",
 "F":"IPC, types and errors", "G":"Frontend architecture and bugs", "H":"3D viewer",
 "I":"Design system and visual design", "J":"UX, IA and copy", "K":"Accessibility",
 "L":"Tests and CI", "M":"Security and privacy", "N":"Repo hygiene and documentation", "O":"Product and coaching value"}

parts=["# AntiRL hostile pre-launch findings", "", "**Release recommendation: hold.** Confirmed wrong personalized results, absent-as-zero measurements, incorrect evidence intervals and bad-row startup failure must be fixed before a launch that promises grounded coaching.", "", f"Target `6762f8cda780a78eee619bb2a16ba2aa5e5769e0`; Windows; 6 October 2026 local. **{len(findings)} findings:** "+", ".join(f"{counts[level]} {level}" for level in ["P0","P1","P2","P3"])+". This is review-only: no production changes.", "", "Each entry records source context, trigger, proof, expected behavior, recommendation and confidence. Confirmed structural gaps are not claims that a live provider hallucinated or that an exploit occurred. Product judgments are identified as such. Characterization tests intentionally assert current bad behavior. Every retained P0/P1 received an active disproof pass; see [VALIDATION.md](VALIDATION.md), [experimental validation](VALIDATION_EXPERIMENTAL.md) and [independent design validation](VALIDATION_DESIGN_INDEPENDENT.md). Initial entries are preserved in findings.pre-validation.jsonl; the final machine ledger includes the adjudications.", "", "Appendix A was a floor, not an oracle: see [LEAD_VERDICTS.md](LEAD_VERDICTS.md) for all48groups and explicitly refuted subclaims. Complete file/area accounting is in [COVERAGE.md](COVERAGE.md); actual commands and limits are in [TEST_REPORT.md](TEST_REPORT.md).", "", "## Findings index", "", "| ID | Severity | Area | Finding | Confidence |", "|---|---|---|---|---|"]
ordered = sorted(findings,key=lambda row:(row["severity"],row["id"].split("-")[0],int(row["id"].split("-")[1])))
for row in ordered:
    parts.append(f"| [{row['id']}](#{row['id'].lower()}) | {row['severity']} | {row['id'][0]} | {cell(row['title'])} | {row['confidence']} |")
for severity in ["P0","P1","P2","P3"]:
    parts.extend(["",f"## {severity}",""])
    for area in area_names:
        subset=[row for row in ordered if row["severity"]==severity and row["id"].startswith(area+"-")]
        if not subset: continue
        parts.extend([f"### {area}. {area_names[area]}",""])
        for row in subset:
            loc=row["location"]
            parts.extend([f"<a id=\"{row['id'].lower()}\"></a>",f"#### {row['id']} — {row['title']}","",f"**{row['severity']} · {row['category']} · {row['confidence']} · effort {row['effort']} · lead {row['lead']}**", "",f"Source: `{loc['file']}:{loc['line']}`", "", "```text", loc.get("quote", ""), "```", "",f"**Problem:** {row['problem']}", "",f"**Trigger / reproduction:** {row['trigger_or_repro']}", "",f"**Expected / actual:** {row['expected_vs_actual']}", "",f"**Evidence:** {row['evidence']}", "",f"**Recommendation:** {row['recommendation']}", ""])
            if row.get("validation"): parts.extend([f"**Validation adjudication:** {row['validation']}", ""])
write("FINDINGS.md", "\n".join(parts))
if "--findings-only" in sys.argv:
    print(json.dumps({"findings":len(findings), "severities":dict(counts), "render":"findings only; edited test/coverage reports preserved"}))
    sys.exit(0)

# Combine lead subclaims without dropping dissenting evidence.
leads=collections.defaultdict(list)
for file in sorted(OUT.glob("leads-*.json")):
    data=read_json(file)
    if isinstance(data,dict): data=[dict(value,lead=key) for key,value in data.items()]
    for row in data:
        number=int(str(row["lead"]).split("-")[0])
        leads[number].append((file.name,row))
leads[8].append(("root source review",{"status":"confirmed","detail":"A-026: format/playlist/ranked eligibility conflated. Known non-whitelisted playlists with validTeamSize becomeunknown and lose rotation events; casual/ranked map to same mode. No private/tournament realfixture was available."}))
lead_lines=["# Appendix A: all lead verdicts", "", "A group is confirmed if its core observation has support; each contradicted or unverified subclaim is stated explicitly. 'Confirmed' does not make every numeric count, severity or hypothesized consequence in the prior pass true. No lead was silently carried over as evidence.", "", "| Lead | Final group verdict | Evidence and corrected subclaims |", "|---|---|---|"]
for number in range(1,49):
    entries=leads[number]
    assert entries, f"Missing lead {number}"
    status="confirmed" if any(row["status"]=="confirmed" for _,row in entries) else "refuted"
    detail="<br><br>".join(cell(row.get("evidence",row.get("detail","")))+f" ({name})" for name,row in entries)
    lead_lines.append(f"| {number} | {status} | {detail} |")
write("LEAD_VERDICTS.md", "\n".join(lead_lines))

# Full file ledger. Include the forbidden ignored test key by name only.
ledger=collections.defaultdict(list)
for file in sorted(OUT.glob("coverage-*.json")):
    for row in read_json(file): ledger[row["path"].replace("\\","/")].append((file.name,row))
required=sorted(p.relative_to(ROOT).as_posix() for directory in ["crates","src-tauri/src","app/src","integrations"] for p in (ROOT/directory).rglob("*") if p.is_file() and not any(part in ["node_modules","target",".git"] for part in p.parts))
assert all(path in ledger for path in required), [path for path in required if path not in ledger]
area_verdicts = {
 "A":("needs work","Native collector, all phases/thresholds/continuity/units/validation/discovery; synthetic9probes and3copied real parses. Event intervals/IDs fail. No independent tactical goldens."),
 "B":("needs work","All migrations/schema/queries/projection/versioning/JSON recovery/deletion; disposable storage proofs and real serialized payload. Bad-row open is broken; warm queries scan everything."),
 "C":("needs work","Every decoder route, worker launch/job/env/output/time/cancel limits, parent validation, stable inputs/hash/tombstones, watcher/queues. Windows job tests run; adversarial OOM is not proven."),
 "D":("broken","Context/manifest/token estimate/truncation, validators/prompts/tools/memory/mode/history/providers/SSE/cancel/offline/cost. Selected-match evidence is lost in saturatedAll; prose grounding gates incomplete. No live calls."),
 "E":("cut or rework","EveryxG/detector/simulation/intelligence/transfer/camera/reference implementation, syntheticpositive/negativecontrols and UIstate test. Per-model decisions below; some groupedCV/reconstruction safeguards work."),
 "F":("needs work","All61IPC commands,25bareValueoutputs/1305stringlookups, generatedDTOs/nullability/errorconversion/blockingroutes, real9.32MBpayload. Typed boundaries do notvalidatebeforecommit."),
 "G":("broken","AllApp/pages/components/data/state/effects/fetchflows/streamownership;40match real-Appharness,6UIbugs and6originalcomponent characterizations. Incorrectpersonalizednumbers and requestraces confirmed."),
 "H":("needs work","Everyviewer module, mesh/engine lifecycle, cameras/collision/interpolation/transport/shortcuts/storage/renderbudget. Pausedactualrender andchunkmeasurements; noGPUenergy/longsession/nativehardware proof."),
 "I":("needs work","4042lineCSS/tokens/type/inline/nativecontrols/deadclasscandidates/assets/team/statuspalette; lexicalcensus and actualscreens. Preservepalette, replacecontract."),
 "J":("needs work","Everypage/populated/empty/startupstate/delete/stream/onboarding at3sizes; copyinventory andcorejourneys. ExistingReviewCTAworks; hierarchy/disclaimerbudget and coachthreadneedrework."),
 "K":("broken","Computedcontrast, keyboardTab/Escape/focus/inertness/labels/selected/currentsemantics/liveannouncements/reducedmotion/targetsize/zoom. Dialogs andunnamedcontrols blockcorepaths. NoNVDA/JAWSvalidation."),
 "L":("broken","Originalcommands/CI/config/tests/manualscripts/adversarialcorpus/cleanarchive/dependencies. Freshinstall andall-featuresfixturefail; originalPlaywrightStoprace fails. Finalcontrolledtests pass."),
 "M":("needs work","CSP/capabilities/opener/vault/QAisolation/cloudconsent/notes/snapshots/deletion/backups/Discord ingress/download/render/env. Goodboundariesexist; containmentgaps and retentioncontractneedwork. Norealcredentialsread."),
 "N":("needs work","README/status/hardening/architecture/metrics/research/validation artifacts,paths/deadcode/dependencies/buildicons. Contradictionsandmissinginputsverified; noLinuxbundleexecuted."),
 "O":("needs work","Player'snext-focusjourney, decoded-but-unusedfeatures, privateingestpositioning, primarycompetitorsources/cost/practicevalue. Actionablemoment->drill->check-in shouldreplace disconnected featurepanels.")}
cov=["# Coverage and verdicts", "",f"Review target `6762f8c`; **{len(required)} files in the required directories are accounted for**. A reviewed file means implementation/call paths were read; it does not imply every runtime path was exercised. Skimmed generated/assets/data files are labelled accordingly. The ignored test key is the one deliberately unreviewed file under the explicit credential-read constraint.", "", "| Area | Verdict | What was checked / limits |", "|---|---|---|"]
for area,(verdict,detail) in area_verdicts.items(): cov.append(f"| {area}. {area_names[area]} | {verdict} | {detail} |")
cov.extend(["", "## Experimental model decisions", "", "| Model | Decision | Reason / gate |", "|---|---|---|", "| Named-player bot likelihood | **delete** person score/badges/tool | Actual15Hz keyboard controls score100; savedhumanlabel still eligible. No human/bot generalization proof. |", "| xG | **rework**, Lab only | Keep groupedCV/heldout exclusion. Fixunits/outcomedefinition/possession/mode/cohort/completeness/convergence; cache/version model and measure uncertainty. |", "| RLTRAIN what-if | **hide behind a flag**; delete current coach tool | Unknownall-car policyrollout lacks candidate-action intervention; geometry gate and deadline flawed. No realcheckpoint exercised. |", "| Reference ghosts | **keep and rework** | Useful qualitative comparison; synchronize scope/playhead and remove blanket claims that ignore capturedcontrols. |", "| Intelligence/fingerprints | **rework** | Keep neutral recurringmoment retrieval; current one-snapshot coarse buckets and counttrends do not establish tactical error/improvement. |", "| Practice/transfer | **keep and rework** | Preserve hybrid selfcheck+supportingtelemetry; make setup progressive and checkpoint/cohort explicit. No causal attribution frombefore/after. |", "| External score notebook | **hide behind a flag** or remove primarypanel | Manual provenance does not supply a core nextaction; retain exports only if usersneed them. |", "", "## Required per-file ledger", "", "| File | Status | Examination / reason |", "|---|---|---|"])
rank={"not reviewed":0,"skimmed":1,"reviewed":2}
resolved=[]
for path in required:
    entries=ledger[path]
    best=max((row for _,row in entries),key=lambda row:rank[row["status"]])
    reasons="; ".join(dict.fromkeys(row["reason"] for _,row in entries))
    cov.append(f"| `{path}` | {best['status']} | {cell(reasons)} |")
    resolved.append({"path":path,"status":best["status"],"reason":reasons})
cov.extend(["", "## Additional configuration, research and documentation", "", "| File | Status | Examination |", "|---|---|---|"])
for path in sorted(set(ledger)-set(required)):
    entries=ledger[path]; best=max((row for _,row in entries),key=lambda row:rank[row["status"]])
    cov.append(f"| `{path}` | {best['status']} | {cell('; '.join(dict.fromkeys(row['reason'] for _,row in entries)))} |")
write("COVERAGE.md","\n".join(cov))
write("coverage-final.json",json.dumps(resolved,ensure_ascii=False,indent=2))

failures={
 "playwright-original":"Product test reliability: coaching.spec Stopclick occurs after fake stream completes;8pass/1fail. Installedbrowser was available, so no missingrevisionfailure here. L-003.",
 "frontend-outdated":"Expected exit1 because updates exist; not a command/build failure. MajorBabylon/Vite/TypeScript/plugin-react/lucide versions behind. N-003.",
 "fresh-install-original":"Product/CI: allowBuilds esbuild value is placeholder text; ERR_PNPM_IGNORED_BUILDS. Cached original installpasses. L-001.",
 "fresh-all-features-original":"Product/CI: include_bytes missing ignored synthetic-oidc-test-key.pem. L-002.",
 "fresh-all-features-workaround":"Generating throwawaykey alone fixes compilation but not committedJWKS;78pass/1signaturefailure/2ignored. Paired key+JWKS workaround needed. L-002.",
 "review-real-replay-payload":"Review invocation: relative fixture path resolves in Cargo cratecwd; absolute review-ownedpath succeeds.",
 "review-typescript-strict":"Additional diagnostic: strictflag finds nullableApp/Coach/Progress/Overview/Transfer and futureball errors. Normalrepo config has strictfalse and buildpasses. F-051/G-019.",
 "parser-characterization":"Review generator: array-return signature parser incomplete; no productioncompile defect.",
 "parser-characterization-2":"Review generator: methodname pattern omitted digit-bearing query; no productiondefect.",
 "parser-characterization-3":"Review generator: defaultmethod swallowed adjacent signature; final exact-source probespass.",
 "before-screenshots":"Review harness: Playwright package import resolved incorrectly; repairedonlyreview script.",
 "before-screenshots-2":"Review harness: React CJS namedexports require explicit aliases; fixedinreview Viteconfig.",
 "playwright-workaround":"Review config: ESM TypeScript wrapper required local type-module manifest; no appdefect.",
 "review-frontend-static-probes":"Review bundler: dependency resolution for siblingreviewfile; correctedreview-onlyaliases.",
 "review-frontend-static-probes-fixed":"Review bundler: packagealiases unresolved; correctedreview-onlyconfiguration.",
 "review-frontend-static-probes-final":"Review bundler: finaldependency entry resolution; subsequent resolvedprobepasses.",
 "experimental-probes":"Review generator/testcompile: missing helper dependency/import; review-onlyfix yields passingprobes.",
 "experimental-ui-state":"Review wrapper ESM Playwright entryresolution; fixedindex.mjs import.",
 "experimental-ui-state-fixed":"Review Vite fsallow cannotread siblingreview HTML; no productioncomponentload occurred.",
 "experimental-ui-state-allowfs":"Review React dependencyalias missing; no productionbug conclusion.",
 "experimental-ui-state-react":"Review/@fs HTML bypassed ReactRefreshpreamble; fixedexplicitpreamble andtestpasses.",
}
summaries={
 "install-original":"PASS cachedworkspace; notfresh-cloneproof.", "fresh-install-workaround":"PASS strict-dep-builds=false CLIoverride,sourceunchanged.",
 "rust-replay-core":"6originaltestsPASS.", "rust-coach-services":"75PASS/2ignoredoriginaltests.", "rust-coach-all-original":"79PASS/2ignored; existingignoredlocalfixturemaskedfreshclonefailure.",
 "rust-workspace-original":"94originaltestsPASS/2ignored onWindows:9Tauri+79services+6core.",
 "frontend-build":"TypeScript/VitePASS; mainchunk1767683B; largechunkwarnings.", "frontend-lint":"ESLintPASS.", "frontend-format":"PrettierPASS.", "frontend-unit":"All23rankartworkchecks/mapping/refresh-budgetassertionsPASS; no generalReactunitcoverage.",
 "discord-unit":"4Node testsPASS; noDiscorddelivery.", "studio-unit":"Frame/camera/score/perspective/assetassertionsPASS; notwiredintoCI.", "frontend-audit":"No known vulnerabilities reportedbyregistryaudit; notsecurityproof.",
 "native-build-original":"OriginalWindowsreleasebuildPASS; MSI19.90MiB/NSIS17.50MiB generated; noapp/installlaunch.",
 "playwright-workaround-2":"9PlaywrighttestsPASS installedChrome,1worker/180stimeout/2retries.",
 "coach-race-five-runs":"5subsequentrunsPASS; originalfailureexists, supplied2/5failurefrequency notreproduced.",
 "security-software-webgl":"PASS Swiftshader/softwareWebGL11.2s undertheoriginal45stimeout; suppliedUbuntu66snotreproduced.",
 "manual-edge-coaching":"PASS review-ownedEdge/output-pathwrapper; originalscriptwouldwritetrackedvalidation.", "manual-edge-security":"PASS review-ownedEdge/output-pathwrapper; providermocks only.",
 "discord-local-synthetic":"PASS local signedHTTPsyntheticintegration; noactualguild/message/upload.", "discord-local-real-clip":"PASS copiedfixtureCLIparse+242195BschematicWebM; local signedHTTPonly.",
 "fresh-all-features-paired-workaround":"79PASS/2ignored usingmatchingthrowawaykey/publicJWKS onlyinreview snapshot; originalfixturesuntouched.",
 "release-worker-three-fixtures":"3releaseWindowsworkerparsesPASS0.981/3.641/1.793s; directworkerbranchdoesnotexerciseparentcontainment.",
 "before-screenshots-3":"66freshreal-AppmockIPCcapturesPASSat3sizes,0pageerrors.", "ui-characterizations":"6UIbugcharacterizationsPASS; pausedrenderCPU/countermeasured.",
 "review-frontend-probes-storage":"6originalcomponentbugcharacterizationsPASS, includingrestrictedlocalStorage andnullablefutureball.",
 "experimental-independent-controls":"11modelcontrolsPASS/2internalchildhelpersignored.", "experimental-ui-state-preamble":"1realproductioncomponentprop-switchcharacterizationPASS; oldAresultsremainonB.",
 "final-controls-workspace-tests":"131PASS/4ignored, including37reviewwrappertests (3contracttests duplicatedfromoriginalmodules). Optionalpayloadprobe defaultdoesnotparsefixture; absolutefixture run recordedseparately.",
 "final-controls-workspace-clippy":"PASS warningsdenied acrossworkspace/alltargets/allfeatures; no warnings.", "final-controls-rust-format":"PASS includingnewreviewtests.", "final-controls-bindings-diff":"PASS0trackedbindingdifference; LF/CRLFadvisoryonly.",
}
commands=[json.loads(line) for line in (OUT/"commands.jsonl").read_text(encoding="utf-8").splitlines()]
test=["# Actual test and measurement report", "", "Target `6762f8c`, Windows/PowerShell, 6 October 2026 local (later command timestamps are7OctoberUTC). Existing developer dependencies and a pre-existing ignored synthetic RSA test fixture are present, so cached passes were explicitly challenged with a clean git archive. No production source/config/lockfile/docs were modified. No provider requests, user-profile/vault/clipboard reads or populate_db execution occurred. Browser provider calls were mocked; external requests from the real-App capture harness were blocked.", "", "## Results that matter", "", "- Original cached frontend build/lint/format/unit and Rustformat/core/services/all-feature/workspace/clippy pass. Original Playwright:8pass/1Stoprace failure. InstalledChrome serialwrapper:9pass. Five laterStoptests pass; softwareWebGL securitytest passes under45s.", "- Fresh archivedsource fails frozeninstall with esbuild ignored-buildspolicy. CLIoverridepasses. Freshall-featurescompile then fails missingPEM; randomkeyaloneproduces78pass/1JWTfailure. Matching synthetic key+publicJWKS in the review snapshot produces79pass/2ignored.", "- Original Windows Tauri release packaging passes75.234swall; MSI19.90MiB andNSIS17.50MiB. No installer or normalnativeGUI was launched, because eager AI-status reads the realglobalvault evenwithQAdata isolation.", "- Final workspace run:131passed/4ignored. Add9exact-source nativecollector characterizations outsideworkspace. Finalfmt/clippy/bindingsdiff pass. These bug-asserting probes demonstrate current failures; a passingreviewtest does not establish correct product behavior.", "- Discord4unit tests, local signedHTTP integration and copiedreplayparse/schematicclip pass. ActualDiscord registration/delivery/upload notrun. Independentreal-component experimentalprop-state test passes as characterization of stale results.", "", "## Original commands, workarounds and every recorded attempt", "", "The rows retain first failures and review-scaffolding failures rather than hiding them with a laterpass. Durations are measured wallseconds including process/Cargo startup and possible contention. Source-inspection/generator rows are also retained. Complete stdout/stderr is linked; commands.jsonl is the machine ledger. Fresh-install/originalfreshcompile rows ran with cwd=review/snapshot and sharedbuildcache; latterpairedworkaround uses explicit snapshotmanifest. Browser/output wrappers are entirely underreview and do not edit the repo configuration.", "", "| Check / exact command | Exit | Wall s | Summary / root cause | Evidence |", "|---|---:|---:|---|---|"]
for row in commands:
    summary=failures.get(row["name"]) if row["exit_code"]!=0 else summaries.get(row["name"])
    if not summary:
        summary="PASS; full command output contains assertions/counts/source evidence." if row["exit_code"]==0 else "Failed review attempt; inspect full output and subsequent fixedrun. No product conclusion inferred from scaffolding."
    test.append(f"| **{row['name']}**<br>`{cell(row['command'])}` | {row['exit_code']} | {row['duration_s']:.3f} | {cell(summary)} | [log](logs/{pathlib.Path(row['log']).name}) |")
test.extend(["", "## Measurements", "", "| Measurement | Actual result | Method / limitation |", "|---|---|---|", "| Frontenddist |16,568,921B/218files; JS3,078,374B |Filesystemafteroriginalproductionbuild; decimalbytes. |", "| Startupmainchunk |1,767,683B; Python gzip464,141B |Vite reported467.16kBgzip withitscompression settings; dynamic viewerEngine wrapper imports coreconstructors frommain, notallBabylon eager. |", "| Rankartwork |23PNGs9,695,742B; largest790,677B |Displayed36–64px; originalsqualitychecks pass. |", "| OpenedrealreplayIPC |9,323,673BtypedJSON for3,803frames/6players |Actualstorage/get-replayserializer, not nativeCDPtrace. Frames12,542,191BJSON /2,033,274Bzstd; compactbody=coachbody160,468Beach; summary1,765B. |", "| IPCmaterialization |debuginflate/Value332ms, Value->typed133ms, serialize222ms |Onecopied3v3fixture, notrelease/nativeIPC latency. |", "| Warmunchangedanalytics |40matches≈97–104ms;400≈991–1265ms |83,762Bsyntheticcompactrecords; reconciledbeforetiming, independentrerun1053ms/400. Notproductionpercentile. |", "| Librarycontext, one mode |24,564characters per1v1/2v2/3v3 |60syntheticmatches20permode24metrics; exactbuilder. |", "| Finalcontext per mode |1v132,776;2v233,759;3v332,776;All47,801characters |Alllibrary72,361chars; selectedmatchheader/allIDscut. Approx4chars/token isnotbilled-tokenmeasurement. |", "| Timelinetool |30srequest->120rows0..7.933s/11,367B |15Hzsyntheticpublic-serviceframes, noactualspan/continuation; independent16KBdispatchcap maydrop entireoversizedresult. |", "| Pausedviewer |25renders/4s; CPUmean2.412ms/p953.2ms/max7.9ms |HeadlessChromeWindows,foregroundWebGLhigh,110meshes774×483canvas;CPUsubmissionnotGPUtimestamp/power. |", "| Playingdiagnostics |cumulative389CPU samplesmean1.177ms/p951.8ms;388intervalsp9566.6ms |Bufferincludesearlierpausedframes:do not convert to pureplaybackFPS. |", "| Simrunnerdeadline |100msbudget->≈914–916msreturn |Safe syntheticparentexits; finitechildholds inheritedpipes900ms. NorealRLTRAIN checkpoint. |", "| Costperanswer |**Unverified / notcurrentlymeasurable** |No providercalls; appdropsusage. Includeplanner/answer/repair/reasoning/cache costs usingconfiguredpriceswithprovenance, neverguessedtariffs. |", "", "### Three copied replay fixtures", "", "Only copied snapshots under review/fixtures were parsed. Original files were not modified. Raw player identities/JSON were not persisted in the logs. There is no independently annotated goldentruth; allthree are2v2/3v3, with no real1v1/overtime/private/tournament corpus coverage.", "", "| Copiedfixture | InputB | Frames/players | DebugCLIs | Releaseworkers | ReleaseoutputB | Replayelapsed/live s |", "|---|---:|---|---:|---:|---:|---|"])
debug=[11.093,43.015,23.985]
for row in read_json(OUT/"measurements-release-worker.json"):
    test.append(f"| sample-{row['fixture']} | {row['source_bytes']:,} | {row['frames']:,}/{row['players']} | {debug[row['fixture']-1]:.3f} | {row['duration_s']:.3f} | {row['stdout_bytes']:,} | {row['duration_seconds']:.2f}/{row['live_play_seconds']:.2f} |")
test.extend(["", "## NOT RUN: each blocked original native command", "", "Windows is available. The block is the reviewconstraint: QAdata does not isolate the realWindowsvault, and unmodifiednative scripts write tracked docs/validation or touchclipboard/processstate. Their source was read; browser-onlyEdge and localDiscordchecks were copied toreview-ownedwrappers andexecuted. No normalnativeApp was started. No additional approval was requested because the task expressly forbids credential reads.", "", "| Originalcommand | Exit / duration | Exact reason |", "|---|---|---|"])
for path in sorted((ROOT/"scripts").glob("test-native-*.mjs")):
    detail="NeedsreleaseAppCDP and realstartupvaultread; writestrackedvalidation/fixedfixtures andcannotrununchanged underwriteconstraint."
    if "export" in path.name: detail+=" Also readsrealclipboard."
    if "restart" in path.name: detail+=" StopsstoredpriorPID andexpectsupgrade-qa binary."
    if "upgrade" in path.name: detail+=" Requiresfixtureupgradeversions/profileworkflow, notjustcurrentbinary."
    test.append(f"| `node scripts/{path.name}` | NOTRUN / n/a | {detail} |")
test.extend(["| `node scripts/test-coaching-ui.mjs` | NOTRUNoriginal / n/a |Writestrackedvalidation; review-ownedEdgewrapperpasses. |", "| `node scripts/test-frontend-security.mjs` | NOTRUNoriginal / n/a |Writestrackedvalidation; review-ownedEdgewrapperpasses. |", "| `node scripts/test-discord-local.mjs` | NOTRUNoriginal / n/a |Writes.local/validation andinheritsenvironment; review-ownedminimal-envwrapperpasses syntheticandcopiedfixture. |", "| `./scripts/launch-test.ps1` | NOTRUN / n/a |ExplicitlyremovesQAisolation andopensnormalprofile; outsideauthorizedscope. |", "| `node scripts/populate_db.mjs` | FORBIDDEN / n/a |Userexplicitlyprohibits it; sourceonly inspected. |", "| Linux/macOSworkspace/package | NOTRUN / n/a |CurrenthostWindows; missingdeclaredicons sourceconfirmed. Linuxsystemlibraries/buildpanic/schema generation notreproduced. Cloudsetupscriptprovidedbutnotexecuted. |", "", "## Ignored tests and open verification gates", "", "Two existing tests remainignored: ai::tests::live_synthetic_coach_stream (realprovider expresslyforbidden), reenrich::tests::real_snapshot_reenrichment_end_to_end (separaterequiredsnapshot fixture/environment). The twoignoredreviewpipe tests are internalchildhelpers invoked by the deadlinecharacterization, not skippedvalidationcases. Native job-object tests do run in the9Tauriunit tests using syntheticchildren, but directreleasefixtureworker invocation does not test itsparent limits.", "", "Unverified: liveOpenAI/NeoToken/SIWC compatibility, actualusage/cost andproxyretention; nativeGUI/WebView2interaction; cleanmachineinstaller/upgrade; realRLTRAINmodel/checkpointfidelity; maliciousOOM replay; GPUenergy/realhardware/DPI/highrefresh/longsession; screenreaderNVDA/JAWS; independenttactical/metric goldentruth and1v1/unusualplaylist fixtures; realDiscorddelivery. Securityfindings do notclaim a completedexploit. Competitorfeatures are primaryvendor claims, nothands-onperformanceproof.", "", "Freshscreens:66real-AppmockIPC before captures plus18mockupcaptures at1280×720,1440×900,1920×1080. Additionalvalidation/screenshots isolate bugs. Staticmockups are designproposalswithsyntheticdata andinlineassets, not implemented productionfeatures.", "", "## Reproduction and cleanup", "", "Run review/serve_harness.mjs after appdependencies exist, then capture_before.mjs/validate_ui.mjs. The harness uses realApp and@tauri-apps/api/mocks; it neverstartsTauri/vault. Wrapperconfigs/generators are review-owned. Parserprobe generator copiesexactproductioncollector source into a separate reviewcrate andrecords itsmethod. AI/modelgenerators extractexactprivatefunctions; publicServiceprobes use tempdirs. Logsretain allfailedattempts. Sourceandbindingsdiff is checked aftertests.", "", "The fresharchive/dependencytree/private throwawaykey and generatedreviewbundler caches are temporaryinputs/buildoutputs, removed after evidencecapture. Logs, generators, reviewtests, screenshotmanifests and mockups remain. No realprofile ororiginal replay was removed. See PLANS.md forfinalcleanup/check state."])
write("TEST_REPORT.md","\n".join(test))
print(json.dumps({"findings":len(findings),"severities":dict(counts),"required_files":len(required),"commands":len(commands),"leads":48}))
