use super::*;
impl CoachService {
    fn cloud_practice(&self, mode: &str) -> ServiceResult<Value> {
        let mut data = self.get_practice(mode)?;
        if let Some(data) = data.as_object_mut() {
            data.remove("transfer");
        }
        Ok(data)
    }

    pub fn search_training_packs(
        &self,
        query: &str,
        mode: &str,
        limit: usize,
    ) -> ServiceResult<Value> {
        let catalog: Vec<Value> =
            serde_json::from_str(include_str!("../../../app/src/data/training-packs.json"))
                .map_err(err)?;
        let query = query.to_ascii_lowercase();
        let terms: Vec<_> = query.split_whitespace().filter(|s| s.len() > 2).collect();
        let mut catalog: Vec<(usize, Value)> = catalog
            .into_iter()
            .filter(|p| {
                mode == "All"
                    || p["modes"]
                        .as_array()
                        .is_some_and(|ms| ms.iter().any(|m| m == mode))
            })
            .map(|p| {
                let text = format!("{} {} {}", p["title"], p["creator"], p["skill_tags"])
                    .to_ascii_lowercase();
                let score = terms.iter().filter(|t| text.contains(**t)).count();
                (score, p)
            })
            .filter(|(score, _)| query.is_empty() || *score > 0)
            .collect();
        catalog.sort_by_key(|entry| std::cmp::Reverse(entry.0));
        let records: Vec<_> = catalog
            .into_iter()
            .take(limit.min(20))
            .map(|(_, p)| p)
            .collect();
        Ok(
            json!({"records":records,"source":"verified_local_catalog","live_search":"unavailable: no supported search connector configured","verification":"source_confirmed does not mean in-game tested; published codes may have changed"}),
        )
    }
    pub fn evidence_tool(&self, tool: &str, mode: &str, args: &Value) -> ServiceResult<Value> {
        let settings = self.get_settings()?;
        let player = settings["player_id"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("Set an explicit player identity before evidence retrieval")?;
        if !["All", "1v1", "2v2", "3v3"].contains(&mode) {
            return Err("Unsupported mode".into());
        }
        match tool {
            "search_replay_events" => self.search_replay_events(mode, args),
            "get_mistake_fingerprints" => self.mistake_fingerprints(mode),
            "get_opponent_history" => self.opponent_history(mode),
            "get_player_overview" | "compare_windows" => self.analytics_context(Some(player), mode),
            "search_training_packs" => {
                self.search_training_packs(args["query"].as_str().unwrap_or(""), mode, 3)
            }
            "get_bot_likeness" => self.tool_bot_likeness(mode, player, args),
            "get_xg_summary" => self.tool_xg_summary(mode, player, args),
            "run_counterfactual" => self.tool_counterfactual(mode, player, args),
            "get_benchmark_summary" => Ok(
                json!({"status":"unavailable","reason":"No validated comparable benchmark cohort"}),
            ),
            "get_training_history" => {
                if mode == "All" {
                    Ok(
                        json!({"1v1":self.cloud_practice("1v1")?,"2v2":self.cloud_practice("2v2")?,"3v3":self.cloud_practice("3v3")?}),
                    )
                } else {
                    self.cloud_practice(mode)
                }
            }
            "list_matches" => {
                let ctx = self.analytics_context(Some(player), mode)?;
                let offset = args["cursor"].as_u64().unwrap_or(0).min(100000) as usize;
                let limit = args["limit"].as_u64().unwrap_or(20).clamp(1, 40) as usize;
                let db = self.analytics.lock().map_err(err)?;
                let mut q = db
                    .prepare(
                        "SELECT body,revision FROM source_matches ORDER BY played_at DESC,id DESC",
                    )
                    .map_err(err)?;
                let rows = q
                    .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                    .map_err(err)?;
                let mut matches = vec![];
                for row in rows {
                    let (body, revision) = row.map_err(err)?;
                    let a: Value = serde_json::from_str(&body).map_err(err)?;
                    if a["summary"]["dataset_role"] != "benchmark"
                        && (mode == "All" || a["summary"]["mode"] == mode)
                        && a["players"]
                            .as_array()
                            .is_some_and(|ps| ps.iter().any(|p| p["id"] == player))
                    {
                        matches.push(json!({"summary":a["summary"],"revision":revision}));
                    }
                }
                Ok(
                    json!({"matches":matches.iter().skip(offset).take(limit).collect::<Vec<_>>(),"next_cursor":if matches.len()>offset+limit{Some(offset+limit)}else{None},"scope":ctx["player_id"]}),
                )
            }
            "get_match_metrics" | "get_evidence_events" | "get_timeline_window" => {
                let id = args["replay_id"].as_str().ok_or("Missing replay ID")?;
                let a = if tool == "get_timeline_window" {
                    self.get_replay(id)?
                } else {
                    self.get_coach_replay(id)?
                };
                if (mode != "All" && a["summary"]["mode"] != mode)
                    || !a["players"]
                        .as_array()
                        .is_some_and(|ps| ps.iter().any(|p| p["id"] == player))
                {
                    return Err("Replay outside personal mode scope".into());
                }
                let start = args["start_s"].as_f64().unwrap_or(0.0);
                let end = args["end_s"].as_f64().unwrap_or(start + 10.0);
                if !start.is_finite()
                    || !end.is_finite()
                    || start < 0.0
                    || end < start
                    || end - start > 30.0
                {
                    return Err("Window must span at most 30 seconds".into());
                }
                let key = if tool == "get_match_metrics" {
                    "metrics"
                } else if tool == "get_evidence_events" {
                    "events"
                } else {
                    "frames"
                };
                let rows: Vec<_> = a[key]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|x| {
                        if key == "metrics" {
                            x["player_id"] == player
                        } else if key == "events" {
                            x["player_id"] == player
                                && x["time"].as_f64().is_some_and(|t| t >= start && t <= end)
                        } else {
                            x["time"].as_f64().is_some_and(|t| t >= start && t <= end)
                        }
                    })
                    .take(120)
                    .cloned()
                    .collect();
                Ok(
                    json!({"replay_id":id,"player_id":player,"mode":a["summary"]["mode"],"coverage":a["coverage"],"rows":rows,"limit":120,"bounded":true,"timeline_sampling":"existing render timeline; no inferred missing flags"}),
                )
            }
            _ => Err("Unsupported read-only evidence tool".into()),
        }
    }
}

