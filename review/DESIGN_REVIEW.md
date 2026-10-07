# AntiRL: product and design review

Review date: 6 October 2026. Review-only; no application source or existing documentation changed. The proposal preserves AntiRL’s navy/near-black surfaces, indigo/violet accent and team blue/orange. It changes the job of the interface: **one useful decision → a replay moment → a short drill → a check in later games**.

The current app has a recognizable identity, an impressive local viewer and several pieces of a coaching loop. It presents those pieces as a catalog of subsystems. The serious ranked player has to interpret neutral statistics, navigate diagnostic panels and assemble the next step themselves. Honesty is mostly expressed as negation and method text. That is a product defect, not a reason to remove honesty.

## Evidence and limits

- Fresh real `App` captures: `review/screenshots/before/manifest.json`, 66 screenshots at 1280×720, 1440×900 and 1920×1080. The harness renders the source components with `mockIPC`, review-owned synthetic 40-game data across the three modes, conversations and practice. Empty/new/loading/error and streaming/delete states are included. No real profile or credential is used.
- Visually examined: all seven populated routes at 1440×900; all seven empty routes and all four onboarding steps at 1280×720; loading/error, streaming and delete; additional Studio/Coach small-window views. Captures are evidence for layout and states; the synthetic numbers are not measurements of a real player.
- Browser interaction checks: `review/design_probe.mjs` and `review/DESIGN_VALIDATION.json`; root `review/validate_ui.mjs` and `review/UI_VALIDATION.json`. Focus and computed-label checks actually ran. Seven Settings controls have no persistent associated label. Independent accessibility-tree inspection (`DESIGN_INDEPENDENT_VALIDATION.json`) finds four truly unnamed controls and three that fall back to placeholder names. Modal focus leakage, missing current-page semantics, Studio scrubber at y=966 in a 720px window, and a Coach composer below the200% equivalent viewport are confirmed. The720px normal-width Coach composer is visible; its thread is only about191px high. This is browser evidence, not an NVDA/JAWS certification.
- Source census: `review/design-census.json`: 4,042 CSS lines, 48 redefined literal selector strings under the documented lexical algorithm, 25 font-size values, 156 JSX inline-style openers, 55 candidate unreferenced classes, 55 hexadecimal occurrences outside `:root`. These last two counts are candidates/occurrences, not an assertion every class is dead or every literal is wrong. The prior 57/88 counts are not reproducible using this method.
- Hedge inventory: `review/DISCLAIMER_INVENTORY.md`:137 matching source lines and 40 `unavailable`occurrences across TSX/data after broadening the lexical set to include self-report, heuristic, proxy and estimate terms. It explicitly separates code/type/status tokens, prompt policy and visible/data-backed copy. These are not137 distinct rendered disclaimers.
- Native DPI, touch, screen-reader speech, real hardware GPU cost and provider conversations are separate verification gates. The mockups are static specifications; no production router, analytics calculation or live provider is implemented.

## Verdicts

| Area | Verdict | Checked / implication |
|---|---|---|
| I · Design system and visual design | **Needs work** | Tokens, typography, inline styles, duplicate/dead candidates, native controls, rank assets, team/status palettes, all fresh pages. Identity works; system and component boundaries do not. |
| J · UX, IA and copy | **Needs work** | Every route and key state; onboarding, import/delete, chat streaming/composer, practice/transfer, Settings. The default path does not reliably answer “what should I do next?” |
| K · WCAG 2.2 AA | **Broken** | Focus/modal interaction and control labels actually checked; contrast computed; keyboard paths, selection states, live-region and motion source reviewed. Dialog behavior, labels and small-text contrast need launch gates. |
| O · Coaching product | **Needs work** | Proposed observation→review→practice→transfer loop; opportunities linked to parser coverage and experimental-model audit. Refuse invented grades/forecasts while still delivering concrete useful advice. |

## Current-page critique

### Shell and navigation

See `before/overview-1440x900.png`, `before/coach-chat-1440x900.png`, `before/settings-1440x900.png`.

The shell uses 244px for seven destinations and repeats a 38px title bar, 56px top bar and page heading. The active violet rail, quiet dark surfaces and bundled Inter are worth keeping. “Studio / Coaching / Account” organizes code subsystems rather than a player journey. Replay Studio is a global destination that silently opens a default match; it is primarily a detail route. Teammates earns an entire route for a sparse table. Navigation has no URL/deep-link/history contract or `aria-current`, and route titles are visual divs rather than useful document headings (G-009, K-006).

