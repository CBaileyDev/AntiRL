from pathlib import Path
from auditlib import ROOT
import json

special={
'app/src/styles.css':('skimmed','Relevant layout, focus, timeline and palette selectors inspected. Design reviewer owns full selector/copy/accessibility audit.'),
'app/src/arenaMesh.ts':('skimmed','Generated quantized/base64 stadium geometry metadata and use in viewerScene checked; encoded vertex payload not hand-reviewed.'),
'app/src/bindings.ts':('skimmed','Generated IPC request/response signatures, nullable frame/metric types and domain exports examined; generator output not manually reviewed line by line.'),
'app/src/data/coach-prompts.json':('skimmed','Frontend prompt use traced; AI reviewer owns full policy/prompt review.'),
'app/src/data/metrics.json':('skimmed','Formatter/dictionary consumers checked; parser and AI reviewers own authoritative metric semantics.'),
'app/src/data/research-cards.json':('skimmed','Research UI/rendering path checked; experimental reviewer owns scientific claim/source review.'),
'app/src/data/training-packs.json':('skimmed','Frontend catalog/search/copy flow checked; AI reviewer owns codes/source validity.'),
'app/src/components/XgPanels.tsx':('skimmed','Props and request lifetimes inspected; experimental reviewer owns scientific/scope/stale-result findings.'),
'app/src/components/BotLikenessPanel.tsx':('skimmed','Props and request lifetimes inspected; experimental reviewer owns scientific/scope/stale-result findings.'),
'app/src/components/DetectorPanel.tsx':('skimmed','Component integration inspected; experimental reviewer owns model claim/verdict details.'),
'app/src/components/SimSettings.tsx':('skimmed','Settings and path IPC inspected; experimental reviewer owns simulator workflow/status validity.'),
'app/src/surfaceTextures.ts':('skimmed','Seeded procedural texture algorithm and allocation/initialization use examined; no independent visual/material numerical oracle.'),
}
ledger=[]
for p in sorted((ROOT/'app/src').rglob('*')):
    if not p.is_file():continue
    path=p.relative_to(ROOT).as_posix()
    status,reason=special.get(path,('reviewed','Source read and call-site/contract/lifecycle checks; fresh real-App screenshots or original component characterizations used where applicable.'))
    ledger.append(dict(path=path,status=status,reason=reason))
(ROOT/'review/coverage-frontend.json').write_text(json.dumps(ledger,indent=2),encoding='utf-8')

leads={
'29':dict(status='confirmed',findings=['G-009','F-050'],detail='State routing, implicit first replay, App state ownership and browser {} success confirmed. aria-current handled design reviewer.'),
'30-citation':dict(status='confirmed',findings=['G-005'],detail='Real-App chip84.6 -> actual0 reproduced.'),
'30-prefill':dict(status='confirmed',findings=['G-008'],detail='Real-App clear/navigate/return reintroduces old draft.'),
'30-cancel':dict(status='confirmed',findings=['G-007'],detail='Real-App navigate Progress during stream emits cancel_ai.'),
'30-full-replay':dict(status='refuted',findings=['G-010'],detail='It invokes get_coach_replay compact record, not full frame replay. Repeated per-bubble compact requests remain confirmed debt.'),
'30-export':dict(status='confirmed',findings=['G-012'],detail='TXT depends innerText of mounted DOM; canonical data used for other formats.'),
'30-input-live-height':dict(status='confirmed',findings=[],detail='Single-line composer, aria-live off, calc height ignores native titlebar; design reviewer records findings.'),
'31':dict(status='confirmed',findings=[],detail='Raw instructions/player IDs and Do not assume recorder text in Ask Coach draft; design reviewer owns copy finding.'),
'32-draft':dict(status='confirmed',findings=['G-006'],detail='Unsaved Draft overwritten Nova after simulated import refresh.'),
'32-save-style-status':dict(status='confirmed',findings=[],detail='One Save covers multiple cards, undefined sage-line, disabled pending live verification copy; design reviewer owns visual/copy detail.'),
'33':dict(status='confirmed',findings=[],detail='Esc onClose marks skipped; finish save catch only console;15profile inputs. Design reviewer owns onboarding.'),
'34-mode':dict(status='confirmed',findings=['G-002'],detail='Hardcoded 2v2 Competitive/rank_2v2; whole-library win-rate confirmed.'),
'34-numbers':dict(status='confirmed',findings=['G-001'],detail='SSR proves absent identity becomes another player victory and unknown scores become0-0 defeat. UI raw Blue/Orange score, invented DFH/player count fallback confirmed; design copy finding owns fallback labels.'),
'35-dialog':dict(status='confirmed',findings=[],detail='Fresh capture inline dialog; root runtime focusOutside/Escignored. Design reviewer owns accessibility.'),
'35-library':dict(status='confirmed',findings=[],detail='No sorting/virtualization/pagination; .sr-only missing. Design reviewer owns library/accessibility.'),
'36':dict(status='confirmed',findings=['G-003','G-013'],detail='SSR missing percentages0; all hardcoded goalsfalse; no trend chart.'),
'37-playhead':dict(status='confirmed',findings=['G-018'],detail='Parent seekTime does not track viewer clock/scrub.'),
'37-layout':dict(status='confirmed',findings=[],detail='Five experimental panels before ReviewNext and small timeline targets; fresh screenshots confirm fold. Design reviewer owns layout/a11y.'),
'38-bundle':dict(status='confirmed',findings=['H-001'],detail='Static camera/viewerEngine graph defeats dynamic import; Vite warning and measured main chunk.'),
'38-ranks':dict(status='confirmed',findings=[],detail='Root measured rank artwork size and design reviewer owns asset optimization finding.'),
'39-idle':dict(status='confirmed',findings=['H-002'],detail='Source target15paused; real headless paused25renders/4s proves ongoing submissions, noGPU-power claim.'),
'39-ray-percar':dict(status='refuted',findings=['H-003'],detail='Flat-turf fastpath skips per-car rays. Wall/cove car rays and near-ground chase collision repeat on paused renders.'),
'39-remount-storage':dict(status='confirmed',findings=['H-004','H-005'],detail='Object identity remount; throwinglocalStorage SSR proves preference failure escapes.'),
'39-shortcuts':dict(status='confirmed',findings=[],detail='Wrapper focus required; CSS removes canvasoutline; design reviewer owns keyboard/focusfinding.'),
}
(ROOT/'review/leads-frontend.json').write_text(json.dumps(leads,indent=2),encoding='utf-8')

