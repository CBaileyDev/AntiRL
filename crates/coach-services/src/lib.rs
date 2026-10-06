//! AntiRL persistence, coaching intelligence, and AI adapters.
use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use uuid::Uuid;

mod ai;
mod analytics;
pub mod chatgpt;
mod conversations;
mod evidence_tools;
mod migrations;
mod practice;
mod research;
mod retrieval;
mod semantics;
mod storage;
pub use ai::ChatUpdate;

pub type ServiceResult<T> = Result<T, String>;

pub struct CoachService {
    db: Mutex<Connection>,
    analytics: Mutex<Connection>,
    ai_gate: tokio::sync::Mutex<()>,
    dir: PathBuf,
    #[cfg(feature = "chatgpt-siwc")]
    oauth_gate: tokio::sync::Mutex<()>,
    ai_cancel: Mutex<tokio_util::sync::CancellationToken>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

pub fn ident() -> String {
    Uuid::new_v4().to_string()
}

fn err(e: impl std::fmt::Display) -> String {
    format!("Local storage operation failed: {e}")
}

fn default_settings() -> Value {
    let folder = std::env::var_os("USERPROFILE")
        .map(|home| PathBuf::from(home).join("Documents/My Games/Rocket League/TAGame/DemosEpic"))
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    json!({
        "replay_folder": folder,
        "player_id": null,
        "player_name": null,
        "modes": ["1v1", "2v2", "3v3"],
        "focus": ["boost", "rotations", "defense"],
        "provider": "none",
        "chat_model": "gpt-6-astra",
        "analysis_model": "gpt-6-astra",
        "auto_import": true,
        "cloud_consent": false,
        "cloud_consent_provider": null,
        "rank_1v1": null,
        "rank_2v2": null,
        "rank_3v3": null
    })
}

fn endpoint(provider: &str) -> ServiceResult<&'static str> {
    match provider {
        "neotoken" => Ok("https://api.v2.neokens.com/v1"),
        "openai" => Ok("https://api.openai.com/v1"),
        "chatgpt" => Err("ChatGPT uses independent OAuth, never a provider API key.".into()),
        _ => Err("Unknown AI provider".into()),
    }
}

fn normalize_cloud_consent(settings: &mut Value) {
    let provider = settings["provider"].as_str().unwrap_or("none");
    let scoped = settings["cloud_consent_provider"].as_str();
    if !["openai", "neotoken", "chatgpt"].contains(&provider) || scoped != Some(provider) {
        settings["cloud_consent"] = json!(false);
        settings["cloud_consent_provider"] = Value::Null;
    }
}

fn vault_entry(provider: &str) -> ServiceResult<keyring::Entry> {
    endpoint(provider)?;
    keyring::Entry::new("AntiRL", provider)
        .map_err(|_| "Windows credential vault unavailable".into())
}