Proposal: four stable destinations — **Today, Matches, Coach, Progress** — with Settings in the player footer. Replay Studio is reached through a match or moment; a recent Studio shortcut may remain in command search. Reduce desktop rail to 176–192px; at small windows collapse labels into a 72px rail with accessible names and tooltips. Do not shrink hit targets to gain space. Preserve a conventional Windows title bar and include its actual height in every workspace calculation.

### Overview → Today

See `before/overview-1440x900.png`, `before/empty-overview-1440x900.png`, `before/startup-loading-1280x720.png`.

The hero gives name/rank, a hardcoded2v2label and “Calibrate Profile.” Four generous KPI tiles follow; three are neutral kinematics and one is win rate with problematic identity/scope handling (G-001/G-002). “Zero guessed statistics” competes with invented missing map/player fallbacks. Rose flame styling makes boost at speed look bad even while text says it is not proven waste. Neutral statistics cannot carry a coaching verdict. In the empty state0%and dashed tiles preserve a dashboard-shaped hole; the page asks for calibration before demonstrating value. A loading capture looks like an empty account rather than a loading state. Independent disproval found Review Last Match is a working, visible primary CTA; the absent focus/drill is a P2 product hierarchy defect, not broken navigation.

Today should show one active focus in plain language, an evidence link, a 10-minute drill and the next-match cue. A small practice-loop card shows review, completed sessions and eligible follow-up games. Recent matches are player-relative reports, not only launch links. Trends sit below the focus and remain neutral unless a user goal gives a direction meaning. If there is no focus yet, the hero says **“Import one match. Find your next useful decision.”** No empty KPI grid. Confirm identity after import; do not assign the recorder or first player as the user.

### Replay Library → Matches

See `before/replay-library-1440x900.png`, `before/empty-replay-library-1280x720.png`, `before/delete-dialog-1440x900.png`.

Search and mode filter are familiar. The table provides usable participant tags but exposes raw ISO UTC strings, storage-oriented names and Blue–Orange scores. Import results consume a full card even when collapsed. It offers Studio and deletion but no report/review state or next useful focus. Large libraries need sorting and virtualization. A failed import needs a reason/retry without burying the rest of the library. “Demos folder” assumes the player knows game filesystem jargon.

Delete is visibly an inline card, not a modal; violet primary deletion looks like a positive action. Keyboard focus stays on background, Escape does nothing and the destructive request closes before success. Keep the source-file distinction, but call the imported snapshot **“AntiRL’s copy”**. Use a proper alert dialog, Cancel default focus, destructive semantic color, specific match name, explicit future-auto-import exclusion and visible retry. Persist the dialog until operation success. Give tombstoned items a restore route.

New Matches: sortable mode/date/result/review-status table, player-perspective score, local time with exact tooltip, review-focus chip, pin/bookmark and typed filters. Detail opens Match Report. Participant detail becomes a scoped drawer and filter, replacing global Teammates. Bulk actions need explicit item count and reversible local exclusion, not an accidental source-file operation.

### Replay Studio

See `before/replay-studio-1440x900.png`, `before/replay-studio-1280x720.png`, `before/empty-replay-studio-1280x720.png`.

The actual arena reconstruction, replay camera and broadcast HUD establish the app’s strongest differentiator. The useful study interaction is weakened by the canvas taking a fixed 600px height, controls stacked below it, and the timeline reaching y=966 at 1280×720. Forms and explanatory text split the canvas from transport. The right rail leads with reference/bot/xG/simulation panels, with Review next beneath five laboratory rows. At 1440 all three review moments are nevertheless visible (heading y≈529.5); this is a P2 hierarchy defect, not a claim review is blocked. Canvas keyboard controls also provide an alternative to the below-fold scrubber; they do not let a mouse user see playback and scrub together. Tiny pins overlap scrub input. The single-plane timeline does not express team ownership, goal/touch/review distinction or discontinuity. The empty-state full-width button is too broad for a simple browse action.