/// Detector, xG and simulation tools for the Coach. Identity and mode are backend-controlled; the
/// replay must belong to the confirmed player's mode scope. Results keep their status, limitation
/// and provenance fields so the model cannot present gated output as a measurement.
impl CoachService {
    fn scoped_replay_for_tool(&self, mode: &str, player: &str, id: &str) -> ServiceResult<Value> {
        let a = self.get_coach_replay(id)?;
        if (mode != "All" && a["summary"]["mode"] != mode)
            || !a["players"]
                .as_array()
                .is_some_and(|ps| ps.iter().any(|p| p["id"] == player))
        {
            return Err("Replay outside personal mode scope".into());
        }
        Ok(a)
    }

    fn tool_bot_likeness(&self, mode: &str, player: &str, args: &Value) -> ServiceResult<Value> {
        let id = args["replay_id"].as_str().ok_or("Missing replay ID")?;
        let a = self.scoped_replay_for_tool(mode, player, id)?;
        let mut out = self.bot_likeness(id)?;
        let team_of = |pid: &str| {
            a["players"]
                .as_array()
                .and_then(|ps| ps.iter().find(|p| p["id"] == pid))
                .map(|p| p["team"].clone())
        };
        let my_team = team_of(player);
        // Names and platform ids are not sent: the index describes input style, not a person.
        if let Some(rows) = out["players"].as_array_mut() {
            for r in rows.iter_mut() {
                let pid = r["player_id"].as_str().unwrap_or("").to_string();
                let role = if pid == player {
                    "you"
                } else if team_of(&pid) == my_team {
                    "teammate"
                } else {
                    "opponent"
                };
                if let Some(o) = r.as_object_mut() {
                    o.remove("name");
                    o.remove("player_id");
                }
                r["role"] = json!(role);
            }
        }
        out["usage_note"] = json!("Local heuristic index. Not a probability of cheating and not evidence a person botted. Keyboard and d-pad play are confounders. Report coverage and unavailable states.");
        Ok(out)
    }

    fn tool_xg_summary(&self, mode: &str, player: &str, args: &Value) -> ServiceResult<Value> {
        const XG_NOTE: &str = "Library-trained xG model on a small sample of shots. Not a finishing-skill measure; goals minus xG is noise at this sample size. Per-shot values for a replay are out-of-fold when available, otherwise labelled in-library. Report coverage and unavailable states.";
        match args["replay_id"].as_str() {
            None => {
                let mut out = self.xg_player_summary()?;
                out["usage_note"] = json!(XG_NOTE);
                Ok(out)
            }
            Some(id) => {
                self.scoped_replay_for_tool(mode, player, id)?;
                let mut out = self.xg_replay_shots(id)?;
                if let Some(shots) = out["shots"].as_array_mut() {
                    shots.retain(|s| s["player_id"] == player);
                    let total = shots.len();
                    shots.truncate(20);
                    out["your_shots"] = json!(total);
                }
                if let Some(o) = out.as_object_mut() {
                    o.remove("library");
                }
                out["usage_note"] = json!(XG_NOTE);
                Ok(out)
            }
        }
    }

    fn tool_counterfactual(&self, mode: &str, player: &str, args: &Value) -> ServiceResult<Value> {
        let id = args["replay_id"].as_str().ok_or("Missing replay ID")?;
        let time = args["time_s"]
            .as_f64()
            .filter(|t| t.is_finite() && (0.0..=3600.0).contains(t))
            .ok_or("time_s must be between 0 and 3600")?;
        self.scoped_replay_for_tool(mode, player, id)?;
        // Fixed options: default steps, deterministic policy, newest compatible checkpoint.
        let mut out = self.sim_what_if(id, time, &json!({}))?;
        // Compact for the model: status, reasons, labels and a coarse ball track.
        if let Some(d) = out["decisions"].as_array() {
            let total = d.len();
            let track: Vec<Value> = d
                .iter()
                .step_by(10)
                .map(|x| json!({"time":x["time"],"ball":x["ball"]["pos"]}))
                .collect();
            out["decisions"] = json!(track);
            out["decisions_total"] = json!(total);
            out["decisions_note"] = json!("Every 10th policy step, ball position only");
        }
        if let Some(p) = out["policy"].as_object_mut() {
            p.remove("checkpoint");
        }
        out["usage_note"] = json!("One simulated rollout of an RLTRAIN_2 policy of unknown skill from a reconstructed state. It is not a recommendation, not what would have happened, and not a model of any player. Pads, input history and opponent intent are not reconstructed. Report status and refusal reasons.");
        Ok(out)
    }
}
