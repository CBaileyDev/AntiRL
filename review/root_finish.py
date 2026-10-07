"""Review artifacts only. Production files are never modified."""
import collections
import json
import pathlib
import re
from auditlib import ROOT, finding

OUT = ROOT / "review"
rows = [json.loads(line) for line in (OUT / "findings.jsonl").read_text(encoding="utf-8").splitlines()]
if not any(row["id"] == "N-005" for row in rows):
    finding(
        id="N-005", severity="P2", category="Build portability",
        title="Bundle configuration references four icon assets absent from the checkout",
        location={"file":"src-tauri/tauri.conf.json", "line":35,
                  "quote":'      "icons/32x32.png",\n      "icons/128x128.png",\n      "icons/128x128@2x.png",\n      "icons/icon.icns",'},
        problem="The bundle list contains missing platform icon inputs. Only icon.png and icon.ico exist. Windows build succeeds, but the configuration cannot be treated as a complete portable packaging manifest. Linux schema output is also absent from ignore rules.",
        trigger_or_repro="Compare each bundle.icon path with files on disk: four missing. Original Windows Tauri build succeeds. Linux/macOS generation or bundling was not executed on this Windows host; supplied Linux panic is not claimed as a newly reproduced failure.",
        expected_vs_actual="Expected every declared icon input to exist in a fresh checkout; actual four paths are missing. Native Linux/macOS runtime and generated schema behavior remain unverified.",
        evidence="src-tauri/tauri.conf.json:35-38; src-tauri/icons/icon.png; src-tauri/icons/icon.ico; review/logs/native-build-original.txt; .gitignore",
        recommendation="Generate and track the declared platform icon set, or declare a verified target-specific list. Add a manifest existence gate and document/ignore reproducible generated schemas. For an audit wrapper only, TAURI_CONFIG can override the icon list without changing source.",
        effort="S", confidence="confirmed", lead="confirmed")

extra = [
    {"path":"crates/coach-services/src/chatgpt.rs", "status":"reviewed", "reason":"Entire adapter and synthetic tests read: disabled defaults, opt-in feature, PKCE/state/nonce/issuer/audience/subject, loopback limits, token rotation, vault chunking, pinned revocation and build fixture contract. Existing all-feature tests pass; no live sign-in or vault values inspected."},
    {"path":"crates/coach-services/tests/fixtures/synthetic-oidc-test-key.pem", "status":"not reviewed", "reason":"Pre-existing ignored private-key fixture was deliberately not read, printed or copied under the no-credential-read constraint. Public fixture README marks it synthetic; cached test compilation uses it. Fresh-clone proof generated an independent throwaway key only inside review/snapshot."},
]
(OUT / "coverage-root-extra.json").write_text(json.dumps(extra, indent=2)+"\n", encoding="utf-8")
leads = [
    {"lead":44, "status":"confirmed", "evidence":"L-004/L-005/L-006: single windows-latest CI job, manual native scripts, declarative adversarial coaching corpus without runner. Windows unit tests do exercise job-object limits; do not say all native constraints are untested."},
    {"lead":45, "status":"confirmed", "evidence":"N-001/N-002/E-014: root research images and self-citations, contradictory validation docs, developer path. Fresh 66 real-App screenshots replace reliance on stale captures; old captures were not assumed to represent current source."},
    {"lead":46, "status":"confirmed", "evidence":"L-001/L-002: all five inspected anonymous GitHub quality runs fail Install frontend, including 6762f8c. Same unmodified command passes cached checkout but fails fresh git archive. After install workaround, missing ignored PEM blocks all-features compilation. Generating key alone fails JWT signature; paired throwaway key/public JWKS in review snapshot passes79/2ignored. Later unmodified Windows checks largely pass, but original Playwright Stop race fails8/1."},
    {"lead":47, "status":"confirmed", "evidence":"N-005: four missing declared icons confirmed by filesystem/config comparison; Windows build succeeds. Linux/macOS build panic was not reproduced on Windows. Linux schema is neither tracked nor ignored, but generation was not exercised, so the untracked-output runtime subclaim is source-only."},
    {"lead":48, "status":"confirmed", "evidence":"L-003/L-007: original Playwright8pass/1Stopfailure; wrapper9pass; five subsequent coaching repetitions pass, so supplied2/5 frequency unverified. frontend-security original17.6s and software-WebGL11.2s pass under45s; supplied Ubuntu66s timeout not reproduced here. Standalone Studio math script passes but CI/package scripts never run it."},
]
(OUT / "leads-root.json").write_text(json.dumps(leads, indent=2)+"\n", encoding="utf-8")
print("Root coverage additions and final five lead verdicts saved.")