New Studio fills the route height: stage + 300–360px docked rail; 120–140px event timeline at bottom; transport overlaid on the stage. Keep a camera selector, shortcuts and quality in a compact stage menu. Context-sensitive **Review / Events / Stats / Lab** tabs; Review is default. Move bot identification out entirely per experimental audit; experimental xG/reference policy rollout only in opt-in Lab. The minimap belongs within the stage, not in another card. User-reviewed good choices should be reference moments, not only errors.

Review a moment with 3 seconds of lead-in, optional bounded loop and before/after markers. Clicking a citation updates `/matches/:id/studio?t=84.6&player=:id`; seek occurs after frames load and never resolves to 0:00 silently. “Ask Coach” passes a typed moment intent and context; internal safety instructions never populate user input. An event list is the keyboard/text equivalent of colored timeline lanes. Viewer paused/hidden GPU behavior is a separate H-area launch gate.

### Coach

See `before/coach-chat-1440x900.png`, `before/coach-streaming-1440x900.png`, `before/empty-coach-chat-1280x720.png`, `validation/coach-200-percent-equivalent.png`.

Conversation search, history, context scope, source links and stop control are valuable. The stacked toolbar is visually dominant: conversation select, search, mode, focus, rename/archive/export, drawers, provider/sample badges and selected match. Around 300px are used before the thread. The single-line composer cannot support an explanation of a play. Quick-prompt pills are too broad and some request teammate comparison when no relevant match is loaded. Sample counts for all modes appear even in a single-mode conversation. The empty-state greeting narrates telemetry limitations rather than offering a first useful action. Offline behavior must be a quality mode, not a less readable fallback.

New full-height workspace: left searchable conversation list, center readable thread, right evidence panel. Header chips: mode, eligible window, selected match and focus; editing opens a bounded context popover. Conversation actions in one menu. A coach answer follows **Focus / Evidence / What to do / Drill / Next-game cue**, with one initial priority. Strength moments establish what to repeat. Citations are verbs: **Play 1:24**, not opaque IDs. The right panel shows one or two relevant moments, coverage and exact manifest on demand.

Composer grows to 5 lines, then scrolls; Enter sends, Shift+Enter newline, configurable preference; IME composition never submits. Send/Stop state is independent of route mounting. Background generation continues and exposes a completion badge; Stop cancels transport/tool execution and gives an explicit stopped record. Scroll follows only when already at the bottom; selection or wheel-up preserves reading anchor and reveals Jump to latest. Screen-reader status announces start/completed/stopped/error without reading every token.

Provider consent happens once per materially changed endpoint/categories, with a durable readable record. Main composer shows **Offline**, estimated price range, or actual token/cost data when known. A cost estimate is not a charge quote; missing current prices show **Usage-based**. The full preview lives in a drawer. No provider call is performed by this review or mockup.

### Progress & Goals

See `before/progress-goals-1440x900.png`, `before/empty-progress-goals-1280x720.png`.

Per-mode control is a useful start. The page repeats the Overview metric cards and overlays methodology paragraphs. A row of W/L tiles is form history, not a trend. Replay intelligence, practice and transfer are spread through long stacked panels. Coaching Goals use hardcoded `ok:false`, so “In Progress” cannot reflect actual goal state (G-013). Missing data defaulting to zero is a correctness defect, not a nice empty state (G-003). Speed/boost averages alone do not prove practice success.

New Progress uses mode + 10/25/50 eligible-game controls, honest trend lines, sample coverage and baseline. One focus metric at a time; other charts through a metric selector. Show individual games lightly and a clearly defined rolling mean; gaps remain gaps. Chart coordinates, text table and exact sample export agree. Practice is a real object with original cue, authored drill, user completion time, eligible baseline/follow-up IDs and reviewed outcomes. “Changed after practice” is descriptive; causal effectiveness is not asserted from before/after alone. A self-check is labeled self-reported. User goal direction can color goal progress; raw metric deltas remain neutral.

### Teammates

See `before/teammates-1440x900.png`, `before/empty-teammates-1280x720.png`.

A clean table but little coaching value: two rows and a mostly empty window, raw last-played timestamps, relationship win rate without mode-specific context. Top-level navigation overstates its role. Consolidate into participant detail from Matches, with mode/sample context and “Show shared matches.” Avoid adjudicating teammate blame from score or a thin record. Teammate comparison belongs in an actual report/review sequence where both players’ context is visible.

