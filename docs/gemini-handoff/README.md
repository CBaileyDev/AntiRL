# Gemini implementation handoff

Prepared on October 5, 2026. This handoff prepares an implementation request; it does not implement or certify the application.

## Use it

1. Open the intended application folder in a Gemini coding agent that can read files, edit code, run a terminal, and inspect the running UI.
2. Paste the entire contents of [GEMINI_ONE_SHOT_PROMPT.md](../../GEMINI_ONE_SHOT_PROMPT.md) as one request. The `.txt` copy contains the same prompt.
3. Keep this folder available for detailed evidence and acceptance criteria. The prompt also contains the essential context, so the documents are optional supporting material.

A normal Gemini chat cannot inspect local Windows paths or independently build and test the application. Pasting paths alone does not give it access. Use a coding agent for the intended autonomous implementation. No prompt can guarantee completion of a product of this scope in one response or remove account, asset, or tool limitations.

## Target decision

The user confirmed **build from scratch in `C:\Users\barke\Documents\AntiRL`**, using a coding agent with local files and a terminal. AntiRL was empty at inspection, with no application or Git metadata. The final prompt fixes it as the write target and keeps every reference read-only.

`C:\Users\barke\Desktop\ZensCoach` contains a substantial replay coach matching this brief. It was inspected read-only as an additional reference. Its files changed during inspection, so paths and findings are snapshots, not a frozen revision. It is not the target.

## Contents

| File | Purpose |
|---|---|
| [01_PROJECT_AUDIT.md](01_PROJECT_AUDIT.md) | Current target state, reference source paths, useful patterns, limitations |
| [02_RESEARCH.md](02_RESEARCH.md) | Primary sources, parser/viewer feasibility, AI access, competitor findings |
| [03_IMPLEMENTATION_SPEC.md](03_IMPLEMENTATION_SPEC.md) | Architecture, data/evidence contracts, visual system, product requirements |
| [04_ACCEPTANCE.md](04_ACCEPTANCE.md) | Implementation order, completion criteria, verification and scope tracking |
| [evidence/rrrocket-probe.json](evidence/rrrocket-probe.json) | Fresh successful low-level parse checks on 29 local files, with two decoded sample summaries |
| [evidence/parser-probe-stopped.json](evidence/parser-probe-stopped.json) | Honest stopped high-level reference-artifact probe |
| [evidence/probe_rrrocket.py](evidence/probe_rrrocket.py) | Reproducible read-only probe; writes aggregate evidence, not replay contents |

## What changed from the supplied draft

- Removed the instruction to deliver only an audit and wait for plan approval.
- Replaced open-ended stack exploration with a concrete default and conditions for preserving an existing stack.
- Corrected the RLTRAIN reference location and recorded the actual provider transport.
- Made local file/terminal access an explicit prerequisite.
- Converted broad quality wishes into data contracts, acceptance criteria, failure behavior, and a completion ledger.
- Kept the full replay/coaching/progress scope. A first working slice is an implementation step, not the final deliverable.
- Retained honest external blockers, user-controlled cloud consent, and the boundary between observed evidence and coaching interpretation.

No reference source, credentials, replay originals, database, or settings were intentionally modified by this preparation task. Historical screenshots and saved reports were inspected; their existence does not mean their checks were rerun.
