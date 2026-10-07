//! Review characterization tests. Every profile is synthetic and temporary.
use coach_services::CoachService;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::time::Instant;

fn replay(id: &str, date: &str, version: &str, value: f64) -> Value {
    json!({"summary":{"id":id,"mode":"2v2","played_at":date,"duration_seconds":300,"blue_score":1,"orange_score":0},"players":[{"id":"review:p","name":"Review","team":0}],"metrics":[{"key":"avg_boost","player_id":"review:p","value":value,"numerator":value*300.0,"denominator":300,"metric_version":version}],"events":[],"frames":[]})
}

#[test]
fn review_corrupt_coach_row_prevents_entire_profile_open() {
    for damaged in [Some("invalid JSON"), None] {
        let dir = tempfile::tempdir().unwrap();
        let s = CoachService::open(dir.path()).unwrap();
        s.save_replay(&replay("good", "2026-01-01T00:00:00Z", "metrics-2", 50.0))
            .unwrap();
        s.save_replay(&replay("bad", "2026-01-02T00:00:00Z", "metrics-2", 50.0))
            .unwrap();
        drop(s);
        let db = Connection::open(dir.path().join("coach.sqlite3")).unwrap();
        db.execute("UPDATE replays SET coach_body=?1 WHERE id='bad'", [damaged])
            .unwrap();
        drop(db);
        let error = CoachService::open(dir.path())
            .err()
            .expect("Characterization: launch fails");
        eprintln!("bad row {damaged:?} prevents launch: {error}");
    }
}

#[test]
fn review_analytics_combines_incompatible_metric_versions() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    s.save_replay(&replay("old", "2026-01-01T00:00:00Z", "legacy", 0.0))
        .unwrap();
    s.save_replay(&replay("new", "2026-01-02T00:00:00Z", "metrics-2", 100.0))
        .unwrap();
    let result = s.analytics_context(Some("review:p"), "2v2").unwrap();
    assert_eq!(
        result["modes"]["2v2"]["lifetime"]["avg_boost"]["value"],
        50.0
    );
    assert_eq!(result["metric_version"], "metrics-2");
    assert!(result["excluded"]["incompatible_metric_version"].is_null());
    eprintln!(
        "mixed legacy + metrics-2 reported as metrics-2: {}",
        result["modes"]["2v2"]["lifetime"]
    );
}

#[test]
fn review_library_accepts_dates_analytics_excludes_from_recent() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    for (id, date) in [("date", "2026-01-01"), ("iso-local", "2026-01-02T00:00:00")] {
        s.save_replay(&replay(id, date, "metrics-2", 50.0)).unwrap();
    }
    let db = Connection::open(dir.path().join("coach.sqlite3")).unwrap();
    let sorted: i64 = db
        .query_row(
            "SELECT count(*) FROM replays WHERE played_sort IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sorted, 2);
    let result = s.analytics_context(Some("review:p"), "2v2").unwrap();
    assert_eq!(result["modes"]["2v2"]["recent_count"], 0);
    assert_eq!(result["modes"]["2v2"]["unknown_date_count"], 2);
    eprintln!("library parsed 2 dates; analytics treated both as unknown");
}

#[test]
fn review_wrong_settings_types_are_persisted_without_validation() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    let result = s.save_settings(json!({"auto_import":"yes", "replay_folder":[], "chat_model":42, "provider":"unrecognized", "review_unknown_field":"kept"})).unwrap();
    assert_eq!(result["chat_model"], 42);
    assert_eq!(s.get_settings().unwrap()["review_unknown_field"], "kept");
    eprintln!("malformed settings accepted: {result}");
}

#[test]
fn review_analytics_query_scales_with_entire_library() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    let mut a = replay("measure", "2026-01-01T00:00:00Z", "metrics-2", 50.0);
    // Representative large compact body: evidence payload remains outside frame storage.
    a["events"] = json!((0..120).map(|n|json!({"id":format!("event-{n}"),"player_id":"review:p","time":n,"title":"Review evidence", "detail":"x".repeat(600)})).collect::<Vec<_>>());
    for count in [40, 400] {
        for n in if count == 40 { 0..40 } else { 40..400 } {
            a["summary"]["id"] = json!(format!("m{n:04}"));
            // Evidence IDs are globally keyed in analytics projection.
            for (j, event) in a["events"].as_array_mut().unwrap().iter_mut().enumerate() {
                event["id"] = json!(format!("m{n:04}-event-{j}"));
            }
            s.save_replay(&a).unwrap();
        }
        s.reconcile_analytics().unwrap();
        let start = Instant::now();
        let result = s.analytics_context(Some("review:p"), "2v2").unwrap();
        eprintln!("unchanged analytics query: matches={count} compact_bytes={} elapsed_ms={} context_bytes={}", a.to_string().len(), start.elapsed().as_millis(), result.to_string().len());
    }
}

