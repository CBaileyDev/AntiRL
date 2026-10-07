# Final floor: independent library-score validation

G-001 remains confirmed at P0 because earlier original-component probes reproduced Overview attributing another player's victory to an absent selected identity and converting unknown scores into a 0–0 defeat. The added library-helper case is a narrower contract edge, not another proven ordinary-import failure.

Independent command: `node review/review_score_probe.mjs`, recorded through auditlib as **validation-library-score-independent**. Exit **0**, duration **0.453 s**. Evidence: [log](logs/validation-library-score-independent.txt), [results](SCORE_VALIDATION.json).

The probe extracts teamScores verbatim from production Replays.tsx, transpiles it without edits and runs these controls:

| Input | Actual | Assessment |
|---|---|---|
| Known Blue 1, Orange 3 | 1 / 3 | Correct positive control. |
| Both scores null | - / - | Correct missing-pair control; disproves a claim that every missing score becomes zero. |
| Blue null, Orange 3 | 0 / 3 | Unknown Blue side is displayed as measured zero. |
| Blue 3, Orange null | 3 / 0 | Symmetric defect; Orange unknown becomes zero. |

Extracted helper SHA-256: `ee7e36c4e78282b572659a38fd319f329d9c919070f4b39c8ab4e192c89b8d39`.

## Contract and attempted disproof

Rust ReplaySummary independently declares each side as Option<i32>. The generated TypeScript contract independently permits number or null for both. LibraryDto contains Vec<ReplaySummary>; the native get_library route uses ordinary typed deserialization without a paired-score invariant. Thus a one-sided-null summary is allowed at the IPC contract boundary. Storage also writes each JSON side independently through as_i64.

However, current parsing intentionally normalizes a one-sided header/network score into a complete pair: Rocket League can omit a zero-goal team header. At lib.rs:377–384, `(None, None)` remains fully unknown, while any available side causes both outputs to become Some, with missing values defaulted to zero. This is meaningful parser-format handling. It prevents fresh current-parser output from presenting the helper with a partial pair.

The library defect therefore applies to contract-allowed legacy, partially populated or externally persisted records. No copied real partial-score replay was found or asserted, and no native UI/provider/profile was launched. The exact helper failure is reproduced; frequency and ordinary-import reachability are unverified. On its own this addition is P2; it does not independently justify P0. G-001's existing P0 comes from the separately reproduced Overview errors.

## Source context

app/src/pages/Replays.tsx:31–36:

```text
function teamScores(r: ReplaySummary): [string, string] {
  const b = r.blue_score;
  const o = r.orange_score;
  if (b == null && o == null) return ["-", "-"];
  return [String(b ?? 0), String(o ?? 0)];
```

crates/replay-core/src/types.rs:23–24:

```text
    pub blue_score: Option<i32>,
    pub orange_score: Option<i32>,
```

crates/replay-core/src/lib.rs:381–384:

```text
    let (blue_score, orange_score) = match (raw_blue, raw_orange) {
        (None, None) => (None, None),
        (b, o) => (Some(b.unwrap_or(0)), Some(o.unwrap_or(0))),
    };
```

Recommended fix: preserve each independent null at the display boundary. Keep the parser's documented header omission semantics separate from UI missing-data formatting; use shared typed result/identity resolution for Overview, Progress and Library.
