//! Capability-safe tool fallback: validate a query plan, then execute local reads.
//! No model-generated SQL, URLs, file paths, account IDs or scope changes.
use super::*;

pub fn validated_plan(text: &str) -> ServiceResult<Vec<(String, Value)>> {
    if text.len() > 8000 {
        return Err("Tool plan exceeds budget".into());
    }
    let text = text
        .trim()
        .strip_prefix("```json")
        .or_else(|| text.trim().strip_prefix("```"))
        .unwrap_or(text.trim())
        .trim()
        .trim_end_matches("```")
        .trim();
    let plan: Value =
        serde_json::from_str(text).map_err(|_| "Invalid tool-plan JSON".to_string())?;
    let root = plan.as_object().ok_or("Tool plan must be an object")?;
    if root.len() != 1 || !root.contains_key("calls") {
        return Err("Unknown tool-plan fields".into());
    }
    let calls = plan["calls"].as_array().ok_or("Missing tool calls")?;
    if calls.len() > 6 {
        return Err("Tool-call budget exceeded".into());
    }
    let mut out = vec![];
    for c in calls {
        let o = c.as_object().ok_or("Invalid tool call")?;
        if o.len() != 2 {
            return Err("Unknown call fields".into());
        }
        let tool = c["tool"].as_str().ok_or("Missing tool name")?;
        let args = c["args"].as_object().ok_or("Tool args must be an object")?;
        let allowed: &[&str] = match tool {
            "get_player_overview"
            | "compare_windows"
            | "get_training_history"
            | "get_benchmark_summary" => &[],
            "get_mistake_fingerprints" | "get_opponent_history" => &[],
            "search_replay_events" => &["kind", "phase", "review", "cursor", "limit"],
            "list_matches" => &["cursor", "limit"],
            "get_match_metrics" => &["replay_id"],
            "get_evidence_events" | "get_timeline_window" => &["replay_id", "start_s", "end_s"],
            "search_training_packs" => &["query"],
            _ => return Err("Unknown read-only tool".into()),
        };
        if args.keys().any(|k| !allowed.contains(&k.as_str())) {
            return Err("Tool argument outside allowed contract".into());
        }
        if args
            .get("cursor")
            .is_some_and(|n| n.as_u64().is_none_or(|v| v > 100000))
            || args
                .get("limit")
                .is_some_and(|n| n.as_u64().is_none_or(|v| v == 0 || v > 40))
        {
            return Err("Invalid pagination".into());
        }
        for key in ["query", "replay_id", "kind", "phase", "review"] {
            if args
                .get(key)
                .is_some_and(|s| s.as_str().is_none_or(|s| s.len() > 500))
            {
                return Err("Invalid text argument".into());
            }
        }
        for key in ["start_s", "end_s"] {
            if args.get(key).is_some_and(|n| n.as_f64().is_none()) {
                return Err("Invalid timeline argument".into());
            }
        }
        out.push((tool.to_string(), c["args"].clone()));
    }
    Ok(out)
}
impl CoachService {
    pub(crate) fn execute_evidence_plan(&self, mode: &str, calls: &[(String, Value)]) -> Value {
        let mut results = vec![];
        let mut size = 0usize;
        for (tool, args) in calls.iter().take(6) {
            let mut result = self
                .evidence_tool(tool, mode, args)
                .unwrap_or_else(|e| json!({"status":"unavailable","reason":e}));
            if tool == "get_player_overview" || tool == "compare_windows" {
                if let Some(modes) = result["modes"].as_object_mut() {
                    for m in modes.values_mut() {
                        m.as_object_mut().map(|m| m.remove("recent"));
                    }
                }
            }
            if tool == "get_mistake_fingerprints" {
                if let Some(clusters) = result["clusters"].as_array_mut() {
                    let total = clusters.len();
                    clusters.truncate(3);
                    for cluster in clusters {
                        if let Some(examples) = cluster["examples"].as_array_mut() {
                            examples.truncate(2);
                        }
                        if let Some(trend) = cluster["trend"].as_array_mut() {
                            trend.truncate(8);
                        }
                    }
                    result["displayed_cluster_limit"] = json!(3);
                    result["available_clusters"] = json!(total);
                }
            }
            if tool == "get_opponent_history" {
                if let Some(records) = result["records"].as_array_mut() {
                    let total = records.len();
                    records.truncate(8);
                    result["total_opponents"] = json!(total);
                }
            }
            if tool == "search_replay_events" {
                if let Some(rows) = result["rows"].as_array_mut() {
                    if rows.len() > 10 {
                        let cursor = args["cursor"].as_u64().unwrap_or(0);
                        rows.truncate(10);
                        result["next_cursor"] = json!(cursor + 10);
                        result["response_limit"] = json!(10);
                    }
                }
            }
            let next = result.to_string().len();
            if size + next > 16000 {
                results.push(json!({"tool":tool,"args":args,"status":"omitted","reason":"Evidence output budget reached"}));
                break;
            }
            size += next;
            results.push(json!({"tool":tool,"args":args,"result":result}));
        }
        json!({"dispatch":"validated_query_plan; native function-calling capability unconfirmed","max_calls":6,"output_bytes":size,"results":results})
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plans_cannot_override_scope_or_read_arbitrary_files() {
        for t in [
            r#"{"calls":[{"tool":"get_match_metrics","args":{"replay_id":"m","player_id":"other"}}]}"#,
            r#"{"calls":[{"tool":"sql","args":{"sql":"DROP TABLE replays"}}]}"#,
            r#"{"calls":[{"tool":"list_matches","args":{"cursor":-1}}]}"#,
            r#"{"calls":[{"tool":"list_matches","args":{"limit":400}}]}"#,
        ] {
            assert!(validated_plan(t).is_err());
        }
        assert_eq!(
            validated_plan(
                r#"{"calls":[{"tool":"list_matches","args":{"cursor":20,"limit":10}}]}"#
            )
            .unwrap()
            .len(),
            1
        );
    }
}
