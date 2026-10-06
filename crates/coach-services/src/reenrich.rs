//! Re-enrichment of already-imported replays with analysis-3 capture data (angular
//! velocity, controller/component state, boost pad pickups, shot samples).
//!
//! Source of truth is the immutable, hash-named snapshot written at import
//! (`replay-snapshots/<sha256>.replay`). Nothing is inferred for replays whose snapshot is
//! gone (the user deleted it, or the retention option removed it): they stay `unavailable`
//! and must be re-imported from the original `.replay` file. Existing metrics, events and
//! user data are never rewritten; only frames, pad_events, shots and analysis_version are.
use super::*;
use rusqlite::OptionalExtension;

pub const ANALYSIS_VERSION: &str = replay_core::ANALYSIS_VERSION;

fn is_hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

impl CoachService {
    /// Replays whose stored capture predates the current analysis version, with whether a
    /// verified snapshot is still present to re-enrich from.
    pub fn reenrichment_status(&self) -> ServiceResult<Value> {
        let rows: Vec<(String, Option<String>, Option<String>)> = {
            let db = self.db.lock().map_err(err)?;
            let mut q = db
                .prepare("SELECT id,file_hash,json_extract(body,'$.analysis_version') FROM replays ORDER BY played_sort DESC,id")
                .map_err(err)?;
            let rows = q
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            rows
        };
        let (mut current, mut ready, mut missing) = (0, vec![], vec![]);
        for (id, hash, version) in rows {
            if version.as_deref() == Some(ANALYSIS_VERSION) {
                current += 1;
            } else if hash.as_deref().is_some_and(|h| {
                is_hash(h) && self.snapshot_dir().join(format!("{h}.replay")).is_file()
            }) {
                ready.push(id);
            } else {
                missing.push(id);
            }
        }
        Ok(json!({
            "analysis_version": ANALYSIS_VERSION,
            "current": current,
            "can_reenrich": ready,
            "snapshot_unavailable": missing,
            "note": "Replays without a snapshot cannot be re-enriched; re-import the original .replay file. Until then their new fields are reported as unavailable, never as zero/neutral."
        }))
    }