#[test]
fn review_messages_query_has_no_supporting_index() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    let db = Connection::open(dir.path().join("coach.sqlite3")).unwrap();
    let plan: String = db.query_row("EXPLAIN QUERY PLAN SELECT id,conversation_id,body FROM messages WHERE conversation_id='review' ORDER BY rowid ASC", [], |r|r.get(3)).unwrap();
    assert!(plan.contains("SCAN messages"));
    eprintln!("get_messages SQL plan: {plan}");
    drop(s);
}

#[test]
fn review_delete_retains_replay_snapshot_when_explicitly_requested() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    let mut a = replay("deleted", "2026-01-01T00:00:00Z", "metrics-2", 50.0);
    let hash = "a".repeat(64);
    a["summary"]["file_hash"] = json!(hash);
    s.save_replay(&a).unwrap();
    std::fs::create_dir_all(s.snapshot_dir()).unwrap();
    let file = s.snapshot_dir().join(format!("{hash}.replay"));
    std::fs::write(&file, "synthetic").unwrap();
    s.delete_replay_with_snapshot("deleted", false).unwrap();
    assert!(file.exists());
    assert!(s.save_replay(&a).is_err());
}

#[test]
fn review_teammates_unknown_result_and_draw_become_losses() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    for (id, blue, orange) in [
        ("draw", json!(2), json!(2)),
        ("unknown", Value::Null, Value::Null),
    ] {
        let mut a = replay(id, "2026-01-01T00:00:00Z", "metrics-2", 50.0);
        a["summary"]["blue_score"] = blue;
        a["summary"]["orange_score"] = orange;
        a["players"]
            .as_array_mut()
            .unwrap()
            .push(json!({"id":"review:mate", "name":"Mate", "team":0}));
        s.save_replay(&a).unwrap();
    }
    let mates = s.get_teammates("review:p").unwrap();
    assert_eq!(mates[0]["losses"], 2);
    assert_eq!(mates[0]["win_rate"], 0.0);
    eprintln!("unknown + draw reported as: {}", mates[0]);
}

#[test]
fn review_memory_load_bypasses_write_size_and_content_guards() {
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    let synthetic = format!("Bearer DUMMY_REVIEW_ONLY\n{}", "x".repeat(200_000));
    assert!(s.save_memory("review.md", &synthetic).is_err());
    std::fs::write(dir.path().join("coach-memory/review.md"), &synthetic).unwrap();
    let loaded = s.get_memory().unwrap();
    assert_eq!(
        loaded[0]["content"].as_str().unwrap().len(),
        synthetic.len()
    );
    eprintln!(
        "memory load accepted {} bytes despite save rejecting same content",
        synthetic.len()
    );
}

#[test]
fn review_opened_replay_payload_measurement() {
    let Some(fixture) = std::env::var_os("ANTIRL_REVIEW_FIXTURE") else {
        eprintln!("No review-owned fixture set; payload measurement not run");
        return;
    };
    let analysis = replay_core::parse_replay(std::path::Path::new(&fixture)).unwrap();
    let frames = analysis.frames.len();
    let players = analysis.players.len();
    let duration = analysis.summary.duration_seconds;
    let dir = tempfile::tempdir().unwrap();
    let s = CoachService::open(dir.path()).unwrap();
    let stored = serde_json::to_value(&analysis).unwrap();
    s.save_replay(&stored).unwrap();
    let start = Instant::now();
    let value = s.get_replay(&analysis.summary.id).unwrap();
    let value_ms = start.elapsed().as_millis();
    let start = Instant::now();
    let typed: replay_core::ReplayAnalysis = serde_json::from_value(value).unwrap();
    let typed_ms = start.elapsed().as_millis();
    let start = Instant::now();
    let bytes = serde_json::to_vec(&typed).unwrap();
    let serialize_ms = start.elapsed().as_millis();
    let db = Connection::open(dir.path().join("coach.sqlite3")).unwrap();
    let (body_bytes, coach_bytes, summary_bytes): (i64, i64, i64) = db
        .query_row(
            "SELECT length(body),length(coach_body),length(summary_body) FROM replays",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    let (frame_json_bytes, zstd_bytes): (i64, i64) = db
        .query_row(
            "SELECT uncompressed_size,length(body) FROM replay_frames",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    eprintln!("REVIEW_PAYLOAD frames={frames} players={players} duration_s={duration} ipc_json_bytes={} compact_body_bytes={body_bytes} coach_body_bytes={coach_bytes} summary_bytes={summary_bytes} frame_json_bytes={frame_json_bytes} zstd_bytes={zstd_bytes} inflate_value_ms={value_ms} value_to_typed_ms={typed_ms} serialize_typed_ms={serialize_ms}",bytes.len());
    assert_eq!(typed.frames.len(), frames);
}