fn get_provider_key(provider: &str) -> Option<String> {
    // 1. Check keyring
    if let Ok(entry) = vault_entry(provider) {
        if let Ok(key) = entry.get_password() {
            let trimmed = key.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }

    None
}

pub fn valid_model(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-._/:".contains(&c))
}

fn text_chat_model(id: &str) -> bool {
    if !valid_model(id) {
        return false;
    }
    let lower = id.to_ascii_lowercase();
    let excludes = [
        "embedding",
        "embed-",
        "moderation",
        "realtime",
        "audio",
        "transcrib",
        "whisper",
        "tts",
        "dall-e",
        "image",
        "sora",
        "video",
        "speech",
    ];
    !excludes.iter().any(|t| lower.contains(t))
}

fn check_note_content(content: &str) -> ServiceResult<()> {
    if content.len() > 100_000 {
        return Err("Memory note exceeds 100 KB safety limit".into());
    }
    if content.match_indices("sk-").any(|(offset, _)| {
        content[offset..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .count()
            > 20
    }) || content.contains("Bearer ")
        || content.contains("-----BEGIN")
        || content.contains("apiKey")
        || content.contains("access_token")
        || content.contains("refresh_token")
    {
        return Err("Memory note must not contain credentials or secret keys".into());
    }
    Ok(())
}

fn safe_name(name: &str) -> bool {
    name.ends_with(".md")
        && name.len() <= 100
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        && !name.starts_with('.')
        && !name.contains("..")
}

impl CoachService {
    pub fn open(data_dir: impl AsRef<Path>) -> ServiceResult<Self> {
        let dir = data_dir.as_ref().to_path_buf();
        fs::create_dir_all(dir.join("coach-memory")).map_err(err)?;
        fs::create_dir_all(dir.join("replay-cache")).map_err(err)?;
        let mut db = Connection::open(dir.join("coach.sqlite3")).map_err(err)?;
        migrations::migrate(&mut db, &dir)?;
        let analytics = Connection::open(dir.join("analytics.sqlite3")).map_err(err)?;
        analytics::migrate(&analytics, &dir)?;

        let service = Self {
            db: Mutex::new(db),
            analytics: Mutex::new(analytics),
            ai_gate: tokio::sync::Mutex::new(()),
            dir,
            #[cfg(feature = "chatgpt-siwc")]
            oauth_gate: tokio::sync::Mutex::new(()),
            ai_cancel: Mutex::new(tokio_util::sync::CancellationToken::new()),
        };
        service.reconcile_analytics()?;
        Ok(service)
    }

    pub fn get_settings(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db
            .prepare("SELECT body FROM settings WHERE id=1")
            .map_err(err)?;
        let mut rows = s.query([]).map_err(err)?;
        let mut value = default_settings();
        if let Some(row) = rows.next().map_err(err)? {
            let text: String = row.get(0).map_err(err)?;
            if let Ok(saved) = serde_json::from_str::<Value>(&text) {
                if let Some(obj) = saved.as_object() {
                    for (k, v) in obj {
                        value[k] = v.clone();
                    }
                }
            }
        }
        normalize_cloud_consent(&mut value);
        Ok(value)
    }

    pub fn save_settings(&self, settings: Value) -> ServiceResult<Value> {
        if !settings.is_object() {
            return Err("Settings must be an object".into());
        }
        let previous = self.get_settings()?;
        let mut merged = previous.clone();
        for (k, v) in settings.as_object().unwrap() {
            merged[k] = v.clone();
        }
        normalize_cloud_consent(&mut merged);
        let text = serde_json::to_string(&merged).map_err(err)?;
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        tx.execute(
            "INSERT INTO settings (id, body) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET body=?1",
            params![text],
        )
        .map_err(err)?;
        if let Some(player) = merged["player_id"].as_str().filter(|s| !s.is_empty()) {
            for (mode, key) in [
                ("1v1", "rank_1v1"),
                ("2v2", "rank_2v2"),
                ("3v3", "rank_3v3"),
            ] {
                if (previous[key] != merged[key] || previous["player_id"] != merged["player_id"])
                    && merged[key]
                        .as_str()
                        .is_some_and(|s| !s.is_empty() && s.len() <= 100)
                {
                    tx.execute(
                        "INSERT INTO rank_observations VALUES(?1,?2,?3,?4,?5,'self_report')",
                        params![ident(), player, mode, merged[key].as_str(), now()],
                    )
                    .map_err(err)?;
                }
            }
        }
        tx.commit().map_err(err)?;
        Ok(merged)
    }

    pub fn set_api_key(&self, provider: &str, key: &str) -> ServiceResult<()> {
        let trimmed = key.trim();
        let entry = vault_entry(provider)?;
        if trimmed.is_empty() {
            let _ = entry.delete_credential();
        } else {
            entry
                .set_password(trimmed)
                .map_err(|_| "Could not store credential securely in Windows vault".to_string())?;
        }
        Ok(())
    }

    pub fn get_ai_status(&self) -> ServiceResult<Value> {
        let settings = self.get_settings()?;
        let current_provider = settings["provider"].as_str().unwrap_or("none");
        let neotoken_has_key = get_provider_key("neotoken").is_some();
        let openai_has_key = get_provider_key("openai").is_some();
        let chatgpt = self.chatgpt_status();

        Ok(json!({
            "current_provider": current_provider,
            "cloud_consent": settings["cloud_consent"].as_bool().unwrap_or(false),
            "chat_model": settings["chat_model"],
            "analysis_model": settings["analysis_model"],
            "providers": {
                "neotoken": {
                    "configured": neotoken_has_key,
                    "endpoint": "https://api.v2.neokens.com/v1",
                    "default_model": "gpt-6-astra"
                },
                "openai": {
                    "configured": openai_has_key,
                    "endpoint": "https://api.openai.com/v1",
                    "default_model": "gpt-4o"
                },
                "chatgpt": chatgpt
            }
        }))
    }

    pub async fn list_models(&self, provider: &str) -> ServiceResult<Value> {
        if provider == "chatgpt" {
            return self.chatgpt_models().await;
        }
        let base = endpoint(provider)?;
        let key = get_provider_key(provider)
            .ok_or_else(|| format!("No API key configured for {provider}"))?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(8))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Could not initialize network connection".to_string())?;

        let res = client
            .get(format!("{base}/models"))
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("Could not reach {provider} models endpoint: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("{provider} returned status {}", res.status()));
        }

        let body: Value = res
            .json()
            .await
            .map_err(|_| "Invalid response JSON".to_string())?;
        let data = body["data"]
            .as_array()
            .ok_or_else(|| "Provider returned invalid model catalog".to_string())?;

        let mut models = vec![];
        for item in data {
            if let Some(id) = item["id"].as_str() {
                if text_chat_model(id) {
                    models.push(json!({
                        "id": id,
                        "name": id,
                        "description": format!("{provider} chat model")
                    }));
                }
            }
        }
        Ok(json!({
            "provider": provider,
            "models": models
        }))
    }

    /// Auto-detected user: the non-bot player present in the most replays.
    pub fn detect_player(&self) -> Option<(String, String)> {
        let c = self.get_player_candidates().ok()?;
        let first = c.first()?;
        Some((
            first["player_id"].as_str()?.to_string(),
            first["name"].as_str()?.to_string(),
        ))
    }

    /// Explicit id > saved settings id > auto-detected id.
    pub fn resolve_player_id(&self, explicit: Option<&str>) -> Option<String> {
        if let Some(p) = explicit.filter(|p| !p.is_empty()) {
            return Some(p.to_string());
        }
        if let Some(p) = self.get_settings().ok().and_then(|s| {
            s["player_id"]
                .as_str()
                .filter(|p| !p.is_empty())
                .map(str::to_string)
        }) {
            return Some(p);
        }
        None
    }

    /// Resolved identity for the UI: {player_id, player_name, auto}.
    pub fn resolve_identity(&self) -> Value {
        let settings = self.get_settings().unwrap_or(Value::Null);
        let sid = settings["player_id"].as_str().filter(|p| !p.is_empty());
        let sname = settings["player_name"].as_str().filter(|p| !p.is_empty());
        let detected = self.detect_player();
        match (sid, detected) {
            (Some(id), d) => {
                let name = sname
                    .map(str::to_string)
                    .or_else(|| d.filter(|(did, _)| did == id).map(|(_, n)| n))
                    .or_else(|| {
                        self.get_player_candidates()
                            .ok()?
                            .iter()
                            .find(|c| c["player_id"] == id)?["name"]
                            .as_str()
                            .map(str::to_string)
                    });
                json!({"player_id": id, "player_name": name, "auto": false})
            }
            (None, Some((id, name))) => {
                json!({"player_id": null, "player_name": sname, "suggested_player_id":id,"suggested_player_name":name,"auto": false})
            }
            (None, None) => json!({"player_id": null, "player_name": sname, "auto": false}),
        }
    }

    pub fn get_progress(&self, player_id: Option<&str>) -> ServiceResult<Value> {
        let resolved = self.resolve_player_id(player_id);
        let player_id = resolved.as_deref();
        let projection = self.analytics_context(player_id, "All")?;
        let mut modes_map = json!({});
        let mut total_matches = 0usize;
        if let Some(modes) = projection["modes"].as_object() {
            for (mode, stats) in modes {
                let matches = stats["lifetime_count"].as_u64().unwrap_or(0);
                total_matches += matches as usize;
                let mut row = json!({"matches":matches,"wins":stats["wins"],"win_rate":stats["win_rate"],"aggregation":"per-metric method in analytics manifest"});
                for key in [
                    "avg_boost",
                    "avg_speed",
                    "defensive_half_pct",
                    "low_boost_pct",
                    "boost_active_at_supersonic_speed_s",
                ] {
                    row[key] = stats["lifetime"][key]["value"].clone();
                }
                modes_map[mode] = row;
            }
        }
        let player_name = self
            .get_player_candidates()?
            .iter()
            .find(|p| p["player_id"].as_str() == player_id)
            .and_then(|p| p["name"].as_str())
            .map(str::to_string);
        let db = self.db.lock().map_err(err)?;
        let mut goals = vec![];
        let mut s_goals = db
            .prepare("SELECT id, title, target, current, status FROM goals")
            .map_err(err)?;
        let mut goal_rows = s_goals.query([]).map_err(err)?;
        while let Some(gr) = goal_rows.next().map_err(err)? {
            goals.push(json!({
                "id": gr.get::<_, String>(0).unwrap_or_default(),
                "title": gr.get::<_, String>(1).unwrap_or_default(),
                "target": gr.get::<_, String>(2).unwrap_or_default(),
                "current": gr.get::<_, String>(3).unwrap_or_default(),
                "status": gr.get::<_, String>(4).unwrap_or_default(),
                "legacy_warning":"Existing goal: reassess numeric targets against metrics-2 before using as coaching evidence.",
            }));
        }

        Ok(json!({
            "player_id": player_id,
            "player_name": player_name,
            "matches_analyzed": total_matches,
            "modes": modes_map,
            // Aggregate metrics cannot establish kickoff quality, rotations, or touches.
            "recurring_strengths": [],
            "recurring_priorities": [],
            "goals": goals
        }))
    }

    pub fn get_memory(&self) -> ServiceResult<Value> {
        let mem_dir = self.dir.join("coach-memory");
        let mut notes = vec![];
        if let Ok(entries) = fs::read_dir(mem_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|e| e == "md") {
                    let name = path.file_name().unwrap_or_default().to_string_lossy();
                    let content = fs::read_to_string(&path).unwrap_or_default();
                    let updated = entry
                        .metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                        .unwrap_or_else(now);
                    notes.push(json!({
                        "name": name,
                        "content": content,
                        "legacy_warning":if content.to_ascii_lowercase().contains("supersonic") {Some("Review legacy metric advice: boosting at >=2200 uu/s is not threshold uptime or proven waste. This note is preserved, not verified.")}else{None},
                        "updated_at": updated
                    }));
                }
            }
        }
        notes.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
        Ok(json!(notes))
    }

    pub fn save_memory(&self, name: &str, content: &str) -> ServiceResult<()> {
        if !safe_name(name) {
            return Err("Invalid memory note name. Must end with .md".into());
        }
        check_note_content(content)?;
        let mem_dir = self.dir.join("coach-memory");
        let target = mem_dir.join(name);
        let temp = mem_dir.join(format!("{}.{}.tmp", name, ident()));
        fs::write(&temp, content).map_err(err)?;
        fs::rename(temp, target).map_err(err)?;
        Ok(())
    }

    pub fn delete_memory(&self, name: &str) -> ServiceResult<()> {
        if !safe_name(name) {
            return Err("Invalid memory note name".into());
        }
        let target = self.dir.join("coach-memory").join(name);
        if target.exists() {
            fs::remove_file(target).map_err(err)?;
        }
        Ok(())
    }

    pub fn get_conversations(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db
            .prepare("SELECT id, title, updated_at, mode, preset, prompt_version FROM conversations WHERE archived=0 ORDER BY updated_at DESC")
            .map_err(err)?;
        let mut rows = s.query([]).map_err(err)?;
        let mut list = vec![];
        while let Some(row) = rows.next().map_err(err)? {
            list.push(json!({
                "id": row.get::<_, String>(0).map_err(err)?,
                "title": row.get::<_, String>(1).map_err(err)?,
                "updated_at": row.get::<_, String>(2).map_err(err)?,
                "mode": row.get::<_, String>(3).map_err(err)?,
                "preset": row.get::<_, String>(4).map_err(err)?,
                "prompt_version": row.get::<_, String>(5).map_err(err)?,
            }));
        }
        Ok(json!(list))
    }

    pub fn get_messages(&self, conv_id: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db
            .prepare("SELECT id, conversation_id, body FROM messages WHERE conversation_id=?1 ORDER BY rowid ASC")
            .map_err(err)?;
        let mut rows = s.query(params![conv_id]).map_err(err)?;
        let mut list = vec![];
        while let Some(row) = rows.next().map_err(err)? {
            let id: String = row.get(0).map_err(err)?;
            let conversation_id: String = row.get(1).map_err(err)?;
            let text: String = row.get(2).map_err(err)?;
            let mut body: Value = serde_json::from_str(&text).unwrap_or(json!({}));
            if body["role"] == "assistant" && body["prompt_version"].is_null() {
                body["legacy_warning"] = json!("Legacy advice predates corrected metric definitions. Reassess numeric goals and boost conclusions.");
            }
            list.push(json!({
                "id": id,
                "conversation_id": conversation_id,
                "body": body
            }));
        }
        Ok(json!(list))
    }

    pub fn cancel_ai(&self) {
        self.ai_cancel
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .cancel();
    }

    pub(crate) fn templated_analysis(
        &self,
        replay_id: &str,
        player_id: &str,
    ) -> ServiceResult<Value> {
        let replay = self.get_coach_replay(replay_id)?;
        let summary = &replay["summary"];
        let events = replay["events"].as_array();
        let metrics = replay["metrics"].as_array();

        // Extract key findings from telemetry
        let mut key_events = vec![];
        if let Some(evs) = events {
            for e in evs {
                if e["player_id"].as_str() == Some(player_id) || !e["team"].is_null() {
                    key_events.push(e.clone());
                }
            }
        }

        let p_metrics: HashMap<String, f64> = metrics
            .map(|ms| {
                ms.iter()
                    .filter(|m| m["player_id"].as_str() == Some(player_id))
                    .filter_map(|m| {
                        let k = m["key"].as_str()?.to_string();
                        let v = m["value"].as_f64()?;
                        Some((k, v))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let findings = vec![json!({
            "evidence_ids": key_events.iter().take(3).filter_map(|e|e["id"].as_str()).collect::<Vec<_>>(),
            "title":"Review observed resource and position context",
            "observation":format!("Available measured values: {}", serde_json::to_string(&p_metrics).unwrap_or_default()),
            "interpretation":"These are observations, not proof of poor decisions. Boost-active time at >=2200 uu/s is not total supersonic time or automatically waste; the speed cap differs from the threshold.",
            "uncertainty":"Missing telemetry remains unavailable. Scalar averages do not establish roles, intentions, causation, skill grade or rank.",
            "alternative_action":"Review one turnover in the viewer: compare available space, recovery and pressure before judging the choice.",
            "training":"General freeplay drill: rehearse one recovery route for 5 minutes, then check whether it keeps you available for the next play. Reassess after new same-mode matches; this is not a promotion forecast."
        })];

        Ok(json!({
            "replay_id": replay_id,
            "player_id": player_id,
            "mode": summary["mode"],
            "findings": findings,
            "telemetry_summary": {
                "avg_boost": p_metrics.get("avg_boost"),
                "low_boost_pct": p_metrics.get("low_boost_pct"),
                "boost_active_at_supersonic_speed_s": p_metrics.get("boost_active_at_supersonic_speed_s"),
                "defensive_half_pct": p_metrics.get("defensive_half_pct")
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_note_content_rejects_credentials() {
        assert!(check_note_content("sk-abcdef1234567890abcdef123456").is_err());
        assert!(check_note_content("Bearer secret_token_xyz").is_err());
        assert!(check_note_content("Normal coaching notes without secrets.").is_ok());
    }

    #[test]
    fn test_settings_and_storage() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        let settings = service.get_settings().unwrap();
        assert_eq!(settings["provider"], "none");

        let updated = service
            .save_settings(json!({
                "rank_2v2": "Champion 1",
                "provider": "openai",
                "cloud_consent_provider": "openai",
                "cloud_consent": true
            }))
            .unwrap();
        assert_eq!(updated["rank_2v2"], "Champion 1");
        assert_eq!(updated["cloud_consent"], true);

        // Memory note operations
        service
            .save_memory("test.md", "# Test Notes\nPractice dribbling.")
            .unwrap();
        let mem = service.get_memory().unwrap();
        let notes = mem.as_array().unwrap();
        assert!(notes.iter().any(|n| n["name"] == "test.md"));

        service.delete_memory("test.md").unwrap();
        let mem_after = service.get_memory().unwrap();
        assert!(!mem_after
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["name"] == "test.md"));
    }

    #[test]
    fn legacy_or_switched_provider_requires_explicit_scoped_consent() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        service
            .db
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO settings VALUES(1,?1)",
                [json!({"provider":"neotoken","cloud_consent":true}).to_string()],
            )
            .unwrap();
        assert_eq!(service.get_settings().unwrap()["cloud_consent"], false);
        let scoped=service.save_settings(json!({"provider":"neotoken","cloud_consent":true,"cloud_consent_provider":"neotoken"})).unwrap();
        assert_eq!(scoped["cloud_consent"], true);
        let switched = service.save_settings(json!({"provider":"openai"})).unwrap();
        assert_eq!(switched["cloud_consent"], false);
        assert!(switched["cloud_consent_provider"].is_null());
        let reused = service
            .save_settings(json!({"provider":"neotoken","cloud_consent":true}))
            .unwrap();
        assert_eq!(reused["cloud_consent"], false);
    }

    #[test]
    fn test_replay_and_progress_flow() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();

        let replay_data = json!({
            "summary": {
                "id": "match-123",
                "file_name": "match-123.replay",
                "replay_name": "Match 123",
                "played_at": "2026-10-05",
                "mode": "2v2",
                "duration_seconds": 300.0,
                "blue_score": 4,
                "orange_score": 2,
                "players": [
                    {"id": "p1", "name": "Hero", "team": 0, "platform": "Epic", "is_bot": false},
                    {"id": "p2", "name": "Mate", "team": 0, "platform": "Steam", "is_bot": false},
                    {"id": "p3", "name": "Foe1", "team": 1, "platform": "Xbox", "is_bot": false},
                    {"id": "p4", "name": "Foe2", "team": 1, "platform": "PSN", "is_bot": false}
                ],
                "status": "ready"
            },
            "players": [
                {"id": "p1", "name": "Hero", "team": 0, "platform": "Epic", "is_bot": false},
                {"id": "p2", "name": "Mate", "team": 0, "platform": "Steam", "is_bot": false}
            ],
            "frames": [],
            "metrics": [
                {"player_id": "p1", "key": "avg_boost", "label": "Avg Boost", "value": 45.0, "unit": "%", "sample_count": 100, "confidence": "measured", "description": ""},
                {"player_id": "p1", "key": "avg_speed", "label": "Avg Speed", "value": 1400.0, "unit": "uu/s", "sample_count": 100, "confidence": "measured", "description": ""},
                {"player_id": "p1", "key": "defensive_half_pct", "label": "Def Half", "value": 48.0, "unit": "%", "sample_count": 100, "confidence": "measured", "description": ""},
                {"player_id": "p1", "key": "low_boost_pct", "label": "Low Boost", "value": 12.0, "unit": "%", "sample_count": 100, "confidence": "measured", "description": ""},
                {"player_id": "p1", "key": "supersonic_boost_seconds", "label": "Waste", "value": 1.2, "unit": "s", "sample_count": 10, "confidence": "measured", "description": ""}
            ],
            "events": [
                {"id": "match-123:goal:0", "player_id": "p1", "team": 0, "time": 45.0, "end_time": 45.0, "category": "goal", "title": "Goal · Hero", "description": "", "severity": "strength", "confidence": "measured", "metric_keys": ["goals"]}
            ],
            "coverage": {
                "metadata": true, "positions": true, "boost": true, "goals": true, "touches": true, "decoded_frames": 1000, "render_frames": 500, "live_play_seconds": 280.0, "notes": []
            }
        });

        service.save_replay(&replay_data).unwrap();
        let loaded = service.get_replay("match-123").unwrap();
        assert_eq!(loaded["summary"]["id"], "match-123");

        let progress = service.get_progress(Some("p1")).unwrap();
        assert_eq!(progress["matches_analyzed"], 1);
        let modes = &progress["modes"]["2v2"];
        assert_eq!(modes["matches"], 1);
        assert_eq!(modes["wins"], 1);
        assert_eq!(modes["win_rate"], 100.0);
        assert_eq!(modes["avg_boost"], 45.0);

        let teammates = service.get_teammates("p1").unwrap();
        let mates = teammates.as_array().unwrap();
        assert_eq!(mates.len(), 1);
        assert_eq!(mates[0]["name"], "Mate");
        assert_eq!(mates[0]["shared_matches"], 1);
        assert_eq!(mates[0]["wins"], 1);
    }
}