    /// Re-enrich up to `max` stale replays (1..=25) from their verified snapshots.
    pub fn reenrich_replays(&self, max: usize) -> ServiceResult<Value> {
        if !(1..=25).contains(&max) {
            return Err("Re-enrichment batch must be between 1 and 25 replays".into());
        }
        let status = self.reenrichment_status()?;
        let all = status["can_reenrich"].as_array().map_or(0, Vec::len);
        let ids: Vec<String> = status["can_reenrich"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .take(max)
            .collect();
        let mut results = vec![];
        for id in &ids {
            results.push(match self.reenrich_replay(id) {
                Ok(v) => v,
                Err(e) => json!({"id":id,"status":"failed","reason":e}),
            });
        }
        Ok(json!({"processed":results.len(),"results":results,"remaining":all.saturating_sub(ids.len())}))
    }

    /// Decode one replay's snapshot in-process (panic-isolated, hash- and identity-verified)
    /// and merge the new capture fields.
    pub fn reenrich_replay(&self, id: &str) -> ServiceResult<Value> {
        let hash: Option<String> = self
            .db
            .lock()
            .map_err(err)?
            .query_row("SELECT file_hash FROM replays WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?
            .ok_or_else(|| format!("Replay {id} not found"))?;
        let Some(hash) = hash.filter(|h| is_hash(h)) else {
            return Ok(
                json!({"id":id,"status":"unavailable","reason":"No verified content hash; re-import the original .replay"}),
            );
        };
        let path = self.snapshot_dir().join(format!("{hash}.replay"));
        if !path.is_file() {
            return Ok(
                json!({"id":id,"status":"unavailable","reason":"Replay snapshot is no longer stored; re-import the original .replay"}),
            );
        }
        let bytes = replay_core::read_replay(&path)?;
        let analysis = std::panic::catch_unwind(|| replay_core::decode(&path, &bytes))
            .map_err(|_| "Replay decoder failed safely".to_string())??;
        self.apply_reenrichment(id, &hash, &analysis)?;
        Ok(json!({"id":id,"status":"updated","analysis_version":ANALYSIS_VERSION,
            "frames":analysis.frames.len(),"pad_events":analysis.pad_events.len(),"shots":analysis.shots.len()}))
    }

    pub(crate) fn apply_reenrichment(
        &self,
        id: &str,
        hash: &str,
        a: &replay_core::ReplayAnalysis,
    ) -> ServiceResult<()> {
        if a.summary.file_hash != hash || a.summary.id != id {
            return Err("Snapshot does not match the stored replay identity; not modified".into());
        }
        replay_core::validate_analysis(a)?;
        if a.analysis_version.as_deref() != Some(ANALYSIS_VERSION) {
            return Err("Decoder output has an unexpected analysis version".into());
        }
        let frames = serde_json::to_vec(&a.frames).map_err(err)?;
        if frames.len() as u64 > 128 * 1024 * 1024 {
            return Err("Playback frame data exceeds 128 MiB safety limit".into());
        }
        let compressed = zstd::stream::encode_all(frames.as_slice(), 3).map_err(err)?;
        let pads = serde_json::to_string(&a.pad_events).map_err(err)?;
        let shots = serde_json::to_string(&a.shots).map_err(err)?;
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        // Re-check identity under the lock: the row may have been replaced since decoding.
        let current: Option<String> = tx
            .query_row("SELECT file_hash FROM replays WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?;
        if current.as_deref() != Some(hash) {
            return Err("Replay changed during re-enrichment; retry".into());
        }
        for col in ["body", "coach_body"] {
            tx.execute(
                &format!("UPDATE replays SET {col}=json_set({col},'$.analysis_version',?2,'$.pad_events',json(?3),'$.shots',json(?4)) WHERE id=?1"),
                params![id, ANALYSIS_VERSION, pads, shots],
            )
            .map_err(err)?;
        }
        tx.execute("INSERT INTO replay_frames VALUES(?1,'zstd-json-v1',?2,?3) ON CONFLICT(replay_id) DO UPDATE SET codec=excluded.codec,uncompressed_size=excluded.uncompressed_size,body=excluded.body", params![id, frames.len() as i64, compressed]).map_err(err)?;
        tx.execute(
            "UPDATE replays SET intelligence_revision=intelligence_revision+1 WHERE id=?1",
            [id],
        )
        .map_err(err)?;
        tx.execute("DELETE FROM situation_cache WHERE replay_id=?1", [id])
            .map_err(err)?;
        tx.commit().map_err(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(hash: &str) -> (tempfile::TempDir, CoachService) {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        service
            .save_replay(&json!({
                "summary":{"id":"m1","file_name":"m1.replay","file_hash":hash,"mode":"2v2","played_at":"2026-01-01","status":"ready","duration_seconds":30},
                "players":[{"id":"epic:a","team":0,"is_bot":false,"name":"A"}],
                "frames":[{"time":1.0,"ball":null,"cars":[{"player_id":"epic:a","position":[0,0,17],"rotation":[0,0,0,1],"velocity":null,"boost":10.0,"discontinuity":false}],"live_play":true,"discontinuity":false}],
                "metrics":[{"key":"avg_boost","player_id":"epic:a","value":10,"metric_version":"metrics-2"}],
                "events":[]
            }))
            .unwrap();
        (dir, service)
    }

    fn decoded(hash: &str) -> replay_core::ReplayAnalysis {
        serde_json::from_value(json!({
            "summary":{"id":"m1","file_hash":hash,"file_name":"m1.replay","replay_name":"","played_at":null,"mode":"2v2","duration_seconds":30.0,"blue_score":null,"orange_score":null,"players":[],"status":"ready","error":null,"source_path":"","match_type":null,"playlist_id":null,"recorder_name":null,"recorder_player_id":null,"content_hash":hash,"map_name":null},
            "players":[{"id":"epic:a","name":"A","team":0,"platform":null,"is_bot":false}],
            "frames":[{"time":1.0,"ball":null,"cars":[{"player_id":"epic:a","position":[0,0,17],"rotation":[0,0,0,1],"velocity":null,"boost":10.0,"discontinuity":false,"throttle":255,"steer":128,"handbrake":false,"angular_velocity":[0.0,1.5,0.0]}],"match_clock_seconds":null,"live_play":true,"discontinuity":false}],
            "metrics":[],"events":[],
            "coverage":{"metadata":true,"positions":true,"boost":true,"goals":true,"touches":false,"decoded_frames":1,"render_frames":1,"live_play_seconds":0.0,"notes":[]},
            "analysis_version":ANALYSIS_VERSION,
            "pad_events":[{"time":2.0,"frame":4,"pad_id":"p","player_id":"epic:a","player_position":null,"sequence":1}],
            "shots":[{"time":3.0,"frame":9,"kind":"shot","player_id":"epic:a","team":0,"player_position":null,"shot":null}]
        }))
        .unwrap()
    }

    #[test]
    fn stale_replay_is_enriched_without_touching_metrics_and_invalidates_cache() {
        let hash = "a".repeat(64);
        let (_dir, s) = fixture(&hash);
        let before = s.get_replay("m1").unwrap();
        assert!(before["frames"][0]["cars"][0]["throttle"].is_null());
        assert!(before["analysis_version"].is_null());
        s.db.lock()
            .unwrap()
            .execute("INSERT INTO situation_cache VALUES('m1',0,'{}')", [])
            .unwrap();
        let rev: i64 = s
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT intelligence_revision FROM replays WHERE id='m1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        s.apply_reenrichment("m1", &hash, &decoded(&hash)).unwrap();
        let after = s.get_replay("m1").unwrap();
        assert_eq!(after["analysis_version"], ANALYSIS_VERSION);
        assert_eq!(after["frames"][0]["cars"][0]["throttle"], 255);
        assert_eq!(after["pad_events"].as_array().unwrap().len(), 1);
        assert_eq!(after["shots"][0]["kind"], "shot");
        assert_eq!(after["metrics"], before["metrics"]);
        assert_eq!(
            s.get_coach_replay("m1").unwrap()["analysis_version"],
            ANALYSIS_VERSION
        );
        let db = s.db.lock().unwrap();
        assert_eq!(
            db.query_row(
                "SELECT intelligence_revision FROM replays WHERE id='m1'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            rev + 1
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM situation_cache", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn mismatched_identity_or_hash_is_rejected() {
        let hash = "a".repeat(64);
        let (_dir, s) = fixture(&hash);
        let other = decoded(&"b".repeat(64));
        assert!(s.apply_reenrichment("m1", &hash, &other).is_err());
        let mut other = decoded(&hash);
        other.summary.id = "other".into();
        assert!(s.apply_reenrichment("m1", &hash, &other).is_err());
        let mut stale = decoded(&hash);
        stale.analysis_version = None;
        assert!(s.apply_reenrichment("m1", &hash, &stale).is_err());
        assert!(s.get_replay("m1").unwrap()["analysis_version"].is_null());
    }

    #[test]
    fn missing_or_corrupt_snapshot_is_unavailable_or_failed_not_fabricated() {
        let hash = "c".repeat(64);
        let (_dir, s) = fixture(&hash);
        let st = s.reenrichment_status().unwrap();
        assert_eq!(st["snapshot_unavailable"][0], "m1");
        assert_eq!(s.reenrich_replay("m1").unwrap()["status"], "unavailable");
        fs::create_dir_all(s.snapshot_dir()).unwrap();
        fs::write(s.snapshot_dir().join(format!("{hash}.replay")), b"not a replay").unwrap();
        assert_eq!(s.reenrichment_status().unwrap()["can_reenrich"][0], "m1");
        assert!(s.reenrich_replay("m1").is_err());
        let batch = s.reenrich_replays(5).unwrap();
        assert_eq!(batch["results"][0]["status"], "failed");
        assert!(s.get_replay("m1").unwrap()["analysis_version"].is_null());
        assert!(s.reenrich_replays(0).is_err());
    }

    /// Real-replay end-to-end check: `ANTIRL_QA_REPLAY=<file.replay> cargo test -p coach-services -- --ignored real_snapshot`.
    /// Works on a temp data dir and a copy of the replay; never touches a live profile.
    #[test]
    #[ignore]
    fn real_snapshot_reenrichment_end_to_end() {
        let src = std::env::var("ANTIRL_QA_REPLAY").expect("set ANTIRL_QA_REPLAY");
        let a = replay_core::parse_replay(std::path::Path::new(&src)).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let s = CoachService::open(dir.path()).unwrap();
        let mut stale = serde_json::to_value(&a).unwrap();
        for k in ["analysis_version", "pad_events", "shots"] {
            stale.as_object_mut().unwrap().remove(k);
        }
        s.save_replay(&stale).unwrap();
        fs::create_dir_all(s.snapshot_dir()).unwrap();
        fs::copy(&src, s.snapshot_dir().join(format!("{}.replay", a.summary.file_hash))).unwrap();
        let r = s.reenrich_replays(1).unwrap();
        assert_eq!(r["results"][0]["status"], "updated", "{r}");
        let got = s.get_replay(&a.summary.id).unwrap();
        assert_eq!(got["frames"].as_array().unwrap().len(), a.frames.len());
        assert_eq!(got["analysis_version"], ANALYSIS_VERSION);
        eprintln!("{r}");
        drop(dir);
    }
}