### Settings

See `before/settings-1440x900.png`, `before/empty-settings-1280x720.png`.

Replay folder and identity appear early, which is useful. The simulator is a full panel before AI provider controls, despite being a niche optional dependency. Three general/provider sections share one save; independent credential and memory actions share the same long surface. Drafts can be wiped by background settings refresh (G-006). Seven fields lack programmatic labels. The undefined `--sage-line` token drops one consent border. Release-status copy exposes an unfinished disabled sign-in option.

New Settings tabs: **Import, Player, Coach & privacy, Accessibility, Advanced**. Each owns save status and draft conflict handling. Import shows watcher state, last successful scan and retry/import queue. Player shows confirmed ID/name, mode rank provenance and progressive goals. Coach shows endpoint, storage/key status, test-with-stub-only in development and consent categories; secret values never displayed/exported. Accessibility controls font scale, motion, camera comfort and shortcuts. Advanced holds explicit opt-in lab dependencies and diagnostic export. General users should not see missing registration identities or developer verification gates.

### Onboarding, loading, empty and error flows

See `before/onboarding-step-{1,2,3,4}-1280x720.png` and startup captures.

Four modal steps are unnecessary before the app has provided value. Fifteen rank/time controls in step 2 are a large ask; roles like Defensive Anchor encourage static tactical identity. Tone is expressed as a separate persona character with unearned precision/exhaustive waste promises. The modal does not capture focus, and Escape discards fields then saves skipped. Finish rejection is console-only. Native selects visibly leak default compact chrome in step 1.

New first-run: detect/choose an authorized folder or individual file; import; confirm the actual account among detected players; select main mode and optional current rank; open first report. Folder discovery does not authorize importing an unrelated directory. If no replay exists, show where Rocket League saves it and let the user continue without inventing an identity. Do not promise detection before first import. Save the setup draft; close retains it; explicit Do this later is reversible. Ask practice availability when a drill is chosen. Choose supportive default tone; offer Direct/Supportive later without changing grounding rules.

Every route distinguishes **loading / empty / partial / error**. Loading uses semantic skeletons and a short status, without 0% placeholder statistics. Empty offers one clear action. Partial keeps healthy library usable with a count of excluded/bad records. Error offers Retry and diagnostics detail; Dismiss hides a notice, not the actual failed-state explanation. Startup corruption repair is a backend gate (B-001), not merely a prettier alert.

## Research judgment

Read root research sections 00, 02, 03, 08 and self-critique, plus `docs/archive/reviews/RESEARCH_AUDIT.md`. Those are design hypotheses with repository-derived citations, not a calibration dataset.

Keep: metric semantics and units; separate measured physical facts from tactical interpretation; mode scope; no arbitrary grade/MMR/rank timetable; sourced pack codes; user identity confirmation; a bounded focus/drill/cue loop. A number labeled null stays null. The existing audit is right to reject unsupported grade weights, imported sample-size thresholds and universal boost targets.

Challenge the over-conservative direction too: “positions do not prove blame” does not prohibit displaying a synchronized replay sequence and asking the player to review a decision. Unknown intent does not mean every useful recovery/goal-side/shadow window must be absent. A repeatable geometric predicate can yield an **Estimated review candidate** with false-positive controls, mode-specific exceptions and human confirmation. “One priority” is the default cognitive budget, not a ban on secondary observations when the player explicitly asks. Generic practice can be useful even when not causally proven; label it authored rather than filling a card with promotion disclaimers. A fixed 20-game reassessment is not scientifically superior to 10 without power and clustering evidence; make the milestone explicit and adjustable to coverage. The spec’s universal challenge rules are tactical hypotheses, not enforcement policies.

Implement direct-data features first: recorded goal/demo/touch timelines with clear provenance; relative positions, boost coverage and replayable sequences; validated boost-pad pickups, route geometry and boost overfill; kickoff approach/outcome segmentation once kickoff exclusion is repaired; mode-scoped you-vs-opponent deltas; time-weighted heatmaps and goal-side estimates. Rotation roles/double commitments, recovery efficiency, touch quality, 50/50 outcome and shadow-defense windows need definitions, labeled examples and falsification before coaching as established mistakes. Do not require a rank forecast or single composite score to make these useful.

## Information architecture and route contract

