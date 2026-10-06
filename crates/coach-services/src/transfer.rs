//! Local-only reflections. Replay windows are observational, never a cue detector.
use super::*;
use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const KEYS: &[&str] = &[
    "avg_boost",
    "low_boost_pct",
    "avg_speed",
    "time_at_or_above_supersonic_threshold_pct",
    "defensive_half_pct",
    "ahead_ball_pct",
    "avg_ball_distance",
];
pub(crate) fn completion_time(input: Option<&str>) -> ServiceResult<String> {
    let at = match input {
        Some(s) => DateTime::parse_from_rfc3339(s)
            .map_err(|_| "Practice completion needs a timestamp with UTC offset")?
            .with_timezone(&Utc),
        None => Utc::now(),
    };
    if at > Utc::now() {
        return Err("Practice completion cannot be in the future".into());
    }
    Ok(at.to_rfc3339())
}
fn replay_time(raw: &Value, offset: Option<i32>) -> Option<DateTime<Utc>> {
    let raw = raw.as_str()?;
    if let Ok(at) = DateTime::parse_from_rfc3339(raw) {
        return Some(at.with_timezone(&Utc));
    }
    let tz = FixedOffset::east_opt(offset? * 60)?;
    [
        "%Y-%m-%d %H-%M-%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ]
    .iter()
    .find_map(|f| NaiveDateTime::parse_from_str(raw, f).ok())
    .and_then(|at| tz.from_local_datetime(&at).single())
    .map(|at| at.with_timezone(&Utc))
}
fn metric_catalog() -> Vec<Value> {
    let dictionary: Value =
        serde_json::from_str(replay_core::METRIC_DICTIONARY).expect("embedded metric dictionary");
    dictionary["metrics"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|m| KEYS.contains(&m["key"].as_str().unwrap_or("")))
        .map(|m| {
            let mut m = m.clone();
            m["version"] = json!("metrics-2");
            m["aggregation"] =
                json!("sum numerator / sum valid seconds; compatible metrics-2 observations only");
            m
        })
        .collect()
}
fn personal(a: &Value, player: &str, mode: &str) -> bool {
    a["summary"]["mode"] == mode
        && a["summary"]["dataset_role"] != "benchmark"
        && a["players"]
            .as_array()
            .is_some_and(|ps| ps.iter().any(|p| p["id"] == player && p["is_bot"] != true))
}
fn context(a: &Value) -> Option<Value> {
    let s = &a["summary"];
    if s["playlist_id"].as_i64().is_none() && s["match_type"].as_str().is_none() {
        return None;
    }
    Some(
        json!({"playlist_id":s["playlist_id"],"match_type":s["match_type"],"mutators":s["mutators"]}),
    )
}
fn game_reason(a: &Value) -> Option<&'static str> {
    let s = &a["summary"];
    if s["status"] != "ready" {
        return Some("replay_not_ready");
    }
    if s["completion_state"]
        .as_str()
        .is_some_and(|v| v != "complete")
    {
        return Some("incomplete_or_unknown_completion");
    }
    if s["mutators"].as_array().is_some_and(|v| !v.is_empty())
        || s["mutators"].as_object().is_some_and(|v| !v.is_empty())
        || s["mutators"].as_str().is_some_and(|v| !v.is_empty())
    {
        return Some("mutators");
    }
    None
}
fn read_replays(db: &Connection, player: &str, mode: &str) -> ServiceResult<Vec<Value>> {
    let mut q = db
        .prepare("SELECT coach_body FROM replays ORDER BY id")
        .map_err(err)?;
    let rows = q.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
    let mut out = vec![];
    for row in rows {
        let a: Value =
            semantics::normalize_analysis(serde_json::from_str(&row.map_err(err)?).map_err(err)?);
        if personal(&a, player, mode) {
            out.push(a);
        }
    }
    Ok(out)
}
fn match_row(a: &Value, offset: Option<i32>) -> Value {
    json!({"replay_id":a["summary"]["id"],"file_name":a["summary"]["file_name"],"played_at":a["summary"]["played_at"],"comparable_at":replay_time(&a["summary"]["played_at"],offset).map(|d|d.to_rfc3339()),"context":context(a),"eligibility_note":game_reason(a),"revision":format!("{:x}",Sha256::digest(a.to_string().as_bytes()))})
}
fn window(rows: &[&Value], player: &str, metric: Option<&Value>, offset: Option<i32>) -> Value {
    let mut numerator = 0.0;
    let mut seconds = 0.0;
    let mut count = 0;
    let mut tracked = 0.0;
    let mut excluded = BTreeMap::<String, usize>::new();
    let matches: Vec<_> = rows
        .iter()
        .map(|a| {
            let mut row = match_row(a, offset);
            let m = metric.and_then(|spec| {
                a["metrics"]
                    .as_array()?
                    .iter()
                    .find(|m| m["player_id"] == player && m["key"] == spec["key"])
            });
            let reason = match m {
                None => Some("measurement_unavailable"),
                Some(m) if m["metric_version"] != "metrics-2" => {
                    Some("incompatible_metric_version")
                }
                Some(m)
                    if !m["value"].as_f64().is_some_and(|v| v.is_finite())
                        || !m["numerator"].as_f64().is_some_and(|v| v.is_finite())
                        || !m["denominator"]
                            .as_f64()
                            .is_some_and(|v| v.is_finite() && v > 0.0) =>
                {
                    Some("missing_valid_weights")
                }
                _ => None,
            };
            if metric.is_some() {
                if let Some(reason) = reason {
                    *excluded.entry(reason.into()).or_default() += 1;
                    row["metric_value"] = Value::Null;
                    row["metric_note"] = json!(reason);
                } else if let Some(m) = m {
                    numerator += m["numerator"].as_f64().unwrap();
                    seconds += m["denominator"].as_f64().unwrap();
                    count += 1;
                    row["metric_value"] = m["value"].clone();
                    row["valid_seconds"] = m["denominator"].clone();
                }
                let duration = a["metrics"]
                    .as_array()
                    .and_then(|ms| {
                        ms.iter()
                            .find(|m| m["player_id"] == player && m["key"] == "tracked_seconds")
                    })
                    .and_then(|m| m["value"].as_f64());
                if let Some(d) = duration.filter(|d| d.is_finite() && *d > 0.0) {
                    tracked += d;
                }
            }
            row
        })
        .collect();
    json!({"matches":matches,"selected_count":rows.len(),"valid_count":count,"value":if seconds>0.0{Some(numerator/seconds)}else{None},"valid_seconds":seconds,"tracked_seconds":if tracked>0.0{Some(tracked)}else{None},"excluded":excluded,"source":"replay_measurement","method":"sum numerator / sum valid seconds; no legacy fallback"})
}
impl CoachService {
    pub fn start_transfer(
        &self,
        mode: &str,
        plan_id: &str,
        metric_key: Option<&str>,
        reference_replay_id: Option<&str>,
        replay_offset_minutes: Option<i32>,
    ) -> ServiceResult<()> {
        let player = self.practice_scope(mode)?;
        if replay_offset_minutes.is_some_and(|v| !(-720..=840).contains(&v) || v % 15 != 0) {
            return Err("Replay UTC offset must be -12 to +14 hours in 15-minute steps".into());
        }
        let metric = match metric_key {
            None => None,
            Some(key) => Some(
                metric_catalog()
                    .into_iter()
                    .find(|m| m["key"] == key)
                    .ok_or("Unsupported transfer measurement")?,
            ),
        };
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        let body:String=tx.query_row("SELECT body FROM practice_plans WHERE id=?1 AND player_id=?2 AND mode=?3 AND archived=0",params![plan_id,player,mode],|r|r.get(0)).map_err(|_|"Plan outside personal mode scope")?;
        let plan: Value = serde_json::from_str(&body).map_err(err)?;
        let reference = if metric.is_some() {
            let id = reference_replay_id
                .ok_or("Choose a reference replay to keep match context comparable")?;
            let raw: String = tx
                .query_row("SELECT coach_body FROM replays WHERE id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(|_| "Reference replay unavailable")?;
            let a: Value = serde_json::from_str(&raw).map_err(err)?;
            if !personal(&a, &player, mode) || game_reason(&a).is_some() {
                return Err("Reference replay outside eligible personal scope".into());
            }
            Some(context(&a).ok_or("Reference replay needs known playlist or match type")?)
        } else {
            None
        };
        let prior: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM transfer_cycles WHERE plan_id=?1)",
                [plan_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        let anchor: Option<String> = if !prior {
            tx.query_row("SELECT completed_at FROM training_sessions WHERE plan_id=?1 AND completion_source='actual_completion' ORDER BY julianday(completed_at),id LIMIT 1",[plan_id],|r|r.get(0)).ok()
        } else {
            None
        };
        let created = now();
        let snapshot = json!({"cue":plan["next_match_cue"],"title":plan["title"],"metric":metric,"context":reference,"replay_offset_minutes":replay_offset_minutes,"policy_version":"transfer-1","eligible_since":if prior{Some(&created)}else{None}});
        tx.execute(
            "UPDATE transfer_cycles SET active=0 WHERE player_id=?1 AND mode=?2",
            params![player, mode],
        )
        .map_err(err)?;
        tx.execute("INSERT INTO transfer_cycles(id,plan_id,player_id,mode,created_at,anchor_at,body) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![ident(),plan_id,player,mode,created,anchor,snapshot.to_string()]).map_err(err)?;
        tx.commit().map_err(err)
    }
    pub(crate) fn get_transfer(&self, mode: &str, player: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let replays = read_replays(&db, player, mode)?;
        let mut q=db.prepare("SELECT id,plan_id,created_at,active,anchor_at,body FROM transfer_cycles WHERE player_id=?1 AND mode=?2 ORDER BY created_at DESC,id DESC").map_err(err)?;
        let rows = q
            .query_map(params![player, mode], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, bool>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, String>(5)?,
                ))
            })
            .map_err(err)?;
        let mut cycles = vec![];
        for row in rows {
            let (id, plan, created, active, anchor, body) = row.map_err(err)?;
            let snapshot: Value = serde_json::from_str(&body).map_err(err)?;
            let offset = snapshot["replay_offset_minutes"].as_i64().map(|v| v as i32);
            let at = anchor
                .as_ref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.with_timezone(&Utc));
            let mut before = vec![];
            let mut after = vec![];
            let mut excluded = BTreeMap::<String, usize>::new();
            let mut manual = vec![];
            for a in &replays {
                let reason = game_reason(a).or_else(|| {
                    if !snapshot["context"].is_null()
                        && context(a).as_ref() != Some(&snapshot["context"])
                    {
                        Some("different_or_unknown_context")
                    } else {
                        None
                    }
                });
                if let Some(reason) = reason {
                    *excluded.entry(reason.into()).or_default() += 1;
                    continue;
                }
                let Some(time) = replay_time(&a["summary"]["played_at"], offset) else {
                    *excluded.entry("unclear_chronology".into()).or_default() += 1;
                    manual.push(match_row(a, offset));
                    continue;
                };
                if time > Utc::now() {
                    *excluded.entry("future_replay_date".into()).or_default() += 1;
                    continue;
                }
                if let Some(at) = at {
                    if time < at {
                        let end = a["summary"]["duration_seconds"]
                            .as_f64()
                            .filter(|d| d.is_finite() && *d > 0.0 && *d * 1000.0 < i64::MAX as f64)
                            .and_then(|d| {
                                time.checked_add_signed(chrono::Duration::milliseconds(
                                    (d * 1000.0) as i64,
                                ))
                            });
                        let Some(end) = end else {
                            *excluded.entry("unknown_match_end".into()).or_default() += 1;
                            continue;
                        };
                        if end >= at {
                            *excluded
                                .entry("overlaps_practice_boundary".into())
                                .or_default() += 1;
                            continue;
                        }
                        before.push((time, a));
                    } else if time > at {
                        after.push((time, a));
                    } else {
                        *excluded.entry("boundary_tie".into()).or_default() += 1;
                    }
                }
            }
            before.sort_by(|a, b| {
                b.0.cmp(&a.0).then_with(|| {
                    a.1["summary"]["id"]
                        .as_str()
                        .cmp(&b.1["summary"]["id"].as_str())
                })
            });
            after.sort_by(|a, b| {
                a.0.cmp(&b.0).then_with(|| {
                    a.1["summary"]["id"]
                        .as_str()
                        .cmp(&b.1["summary"]["id"].as_str())
                })
            });
            let before: Vec<_> = before.iter().take(10).map(|r| r.1).collect();
            let after: Vec<_> = after.iter().take(10).map(|r| r.1).collect();
            let metric = (!snapshot["metric"].is_null()).then_some(&snapshot["metric"]);
            let before = window(&before, player, metric, offset);
            let after = window(&after, player, metric, offset);
            let mut checks=db.prepare("SELECT replay_id,state,notes,updated_at FROM transfer_checkins WHERE cycle_id=?1 ORDER BY updated_at DESC").map_err(err)?;
            let checkins=checks.query_map([&id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?))).map_err(err)?.map(|r|r.map(|(replay,state,notes,updated)| json!({"replay_id":replay,"state":state,"notes":notes,"updated_at":updated,"available":replays.iter().any(|a|a["summary"]["id"]==replay),"in_window":after["matches"].as_array().is_some_and(|ms|ms.iter().any(|m|m["replay_id"]==replay)),"source":"self_report"}))).collect::<Result<Vec<_>,_>>().map_err(err)?;
            let mut counts = BTreeMap::<String, usize>::new();
            for c in &checkins {
                if c["in_window"] == true {
                    *counts
                        .entry(c["state"].as_str().unwrap().into())
                        .or_default() += 1;
                }
            }
            cycles.push(json!({"id":id,"plan_id":plan,"created_at":created,"active":active,"anchor_at":anchor,"snapshot":snapshot,"before":before,"after":after,"manual_matches":manual,"checkins":checkins,"reflection_counts":counts,"excluded":excluded,"delta":before["value"].as_f64().zip(after["value"].as_f64()).map(|(a,b)|b-a)}));
        }
        let mut options: Vec<_> = replays.iter().map(|a| match_row(a, None)).collect();
        options.sort_by(|a, b| {
            b["played_at"]
                .as_str()
                .cmp(&a["played_at"].as_str())
                .then_with(|| a["replay_id"].as_str().cmp(&b["replay_id"].as_str()))
        });
        Ok(
            json!({"cycles":cycles,"metric_options":metric_catalog(),"match_options":options,"computed_at":now(),"privacy":"Transfer check-ins and notes stay local and are excluded from cloud Coach retrieval.","window_policy":"Closest 10 preceding and earliest 10 following matches; select before checking metric availability. Windows refresh when the replay library changes; saved reflections stay attached to their original replay."}),
        )
    }
    pub fn save_transfer_checkin(
        &self,
        mode: &str,
        cycle_id: &str,
        replay_id: &str,
        state: &str,
        notes: &str,
    ) -> ServiceResult<()> {
        let player = self.practice_scope(mode)?;
        if !["used", "missed", "no_opportunity", "unsure", "skipped"].contains(&state) {
            return Err("Invalid check-in state".into());
        }
        if notes.chars().count() > 2000 {
            return Err("Notes must be at most 2000 characters".into());
        }
        check_note_content(notes)?;
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        let (anchor,body):(Option<String>,String)=tx.query_row("SELECT anchor_at,body FROM transfer_cycles WHERE id=?1 AND player_id=?2 AND mode=?3",params![cycle_id,player,mode],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"Cycle outside personal mode scope")?;
        let anchor = anchor.ok_or("Record a practice session before reviewing transfer")?;
        let snapshot: Value = serde_json::from_str(&body).map_err(err)?;
        let raw: String = tx
            .query_row(
                "SELECT coach_body FROM replays WHERE id=?1",
                [replay_id],
                |r| r.get(0),
            )
            .map_err(|_| "Replay unavailable; existing reflection is retained")?;
        let a: Value = serde_json::from_str(&raw).map_err(err)?;
        if !personal(&a, &player, mode)
            || game_reason(&a).is_some()
            || (!snapshot["context"].is_null()
                && context(&a).as_ref() != Some(&snapshot["context"]))
        {
            return Err("Replay outside eligible personal context".into());
        }
        if let Some(time) = replay_time(
            &a["summary"]["played_at"],
            snapshot["replay_offset_minutes"].as_i64().map(|v| v as i32),
        ) {
            let at = DateTime::parse_from_rfc3339(&anchor)
                .map_err(err)?
                .with_timezone(&Utc);
            if time <= at || time > Utc::now() {
                return Err("Choose a match after practice, or one with unclear chronology".into());
            }
        }
        tx.execute("INSERT INTO transfer_checkins(cycle_id,replay_id,state,notes,updated_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(cycle_id,replay_id) DO UPDATE SET state=excluded.state,notes=excluded.notes,updated_at=excluded.updated_at",params![cycle_id,replay_id,state,notes.trim(),now()]).map_err(err)?;
        tx.commit().map_err(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn service() -> (tempfile::TempDir, CoachService, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = CoachService::open(dir.path()).unwrap();
        s.save_settings(json!({"player_id":"p"})).unwrap();
        let p=s.save_practice_plan("2v2",&json!({"title":"Pad route","drill":"Freeplay route","success_criterion":"Five attempts","next_match_cue":"Use small pads"})).unwrap();
        (dir, s, p["id"].as_str().unwrap().into())
    }
    fn replay(s: &CoachService, id: &str, date: &str, v: Option<f64>, seconds: f64) {
        s.save_replay(&json!({"summary":{"id":id,"file_name":format!("{id}.replay"),"file_hash":id,"mode":"2v2","played_at":date,"playlist_id":2,"match_type":"Online","status":"ready","duration_seconds":300},"players":[{"id":"p","is_bot":false}],"metrics":[{"key":"avg_boost","player_id":"p","value":v,"numerator":v.map(|v|v*seconds),"denominator":seconds,"metric_version":"metrics-2"},{"key":"tracked_seconds","player_id":"p","value":300,"metric_version":"metrics-2"}]})).unwrap();
    }
    fn start(s: &CoachService, p: &str, metric: bool) -> String {
        s.record_training_at(
            "2v2",
            p,
            5.0,
            "appropriate",
            "",
            Some("2026-01-02T00:00:00Z"),
        )
        .unwrap();
        s.start_transfer(
            "2v2",
            p,
            metric.then_some("avg_boost"),
            metric.then_some("base"),
            None,
        )
        .unwrap();
        s.get_practice("2v2").unwrap()["transfer"]["cycles"][0]["id"]
            .as_str()
            .unwrap()
            .into()
    }
    #[test]
    fn windows_select_before_metric_filter_and_preserve_zero_weights() {
        let (_d, s, p) = service();
        replay(&s, "base", "2026-01-01T00:00:00Z", Some(10.0), 100.0);
        replay(&s, "older", "2025-12-31T00:00:00Z", Some(0.0), 300.0);
        for i in 0..12 {
            replay(
                &s,
                &format!("after{i:02}"),
                &format!("2026-01-02T00:{:02}:00Z", i + 1),
                if i == 0 { None } else { Some(80.0) },
                100.0,
            );
        }
        start(&s, &p, true);
        let d = s.get_practice("2v2").unwrap();
        let c = &d["transfer"]["cycles"][0];
        assert_eq!(c["before"]["value"], 2.5);
        assert_eq!(c["before"]["valid_count"], 2);
        assert_eq!(c["after"]["selected_count"], 10);
        assert_eq!(c["after"]["valid_count"], 9);
        assert_eq!(c["after"]["matches"][0]["replay_id"], "after00");
        assert_eq!(c["after"]["matches"][9]["replay_id"], "after09");
        assert_eq!(c["after"]["matches"][0]["metric_value"], Value::Null);
        assert_eq!(c["after"]["value"], 80.0);
        assert_eq!(c["after"]["valid_seconds"], 900.0);
    }
    #[test]
    fn chronology_context_missing_version_and_overlaps_are_explicit() {
        let (_d, s, p) = service();
        replay(&s, "base", "2026-01-01T00:00:00Z", Some(10.0), 100.0);
        replay(&s, "naive", "2026-01-02 00-10-00", Some(20.0), 100.0);
        replay(&s, "tie", "2026-01-02T00:00:00Z", Some(20.0), 100.0);
        replay(&s, "overlap", "2026-01-01T23:59:00Z", Some(20.0), 100.0);
        replay(&s, "legacy", "2026-01-02T00:01:00Z", Some(20.0), 100.0);
        let mut a = s.get_coach_replay("legacy").unwrap();
        a["metrics"][0]["metric_version"] = json!("metrics-1");
        s.save_replay(&a).unwrap();
        replay(
            &s,
            "casual_other",
            "2026-01-02T00:02:00Z",
            Some(20.0),
            100.0,
        );
        let mut a = s.get_coach_replay("casual_other").unwrap();
        a["summary"]["playlist_id"] = json!(12);
        s.save_replay(&a).unwrap();
        let id = start(&s, &p, true);
        let d = s.get_practice("2v2").unwrap();
        let c = &d["transfer"]["cycles"][0];
        assert_eq!(c["manual_matches"].as_array().unwrap().len(), 1);
        assert_eq!(c["after"]["valid_count"], 0);
        assert!(c["after"]["value"].is_null());
        assert_eq!(c["excluded"]["boundary_tie"], 1);
        assert_eq!(c["excluded"]["overlaps_practice_boundary"], 1);
        assert_eq!(c["excluded"]["different_or_unknown_context"], 1);
        assert_eq!(c["after"]["excluded"]["incompatible_metric_version"], 1);
        assert!(s
            .save_transfer_checkin("2v2", &id, "tie", "used", "")
            .is_err());
        s.save_transfer_checkin("2v2", &id, "naive", "unsure", "")
            .unwrap();
        assert_eq!(
            replay_time(&json!("2026-01-02 00-10-00"), Some(-240))
                .unwrap()
                .to_rfc3339(),
            "2026-01-02T04:10:00+00:00"
        );
        assert!(replay_time(&json!("2026-01-02"), Some(-240)).is_none());
        assert!(completion_time(Some("2026-01-02 00:00:00")).is_err());
        assert!(completion_time(Some("2999-01-02T00:00:00Z")).is_err());
    }
    #[test]
    fn checkins_are_editable_durable_local_and_survive_replay_deletion() {
        let (d, s, p) = service();
        replay(&s, "base", "2026-01-01T00:00:00Z", Some(0.0), 100.0);
        replay(&s, "after", "2026-01-02T01:00:00Z", None, 100.0);
        let id = start(&s, &p, false);
        s.save_transfer_checkin(
            "2v2",
            &id,
            "after",
            "skipped",
            "local-only transfer note xyz",
        )
        .unwrap();
        s.save_transfer_checkin("2v2", &id, "after", "used", "local-only transfer note xyz")
            .unwrap();
        let d1 = s.get_practice("2v2").unwrap();
        assert_eq!(
            d1["transfer"]["cycles"][0]["checkins"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let cloud = s
            .execute_evidence_plan("All", &[("get_training_history".into(), json!({}))])
            .to_string();
        assert!(!cloud.contains("local-only transfer note xyz"));
        assert!(!cloud.contains("reflection_counts"));
        assert!(s
            .save_transfer_checkin("1v1", &id, "after", "used", "")
            .is_err());
        s.save_settings(json!({"player_id":"q"})).unwrap();
        assert!(s
            .save_transfer_checkin("2v2", &id, "after", "used", "")
            .is_err());
        assert!(s.get_practice("2v2").unwrap()["transfer"]["cycles"]
            .as_array()
            .unwrap()
            .is_empty());
        s.save_settings(json!({"player_id":"p"})).unwrap();
        s.delete_replay("after").unwrap();
        drop(s);
        let s = CoachService::open(d.path()).unwrap();
        let data = s.get_practice("2v2").unwrap();
        let check = &data["transfer"]["cycles"][0]["checkins"][0];
        assert_eq!(check["state"], "used");
        assert_eq!(check["available"], false);
        assert_eq!(check["notes"], "local-only transfer note xyz");
        assert!(s
            .save_replay(&json!({"summary":{"id":"after","file_hash":"after"}}))
            .is_err());
    }
    #[test]
    fn switching_and_new_cycles_preserve_history_and_wait_for_new_practice() {
        let (_d, s, p) = service();
        let id = start(&s, &p, false);
        s.start_transfer("2v2", &p, None, None, None).unwrap();
        let data = s.get_practice("2v2").unwrap();
        let cs = data["transfer"]["cycles"].as_array().unwrap();
        assert_eq!(cs.len(), 2);
        assert_eq!(cs.iter().filter(|c| c["active"] == true).count(), 1);
        assert!(cs.iter().find(|c| c["active"] == true).unwrap()["anchor_at"].is_null());
        assert!(cs.iter().any(|c| c["id"] == id));
        s.record_training_at("2v2", &p, 5.0, "easy", "", Some("2026-01-03T00:00:00Z"))
            .unwrap();
        assert!(s.get_practice("2v2").unwrap()["transfer"]["cycles"][0]["anchor_at"].is_null());
        s.record_training("2v2", &p, 5.0, "easy", "").unwrap();
        assert!(s.get_practice("2v2").unwrap()["transfer"]["cycles"][0]["anchor_at"].is_string());
        s.archive_practice("2v2", &p).unwrap();
        assert!(s.get_practice("2v2").unwrap()["transfer"]["cycles"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["active"] == false));
    }
    #[test]
    fn migration_retains_old_plans_logs_and_does_not_invent_completion_time() {
        let (d, s, p) = service();
        s.record_training("2v2", &p, 5.0, "easy", "old log")
            .unwrap();
        drop(s);
        let db = Connection::open(d.path().join("coach.sqlite3")).unwrap();
        db.execute_batch("DROP TABLE situation_cache; DROP TABLE situation_reviews; DROP TABLE camera_profiles; DROP TABLE detector_reports; DROP TABLE IF EXISTS bot_labels; ALTER TABLE replays DROP COLUMN intelligence_revision; DROP TABLE transfer_checkins; DROP TABLE transfer_cycles; ALTER TABLE training_sessions DROP COLUMN logged_at; ALTER TABLE training_sessions DROP COLUMN completion_source; DELETE FROM schema_migrations WHERE version>=6; PRAGMA user_version=5;").unwrap();
        drop(db);
        let s = CoachService::open(d.path()).unwrap();
        s.start_transfer("2v2", &p, None, None, None).unwrap();
        let data = s.get_practice("2v2").unwrap();
        assert_eq!(data["plans"].as_array().unwrap().len(), 1);
        assert_eq!(data["sessions"][0]["body"]["notes"], "old log");
        assert_eq!(
            data["sessions"][0]["completion_source"],
            "legacy_logged_time"
        );
        assert!(data["transfer"]["cycles"][0]["anchor_at"].is_null());
        drop(s);
        let s = CoachService::open(d.path()).unwrap();
        assert_eq!(
            s.get_practice("2v2").unwrap()["sessions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
}
