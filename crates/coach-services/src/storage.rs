//! Indexed library metadata, durable import outcomes, and isolated compressed
//! playback frames. Coaching queries never inflate a frame blob.
use super::*;
use rusqlite::OptionalExtension;
use std::io::Read;

const MAX_FRAME_JSON: u64 = 128 * 1024 * 1024;

fn date_sort(raw: Option<&str>) -> Option<String> {
    let raw = raw?;
    if let Ok(date) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(date.with_timezone(&Utc).to_rfc3339());
    }
    // Legacy replay headers commonly omit an offset. Keep their clock ordering;
    // this does not claim their timezone is known.
    for format in [
        "%Y-%m-%d %H-%M-%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ] {
        if let Ok(date) = chrono::NaiveDateTime::parse_from_str(raw, format) {
            return Some(date.format("%Y-%m-%dT%H:%M:%S+00:00").to_string());
        }
    }
    chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .ok()
        .map(|d| format!("{d}T00:00:00+00:00"))
}

pub(crate) fn write_replay(db: &Connection, analysis: &Value) -> ServiceResult<()> {
    write_replay_inner(db, analysis, true)
}

pub(crate) fn write_legacy_replay(db: &Connection, analysis: &Value) -> ServiceResult<()> {
    write_replay_inner(db, analysis, false)
}

fn write_replay_inner(
    db: &Connection,
    analysis: &Value,
    enforce_deleted_ids: bool,
) -> ServiceResult<()> {
    let summary = &analysis["summary"];
    let id = summary["id"].as_str().ok_or("Analysis has no ID")?;
    if enforce_deleted_ids {
        let deleted_id: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM replay_id_tombstones WHERE replay_id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if deleted_id {
            return Err("Replay was deleted and is excluded from import".into());
        }
    }
    let hash = summary["file_hash"].as_str().filter(|s| !s.is_empty());
    if let Some(hash) = hash {
        let deleted: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM replay_tombstones WHERE file_hash=?1)",
                [hash],
                |r| r.get(0),
            )
            .map_err(err)?;
        if deleted {
            return Err("Replay was deleted and is excluded from import".into());
        }
    }
    let mut compact = analysis.clone();
    let frames = compact
        .as_object_mut()
        .ok_or("Analysis must be an object")?
        .remove("frames");
    let body = serde_json::to_string(&compact).map_err(err)?;
    let played = summary["played_at"].as_str();
    db.execute("INSERT INTO replays(id,body,coach_body,file_hash,summary_body,mode,played_at,played_sort,blue_score,orange_score)
        VALUES(?1,?2,?2,?3,?4,?5,?6,?7,?8,?9)
        ON CONFLICT(id) DO UPDATE SET body=?2,coach_body=?2,file_hash=?3,summary_body=?4,mode=?5,played_at=?6,played_sort=?7,blue_score=?8,orange_score=?9",
        params![id,body,hash,summary.to_string(),summary["mode"].as_str(),played,date_sort(played),summary["blue_score"].as_i64(),summary["orange_score"].as_i64()]).map_err(err)?;
    // A coach-only update must retain playback; explicit frames (including [])
    // replace it atomically with the metadata.
    if let Some(frames) = frames {
        let bytes = serde_json::to_vec(&frames).map_err(err)?;
        if bytes.len() as u64 > MAX_FRAME_JSON {
            return Err("Playback frame data exceeds 128 MiB safety limit".into());
        }
        let compressed = zstd::stream::encode_all(bytes.as_slice(), 3).map_err(err)?;
        db.execute("INSERT INTO replay_frames VALUES(?1,'zstd-json-v1',?2,?3) ON CONFLICT(replay_id) DO UPDATE SET codec=excluded.codec,uncompressed_size=excluded.uncompressed_size,body=excluded.body", params![id,bytes.len() as i64,compressed]).map_err(err)?;
    }
    db.execute("DELETE FROM replay_players WHERE replay_id=?1", [id])
        .map_err(err)?;
    for player in analysis["players"].as_array().into_iter().flatten() {
        if let Some(pid) = player["id"].as_str() {
            db.execute(
                "INSERT OR REPLACE INTO replay_players VALUES(?1,?2,?3,?4,?5,?6)",
                params![
                    id,
                    pid,
                    player["name"].as_str().unwrap_or("Unknown"),
                    player["team"].as_i64(),
                    player["platform"].as_str(),
                    player["is_bot"].as_bool().unwrap_or(false)
                ],
            )
            .map_err(err)?;
        }
    }
    Ok(())
}