| Route | Main job | Persisted / typed state |
|---|---|---|
| `/today?mode=2v2` | One current focus and next session | Mode, active goal/cycle, last acknowledged report |
| `/matches?mode=2v2&sort=played-desc&review=unreviewed` | Find a match or sequence | Filter/sort/cursor; identity from confirmed profile |
| `/matches/:id` | Post-match report | Perspective account, metric/source version, cited moment IDs |
| `/matches/:id/studio?t=84.6&player=:id&camera=top` | Inspect/play one decision | Time in seconds, perspective, camera, selected moment |
| `/coach/:conversationId` | Focused answer with evidence | Conversation scope, generation job, context manifest revision |
| `/progress?mode=2v2&window=25&metric=low-boost` | Observe own trend and transfer | Eligible window/cycle, compatible metric version |
| `/settings/:section` | Configure and manage privacy | Section draft/revision/save state |

Route params validate IDs and finite nonnegative times; cap time to replay range. Navigation restores last route and scroll; moment links restore identity/replay/time exactly. Deleted replay routes show a specific missing-item state with Restore/browse action. Back returns to the originating list/chat, preserving its scroll. Avoid page-local replay refetch on every message; summary, compact coach evidence and frame stream are distinct query keys.

Ctrl+K searches matches, moments, conversations and safe commands. Two sections separate search results from actions. Arrow keys navigate; Enter opens; Escape returns focus. Query never runs a provider automatically. “Delete all” is not a command-palette shortcut without an explicit reviewable selection. Ctrl+O import, Space play, arrows/frame-step and marker navigation work when appropriate; shortcuts do not capture typing or IME. An accessible shortcut help dialog lists conflicts and remapping.

## Design-token specification

No new color identity is needed. Split global raw palette from semantic tokens; no page invents a color, numeric font size or arbitrary radius. Keep a small explicit high-contrast set for text.

| Role | Value / rule |
|---|---|
| Surfaces | canvas `#080a0f`; rail `#0c0f17`; panel `#121722`; raised `#182030`; selected/soft `#20293d` |
| Text | primary `#f8fafc`; secondary `#a8b4c8`; muted `#94a3b8`; disabled uses muted plus disabled semantics, never faint alone |
| Faint | retain `#64748b` for non-text chrome. It is 3.767:1 on panel and 3.426:1 on raised; normal text needs 4.5:1. |
| Brand / actions | brand remains `#6366f1`; small-text primary fill `#4f46e5` +white (~6.29:1), hover `#4338ca` +white; accent text `#a5b4fc` or `#818cf8`; focus ring `#a5b4fc`. White on brand 6366f1 is only4.467:1 and f8fafc is4.269:1, so do not use those pairs for normal-size control text. |
| Teams | `team.blue=#38bdf8`, `team.orange=#fb923c`; material aliases share a single authoritative export. Never interpret team color as good/bad. |
| Status | positive `#34d399`, warning `#f59e0b`, destructive `#f43f5e`; separate info semantics from team blue. Status includes text/icon. |
| Borders | default white8%; strong white16%; interactive focus uses opaque accent-text. Validate non-text contrast on custom control borders, not only text. |
| Space | 4,8,12,16,20,24,32,40,48,64px. Card padding20/24; small card16; row gap12/16. No one-off 13px margins for alignment. |
| Radius | control8; card12; large stage16; badgepill. Do not put pill radius on every CTA. |
| Elevation | flat surfaces for hierarchy; elevation1 `0 4px 14px #0005`; overlay `0 20px 40px -15px #0009`. Glow only a bounded focus/playback cue. |
| Type | bundled Inter; 12/18 metadata,14/21 UI/body,16/24 long coach text,20/28 section,24/32 verdict,32/40 page. Weight400/600/700. |
| Numerals | `font-variant-numeric:tabular-nums`; statistics use Inter, code font only for training codes/technical detail. Align units separately and consistently. |
| Motion |100ms press,160ms state fade,220ms panel; opacity/transform. No looping decorative glow. Reduce preference disables decorative motion; camera movement comfort independently configurable. |
| Layers | stage0; sticky20; popover40; modal60; toast80; tooltip90. Portals and focus order remain coherent. |
| Target |44px default control height;24px minimum event/secondary hit area with spacing; timeline glyph may be smaller inside its target. |
| Reading measure | thread68–78ch maximum; evidence rail300–360px; Today canvas max1560px. Expanded empty gutters are not added automatically at1080p. |

