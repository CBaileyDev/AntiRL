from auditlib import finding
finding(
    id="A-026", severity="P2", category="Playlist and mode semantics",
    title="Team format is coupled to a playlist whitelist and ranked/casual share coaching cohorts",
    location={"file":"crates/replay-core/src/lib.rs", "line":227,
              "quote":"    let playlist = meta.game_type.playlist_id;\n    let standard_playlist = playlist.is_none_or(|id| matches!(id, 1 | 2 | 3 | 10 | 11 | 13));\n    let mode = if standard_playlist {"},
    problem="A known non-whitelisted playlist with a valid TeamSize is labelled unknown, and rotation events are removed. Conversely the casual and competitive playlist IDs in the whitelist map to the same mode and library analytics filter by that mode, not competitive status. Team format, ruleset and ranked eligibility are different dimensions. Missing playlist is permissively treated as standard while a known unsupported playlist loses format information.",
    trigger_or_repro="Read the explicit predicate and TeamSize branch at227-241 and events.retain at256-258; supply a non-whitelisted playlist plus TeamSize2 versus whitelisted casual/ranked playlist plus TeamSize2. This is source branch proof, not a new private/tournament real fixture parse. No unsupported numeric playlist IDs are guessed.",
    expected_vs_actual="Expected known roster format to remain2v2 with separate playlist/ranked/ruleset eligibility. Actual becomesunknown outside the whitelist; casual/ranked both become2v2 and are pooled by default coaching cohorts.",
    evidence="crates/replay-core/src/lib.rs:227-241,256-258; crates/coach-services/src/analytics.rs mode-based filters; review/PARSER_REVIEW.md",
    recommendation="Represent format, competitive status, playlist/ruleset and detector eligibility separately. Preserve known team shape; suppress only detectors whose assumptions fail. Default ranked-player baselines to ranked standard same-mode games with a visible casual/private inclusion option. Add synthetic metadata and annotated private/tournament fixtures before asserting tactical accuracy.",
    effort="M", confidence="confirmed", lead="confirmed")
