# Report editorial and fact check

TEST_REPORT.md and COVERAGE.md were edited in place after rendering. Headline prose, all area/model verdicts, command summaries, measurements, native exclusions and reproduction notes now use readable sentences and spacing. Environment versions were added. The editor asserted that all 119 initial command rows/order, 136 test-report inline code spans and 127 coverage file/code spans survived unchanged. Root may append later command rows without regenerating these reports.

Corrections made against raw logs:

- review-frontend-static-probes-fixed failed because its JSX lacked a closing brace before playerId; it was not another package-alias failure. See logs/review-frontend-static-probes-fixed.txt.
- review-frontend-static-probes-final failed to resolve react/jsx-runtime. The previous wording was vague; the summary now identifies that dependency.
- experimental-probes failed because generated Rust used leading-dot floats and an array-index expression that json! could not parse. It was not a missing helper/import. See logs/experimental-probes.txt.
- The 40-match analytics range includes a 96 ms run, alongside 97 and 104 ms. The measurement table now says 96–104 ms; the 400-match range remains 991–1265 ms.
- AI coverage initially described 10 probes. It now distinguishes the initial 10 from the final 11, including the public offline count-injection test.

Counts and gates checked against logs: original workspace 94 passed / 2 ignored; final workspace 131 passed / 4 ignored; the final wrapper pass count 37 includes 3 repeated original contract tests. All 119 initially linked command logs exist. The complete filesystem ledger contains every required file under crates, src-tauri/src, app/src and integrations; no omissions found. The only deliberately unreviewed input is the pre-existing ignored private-key fixture, with a stated reason.

Open notes for root:

- Commands appended after initial rendering need rows: render-review-reports, environment-versions, design-font-license-preservation, design-final-semantic-build, design-final-semantic-captures and final-findings-merge (plus any later commands). Root is handling this from commands.jsonl.
- CI's separate `pnpm --dir app exec playwright install chromium` step has no executed command row. The original Playwright run already found its browser. If the report is intended to account for every CI step as well as every user-listed command, add an explicit NOT RUN reason or run the install safely; fresh CI browser download availability is unverified.
- Playwright's log proves the cancelled partial-response assertion failed. The exact ordering of the click versus final stream completion was not separately traced; describe it as a Stop/stream-completion race, not a measured timestamp ordering. Five subsequent runs passed, so the supplied failure frequency remains unverified.
- The cleanup paragraph describes the final intended state. Confirm PLANS.md and final git status after removing the review snapshot/caches and .vite before declaring cleanup complete.

No source, configuration, lockfile, CI or existing documentation was changed by this editorial pass.