Default text/contrast gate includes actual composite surfaces, hover, disabled, selection, focus, error and blue/orange team tags. Do not keep a low-contrast label and attempt to excuse it with a tooltip. Zoom to200%, resize to720×450 equivalent and verify compositor/input remains reachable. Windows100/125/150/200% DPI is a separate native matrix.

Normative thresholds and interaction expectations were checked against primary W3C guidance in this run: normal text requires4.5:1, large text3:1; ratios are not rounded up to pass. [WCAG2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). The minimum pointer target is24×24CSSpx with defined spacing/equivalent exceptions, so K-010 is a usability/exception-audit finding rather than an unconditional conformance failure. [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Dialogs need actual focus containment, a deliberate Escape behavior and focus restoration; declaring `aria-modal` is insufficient. [ARIA APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Accessible primitive inventory

Use current native controls where they fit. A new headless dependency is justified only by behavior and tested parity, not taste. One wrapper library owns semantics and styling; page components consume it.

| Primitive | Contract / states |
|---|---|
| Button / IconButton | primary/secondary/quiet/destructive; loading/disabled; named icon; ≥44px primary; no nested interactive controls |
| Field / TextInput / Textarea | label/description/error IDs; optional/required; draft preserved; IME; auto-growing composer with max-height |
| Select / Combobox | native wrapper for finite choices; custom searchable model list only when necessary; label, keyboard, no secret text |
| Switch / Checkbox / RadioGroup / Segmented | native role/state; focus and disabled parity; selected state announced; mode context explicit |
| Dialog / AlertDialog | initial focus, containment, inert background, Escape policy, return focus; visible async error; no destructive close-on-request |
| Popover / Tooltip | trigger name, focus management; Escape; tooltip never sole explanation; definition accessible to keyboard/touch |
| Tabs | active `aria-selected`, roving focus, panel ID; bounded rail scrolling; Lab opt-in persists separately |
| Toast / Status / ErrorState | concise live status, dismiss where appropriate, retry/context; durable error remains in affected surface |
| Slider / Timeline | named value with formatted time; arrows/Home/End; event targets separate from scrub; text list equivalent |
| Stat / Comparison / Sparkline | units, null vs0, compatible version/denominator, baseline sample, neutral delta by default, accessible table |
| ConfidenceBadge / CoverageChip | typed measured/estimated/experimental and based-on-N; does not imply tactical causality |
| MomentCard / Citation | stable replay/player/event ID and start/end; play/loop; strength/review; reported missing state |
| DrillCard / Goal / PracticeCycle | authored provenance, feasible duration, completion source/time, cue, success criterion and checkpoint |
| DataTable / VirtualList | sort announced; stable row keys; one interactive row action; selection/bulk count; keyboard/text access |
| VisuallyHidden / SkipLink | one proven utility; no free-form missing `sr-only`; focus-visible skip to main |

## Confidence and disclaimer budget

**Measured**: a defined directly observed quantity with compatible metric version, unit and eligible denominator. It says nothing about optimality or intent. **Estimated**: a reproducible inference/heuristic/tactical read with known input coverage; use “Review…” language and user confirmation. **Experimental**: calibration/validation is not ready for coaching; off by default in Lab. Self-report is a distinct source tag, never passed off as measured telemetry.

Confidence (strength of evidence) and coverage (what was captured) are separate. Do not replace an arbitrary percentage with an equally arbitrary high-confidence label. Show `Based on 12 eligible 2v2 games` and one compact confidence badge. The popover records formula/version, numerator/denominator, missing observations, selection rules, exclusions and limits. Export keeps full provenance. A failed required source removes the affected claim, not all useful coaching.

The default answer budget: one priority, a short reason linked to1–3 moments, one practical drill and one cue. At most one limitation sentence, only when it changes the player’s action. Every caveat must answer: **what would the user wrongly do if this were omitted?** If nothing changes, put it in methodology, not the paragraph. Keep privacy consent, third-party endpoint, actionable failures and explicit unavailable required data visible. Remove generic “No grades or rank forecasts inferred” from surfaces that do not offer a grade/forecast. A null xG does not need a permanent main-page xG card.

Examples:

| Current | Proposed |
|---|---|
| “Legacy equal-match mean; weights unavailable” | “Average boost42.6%” + `Older measurement` badge; details explain denominator and exclude incompatible comparisons |
| “No grade, benchmark percentile or promotion estimate is inferred…” | No empty grade tile; methodology explains available comparison types |
| “Pad glow is decorative; pickup/cooldown state unavailable” | Remove deceptive pad availability glow; stage menu: `Pad locations` (positions only) |
| “Recorded flags to investigate” | “Review these3 moments” + Estimated badge |
| “Calibrate Profile” | “Edit profile” |
| Offline `avg_boost:50.0 [time_weighted;count=…]` | “Start with this recovery at 1:24. Try 10 minutes of small-pad routes. In the next 3 games, check the route before the challenge.” Exact metric stays in evidence details. |

## Page-by-page layout and interaction spec

**Match Report**: slim breadcrumb and local time, result framed You/Them; compact verdict hero with one drill CTA; stat strip against the user’s own compatible recent baseline; three playable focus/reference cards; deeper Stats/Players/Methods beneath. At1440×900 all three card titles and actions are visible in the authored proposal. At720px height scrolling is allowed for report detail, but result, verdict and cue remain first. Unknown identity blocks personalized verdict and offers Confirm player; it never silently selects a participant.

**Today**: one active weekly focus, practice10 min button, next-match cue and evidence link; right practice-loop progress; bottom recent reports and a trend sparkline. Completed session leads to1-question self-check, then next matches. A missed week is a resumed plan, not a guilt banner. Imported new match produces a quiet report badge; does not steal keyboard focus.

**Studio**: viewport-contained grid, full stage, overlaid transport and docked rail, timeline separate. Minimum1280×720 keeps playback/time/events visible. Review tab starts with selected moment description, confidence/method, next/previous and user verdict. Events filters appear only in Events. Stats compare focus vs teammate/opponent with unit and coverage. Lab shows model status and its limitations on explicit entry. Arrow controls and moments share one playhead; simulation anchors read the current time snapshot, not the last externally issued seek.

**Coach**: conversation list206–240px, central flexible thread and300–340px evidence rail; compact header context; footer composer always visible; center independently scrolls. At1280×720 thread content scrolls behind a retained composer. At narrow/zoomed widths evidence becomes a drawer and conversation list a picker; do not squeeze the thread to350px while keeping244px navigation. Evidence opens exact moments and returns to thread/reading anchor. Generation jobs belong to service/query state rather than page lifetime.

**Progress**: mode +10/25/50 games, sample-aware headline metrics; one rolling trend and a transfer cycle next to it; real active goal rows with editable criterion, evidence/self-check source and due checkpoint. Drill started/finished dates are time markers, not an implied causal regression. Missing compatibility produces a gap/exclusion badge; no0fill. Each trend point can open the underlying report with match IDs.

**Onboarding**: one short identity/mode/rank/import surface, little brand story, no fictional rank badge for unknown user. If there is no imported identity, replace player card with first import; import parses locally under limits. Choose from detected accounts with count/platform disambiguation. Main-mode rank is optional/self-reported. Primary CTA opens first report. Provider and detailed practice profile follow value, not precede it.

**Settings/participant detail** have no full mockup because six core mockups are the requested delivery floor; their structural specification above is mandatory implementation scope. Do not keep current Settings/Teammates merely because they lack a standalone image.

## Mockups and validation

Six self-contained HTML files in `review/mockups/`: `match-report.html`, `today.html`, `replay-studio.html`, `coach.html`, `progress.html`, `onboarding.html`. CSS,400/600/700 Inter fonts, pitch SVGs and prototype feedback are embedded. Navigation links connect the pages. No external network assets, provider requests or actual replay playback. Synthetic Nova data and route diagrams are labeled design proposals. The distinct mockup fixture is 86 matches:56 doubles,15 duels,15 standard, allowing 25 eligible2v2games and a previous 25 baseline. The real-App harness remains 40 across modes. Onboarding illustrates final confirmation after a local import preview, not a first launch that somehow knows a player already. Goal-side time is a proposed estimated metric; Recorded shots avoids pretending native shot-event semantics are independently validated “shots on target.”

The cost chip is synthetic UI content. Production must compute an estimate from explicitly configured/current provider rates and planned token budgets, then reconcile actual usage when returned. Never label a guessed price as measured; unknown prices show Usage-based and offer details. New consent covers the actual endpoint and data categories.

`review/screenshots/mockups/manifest.json` records 18 screenshots at all three requested sizes, zero page errors, zero horizontal overflow and zero measured heading/paragraph/button text overflow. The review visually inspected all six 1440 renders, Studio/Coach/onboarding 1280 and Progress 1920. Visual inspection caught and fixed: missing real weight hierarchy from a regular-only embedded font; report moment actions below fold; green low-boost delta wrongly implying universal improvement; an offscreen 720 Coach composer caused by flex minimum sizing; horizontal mode-card labels caused by generic button styling. These fixes are confined to mockups.

| Gate | Result | Evidence / next work |
|---|---|---|
| Real App layout states | **PASS** for capture/inspection; **FAIL** for defects listed |66 fresh captures and actual browser probes |
| Static mockup rendering | **PASS** |18 captures, manifests, zero console/overflow errors |
| Mockup key viewport loop | **PASS** |Compact Report at 1440; Studio timeline/transport and Coach composer at 1280; onboarding CTA at 1280; inspected updated renders |
| Mockup control text / nesting | **PASS** |`MOCKUP_CONTROL_QA.json`:156 default/hover/focus control-state contrast checks,0 below applicable threshold,0 nested interactive controls; flat/opaque background calculation, not a full gradient audit |
| Production keyboard/dialog/labels | **FAIL** |K-001/K-002, browser focus/label tests |
| Production small-text contrast | **FAIL** |K-003, luminance census and source usage |
| Mockup complete WCAG certification | **NOT RUN** |Static proposals demonstrate primitives/layout only; semantic keyboard/state parity belongs in implementation |
| Screen-reader speech | **NOT RUN** |No NVDA/JAWS session; log announcement recommendation K-008 remains likely |
| Native DPI/touch/installer | **NOT RUN** by design audit |Root native test report distinguishes actual release checks; full display/DPI matrix is still required |
| Causal drill efficacy / rank forecasting | **NOT RUN** |No labeled/longitudinal cohort; not claimed |
| Provider calls / pricing estimate calibration | **NOT RUN** |Prohibited by user; prototype $0.02 is synthetic illustration, not verified model pricing |

## Implementation acceptance, migration and cuts

Deliver vertical slices, not a simultaneous source/theme rewrite. First lock identity, metric/null/scope/version and error contracts; stabilize build/CI/storage/worker isolation; add router/query/stream-job state; then primitive/dialog/type foundation; then Match Report→Studio moment loop; Today/practice; Coach workspace; Progress/transfer; remove old routes/CSS. Preserve stored conversations/imports; migrate by typed schema revision and test rollback. The source truth remains local and no provider receives raw frames by default.

Acceptance: newly imported match opens a useful report; every claim has a playable moment or explicit aggregate provenance;0vsunknown never conflates; mode-scoped baselines exclude incompatible versions; user can complete the review→practice→check loop without opening Settings. All three windows retain critical controls;200%reflow stays usable; keyboard can import/review/coach/practise/delete and recover from failure; every control named; dialogs contain/return focus; confidence links do not dump raw audit text in the main thread. Idle viewer rendering and multi-MB IPC must pass H/F budgets before launch. A pilot player can identify the next cue within 10 seconds of opening Today.

Cuts: unused GoalTracker (I-006); persona/setup questionnaire before first value (J-005/J-009); global Teammates route (J-013); permanently disabled sign-in choice (J-012); bot identity/accusation UI per E audit; unused grade/forecast placeholders; raw evidence dumps as default offline answer; old CSS after each migrated surface. Keep sourced training catalog, offline coaching, personal baselines, player review, local automatic ingest and the actual viewer. Place policy rollout/xG/ref-reference diagnostics behind an explicit Lab flag with model verdicts from the experimental audit.

Roadmap linkage: the design program resolves I-001–I-007, J-001–J-014 and K-001–K-010, plus frontend G/H and service D/B/A correctness prerequisites. The root `ROADMAP.md` supplies ordered epics and risks; this document is the layout, interaction and copy contract, not permission to skip those prerequisites.
