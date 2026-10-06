//! Local, evidence-linked situation cohorts. Outcomes are review candidates, not blame.
use super::*;
use rusqlite::OptionalExtension;
use std::collections::{BTreeMap, BTreeSet};

const VERSION: &str = "situations-2";
fn number(v: &Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite())
}
fn context(a: &Value, player: &Value, frame: Option<&Value>, at: f64) -> Value {
    let team = player["team"].as_u64();
    let car = frame.and_then(|f| f["cars"].as_array()).and_then(|cs| {
        cs.iter()
            .find(|c| c["player_id"] == player["id"] && c["discontinuity"] != true)
    });
    let boost = car.and_then(|c| number(&c["boost"]).filter(|b| (0.0..=100.0).contains(b)));
    let x = car.and_then(|c| number(&c["position"][0]));
    let y = car
        .and_then(|c| number(&c["position"][1]))
        .zip(team)
        .map(|(y, t)| y * if t == 0 { 1.0 } else { -1.0 });
    let zone = y
        .map(|y| {
            if y < -1700.0 {
                "own third"
            } else if y > 1700.0 {
                "opponent third"
            } else {
                "middle third"
            }
        })
        .unwrap_or("unknown");
    let lane = x
        .zip(team)
        .map(|(x, t)| x * if t == 0 { 1.0 } else { -1.0 })
        .map(|x| {
            if x < -1300.0 {
                "left"
            } else if x > 1300.0 {
                "right"
            } else {
                "center"
            }
        })
        .unwrap_or("unknown");
    let goals: Vec<_> = a["events"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|e| e["category"] == "goal")
        .collect();
    let complete = a["coverage"]["goals"] == true
        && goals
            .iter()
            .all(|g| g["team"].as_u64().is_some_and(|t| t < 2));
    let scores: [Option<i64>; 2] = std::array::from_fn(|t| {
        a["summary"][if t == 0 { "blue_score" } else { "orange_score" }]
            .as_i64()
            .and_then(|s| {
                let n = goals
                    .iter()
                    .filter(|e| e["team"] == t && number(&e["time"]).is_some_and(|v| v > at))
                    .count() as i64;
                (complete && s >= n).then_some(s - n)
            })
    });
    let margin = team.filter(|t| *t < 2).and_then(|t| {
        scores[t as usize]
            .zip(scores[1 - t as usize])
            .map(|(me, them)| me - them)
    });
    let score_state = margin
        .map(|n| {
            if n < 0 {
                "trailing"
            } else if n > 0 {
                "leading"
            } else {
                "tied"
            }
        })
        .unwrap_or("unknown");
    let overtime = frame.and_then(|f| f["overtime"].as_bool());
    let clock = frame.and_then(|f| f["match_clock_seconds"].as_i64());
    let phase = match overtime {
        Some(true) => "overtime",
        Some(false) => match clock {
            Some(0..=60) => "last minute",
            Some(n) if n > 60 => "regulation",
            _ => "unknown",
        },
        None => "unknown",
    };
    json!({"zone":zone,"lane":lane,"boost":boost,"boost_bucket":boost.map(|b|if b<20.0{"low (<20)"}else if b<60.0{"medium (20–59)"}else{"high (60–100)"}).unwrap_or("unknown"),"score_state":score_state,"score_margin":margin,"clock_seconds":clock,"phase":phase,"overtime":overtime,"position":car.map(|c|c["position"].clone()),"ball_position":frame.map(|f|f["ball"]["position"].clone()),"observed_at":frame.and_then(|f|number(&f["time"]))})
}
fn build_cache(a: &Value) -> Value {
    let frames: Vec<_> = a["frames"].as_array().into_iter().flatten().collect();
    let events: Vec<_> = a["events"].as_array().into_iter().flatten().collect();
    let mut rows = vec![];
    for player in a["players"].as_array().into_iter().flatten() {
        for event in &events {
            let conceded = event["category"] == "goal"
                && event["team"]
                    .as_u64()
                    .is_some_and(|t| t < 2 && Some(t) != player["team"].as_u64());
            let own_review = event["player_id"] == player["id"]
                && ["review", "critical"].contains(&event["severity"].as_str().unwrap_or(""));
            let team_goal = event["category"] == "goal"
                && event["team"]
                    .as_u64()
                    .is_some_and(|t| t < 2 && Some(t) == player["team"].as_u64());
            let team_review = event["player_id"].is_null()
                && event["team"].as_u64() == player["team"].as_u64()
                && ["review", "critical"].contains(&event["severity"].as_str().unwrap_or(""));
            let own_event = event["player_id"] == player["id"];
            let candidate = conceded || own_review || team_review;
            if !candidate && !team_goal && !own_event {
                continue;
            }
            let Some(time) = number(&event["time"]) else {
                continue;
            };
            let at = (time - 3.0).max(0.0);
            let idx = frames.partition_point(|f| number(&f["time"]).is_some_and(|t| t <= at));
            let frame = idx
                .checked_sub(1)
                .and_then(|i| frames.get(i).copied())
                .filter(|f| {
                    f["live_play"] == true
                        && f["discontinuity"] != true
                        && number(&f["time"]).is_some_and(|t| at - t <= 0.5)
                });
            let context = context(a, player, frame, at);
            let event_index =
                frames.partition_point(|f| number(&f["time"]).is_some_and(|t| t <= time));
            let event_frame = event_index
                .checked_sub(1)
                .and_then(|i| frames.get(i).copied())
                .filter(|f| number(&f["time"]).is_some_and(|t| time - t <= 0.5));
            let event_phase =
                crate::intelligence::context(a, player, event_frame, time)["phase"].clone();

            let kind = if conceded {
                "goal conceded"
            } else if team_goal {
                if own_event {
                    "goal scored"
                } else {
                    "team goal scored"
                }
            } else {
                event["category"].as_str().unwrap_or("review")
            };
            let key = format!(
                "{}|{}|{}|{}|{}|{}|{}",
                a["summary"]["mode"].as_str().unwrap_or("unknown"),
                kind,
                context["zone"].as_str().unwrap_or("unknown"),
                context["lane"].as_str().unwrap_or("unknown"),
                context["boost_bucket"].as_str().unwrap_or("unknown"),
                context["score_state"].as_str().unwrap_or("unknown"),
                context["phase"].as_str().unwrap_or("unknown")
            );
            rows.push(json!({"replay_id":a["summary"]["id"],"file_name":a["summary"]["file_name"],"played_at":a["summary"]["played_at"],"mode":a["summary"]["mode"],"player_id":player["id"],"event_id":event["id"],"time":time,"title":event["title"],"kind":kind,"event_phase":event_phase,"context":context,"fingerprint":key,"source":"recorded replay; context sampled 3 seconds before marker","event_confidence":event["confidence"],"review_candidate":candidate}));
        }
    }
    json!({"version":VERSION,"rows":rows})
}
impl CoachService {
    fn scoped_situations(&self, mode: &str) -> ServiceResult<(String, Vec<Value>, usize)> {
        if !["All", "1v1", "2v2", "3v3"].contains(&mode) {
            return Err("Unsupported mode".into());
        }
        let player = self
            .resolve_player_id(None)
            .filter(|p| !p.is_empty())
            .ok_or("Confirm your player in Settings")?;
        let sources = {
            let db = self.db.lock().map_err(err)?;
            let mut q=db.prepare("SELECT r.id,r.intelligence_revision,c.body FROM replays r JOIN replay_players p ON p.replay_id=r.id LEFT JOIN situation_cache c ON c.replay_id=r.id AND c.revision=r.intelligence_revision WHERE p.player_id=?1 AND (?2='All' OR r.mode=?2) ORDER BY r.played_sort DESC,r.id DESC").map_err(err)?;
            let result = q
                .query_map(params![player, mode], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, Option<String>>(2)?,
                    ))
                })
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            result
        };
        let mut rows = vec![];
        let mut matches = 0;
        for (id, revision, cached) in sources {
            let cached = cached
                .map(|body| serde_json::from_str::<Value>(&body).map_err(err))
                .transpose()?
                .filter(|data| data["version"] == VERSION);
            let data = if let Some(data) = cached {
                data
            } else {
                let mut analysis = self.get_replay(&id)?;
                if analysis["summary"]["dataset_role"] == "benchmark" {
                    continue;
                }
                // Enrich old imports from their immutable, bounded snapshots when available.
                let hash = analysis["summary"]["file_hash"].as_str().unwrap_or("");
                if hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()) {
                    let path = self.snapshot_dir().join(format!("{hash}.replay"));
                    if path.is_file() {
                        if let Ok(meta) = replay_core::read_profile_metadata(&path, true) {
                            if meta["file_hash"] != hash {
                                return Err(
                                    "Replay snapshot hash changed; metadata was not indexed".into(),
                                );
                            }
                            let samples: Vec<_> =
                                meta["overtime"].as_array().into_iter().flatten().collect();
                            let mut index = 0;
                            let mut ot = Value::Null;
                            for frame in analysis["frames"].as_array_mut().into_iter().flatten() {
                                while index < samples.len()
                                    && number(&samples[index][0])
                                        .zip(number(&frame["time"]))
                                        .is_some_and(|(s, t)| s <= t)
                                {
                                    ot = samples[index][1].clone();
                                    index += 1;
                                }
                                if frame["overtime"].is_null() {
                                    frame["overtime"] = ot.clone();
                                }
                            }
                        }
                    }
                }
                let data = build_cache(&analysis);
                let db = self.db.lock().map_err(err)?;
                // Never publish an index derived from a source replaced during computation.
                let current: Option<i64> = db
                    .query_row(
                        "SELECT intelligence_revision FROM replays WHERE id=?1",
                        [&id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?;
                if current != Some(revision) {
                    return Err("Replay library changed while indexing; retry the query".into());
                }
                db.execute("INSERT INTO situation_cache VALUES(?1,?2,?3) ON CONFLICT(replay_id) DO UPDATE SET revision=excluded.revision,body=excluded.body",params![id,revision,data.to_string()]).map_err(err)?;
                data
            };
            // Cached benchmark data is excluded as well.
            let compact = self.get_coach_replay(&id)?;
            if compact["summary"]["dataset_role"] == "benchmark" {
                continue;
            }
            matches += 1;
            rows.extend(
                data["rows"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|r| r["player_id"] == player)
                    .cloned(),
            );
        }
        let reviews = {
            let db = self.db.lock().map_err(err)?;
            let mut q = db
                .prepare(
                    "SELECT replay_id,event_id,verdict FROM situation_reviews WHERE player_id=?1",
                )
                .map_err(err)?;
            let result = q
                .query_map([&player], |r| {
                    Ok((
                        (r.get::<_, String>(0)?, r.get::<_, String>(1)?),
                        r.get::<_, String>(2)?,
                    ))
                })
                .map_err(err)?
                .collect::<Result<HashMap<_, _>, _>>()
                .map_err(err)?;
            result
        };
        for row in &mut rows {
            row["review"] = json!(reviews
                .get(&(
                    row["replay_id"].as_str().unwrap_or("").into(),
                    row["event_id"].as_str().unwrap_or("").into()
                ))
                .map(String::as_str)
                .unwrap_or("unreviewed"));
        }
        Ok((player, rows, matches))
    }
    pub fn search_replay_events(&self, mode: &str, args: &Value) -> ServiceResult<Value> {
        let kind = args["kind"].as_str().unwrap_or("all");
        let phase = args["phase"].as_str().unwrap_or("all");
        let review = args["review"].as_str().unwrap_or("all");
        if ![
            "all",
            "goal conceded",
            "goal scored",
            "team goal scored",
            "goals",
            "touch",
            "boost",
            "rotation",
            "coverage",
            "demo",
        ]
        .contains(&kind)
            || !["all", "overtime", "last minute", "regulation", "unknown"].contains(&phase)
            || !["all", "mistake", "not_mistake", "unsure", "unreviewed"].contains(&review)
        {
            return Err("Unsupported event filter".into());
        }
        let cursor = args["cursor"].as_u64().unwrap_or(0).min(100000) as usize;
        let limit = args["limit"].as_u64().unwrap_or(20).clamp(1, 40) as usize;
        let (player, rows, matches) = self.scoped_situations(mode)?;
        let unknown_phase = rows
            .iter()
            .filter(|r| r["event_phase"] == "unknown")
            .count();
        let filtered: Vec<_> = rows
            .into_iter()
            .filter(|r| {
                (kind == "all"
                    || r["kind"] == kind
                    || (kind == "goals"
                        && ["goal conceded", "goal scored", "team goal scored"]
                            .contains(&r["kind"].as_str().unwrap_or(""))))
                    && (phase == "all" || r["event_phase"] == phase)
                    && (review == "all" || r["review"] == review)
            })
            .collect();
        Ok(
            json!({"index_version":VERSION,"player_id":player,"mode":mode,"matches_searched":matches,"total":filtered.len(),"rows":filtered.iter().skip(cursor).take(limit).collect::<Vec<_>>(),"next_cursor":if cursor+limit<filtered.len(){Some(cursor+limit)}else{None},"unknown_phase_events":unknown_phase,"scope":"entire personal imported library; benchmarks excluded","limitations":"Recorded goals, player events, and team review markers only; unknown overtime is excluded from overtime filters. A goal against your team does not establish your mistake."}),
        )
    }
    pub fn mistake_fingerprints(&self, mode: &str) -> ServiceResult<Value> {
        let (player, rows, matches) = self.scoped_situations(mode)?;
        let mut groups: BTreeMap<String, Vec<Value>> = BTreeMap::new();
        for row in rows.into_iter().filter(|r| r["review_candidate"] == true) {
            groups
                .entry(row["fingerprint"].as_str().unwrap_or("unknown").into())
                .or_default()
                .push(row);
        }
        let mut clusters:Vec<_>=groups.into_iter().map(|(key,rows)|{
            let confirmed=rows.iter().filter(|r|r["review"]=="mistake").count();
            let distinct:BTreeSet<_>=rows.iter().filter_map(|r|r["replay_id"].as_str()).collect();
            let mut trend:BTreeMap<String,(usize,usize,BTreeSet<String>)>=BTreeMap::new();
            for row in &rows {
                let date=row["played_at"].as_str().unwrap_or("");
                let date=date.get(..10).and_then(|s|chrono::NaiveDate::parse_from_str(s,"%Y-%m-%d").ok());
                let bucket=date.map(|d|d.format("%G-W%V").to_string()).unwrap_or_else(||"Unknown date".into());
                let entry=trend.entry(bucket).or_default();entry.0+=1;entry.1+=usize::from(row["review"]=="mistake");entry.2.insert(row["replay_id"].as_str().unwrap_or("").into());
            }
            let mut example_matches=BTreeSet::new();
            let examples:Vec<_>=rows.iter().filter(|r|example_matches.insert(r["replay_id"].as_str().unwrap_or(""))).take(5).collect();
            json!({"id":key,"mode":rows[0]["mode"],"kind":rows[0]["kind"],"context":rows[0]["context"],"candidate_count":rows.len(),"confirmed_mistakes":confirmed,"distinct_matches":distinct.len(),"confirmed_matches":rows.iter().filter(|r|r["review"]=="mistake").filter_map(|r|r["replay_id"].as_str()).collect::<BTreeSet<_>>().len(),"examples":examples,"trend":trend.into_iter().map(|(week,(candidate,confirmed,matches))|json!({"week":week,"candidates":candidate,"confirmed":confirmed,"matches":matches.len()})).collect::<Vec<_>>()})
        }).collect();
        clusters.sort_by(|a, b| {
            b["confirmed_mistakes"]
                .as_u64()
                .cmp(&a["confirmed_mistakes"].as_u64())
                .then(
                    b["distinct_matches"]
                        .as_u64()
                        .cmp(&a["distinct_matches"].as_u64()),
                )
                .then(
                    b["candidate_count"]
                        .as_u64()
                        .cmp(&a["candidate_count"].as_u64()),
                )
                .then(a["id"].as_str().cmp(&b["id"].as_str()))
        });
        Ok(
            json!({"index_version":VERSION,"player_id":player,"mode":mode,"matches_searched":matches,"clusters":clusters.into_iter().take(40).collect::<Vec<_>>(),"method":"Deterministic context buckets, 3 seconds before a marker; repeat in 2+ distinct matches before calling recurring. Not learned tactical blame.","trend_policy":"Counts in imported replays only; header-local calendar weeks, timezone may be unknown. No opportunity denominator or causal improvement claim."}),
        )
    }
    pub fn review_situation(
        &self,
        mode: &str,
        replay: &str,
        event: &str,
        verdict: &str,
    ) -> ServiceResult<()> {
        if !["mistake", "not_mistake", "unsure"].contains(&verdict) {
            return Err("Unsupported review decision".into());
        }
        let (player, rows, _) = self.scoped_situations(mode)?;
        if !rows.iter().any(|r| {
            r["replay_id"] == replay && r["event_id"] == event && r["review_candidate"] == true
        }) {
            return Err("Event outside personal mode scope".into());
        }
        self.db.lock().map_err(err)?.execute("INSERT INTO situation_reviews VALUES(?1,?2,?3,?4,?5) ON CONFLICT(replay_id,event_id,player_id) DO UPDATE SET verdict=excluded.verdict,updated_at=excluded.updated_at",params![replay,event,player,verdict,now()]).map_err(err)?;
        Ok(())
    }
    pub fn drill_from_fingerprint(&self, mode: &str, id: &str) -> ServiceResult<Value> {
        let report = self.mistake_fingerprints(mode)?;
        let cluster = report["clusters"]
            .as_array()
            .and_then(|cs| cs.iter().find(|c| c["id"] == id))
            .ok_or("Fingerprint no longer available")?;
        if cluster["confirmed_mistakes"].as_u64().unwrap_or(0) < 2
            || cluster["confirmed_matches"].as_u64().unwrap_or(0) < 2
        {
            return Err("Confirm mistakes in at least two matches before creating a recurring-mistake drill".into());
        }
        let low = cluster["context"]["boost_bucket"] == "low (<20)";
        let drill = if low {
            "Free Play: start in your own half with 20 boost. Follow a small-pad route, turn goal-side, and make one controlled clear. Reset and repeat 10 times; 3 sessions this week."
        } else {
            "Review the five linked lead-ins in Overhead. Write one available alternative for each. In Free Play rehearse that recovery and a controlled touch 10 times; 3 sessions this week."
        };
        let cue = if low {
            "Check a reachable small pad and goal-side cover before the next challenge."
        } else if mode == "1v1" {
            "Check the opponent's position and your recovery route before committing."
        } else {
            "Check teammate cover and your recovery route before committing."
        };
        self.save_practice_plan(mode,&json!({"title":format!("Weekly review: {}",cluster["kind"].as_str().unwrap_or("recurring situation")),"drill":format!("{drill} Source fingerprint: {id}. Coaching suggestion to test, not a validated optimal play."),"success_criterion":"Complete 8/10 controlled repetitions; then record whether the cue was used in later same-mode matches.","next_match_cue":cue,"intended_minutes":15}))
    }
    pub fn opponent_history(&self, mode: &str) -> ServiceResult<Value> {
        let player = self
            .resolve_player_id(None)
            .ok_or("Confirm your player in Settings")?;
        if !["All", "1v1", "2v2", "3v3"].contains(&mode) {
            return Err("Unsupported mode".into());
        }
        let db = self.db.lock().map_err(err)?;
        let mut q=db.prepare("SELECT r.coach_body FROM replays r JOIN replay_players p ON p.replay_id=r.id WHERE p.player_id=?1 AND (?2='All' OR r.mode=?2) ORDER BY r.played_sort DESC,r.id DESC").map_err(err)?;
        let sources = q
            .query_map(params![player, mode], |r| r.get::<_, String>(0))
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut opponents: BTreeMap<String, Value> = BTreeMap::new();
        for body in sources {
            let a: Value = serde_json::from_str(&body).map_err(err)?;
            if a["summary"]["dataset_role"] == "benchmark" {
                continue;
            }
            let Some(me) = a["players"]
                .as_array()
                .and_then(|ps| ps.iter().find(|p| p["id"] == player))
            else {
                continue;
            };
            for p in a["players"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|p| p["team"] != me["team"])
            {
                let Some(id) = p["id"].as_str() else {
                    continue;
                };
                let item=opponents.entry(id.into()).or_insert_with(||json!({"player":p,"encounters":0,"replays":[],"tracker_url":tracker_url(id),"last_seen":a["summary"]["played_at"]}));
                item["encounters"] = json!(item["encounters"].as_u64().unwrap_or(0) + 1);
                if let Some(list) = item["replays"].as_array_mut() {
                    if list.len() < 10 {
                        list.push(a["summary"]["id"].clone());
                    }
                }
            }
        }
        let mut records: Vec<_> = opponents.into_values().collect();
        records.sort_by(|a, b| b["encounters"].as_u64().cmp(&a["encounters"].as_u64()));
        Ok(
            json!({"records":records,"source":"local replay encounters","rank_status":"Current opponent ranks unavailable; Tracker profile links require supported identity. No public Rocket League Tracker API configured."}),
        )
    }
    pub fn save_detector_report(
        &self,
        replay: &str,
        player: &str,
        body: &Value,
    ) -> ServiceResult<()> {
        let a = self.get_coach_replay(replay)?;
        if !a["players"]
            .as_array()
            .is_some_and(|ps| ps.iter().any(|p| p["id"] == player && p["is_bot"] != true))
        {
            return Err("Choose a human-slot player in this replay; built-in bots are not RL cheat detections".into());
        }
        let score = number(&body["score_percent"])
            .filter(|s| (0.0..=100.0).contains(s))
            .ok_or("Score must be 0–100")?;
        let version = body["detector_version"]
            .as_str()
            .filter(|s| !s.trim().is_empty() && s.len() <= 80)
            .ok_or("Record the detector version")?;
        let source = body["source"]
            .as_str()
            .filter(|s| ["whosbotting.com", "rldetect.com"].contains(s))
            .ok_or("Unsupported detector source")?;
        let reference = body["result_url"]
            .as_str()
            .ok_or("Record the external result URL")?;
        let url = url::Url::parse(reference).map_err(|_| "Invalid result URL")?;
        if reference.len() > 1000
            || url.scheme() != "https"
            || url.host_str() != Some(source)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
        {
            return Err("Result URL must be HTTPS on the selected detector's domain".into());
        }
        let safe = json!({"score_percent":score,"source":source,"detector_version":version,"result_url":reference,"provenance":"user-entered external detector result; not independently verified","interpretation":"Bot-likeness score, not a calibrated probability of cheating. Do not infer identity, intent, or certainty."});
        self.db.lock().map_err(err)?.execute("INSERT INTO detector_reports VALUES(?1,?2,?3,?4) ON CONFLICT(replay_id,player_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",params![replay,player,safe.to_string(),now()]).map_err(err)?;
        Ok(())
    }
    pub fn detector_reports(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut q = db
            .prepare("SELECT replay_id,player_id,body,updated_at FROM detector_reports")
            .map_err(err)?;
        let records=q.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?.into_iter().map(|(replay,player,b,at)|json!({"replay_id":replay,"player_id":player,"report":serde_json::from_str::<Value>(&b).unwrap_or(Value::Null),"recorded_at":at})).collect::<Vec<_>>();
        Ok(
            json!({"records":records,"automatic_detection":"unavailable: no supported public detector API or calibrated local model"}),
        )
    }
}
fn tracker_url(id: &str) -> Option<String> {
    let (platform, id) = id.split_once(':')?;
    let platform = match platform {
        "steam" if id.bytes().all(|b| b.is_ascii_digit()) => "steam",
        _ => return None,
    };
    (!id.is_empty()).then(|| {
        format!(
            "https://rocketleague.tracker.network/rocket-league/profile/{platform}/{id}/overview"
        )
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(id: &str, mode: &str, boost: Value) -> Value {
        let mut a = json!({"summary":{"id":id,"mode":mode,"blue_score":0,"orange_score":1,"played_at":"2026-10-03 12-00-00"},"players":[{"id":"me","team":0},{"id":"them","team":1}],"coverage":{"goals":true},"frames":[{"time":10,"live_play":true,"discontinuity":false,"match_clock_seconds":15,"overtime":true,"cars":[{"player_id":"me","position":[0,-3000,17],"boost":boost,"discontinuity":false}]}],"events":[{"id":"goal","time":10,"category":"goal","team":1,"title":"Goal","severity":"strength"}]});
        let mut lead = a["frames"][0].clone();
        lead["time"] = json!(7);
        a["frames"].as_array_mut().unwrap().insert(0, lead);
        a
    }
    #[test]
    fn context_uses_pre_goal_score_and_unknowns() {
        let a = fixture("a", "2v2", Value::Null);
        let cache = build_cache(&a);
        let c = &cache["rows"][0]["context"];
        assert_eq!(c["score_state"], "tied");
        assert_eq!(c["boost"], Value::Null);
        assert_eq!(c["boost_bucket"], "unknown");
        assert_eq!(c["phase"], "overtime");
        assert_eq!(c["zone"], "own third");
        let mut gap = a.clone();
        gap["frames"][0]["time"] = json!(5);
        assert_eq!(build_cache(&gap)["rows"][0]["context"]["zone"], "unknown");
    }
    #[test]
    fn queries_reviews_cache_and_drills_are_scoped() {
        let dir = std::env::temp_dir().join(format!("antirl-intelligence-{}", ident()));
        let service = CoachService::open(&dir).unwrap();
        service.save_settings(json!({"player_id":"me"})).unwrap();
        service
            .save_replay(&fixture("a", "2v2", json!(10)))
            .unwrap();
        service
            .save_replay(&fixture("b", "1v1", json!(10)))
            .unwrap();
        assert_eq!(
            service
                .search_replay_events("2v2", &json!({"kind":"goal conceded","phase":"overtime"}))
                .unwrap()["total"],
            1
        );
        assert!(service
            .review_situation("2v2", "b", "goal", "mistake")
            .is_err());
        service
            .review_situation("2v2", "a", "goal", "mistake")
            .unwrap();
        let report = service.mistake_fingerprints("2v2").unwrap();
        let id = report["clusters"][0]["id"].as_str().unwrap();
        assert!(service.drill_from_fingerprint("2v2", id).is_err());
        service
            .save_replay(&fixture("c", "2v2", json!(10)))
            .unwrap();
        service
            .review_situation("2v2", "c", "goal", "mistake")
            .unwrap();
        assert!(service.drill_from_fingerprint("2v2", id).is_ok());
        let mut a = fixture("a", "2v2", json!(90));
        for f in a["frames"].as_array_mut().unwrap() {
            f["overtime"] = Value::Null;
        }
        service.save_replay(&a).unwrap();
        assert_eq!(
            service
                .search_replay_events("2v2", &json!({"phase":"overtime"}))
                .unwrap()["total"],
            1
        );
        service
            .save_replay(&fixture("d", "1v1", json!(90)))
            .unwrap();
        service
            .save_replay(&fixture("e", "1v1", json!(90)))
            .unwrap();
        service
            .review_situation("1v1", "d", "goal", "mistake")
            .unwrap();
        service
            .review_situation("1v1", "e", "goal", "mistake")
            .unwrap();
        let duel = service.mistake_fingerprints("1v1").unwrap();
        let duel_id = duel["clusters"][0]["id"].as_str().unwrap();
        let plan = service.drill_from_fingerprint("1v1", duel_id).unwrap();
        assert!(!plan["body"]["next_match_cue"]
            .as_str()
            .unwrap()
            .contains("teammate"));
        service.save_settings(json!({"player_id":"them"})).unwrap();
        assert_eq!(
            service.mistake_fingerprints("2v2").unwrap()["clusters"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
        drop(service);
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn goal_phase_is_distinct_from_lead_in_and_reports_are_sourced() {
        let mut a = fixture("ot", "2v2", json!(10));
        a["frames"][0]["overtime"] = json!(false);
        let rows = build_cache(&a);
        assert_eq!(rows["rows"][0]["context"]["phase"], "last minute");
        assert_eq!(rows["rows"][0]["event_phase"], "overtime");
        let dir = std::env::temp_dir().join(format!("antirl-detector-{}", ident()));
        let s = CoachService::open(&dir).unwrap();
        s.save_replay(&a).unwrap();
        let report = json!({"score_percent":70,"detector_version":"1.8.2","source":"whosbotting.com","result_url":"https://evil.example/result"});
        assert!(s.save_detector_report("ot", "me", &report).is_err());
        let mut report = report;
        report["result_url"] = json!("https://whosbotting.com/result/123");
        s.save_detector_report("ot", "me", &report).unwrap();
        assert_eq!(
            s.detector_reports().unwrap()["records"][0]["report"]["score_percent"].as_f64(),
            Some(70.0)
        );
        report["score_percent"] = json!(101);
        assert!(s.save_detector_report("ot", "me", &report).is_err());
        assert!(s.save_detector_report("ot", "missing", &report).is_err());
        drop(s);
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn scored_goals_and_team_flags_are_searchable_without_becoming_blame() {
        let mut a = fixture("goals", "2v2", json!(10));
        a["events"][0]["player_id"] = json!("them");
        let rows = build_cache(&a);
        let winning = rows["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["player_id"] == "them")
            .unwrap();
        assert_eq!(winning["kind"], "goal scored");
        assert_eq!(winning["review_candidate"], false);
        a["events"].as_array_mut().unwrap().push(json!({"id":"team-review","time":10,"category":"coverage","team":0,"severity":"review"}));
        let rows = build_cache(&a);
        assert!(rows["rows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["player_id"] == "me"
                && r["event_id"] == "team-review"
                && r["review_candidate"] == true));
    }
    #[test]
    fn all_mode_queries_keep_fingerprints_separate_and_duel_drills_have_no_teammates() {
        let dir = std::env::temp_dir().join(format!("antirl-modes-{}", ident()));
        let s = CoachService::open(&dir).unwrap();
        s.save_settings(json!({"player_id":"me"})).unwrap();
        for (id, mode) in [("a", "2v2"), ("b", "1v1"), ("c", "1v1")] {
            s.save_replay(&fixture(id, mode, json!(90))).unwrap();
        }
        assert_eq!(
            s.mistake_fingerprints("All").unwrap()["clusters"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        s.review_situation("1v1", "b", "goal", "mistake").unwrap();
        s.review_situation("1v1", "c", "goal", "mistake").unwrap();
        let report = s.mistake_fingerprints("1v1").unwrap();
        let id = report["clusters"][0]["id"].as_str().unwrap();
        let plan = s.drill_from_fingerprint("1v1", id).unwrap();
        let cue = plan["body"]["next_match_cue"].as_str().unwrap();
        assert!(cue.contains("opponent"));
        assert!(!cue.contains("teammate"));
        drop(s);
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn tracker_links_never_guess_epic_ids_as_names() {
        assert!(tracker_url("epic:opaque-id").is_none());
        assert!(tracker_url("steam:123").unwrap().contains("/steam/123/"));
        assert!(tracker_url("steam:abc").is_none());
    }
}