impl CoachService {
    pub fn snapshot_dir(&self) -> PathBuf {
        self.dir.join("replay-snapshots")
    }

    pub fn save_replay(&self, analysis: &Value) -> ServiceResult<()> {
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        write_replay(&tx, analysis)?;
        tx.commit().map_err(err)
    }

    pub fn get_replay(&self, id: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let body: String = db
            .query_row("SELECT body FROM replays WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(err)?
            .ok_or_else(|| format!("Replay {id} not found"))?;
        let mut value: Value = serde_json::from_str(&body).map_err(err)?;
        let frames: Option<(String, i64, Vec<u8>)> = db
            .query_row(
                "SELECT codec,uncompressed_size,body FROM replay_frames WHERE replay_id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(err)?;
        drop(db);
        if let Some((codec, size, blob)) = frames {
            if codec != "zstd-json-v1" || size < 0 || size as u64 > MAX_FRAME_JSON {
                return Err("Invalid playback storage format or size".into());
            }
            let mut bytes = Vec::new();
            zstd::stream::read::Decoder::new(blob.as_slice())
                .map_err(err)?
                .take(MAX_FRAME_JSON + 1)
                .read_to_end(&mut bytes)
                .map_err(err)?;
            if bytes.len() as i64 != size {
                return Err(
                    "Playback frame storage was truncated or exceeds its declared size".into(),
                );
            }
            value["frames"] = serde_json::from_slice(&bytes).map_err(err)?;
        } else {
            value["frames"] = json!([]);
        }
        Ok(semantics::normalize_analysis(value))
    }

    pub fn get_coach_replay(&self, id: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let text: String = db
            .query_row("SELECT coach_body FROM replays WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(err)?;
        serde_json::from_str(&text)
            .map(semantics::normalize_analysis)
            .map_err(err)
    }

    pub fn has_replay_by_hash(&self, hash: &str) -> ServiceResult<bool> {
        self.db
            .lock()
            .map_err(err)?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM replays WHERE file_hash=?1)",
                [hash],
                |r| r.get(0),
            )
            .map_err(err)
    }

    pub fn is_replay_deleted(&self, hash: &str) -> ServiceResult<bool> {
        self.db
            .lock()
            .map_err(err)?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM replay_tombstones WHERE file_hash=?1)",
                [hash],
                |r| r.get(0),
            )
            .map_err(err)
    }

    pub fn is_replay_id_deleted(&self, id: &str) -> ServiceResult<bool> {
        self.db
            .lock()
            .map_err(err)?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM replay_id_tombstones WHERE replay_id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(err)
    }

    pub fn replay_id_by_hash(&self, hash: &str) -> ServiceResult<Option<String>> {
        self.db
            .lock()
            .map_err(err)?
            .query_row(
                "SELECT id FROM replays WHERE file_hash=?1 LIMIT 1",
                [hash],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    pub fn restore_original_filename(&self, hash: &str, name: &str) -> ServiceResult<()> {
        let db = self.db.lock().map_err(err)?;
        // Repair old snapshot-based display names without touching evidence or
        // overwriting an existing descriptive filename.
        db.execute("UPDATE replays SET body=json_set(body,'$.summary.file_name',?2),coach_body=json_set(coach_body,'$.summary.file_name',?2),summary_body=json_set(summary_body,'$.file_name',?2) WHERE file_hash=?1 AND json_extract(summary_body,'$.file_name')=?3", params![hash,name,format!("{hash}.replay")]).map_err(err)?;
        Ok(())
    }

    pub fn delete_replay(&self, id: &str) -> ServiceResult<()> {
        self.delete_replay_with_snapshot(id, true)
    }

    pub fn delete_replay_with_snapshot(
        &self,
        id: &str,
        remove_snapshot: bool,
    ) -> ServiceResult<()> {
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        let hash: Option<String> = tx
            .query_row("SELECT file_hash FROM replays WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?
            .flatten();
        tx.execute(
            "INSERT OR REPLACE INTO replay_id_tombstones VALUES(?1,?2)",
            params![id, now()],
        )
        .map_err(err)?;
        if let Some(hash) = hash.as_deref() {
            tx.execute(
                "INSERT OR REPLACE INTO replay_tombstones VALUES(?1,?2)",
                params![hash, now()],
            )
            .map_err(err)?;
            tx.execute(
                "UPDATE imports SET status='deleted',error=NULL,updated_at=?2 WHERE file_hash=?1",
                params![hash, now()],
            )
            .map_err(err)?;
        }
        tx.execute("DELETE FROM replays WHERE id=?1", [id])
            .map_err(err)?;
        tx.commit().map_err(err)?;
        drop(db);
        if remove_snapshot {
            // A hash from disk must never become a filesystem traversal path.
            if let Some(hash) =
                hash.filter(|h| h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit()))
            {
                match fs::remove_file(self.snapshot_dir().join(format!("{hash}.replay"))) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => {
                        return Err(format!(
                            "Replay deleted; could not remove its snapshot: {e}"
                        ))
                    }
                }
            }
        }
        Ok(())
    }

    pub fn get_player_candidates(&self) -> ServiceResult<Vec<Value>> {
        let db = self.db.lock().map_err(err)?;
        let mut q=db.prepare("SELECT p.player_id,
            (SELECT recent.name FROM replay_players recent JOIN replays r ON r.id=recent.replay_id WHERE recent.player_id=p.player_id ORDER BY r.played_sort DESC,r.rowid DESC LIMIT 1) AS latest_name,
            COUNT(*) AS matches FROM replay_players p WHERE p.is_bot=0 AND p.player_id NOT LIKE 'local:%' GROUP BY p.player_id ORDER BY matches DESC,latest_name ASC").map_err(err)?;
        let rows=q.query_map([], |r|Ok(json!({"player_id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"matches":r.get::<_,i64>(2)?}))).map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)
    }

    pub fn get_library(&self) -> ServiceResult<Value> {
        let identity_candidates = self.get_player_candidates()?;
        let db = self.db.lock().map_err(err)?;
        let mut q = db
            .prepare("SELECT summary_body FROM replays ORDER BY played_sort DESC,rowid DESC")
            .map_err(err)?;
        let rows = q.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
        let mut summaries = Vec::new();
        for row in rows {
            summaries.push(serde_json::from_str::<Value>(&row.map_err(err)?).map_err(err)?);
        }
        Ok(
            json!({"count":summaries.len(),"replays":summaries,"identity_candidates":identity_candidates}),
        )
    }

    pub fn get_teammates(&self, player_id: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut q=db.prepare("SELECT mate.player_id,mate.name,mate.platform,COUNT(*),
            SUM(CASE WHEN (own.team=0 AND r.blue_score>r.orange_score) OR (own.team=1 AND r.orange_score>r.blue_score) THEN 1 ELSE 0 END),MAX(r.played_sort)
            FROM replay_players own JOIN replay_players mate ON mate.replay_id=own.replay_id AND mate.team=own.team AND mate.player_id<>own.player_id
            JOIN replays r ON r.id=own.replay_id WHERE own.player_id=?1 GROUP BY mate.player_id ORDER BY COUNT(*) DESC,mate.player_id").map_err(err)?;
        let rows=q.query_map([player_id], |r| {
            let matches:i64=r.get(3)?;let wins:i64=r.get(4)?;
            Ok(json!({"player_id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"platform":r.get::<_,Option<String>>(2)?,"shared_matches":matches,"wins":wins,"losses":matches-wins,"win_rate":(wins as f64/matches as f64*1000.0).round()/10.0,"last_played":r.get::<_,Option<String>>(5)?}))
        }).map_err(err)?;
        Ok(json!(rows.collect::<Result<Vec<_>, _>>().map_err(err)?))
    }

    /// None means the file changed or has never been attempted. Failed and
    /// deleted records are durable too; restarting the app never retries them.
    pub fn unchanged_import(
        &self,
        path: &str,
        size: u64,
        mtime_ns: &str,
    ) -> ServiceResult<Option<(String, Option<String>)>> {
        self.db
            .lock()
            .map_err(err)?
            .query_row(
                "SELECT status,error FROM imports WHERE path=?1 AND size=?2 AND mtime_ns=?3",
                params![path, size as i64, mtime_ns],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)
    }

    pub fn record_import(
        &self,
        path: &str,
        size: u64,
        mtime_ns: &str,
        hash: Option<&str>,
        status: &str,
        error: Option<&str>,
    ) -> ServiceResult<()> {
        let name = Path::new(path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        self.db.lock().map_err(err)?.execute("INSERT INTO imports VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(path) DO UPDATE SET file_name=?2,size=?3,mtime_ns=?4,file_hash=?5,status=?6,error=?7,updated_at=?8", params![path,name.as_ref(),size as i64,mtime_ns,hash,status,error,now()]).map_err(err)?;
        Ok(())
    }

    pub fn get_import_status(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut q=db.prepare("SELECT path,file_name,size,mtime_ns,file_hash,status,error,updated_at FROM imports ORDER BY updated_at DESC,path").map_err(err)?;
        let rows=q.query_map([], |r|Ok(json!({"path":r.get::<_,String>(0)?,"file_name":r.get::<_,String>(1)?,"size":r.get::<_,i64>(2)?,"mtime_ns":r.get::<_,String>(3)?,"file_hash":r.get::<_,Option<String>>(4)?,"status":r.get::<_,String>(5)?,"error":r.get::<_,Option<String>>(6)?,"updated_at":r.get::<_,String>(7)?}))).map_err(err)?;
        Ok(json!(rows.collect::<Result<Vec<_>, _>>().map_err(err)?))
    }

    pub fn retry_failed_imports(&self, folder: &Path) -> ServiceResult<usize> {
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        let paths = {
            let mut q = tx
                .prepare("SELECT path FROM imports WHERE status='failed'")
                .map_err(err)?;
            let rows = q.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(err)?
        };
        let mut count = 0;
        for path in paths {
            if Path::new(&path).parent() == Some(folder) {
                count += tx
                    .execute(
                        "DELETE FROM imports WHERE path=?1 AND status='failed'",
                        [&path],
                    )
                    .map_err(err)?;
            }
        }
        tx.commit().map_err(err)?;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replay(id: &str, hash: &str, date: &str) -> Value {
        json!({"summary":{"id":id,"file_hash":hash,"file_name":"My match.replay","mode":"2v2","played_at":date,"blue_score":2,"orange_score":1},"players":[{"id":"epic:me","name":"Me","team":0},{"id":"epic:mate","name":"Mate","team":0},{"id":"local:bot","name":"Bot","team":1,"is_bot":true}],"frames":[{"time":1.0,"ball":{"x":1.0},"cars":[]}],"metrics":[]})
    }

    #[test]
    fn compressed_frames_round_trip_and_queries_use_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        let a = replay("a", &"a".repeat(64), "2026-01-01T12:00:00Z");
        service.save_replay(&a).unwrap();
        assert_eq!(service.get_replay("a").unwrap()["frames"], a["frames"]);
        assert!(service
            .get_coach_replay("a")
            .unwrap()
            .get("frames")
            .is_none());
        let db = service.db.lock().unwrap();
        let body: String = db
            .query_row("SELECT body FROM replays WHERE id='a'", [], |r| r.get(0))
            .unwrap();
        assert!(!body.contains("\"frames\""));
        let plan: String = db
            .query_row(
                "EXPLAIN QUERY PLAN SELECT 1 FROM replays WHERE file_hash=?1",
                ["a".repeat(64)],
                |r| r.get(3),
            )
            .unwrap();
        assert!(plan.contains("replay_file_hash"), "{plan}");
        drop(db);
        assert_eq!(service.get_library().unwrap()["replays"][0], a["summary"]);
        assert_eq!(service.get_player_candidates().unwrap().len(), 2);
        // Corrupt compact metadata must not affect SQL candidates or teammates.
        service
            .db
            .lock()
            .unwrap()
            .execute("UPDATE replays SET coach_body='broken' WHERE id='a'", [])
            .unwrap();
        assert_eq!(service.get_player_candidates().unwrap().len(), 2);
        assert_eq!(service.get_teammates("epic:me").unwrap()[0]["wins"], 1);
    }

    #[test]
    fn tombstone_survives_restart_and_snapshot_is_removed() {
        let dir = tempfile::tempdir().unwrap();
        let hash = "b".repeat(64);
        let service = CoachService::open(dir.path()).unwrap();
        let a = replay("a", &hash, "2026-01-01");
        service.save_replay(&a).unwrap();
        fs::create_dir_all(service.snapshot_dir()).unwrap();
        let snapshot = service.snapshot_dir().join(format!("{hash}.replay"));
        fs::write(&snapshot, b"snapshot").unwrap();
        service
            .record_import("C:\\replays\\a.replay", 8, "123", Some(&hash), "new", None)
            .unwrap();
        service.delete_replay("a").unwrap();
        assert!(!snapshot.exists());
        assert_eq!(service.get_import_status().unwrap()[0]["status"], "deleted");
        assert_eq!(
            service
                .db
                .lock()
                .unwrap()
                .query_row("SELECT COUNT(*) FROM replay_frames", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        drop(service);
        let reopened = CoachService::open(dir.path()).unwrap();
        assert!(reopened.is_replay_deleted(&hash).unwrap());
        assert!(reopened.save_replay(&a).is_err());
        let reexport = replay("a", &"e".repeat(64), "2026-01-01");
        assert!(reopened.save_replay(&reexport).is_err());
        assert_eq!(reopened.get_library().unwrap()["count"], 0);
    }

    #[test]
    fn snapshot_retention_is_explicit_and_bad_frame_blob_does_not_break_library() {
        let dir = tempfile::tempdir().unwrap();
        let hash = "d".repeat(64);
        let service = CoachService::open(dir.path()).unwrap();
        service
            .save_replay(&replay("a", &hash, "2026-01-01"))
            .unwrap();
        service
            .db
            .lock()
            .unwrap()
            .execute(
                "UPDATE replay_frames SET uncompressed_size=1 WHERE replay_id='a'",
                [],
            )
            .unwrap();
        assert!(service
            .get_replay("a")
            .unwrap_err()
            .contains("declared size"));
        assert_eq!(service.get_library().unwrap()["count"], 1);
        assert!(service.get_coach_replay("a").is_ok());
        fs::create_dir_all(service.snapshot_dir()).unwrap();
        let path = service.snapshot_dir().join(format!("{hash}.replay"));
        fs::write(&path, b"snapshot").unwrap();
        service.delete_replay_with_snapshot("a", false).unwrap();
        assert!(path.exists());
        assert!(service.is_replay_deleted(&hash).unwrap());
    }

    #[test]
    fn unchanged_success_and_failure_are_durable_and_retry_is_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        let source = dir.path().join("matches");
        let other = dir.path().join("other");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&other).unwrap();
        let good = source.join("good.replay").to_string_lossy().to_string();
        let bad = source.join("bad.replay").to_string_lossy().to_string();
        let unrelated = other.join("bad.replay").to_string_lossy().to_string();
        for (p, status, error) in [
            (&good, "new", None),
            (&bad, "failed", Some("corrupt replay")),
            (&unrelated, "failed", Some("unsupported replay")),
        ] {
            service
                .record_import(p, 42, "123", None, status, error)
                .unwrap();
        }
        assert!(service
            .unchanged_import(&good, 42, "123")
            .unwrap()
            .is_some());
        assert_eq!(
            service
                .unchanged_import(&bad, 42, "123")
                .unwrap()
                .unwrap()
                .1,
            Some("corrupt replay".into())
        );
        assert!(service.unchanged_import(&bad, 43, "123").unwrap().is_none());
        assert!(service.unchanged_import(&bad, 42, "124").unwrap().is_none());
        drop(service);
        let reopened = CoachService::open(dir.path()).unwrap();
        assert!(reopened
            .unchanged_import(&bad, 42, "123")
            .unwrap()
            .is_some());
        assert_eq!(reopened.retry_failed_imports(&source).unwrap(), 1);
        assert!(reopened
            .unchanged_import(&bad, 42, "123")
            .unwrap()
            .is_none());
        assert!(reopened
            .unchanged_import(&good, 42, "123")
            .unwrap()
            .is_some());
        assert!(reopened
            .unchanged_import(&unrelated, 42, "123")
            .unwrap()
            .is_some());
    }

    #[test]
    fn teammate_latest_date_is_independent_of_insert_order_and_offsets() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        service
            .save_replay(&replay("new", &"a".repeat(64), "2026-01-02T00:30:00-05:00"))
            .unwrap();
        service
            .save_replay(&replay("old", &"b".repeat(64), "2026-01-02T04:30:00Z"))
            .unwrap();
        let mates = service.get_teammates("epic:me").unwrap();
        assert_eq!(mates[0]["last_played"], "2026-01-02T05:30:00+00:00");
        assert_eq!(mates[0]["shared_matches"], 2);
    }

    #[test]
    fn legacy_database_migrates_frames_and_reopens_without_loss() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("coach.sqlite3");
        let a = replay("legacy", &"c".repeat(64), "2026-01-01");
        let db = Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE replays(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT,body TEXT NOT NULL);INSERT INTO conversations VALUES('chat','Keep me','2026-01-01');INSERT INTO messages VALUES('msg','chat','{\"content\":\"Preserved\"}');").unwrap();
        db.execute("INSERT INTO replays VALUES('legacy',?1)", [a.to_string()])
            .unwrap();
        drop(db);
        let service = CoachService::open(dir.path()).unwrap();
        assert_eq!(service.get_replay("legacy").unwrap()["frames"], a["frames"]);
        assert_eq!(
            service
                .db
                .lock()
                .unwrap()
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            migrations::SCHEMA_VERSION
        );
        assert!(dir
            .path()
            .join(format!(
                "coach-before-schema-v{}.sqlite3",
                migrations::SCHEMA_VERSION
            ))
            .exists());
        drop(service);
        let service = CoachService::open(dir.path()).unwrap();
        assert_eq!(
            service.get_messages("chat").unwrap()[0]["body"]["content"],
            "Preserved"
        );
        assert_eq!(service.get_library().unwrap()["count"], 1);
    }

    #[test]
    fn interrupted_frame_migration_rolls_back_with_original_backup() {
        let dir = tempfile::tempdir().unwrap();
        let db = Connection::open(dir.path().join("coach.sqlite3")).unwrap();
        db.execute_batch("CREATE TABLE replays(id TEXT PRIMARY KEY,body TEXT NOT NULL);INSERT INTO replays VALUES('broken','not-json');").unwrap();
        drop(db);
        assert!(CoachService::open(dir.path()).is_err());
        let db = Connection::open(dir.path().join("coach.sqlite3")).unwrap();
        assert_eq!(
            db.query_row("SELECT body FROM replays", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "not-json"
        );
        let backup = Connection::open(dir.path().join(format!(
            "coach-before-schema-v{}.sqlite3",
            migrations::SCHEMA_VERSION
        )))
        .unwrap();
        assert_eq!(
            backup
                .query_row("SELECT body FROM replays", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "not-json"
        );
    }
}