report='''# Frontend and viewer review

Verdicts: G frontend **needs work**; H viewer **needs work**; F IPC frontend **needs work**. Original React components, generated nullable contracts, every app source file ledger, full source/data-flow checks,66fresh screenshots at three sizes and real-App deterministic UI characterizations examined. Palette is intact and scene has substantial working rendering/disposal code; core identity/result, asynchronous selection and coaching navigation contracts are unreliable.

## Fresh screens examined directly

- Overview1440x900: primary1s harness still presents2v2/DiamondII; counts and result scope ambiguous.
- Progress1440x900 and empty1280x720: no longitudinal chart; placeholder goals remain In Progress; missing percentages displayzero.
- Studio1440x900: large canvas competes with five experimental panels before ReviewNext; transport lies below fold. Visible playhead and Lab anchor are different states.
- Coach1280x720: upper controls/context consume most height, evidence citation lacks seek, single-line composer and thread constrained; design reviewer documents layout and confidence/copy solution.
- Librarydelete1280x720: destructive dialog is inline and lacks focus containment; root reproduced Escape and Tab failures (design owns finding).
- Settings1280x720: separate concerns share Save; auto-import refresh destroys drafts.

## Runtime evidence

`UI_VALIDATION.json`: all6targeted failures confirmed (citation0instead84.6, dirty settings loss, late replay overwrite, stale draft resurrection, navigation cancellation, dialog focus/Escape). Viewer paused25renders/4s, CPU mean2.412ms/p953.2ms;110meshes, high quality, WebGL774x483. CPU submissions measured; GPU/energy/hardware not measured. Playing diagnostics include mixed paused samples and must not be stated as pure playbackFPS.

`review_frontend_probes.tsx` bundles original components and asserts6defects: absent selected identity becomes100%own win, unknown scores0-0DEFEAT, missing percentages0%, positive overtime losesOT, nullable future ball crashes successful trajectory, throwing preference storage crashes viewer initializer. All6pass as characterization tests. Future-gap sim plot uses a valid start; backend reconstruction gate checks preceding free-flight leg only. The simulation provider itself was not launched.

`tsc --noEmit --strict` exits2 and catches the null-ball bug plus nullable App/Coach/Overview/Progress/Transfer contracts; normal build succeeds because strict=false.

## Disproved/qualified prior leads

- Coach citation requests are compact get_coach_replay, not frames/full getReplay. Per-bubble fetch duplication remains.
- Per-car raycast every frame is false for flat turf. Wall/cove raycasts and selected-camera collision repeat; no isolated raycast CPU estimate.
- GPU scene cleanup is registered immediately after scene construction and later replaced with complete cleanup; scene/engine are disposed on error/unmount. No routine GPU-resource leak asserted.
- TimelineMarkers is memoized; React/HUD publishes10Hz while renderer reads a ref; copied transforms, binary frame search, hidden-document early return, pixel ratio cap and mesh-fetch retry cache are useful existing optimizations.
- Coach session selection already catches error at handler; no unhandled-selection finding.
- Main/references selection races, provider model race and page-owned operation lifetimes need common resource-query solution.

## Architecture plan input

Implement route/resource identity before page redesign. Give transport, replay identity/result resolution, conversation generation, settings drafts and playback clock explicit owners; make nullable telemetry a valid product state. Lazy-load Studio/Babylon and retain one engine. Replace static goals with scoped data objects and canonical transcript/evidence links. Design reviewer supplies accessible primitive layer, visual layouts and disclaimer budget.
'''
(ROOT/'review/FRONTEND_REVIEW.md').write_text(report,encoding='utf-8')
print('Frontend ledger, leads and report written')
