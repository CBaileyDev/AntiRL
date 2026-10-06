//! Rebuildable, versioned projection. Source commits precede projection commits;
//! reconciliation on startup/query repairs interrupted imports and deletions.
use super::*;
use sha2::{Digest, Sha256};

pub fn migrate(db: &Connection, dir: &Path) -> ServiceResult<()> {
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(err)?;
    db.busy_timeout(Duration::from_secs(10)).map_err(err)?;
    let old: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if old > 2 {
        return Err("Analytics database was written by a newer AntiRL version".into());
    }
    if old == 2 {
        return Ok(());
    }
    if old == 1 {
        let backup = dir.join("analytics-before-provenance-v2.sqlite3");
        if !backup.exists() {
            db.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
                .map_err(err)?;
        }
    }
    for version in old + 1..=2 {
        let tx = db.unchecked_transaction().map_err(err)?;
        tx.execute_batch(match version {
            1 => include_str!("migrations/analytics_001_base.sql"),
            2 => include_str!("migrations/analytics_002_provenance.sql"),
            _ => unreachable!(),
        })
        .map_err(err)?;
        tx.execute(
            "INSERT OR REPLACE INTO migrations VALUES(?1,?2)",
            params![version, now()],
        )
        .map_err(err)?;
        tx.pragma_update(None, "user_version", version)
            .map_err(err)?;
        tx.commit().map_err(err)?;
    }
    Ok(())
}

impl CoachService {
    pub fn reconcile_analytics(&self) -> ServiceResult<()> {
        self.project_analytics(false)
    }

    fn project_analytics(&self, rebuild: bool) -> ServiceResult<()> {
        let source = self.db.lock().map_err(err)?;
        let mut analytics = self.analytics.lock().map_err(err)?;
        let tx = analytics.transaction().map_err(err)?;
        // Rebuild and verification share one transaction. A bad source row or a
        // process crash leaves the previous projection intact.
        if rebuild {
            tx.execute("DELETE FROM source_matches", []).map_err(err)?;
        }
        tx.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY); DELETE FROM seen;",
        )
        .map_err(err)?;
        let mut q = source
            .prepare("SELECT id,coach_body FROM replays ORDER BY rowid")
            .map_err(err)?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        let mut watermark = Sha256::new();
        for row in rows {
            let (id, body) = row.map_err(err)?;
            let a: Value = semantics::normalize_analysis(serde_json::from_str(&body).map_err(err)?);
            // Parser uses the replay's game ID when present, content hash otherwise.
            // Never deduplicate by names, timestamp, or scoreboard similarity.
            tx.execute("INSERT OR IGNORE INTO seen VALUES(?1)", [&id])
                .map_err(err)?;
            let revision = format!("{:x}", Sha256::digest(body.as_bytes()));
            watermark.update(id.as_bytes());
            watermark.update(revision.as_bytes());
            let existing: Option<String> = tx
                .query_row(
                    "SELECT revision FROM source_matches WHERE id=?1",
                    [&id],
                    |r| r.get(0),
                )
                .ok();
            let has_provenance: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM match_provenance WHERE match_id=?1)",
                    [&id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if existing.as_deref() == Some(&revision) && has_provenance {
                continue;
            }
            let played = a["summary"]["played_at"].as_str().and_then(normalize_date);
            tx.execute("INSERT INTO source_matches VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET revision=?2,played_at=?3,mode=?4,body=?5",params![id,revision,played,a["summary"]["mode"].as_str().unwrap_or("unknown"),body]).map_err(err)?;
            tx.execute("DELETE FROM metric_observations WHERE match_id=?1", [&id])
                .map_err(err)?;
            let sm = &a["summary"];
            tx.execute("INSERT OR REPLACE INTO match_provenance VALUES(?1,?2)",params![id,json!({"canonical_match_id":id,"source_revision":revision,"file_hash":sm["file_hash"],"played_at_raw":sm["played_at"],"imported_at":sm["imported_at"],"time_source":"replay_header; timezone may be unknown","parser_version":sm["parser_version"],"season":sm["season"],"mutators":sm["mutators"],"playlist":sm["playlist"],"completion_state":sm["completion_state"],"coverage":a["coverage"]}).to_string()]).map_err(err)?;
            tx.execute("DELETE FROM participants WHERE match_id=?1", [&id])
                .map_err(err)?;
            for p in a["players"].as_array().into_iter().flatten() {
                if let Some(pid) = p["id"].as_str() {
                    tx.execute(
                        "INSERT INTO participants VALUES(?1,?2,?3,?4,?5)",
                        params![
                            id,
                            pid,
                            p["team"].as_i64(),
                            p["name"].as_str(),
                            p["identity_confidence"]
                                .as_str()
                                .unwrap_or("source_identity; not account confirmation")
                        ],
                    )
                    .map_err(err)?;
                }
            }
            tx.execute("DELETE FROM metric_provenance WHERE match_id=?1", [&id])
                .map_err(err)?;
            for m in a["metrics"].as_array().into_iter().flatten() {
                tx.execute(
                    "INSERT OR REPLACE INTO metric_observations VALUES(?1,?2,?3,?4,?5,?6,?7)",
                    params![
                        id,
                        m["player_id"].as_str().unwrap_or(""),
                        m["key"].as_str().unwrap_or(""),
                        m["value"].as_f64(),
                        m["numerator"].as_f64(),
                        m["denominator"].as_f64(),
                        m["metric_version"].as_str().unwrap_or("legacy")
                    ],
                )
                .map_err(err)?;
                tx.execute(
                    "INSERT OR REPLACE INTO metric_provenance VALUES(?1,?2,?3,?4)",
                    params![
                        id,
                        m["player_id"].as_str().unwrap_or(""),
                        m["key"].as_str().unwrap_or(""),
                        m.to_string()
                    ],
                )
                .map_err(err)?;
            }
            tx.execute("DELETE FROM evidence_events WHERE match_id=?1", [&id])
                .map_err(err)?;
            for e in a["events"].as_array().into_iter().flatten() {
                if let Some(eid) = e["id"].as_str() {
                    tx.execute(
                        "INSERT OR REPLACE INTO evidence_events VALUES(?1,?2,?3,?4,?5,?6)",
                        params![
                            eid,
                            id,
                            e["player_id"].as_str(),
                            e["time"].as_f64(),
                            e["end_time"].as_f64(),
                            e.to_string()
                        ],
                    )
                    .map_err(err)?;
                }
            }
        }
        tx.execute(
            "DELETE FROM source_matches WHERE id NOT IN (SELECT id FROM seen)",
            [],
        )
        .map_err(err)?;
        let violations: i64 = tx
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        if violations != 0 {
            return Err("Projection integrity verification failed".into());
        }
        tx.execute(
            "INSERT OR REPLACE INTO projection_state VALUES('source_watermark',?1)",
            [format!("{:x}", watermark.finalize())],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }

    pub fn analytics_context(&self, player: Option<&str>, mode: &str) -> ServiceResult<Value> {
        self.reconcile_analytics()?;
        let db = self.analytics.lock().map_err(err)?;
        let mut q=db.prepare("SELECT body,revision,played_at FROM source_matches ORDER BY played_at DESC,id DESC").map_err(err)?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(err)?;
        let mut groups: std::collections::BTreeMap<String, Vec<Value>> =
            std::collections::BTreeMap::new();
        let mut excluded = std::collections::BTreeMap::<String, usize>::new();
        let mut total = 0;
        for row in rows {
            let (body, revision, played) = row.map_err(err)?;
            let a: Value = semantics::normalize_analysis(serde_json::from_str(&body).map_err(err)?);
            total += 1;
            let sm = &a["summary"];
            let m = sm["mode"].as_str().unwrap_or("unknown");
            let reason = if mode != "All" && m != mode {
                Some("other_mode")
            } else if player.is_none() {
                Some("identity_unknown")
            } else if !a["players"]
                .as_array()
                .is_some_and(|ps| ps.iter().any(|p| p["id"].as_str() == player))
            {
                Some("player_absent")
            } else if sm["dataset_role"] == "benchmark" {
                Some("benchmark")
            } else if !a["metrics"].as_array().is_some_and(|ms| {
                ms.iter()
                    .any(|x| x["player_id"].as_str() == player && x["value"].is_number())
            }) {
                Some("metrics_unavailable")
            } else {
                None
            };
            if let Some(reason) = reason {
                *excluded.entry(reason.into()).or_default() += 1;
                continue;
            }
            let metrics: Vec<Value> = a["metrics"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|x| x["player_id"].as_str() == player)
                .cloned()
                .collect();
            groups.entry(m.into()).or_default().push(json!({"id":sm["id"],"played_at":played,"time_provenance":if sm["played_at"].as_str().is_some_and(|s|chrono::DateTime::parse_from_rfc3339(s).is_ok()){"replay_header_with_offset"}else if played.is_some(){"replay_header_clock; timezone_unknown"}else{"unknown"},"revision":revision,"metrics":metrics,"result":personal_result(&a,player.unwrap_or(""))}));
        }
        let mut modes = json!({});
        for (m, all) in groups {
            let dated: Vec<Value> = all
                .iter()
                .filter(|x| !x["played_at"].is_null())
                .cloned()
                .collect();
            let recent: Vec<Value> = dated.iter().take(20).cloned().collect();
            let previous: Vec<Value> = dated.iter().skip(20).take(20).cloned().collect();
            let wins = all.iter().filter(|a| a["result"] == "win").count();
            let outcomes = all.iter().filter(|a| a["result"].is_string()).count();
            modes[m] = json!({"wins":wins,"win_rate":if outcomes>0{Some(100.0*wins as f64/outcomes as f64)}else{None},"lifetime_count":all.len(),"unknown_date_count":all.len()-dated.len(),"recent_count":recent.len(),"recent":recent,"previous_count":previous.len(),"lifetime":aggregate(&all),"recent_summary":aggregate(&recent),"previous_summary":aggregate(&previous)});
        }
        let watermark: String = db
            .query_row(
                "SELECT value FROM projection_state WHERE key='source_watermark'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        let result = json!({"metric_version":"metrics-2","query_version":"personal-windows-2","source_watermark":watermark,"source":"analytics.sqlite3","library_count":total,"player_id":player,"mode":mode,"modes":modes,"excluded":excluded,"lag":false,"date_policy":"Unknown dates included in lifetime only. Latest 20 per mode by replay clock; offset-aware timestamps normalized to UTC. Offset-free headers retain unknown timezone; ordering across timezone changes is uncertain."});
        if let Some(player) = player {
            db.execute("INSERT OR REPLACE INTO aggregate_snapshots VALUES(?1,?2,'personal-windows-2',?3,?4,?5)",params![player,mode,watermark,now(),result.to_string()]).map_err(err)?;
        }
        Ok(result)
    }
    pub fn rebuild_analytics(&self) -> ServiceResult<()> {
        self.project_analytics(true)
    }
}
fn personal_result(a: &Value, player: &str) -> Option<&'static str> {
    let team = a["players"]
        .as_array()?
        .iter()
        .find(|p| p["id"] == player)?["team"]
        .as_u64()?;
    let blue = a["summary"]["blue_score"].as_i64()?;
    let orange = a["summary"]["orange_score"].as_i64()?;
    Some(if blue == orange {
        "draw"
    } else if (team == 0 && blue > orange) || (team == 1 && orange > blue) {
        "win"
    } else {
        "loss"
    })
}
fn normalize_date(value: &str) -> Option<String> {
    if let Ok(d) = chrono::DateTime::parse_from_rfc3339(value) {
        return Some(d.with_timezone(&Utc).to_rfc3339());
    }
    ["%Y-%m-%d %H-%M-%S", "%Y-%m-%d %H:%M:%S"]
        .iter()
        .find_map(|f| chrono::NaiveDateTime::parse_from_str(value, f).ok())
        .map(|d| d.format("%Y-%m-%dT%H:%M:%S").to_string())
}
fn aggregate(matches: &[Value]) -> Value {
    let mut keys = std::collections::BTreeMap::<String, Vec<&Value>>::new();
    for a in matches {
        for m in a["metrics"].as_array().into_iter().flatten() {
            keys.entry(m["key"].as_str().unwrap_or("").into())
                .or_default()
                .push(m);
        }
    }
    let mut out = json!({});
    for (key, ms) in keys {
        let valid: Vec<_> = ms.into_iter().filter(|m| m["value"].is_number()).collect();
        let weighted = !valid.is_empty()
            && valid.iter().all(|m| {
                m["numerator"].is_number() && m["denominator"].as_f64().is_some_and(|d| d > 0.0)
            });
        let numerator: f64 = valid.iter().filter_map(|m| m["numerator"].as_f64()).sum();
        let denominator: f64 = valid.iter().filter_map(|m| m["denominator"].as_f64()).sum();
        let value = if valid.is_empty() {
            None
        } else if weighted {
            Some(numerator / denominator)
        } else {
            Some(
                valid
                    .iter()
                    .filter_map(|m| m["value"].as_f64())
                    .sum::<f64>()
                    / valid.len() as f64,
            )
        };
        out[key] = json!({"value":value,"count":valid.len(),"numerator":if weighted{Some(numerator)}else{None},"denominator":if weighted{Some(denominator)}else{None},"method":if weighted{"time_weighted"}else{"equal_match_mean; legacy weights unavailable or duration/count metric"}});
    }
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crash_worker() {
        let Some(path) = std::env::var_os("ANTIRL_CRASH_TEST_DIR") else {
            return;
        };
        let dir = PathBuf::from(path);
        assert!(dir.starts_with(std::env::temp_dir()));
        let s = CoachService::open(&dir).unwrap();
        let a = json!({"summary":{"id":"new-after-source-commit","mode":"2v2","played_at":"2026-01-02T00:00:00Z"},"players":[{"id":"p"}],"metrics":[{"key":"avg_boost","player_id":"p","value":50}]});
        s.save_replay(&a).unwrap();
        s.analytics
            .lock()
            .unwrap()
            .execute_batch("BEGIN IMMEDIATE; DELETE FROM source_matches;")
            .unwrap();
        std::process::exit(73);
    }
    #[test]
    fn process_exit_rolls_back_projection_and_reconciles_source_commit() {
        let d = tempfile::tempdir().unwrap();
        let s = CoachService::open(d.path()).unwrap();
        s.save_replay(&json!({"summary":{"id":"original","mode":"2v2","played_at":"2026-01-01T00:00:00Z"},"players":[{"id":"p"}],"metrics":[{"key":"avg_boost","player_id":"p","value":0}]})).unwrap();
        s.reconcile_analytics().unwrap();
        drop(s);
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "analytics::tests::crash_worker", "--nocapture"])
            .env("ANTIRL_CRASH_TEST_DIR", d.path())
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(73));
        let db = Connection::open(d.path().join("analytics.sqlite3")).unwrap();
        let count: i64 = db
            .query_row("SELECT count(*) FROM source_matches", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        drop(db);
        let s = CoachService::open(d.path()).unwrap();
        assert_eq!(
            s.analytics_context(Some("p"), "2v2").unwrap()["modes"]["2v2"]["lifetime_count"],
            2
        );
    }
    #[test]
    fn failed_rebuild_keeps_verified_projection() {
        let d = tempfile::tempdir().unwrap();
        let s = CoachService::open(d.path()).unwrap();
        s.save_replay(&json!({"summary":{"id":"good","mode":"2v2","played_at":"2026-01-01T00:00:00Z"},"players":[{"id":"p"}],"metrics":[{"key":"avg_boost","player_id":"p","value":0}]})).unwrap();
        s.reconcile_analytics().unwrap();
        s.db.lock()
            .unwrap()
            .execute(
                "UPDATE replays SET coach_body='invalid JSON' WHERE id='good'",
                [],
            )
            .unwrap();
        assert!(s.rebuild_analytics().is_err());
        let db = s.analytics.lock().unwrap();
        let value: f64 = db
            .query_row(
                "SELECT value FROM metric_observations WHERE match_id='good'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(value, 0.0);
    }
    #[test]
    fn recent_previous_lifetime_are_personal_and_mode_scoped() {
        let d = tempfile::tempdir().unwrap();
        let s = CoachService::open(d.path()).unwrap();
        for n in 0..45 {
            s.save_replay(&json!({"summary":{"id":format!("m{n:02}"),"mode":"2v2","played_at":format!("2026-01-01T00:{n:02}:00Z")},"players":[{"id":"p"}],"metrics":[{"key":"avg_boost","player_id":"p","value":n}]})).unwrap();
        }
        for (id, mode, who, date, role) in [
            ("undated", "2v2", "p", "unknown", "personal"),
            ("other", "1v1", "p", "2026-02-01T00:00:00Z", "personal"),
            ("absent", "2v2", "q", "2026-02-01T00:00:00Z", "personal"),
            ("benchmark", "2v2", "p", "2026-02-01T00:00:00Z", "benchmark"),
        ] {
            s.save_replay(&json!({"summary":{"id":id,"mode":mode,"played_at":date,"dataset_role":role},"players":[{"id":who}],"metrics":[{"key":"avg_boost","player_id":who,"value":50}]})).unwrap();
        }
        let ctx = s.analytics_context(Some("p"), "2v2").unwrap();
        let m = &ctx["modes"]["2v2"];
        assert_eq!(m["lifetime_count"], 46);
        assert_eq!(m["recent_count"], 20);
        assert_eq!(m["previous_count"], 20);
        assert_eq!(m["unknown_date_count"], 1);
        assert_eq!(m["recent"][0]["id"], "m44");
        assert_eq!(ctx["excluded"]["benchmark"], 1);
        assert_eq!(ctx["excluded"]["player_absent"], 1);
        assert_eq!(ctx["excluded"]["other_mode"], 1);
    }
    #[test]
    fn weighted_and_unknown() {
        let a =
            json!({"metrics":[{"key":"avg_boost","value":20,"numerator":200,"denominator":10}]});
        let b =
            json!({"metrics":[{"key":"avg_boost","value":80,"numerator":7200,"denominator":90}]});
        assert_eq!(aggregate(&[a, b])["avg_boost"]["value"], 74.0);
        assert!(
            aggregate(&[json!({"metrics":[{"key":"avg_speed","value":null}]})])["avg_speed"]
                ["value"]
                .is_null()
        );
    }
    #[test]
    fn dates() {
        assert!(normalize_date("unknown").is_none());
        assert_eq!(
            normalize_date("2026-01-02 10-00-00").unwrap(),
            "2026-01-02T10:00:00"
        );
    }
    #[test]
    fn reconcile_revision_delete_and_restart() {
        let d = tempfile::tempdir().unwrap();
        let s = CoachService::open(d.path()).unwrap();
        let mut a = json!({"summary":{"id":"a","mode":"2v2","played_at":"2026-01-01T00:00:00Z"},"players":[{"id":"p"}],"metrics":[{"key":"avg_boost","player_id":"p","value":0}]});
        s.save_replay(&a).unwrap();
        s.save_replay(&a).unwrap();
        assert_eq!(
            s.analytics_context(Some("p"), "2v2").unwrap()["modes"]["2v2"]["lifetime_count"],
            1
        );
        a["metrics"][0]["value"] = json!(75);
        s.save_replay(&a).unwrap();
        assert_eq!(
            s.analytics_context(Some("p"), "2v2").unwrap()["modes"]["2v2"]["lifetime"]["avg_boost"]
                ["value"],
            75.0
        );
        s.rebuild_analytics().unwrap();
        s.delete_replay("a").unwrap();
        assert_eq!(
            s.analytics_context(Some("p"), "2v2").unwrap()["library_count"],
            0
        );
    }
}
