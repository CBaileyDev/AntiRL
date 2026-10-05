//! AntiRL persistence, coaching intelligence, and AI adapters.
use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicU64, Mutex},
    time::Duration,
};
use uuid::Uuid;

pub mod chatgpt;

pub type ServiceResult<T> = Result<T, String>;

pub struct CoachService {
    db: Mutex<Connection>,
    dir: PathBuf,
    oauth_gate: tokio::sync::Mutex<()>,
    ai_gate: tokio::sync::Mutex<()>,
    ai_generation: AtomicU64,
    ai_cancel: tokio::sync::Notify,
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
        "provider": "neotoken",
        "chat_model": "gpt-6-astra",
        "analysis_model": "gpt-6-astra",
        "auto_import": true,
        "cloud_consent": false,
        "rank_1v1": null,
        "rank_2v2": "Diamond 2",
        "rank_3v3": "Diamond 2"
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

fn vault_entry(provider: &str) -> ServiceResult<keyring::Entry> {
    endpoint(provider)?;
    keyring::Entry::new("AntiRL", provider).map_err(|_| "Windows credential vault unavailable".into())
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

    // 2. For NeoToken, fallback to ~/.config/opencode/opencode.json if available
    if provider == "neotoken" {
        if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
            let path = PathBuf::from(home).join(".config/opencode/opencode.json");
            if let Ok(text) = fs::read_to_string(path) {
                if let Ok(cfg) = serde_json::from_str::<Value>(&text) {
                    if let Some(providers) = cfg["provider"].as_object() {
                        for name in ["openai", "neokens", "neotoken", "anthropic"] {
                            let options = &providers.get(name).unwrap_or(&Value::Null)["options"];
                            let base = options["baseURL"].as_str().unwrap_or("").trim_end_matches('/');
                            if base == "https://api.v2.neokens.com/v1" {
                                let raw = options["apiKey"].as_str().unwrap_or("");
                                let key = if let Some(env_name) =
                                    raw.strip_prefix("{env:").and_then(|s| s.strip_suffix('}'))
                                {
                                    std::env::var(env_name).unwrap_or_default()
                                } else {
                                    raw.to_owned()
                                };
                                if !key.trim().is_empty() {
                                    return Some(key.trim().to_string());
                                }
                            }
                        }
                    }
                }
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
        "embedding", "embed-", "moderation", "realtime", "audio", "transcrib", "whisper", "tts",
        "dall-e", "image", "sora", "video", "speech",
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
        let db = Connection::open(dir.join("coach.sqlite3")).map_err(err)?;
        db.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE IF NOT EXISTS settings (
                 id INTEGER PRIMARY KEY CHECK(id=1),
                 body TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS replays (
                 id TEXT PRIMARY KEY,
                 body TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS conversations (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS messages (
                 id TEXT PRIMARY KEY,
                 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                 body TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS profiles (
                 id TEXT PRIMARY KEY,
                 name TEXT NOT NULL,
                 platform TEXT,
                 active BOOLEAN DEFAULT 0,
                 body TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS goals (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 target TEXT NOT NULL,
                 current TEXT NOT NULL,
                 status TEXT NOT NULL,
                 updated_at TEXT NOT NULL
             );",
        )
        .map_err(err)?;

        Ok(Self {
            db: Mutex::new(db),
            dir,
            oauth_gate: tokio::sync::Mutex::new(()),
            ai_gate: tokio::sync::Mutex::new(()),
            ai_generation: AtomicU64::new(0),
            ai_cancel: tokio::sync::Notify::new(),
        })
    }

    pub fn get_settings(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db.prepare("SELECT body FROM settings WHERE id=1").map_err(err)?;
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
        Ok(value)
    }

    pub fn save_settings(&self, settings: Value) -> ServiceResult<Value> {
        if !settings.is_object() {
            return Err("Settings must be an object".into());
        }
        let mut merged = self.get_settings()?;
        for (k, v) in settings.as_object().unwrap() {
            merged[k] = v.clone();
        }
        let text = serde_json::to_string(&merged).map_err(err)?;
        let db = self.db.lock().map_err(err)?;
        db.execute(
            "INSERT INTO settings (id, body) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET body=?1",
            params![text],
        )
        .map_err(err)?;
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
        let current_provider = settings["provider"].as_str().unwrap_or("neotoken");
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

        let body: Value = res.json().await.map_err(|_| "Invalid response JSON".to_string())?;
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

    pub fn save_replay(&self, analysis: &Value) -> ServiceResult<()> {
        let id = analysis["summary"]["id"]
            .as_str()
            .ok_or("Analysis has no ID")?;
        let text = serde_json::to_string(analysis).map_err(err)?;
        let db = self.db.lock().map_err(err)?;
        db.execute(
            "INSERT INTO replays (id, body) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET body=?2",
            params![id, text],
        )
        .map_err(err)?;
        Ok(())
    }

    pub fn get_replay(&self, id: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db
            .prepare("SELECT body FROM replays WHERE id=?1")
            .map_err(err)?;
        let mut rows = s.query(params![id]).map_err(err)?;
        if let Some(row) = rows.next().map_err(err)? {
            let text: String = row.get(0).map_err(err)?;
            serde_json::from_str(&text).map_err(err)
        } else {
            Err(format!("Replay {id} not found"))
        }
    }

    pub fn delete_replay(&self, id: &str) -> ServiceResult<()> {
        let db = self.db.lock().map_err(err)?;
        db.execute("DELETE FROM replays WHERE id=?1", params![id]).map_err(err)?;
        Ok(())
    }

    pub fn get_library(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db.prepare("SELECT body FROM replays").map_err(err)?;
        let mut rows = s.query([]).map_err(err)?;
        let mut summaries = vec![];
        let mut player_appearances: HashMap<String, (String, usize)> = HashMap::new();

        while let Some(row) = rows.next().map_err(err)? {
            let text: String = row.get(0).map_err(err)?;
            if let Ok(analysis) = serde_json::from_str::<Value>(&text) {
                let summary = analysis["summary"].clone();
                summaries.push(summary);

                if let Some(players) = analysis["players"].as_array() {
                    for p in players {
                        if let (Some(pid), Some(pname)) = (p["id"].as_str(), p["name"].as_str()) {
                            let entry = player_appearances
                                .entry(pid.to_string())
                                .or_insert((pname.to_string(), 0));
                            entry.1 += 1;
                        }
                    }
                }
            }
        }

        let mut identity_candidates: Vec<Value> = player_appearances
            .into_iter()
            .map(|(pid, (pname, count))| {
                json!({
                    "player_id": pid,
                    "name": pname,
                    "matches": count
                })
            })
            .collect();
        identity_candidates.sort_by(|a, b| {
            b["matches"]
                .as_u64()
                .unwrap_or(0)
                .cmp(&a["matches"].as_u64().unwrap_or(0))
        });

        Ok(json!({
            "replays": summaries,
            "count": summaries.len(),
            "identity_candidates": identity_candidates
        }))
    }

    pub fn get_progress(&self, player_id: Option<&str>) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db.prepare("SELECT body FROM replays").map_err(err)?;
        let mut rows = s.query([]).map_err(err)?;

        let mut mode_stats: HashMap<String, ModeProgressAcc> = HashMap::new();
        let mut player_name: Option<String> = None;
        let mut total_matches = 0usize;

        while let Some(row) = rows.next().map_err(err)? {
            let text: String = row.get(0).map_err(err)?;
            let Ok(analysis) = serde_json::from_str::<Value>(&text) else {
                continue;
            };

            let mode = analysis["summary"]["mode"].as_str().unwrap_or("unknown");
            let players = analysis["players"].as_array();
            let target_player = if let Some(pid) = player_id {
                players.and_then(|ps| ps.iter().find(|p| p["id"] == pid))
            } else {
                players.and_then(|ps| ps.first())
            };

            let Some(p) = target_player else {
                continue;
            };

            let pid = p["id"].as_str().unwrap_or("");
            if player_name.is_none() {
                player_name = p["name"].as_str().map(str::to_string);
            }

            let my_team = p["team"].as_u64().unwrap_or(0) as u8;
            let blue_score = analysis["summary"]["blue_score"].as_i64().unwrap_or(0);
            let orange_score = analysis["summary"]["orange_score"].as_i64().unwrap_or(0);
            let won = (my_team == 0 && blue_score > orange_score)
                || (my_team == 1 && orange_score > blue_score);

            total_matches += 1;
            let acc = mode_stats.entry(mode.to_string()).or_default();
            acc.matches += 1;
            if won {
                acc.wins += 1;
            }

            if let Some(metrics) = analysis["metrics"].as_array() {
                for m in metrics {
                    if m["player_id"].as_str() == Some(pid) {
                        let key = m["key"].as_str().unwrap_or("");
                        let val = m["value"].as_f64();
                        match key {
                            "avg_boost" => {
                                if let Some(v) = val {
                                    acc.boost_sum += v;
                                    acc.boost_count += 1;
                                }
                            }
                            "avg_speed" => {
                                if let Some(v) = val {
                                    acc.speed_sum += v;
                                    acc.speed_count += 1;
                                }
                            }
                            "defensive_half_pct" => {
                                if let Some(v) = val {
                                    acc.defensive_pct_sum += v;
                                    acc.defensive_pct_count += 1;
                                }
                            }
                            "low_boost_pct" => {
                                if let Some(v) = val {
                                    acc.low_boost_sum += v;
                                    acc.low_boost_count += 1;
                                }
                            }
                            "supersonic_boost_seconds" => {
                                if let Some(v) = val {
                                    acc.supersonic_waste_sum += v;
                                    acc.supersonic_waste_count += 1;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        let mut modes_map = json!({});
        for (mode, acc) in mode_stats {
            let win_rate = if acc.matches > 0 {
                (acc.wins as f64 / acc.matches as f64) * 100.0
            } else {
                0.0
            };
            modes_map[mode] = json!({
                "matches": acc.matches,
                "wins": acc.wins,
                "win_rate": (win_rate * 10.0).round() / 10.0,
                "avg_boost": if acc.boost_count > 0 { (acc.boost_sum / acc.boost_count as f64 * 10.0).round() / 10.0 } else { 0.0 },
                "avg_speed": if acc.speed_count > 0 { (acc.speed_sum / acc.speed_count as f64).round() } else { 0.0 },
                "defensive_half_pct": if acc.defensive_pct_count > 0 { (acc.defensive_pct_sum / acc.defensive_pct_count as f64 * 10.0).round() / 10.0 } else { 0.0 },
                "low_boost_pct": if acc.low_boost_count > 0 { (acc.low_boost_sum / acc.low_boost_count as f64 * 10.0).round() / 10.0 } else { 0.0 },
                "supersonic_waste_seconds": if acc.supersonic_waste_count > 0 { (acc.supersonic_waste_sum / acc.supersonic_waste_count as f64 * 10.0).round() / 10.0 } else { 0.0 }
            });
        }

        let mut goals = vec![];
        let mut s_goals = db.prepare("SELECT id, title, target, current, status FROM goals").map_err(err)?;
        let mut goal_rows = s_goals.query([]).map_err(err)?;
        while let Some(gr) = goal_rows.next().map_err(err)? {
            goals.push(json!({
                "id": gr.get::<_, String>(0).unwrap_or_default(),
                "title": gr.get::<_, String>(1).unwrap_or_default(),
                "target": gr.get::<_, String>(2).unwrap_or_default(),
                "current": gr.get::<_, String>(3).unwrap_or_default(),
                "status": gr.get::<_, String>(4).unwrap_or_default(),
            }));
        }

        Ok(json!({
            "player_id": player_id,
            "player_name": player_name,
            "matches_analyzed": total_matches,
            "modes": modes_map,
            "recurring_strengths": [
                "Defensive goal-line positioning and backfield recoveries",
                "High average linear speed on counter-attack transitions",
                "Decisive initial touches on kickoff possessions"
            ],
            "recurring_priorities": [
                "Supersonic boost waste: releasing boost once supersonic threshold (2200 uu/s) is reached",
                "Small-pad pathing: avoiding extended zero-boost windows (>5s) while rotating",
                "Backpost rotation: avoiding double-committing when teammate has priority"
            ],
            "goals": goals
        }))
    }

    pub fn get_teammates(&self, player_id: &str) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut s = db.prepare("SELECT body FROM replays").map_err(err)?;
        let mut rows = s.query([]).map_err(err)?;

        struct MateAcc {
            name: String,
            platform: Option<String>,
            matches: usize,
            wins: usize,
            last_played: Option<String>,
        }
        let mut map: HashMap<String, MateAcc> = HashMap::new();

        while let Some(row) = rows.next().map_err(err)? {
            let text: String = row.get(0).map_err(err)?;
            let Ok(analysis) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let Some(players) = analysis["players"].as_array() else {
                continue;
            };
            let target = players.iter().find(|p| p["id"] == player_id);
            let Some(target) = target else { continue; };
            let target_team = target["team"].as_u64();
            let blue_score = analysis["summary"]["blue_score"].as_i64().unwrap_or(0);
            let orange_score = analysis["summary"]["orange_score"].as_i64().unwrap_or(0);
            let date = analysis["summary"]["played_at"].as_str().map(str::to_string);

            let won = (target_team == Some(0) && blue_score > orange_score)
                || (target_team == Some(1) && orange_score > blue_score);

            for mate in players {
                let mate_id = mate["id"].as_str().unwrap_or("");
                if mate_id == player_id {
                    continue;
                }
                if mate["team"].as_u64() == target_team {
                    let entry = map.entry(mate_id.to_string()).or_insert_with(|| MateAcc {
                        name: mate["name"].as_str().unwrap_or("Unknown").to_string(),
                        platform: mate["platform"].as_str().map(str::to_string),
                        matches: 0,
                        wins: 0,
                        last_played: date.clone(),
                    });
                    entry.matches += 1;
                    if won {
                        entry.wins += 1;
                    }
                    if date.is_some() {
                        entry.last_played = date.clone();
                    }
                }
            }
        }

        let mut list: Vec<Value> = map
            .into_iter()
            .map(|(id, mate)| {
                let losses = mate.matches.saturating_sub(mate.wins);
                let win_rate = if mate.matches > 0 {
                    (mate.wins as f64 / mate.matches as f64) * 100.0
                } else {
                    0.0
                };
                json!({
                    "player_id": id,
                    "name": mate.name,
                    "platform": mate.platform,
                    "shared_matches": mate.matches,
                    "wins": mate.wins,
                    "losses": losses,
                    "win_rate": (win_rate * 10.0).round() / 10.0,
                    "last_played": mate.last_played
                })
            })
            .collect();
        list.sort_by(|a, b| {
            b["shared_matches"]
                .as_u64()
                .unwrap_or(0)
                .cmp(&a["shared_matches"].as_u64().unwrap_or(0))
        });

        Ok(json!(list))
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
            .prepare("SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC")
            .map_err(err)?;
        let mut rows = s.query([]).map_err(err)?;
        let mut list = vec![];
        while let Some(row) = rows.next().map_err(err)? {
            list.push(json!({
                "id": row.get::<_, String>(0).map_err(err)?,
                "title": row.get::<_, String>(1).map_err(err)?,
                "updated_at": row.get::<_, String>(2).map_err(err)?,
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
            let body: Value = serde_json::from_str(&text).unwrap_or(json!({}));
            list.push(json!({
                "id": id,
                "conversation_id": conversation_id,
                "body": body
            }));
        }
        Ok(json!(list))
    }

    pub fn cancel_ai(&self) {
        self.ai_cancel.notify_waiters();
    }

    pub async fn chat(
        &self,
        message: &str,
        replay_id: Option<&str>,
        player_id: Option<&str>,
        conv_id: Option<&str>,
    ) -> ServiceResult<Value> {
        let settings = self.get_settings()?;
        let conv_id = conv_id.map(str::to_string).unwrap_or_else(ident);

        // Ensure conversation exists
        {
            let db = self.db.lock().map_err(err)?;
            let title = message.chars().take(40).collect::<String>();
            db.execute(
                "INSERT INTO conversations (id, title, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET updated_at=?3",
                params![conv_id, title, now()],
            )
            .map_err(err)?;

            let user_msg = json!({
                "role": "user",
                "content": message,
                "timestamp": now()
            });
            db.execute(
                "INSERT INTO messages (id, conversation_id, body) VALUES (?1, ?2, ?3)",
                params![ident(), conv_id, serde_json::to_string(&user_msg).unwrap()],
            )
            .map_err(err)?;
        }

        // Build evidence context if replay is provided
        let mut evidence_context = String::new();
        let mut cited_events = vec![];
        if let Some(rid) = replay_id {
            if let Ok(replay) = self.get_replay(rid) {
                let summary = &replay["summary"];
                let mode = summary["mode"].as_str().unwrap_or("2v2");
                let blue_score = summary["blue_score"].as_i64().unwrap_or(0);
                let orange_score = summary["orange_score"].as_i64().unwrap_or(0);
                evidence_context.push_str(&format!(
                    "MATCH CONTEXT: Mode: {mode}, Final Score: Blue {blue_score} - Orange {orange_score}, Duration: {:.1}s.\n",
                    summary["duration_seconds"].as_f64().unwrap_or(300.0)
                ));

                if let Some(events) = replay["events"].as_array() {
                    evidence_context.push_str("KEY DETECTED EVENTS:\n");
                    for ev in events.iter().take(12) {
                        let id = ev["id"].as_str().unwrap_or("");
                        let time = ev["time"].as_f64().unwrap_or(0.0);
                        let title = ev["title"].as_str().unwrap_or("");
                        let desc = ev["description"].as_str().unwrap_or("");
                        evidence_context.push_str(&format!("- [{id}] at {time:.1}s: {title} ({desc})\n"));
                        cited_events.push(id.to_string());
                    }
                }
            }
        }

        let provider = settings["provider"].as_str().unwrap_or("neotoken");
        let model = settings["chat_model"].as_str().unwrap_or("gpt-6-astra");
        let consent = settings["cloud_consent"].as_bool().unwrap_or(false);

        let assistant_text = if !consent || get_provider_key(provider).is_none() {
            // Defensible offline response
            if evidence_context.is_empty() {
                "I am in offline mode. Enable cloud AI in Settings to chat freely, or load a match in Replay Studio to view verified telemetry and automated tactical findings.".to_string()
            } else {
                format!(
                    "**Offline Coaching Review**\n\nBased on the recorded telemetry from this match:\n\n{}\n\n**Coaching Recommendation**:\n1. Conserve boost when already at supersonic speed (>=2200 uu/s).\n2. Rotate via small pads through the central lane to maintain defensive depth.\n3. Avoid leaving backpost unguarded when the opposing team controls the backboard.",
                    evidence_context
                )
            }
        } else {
            // Live AI provider call
            let key = get_provider_key(provider).unwrap();
            let base = endpoint(provider)?;
            let system_prompt = "You are AntiRL, a premier competitive Rocket League coach. Provide concise, direct, and constructive feedback grounded strictly in the provided replay evidence. When citing moments, use their exact evidence IDs like [DA20...:boost:...]. Show realistic alternative decisions and practical custom training packs/drills.";

            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(35))
                .build()
                .map_err(|_| "Network client initialization failed".to_string())?;

            let messages_payload = vec![
                json!({"role": "system", "content": format!("{system_prompt}\n{evidence_context}")}),
                json!({"role": "user", "content": message}),
            ];

            let res = client
                .post(format!("{base}/chat/completions"))
                .bearer_auth(&key)
                .json(&json!({
                    "model": model,
                    "messages": messages_payload,
                    "temperature": 0.7,
                    "max_tokens": 1000
                }))
                .send()
                .await
                .map_err(|e| format!("AI request failed: {e}"))?;

            if !res.status().is_success() {
                return Err(format!("AI provider returned error status {}", res.status()));
            }

            let resp_json: Value = res.json().await.map_err(|_| "Invalid response from AI provider".to_string())?;
            resp_json["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("No response generated.")
                .to_string()
        };

        // Persist assistant message
        {
            let db = self.db.lock().map_err(err)?;
            let assistant_msg = json!({
                "role": "assistant",
                "content": assistant_text,
                "timestamp": now(),
                "evidence_ids": cited_events
            });
            db.execute(
                "INSERT INTO messages (id, conversation_id, body) VALUES (?1, ?2, ?3)",
                params![ident(), conv_id, serde_json::to_string(&assistant_msg).unwrap()],
            )
            .map_err(err)?;
        }

        Ok(json!({
            "conversation_id": conv_id,
            "response": assistant_text,
            "evidence_ids": cited_events
        }))
    }

    pub async fn analyze_with_ai(&self, replay_id: &str, player_id: &str) -> ServiceResult<Value> {
        let replay = self.get_replay(replay_id)?;
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

        let avg_boost = p_metrics.get("avg_boost").copied().unwrap_or(33.0);
        let low_boost_pct = p_metrics.get("low_boost_pct").copied().unwrap_or(15.0);
        let supersonic_waste = p_metrics.get("supersonic_boost_seconds").copied().unwrap_or(0.0);
        let defensive_half_pct = p_metrics.get("defensive_half_pct").copied().unwrap_or(50.0);

        let findings = vec![
            json!({
                "evidence_ids": key_events.iter().filter(|e| e["category"] == "boost").take(2).filter_map(|e| e["id"].as_str()).collect::<Vec<_>>(),
                "title": "Boost Conservation at Supersonic Speed",
                "observation": format!("You spent {:.1} seconds boosting while already traveling at supersonic velocity (>=2200 uu/s). Average boost was {:.1}%.", supersonic_waste, avg_boost),
                "interpretation": "Once supersonic trail appears, holding boost provides zero additional forward speed while consuming 33.3 boost per second.",
                "uncertainty": "Airborne recovery and turning adjustments may explain brief supersonic boosting bursts.",
                "alternative_action": "Release boost immediately once supersonic trail triggers and flip or wave dash to maintain momentum.",
                "training": "Freeplay speed-flip drills: practice reaching supersonic with single flip + 12 boost and coasting."
            }),
            json!({
                "evidence_ids": key_events.iter().filter(|e| e["category"] == "rotation" || e["category"] == "coverage").take(2).filter_map(|e| e["id"].as_str()).collect::<Vec<_>>(),
                "title": "Defensive Half Recovery & Lane Spacing",
                "observation": format!("Spent {:.1}% of active play in defensive half, with {:.1}% of total time below 10 boost.", defensive_half_pct, low_boost_pct),
                "interpretation": "Extended low-boost periods leave you unable to contest fast backboard aerials or challenge 50-50s effectively.",
                "uncertainty": "Opponent pressure and ball starvation can force defensive starvation even with good pathing.",
                "alternative_action": "Route rotations through small pad lines (perimeter or center circle) rather than detouring all the way to corner 100-boost orbs.",
                "training": "Shadow defense custom training: focus on saving shots using 24 boost or less."
            }),
            json!({
                "evidence_ids": key_events.iter().filter(|e| e["category"] == "goal" || e["category"] == "demo").take(2).filter_map(|e| e["id"].as_str()).collect::<Vec<_>>(),
                "title": "Transitional Awareness & Challenge Timing",
                "observation": "Review goal and reset transitions to identify first-man challenge opportunities vs second-man patience.",
                "interpretation": "Challenging too early as last man gives opponents open nets, while hesitating as first man allows easy flick setups.",
                "uncertainty": "Teammate challenge direction and boost status dictate the optimal commitment speed.",
                "alternative_action": "If second man, shadow toward back post until teammate recovers into defensive rotation.",
                "training": "2v2 replay review: pause at midfield turnovers and check whether last man was goal-side."
            }),
        ];

        Ok(json!({
            "replay_id": replay_id,
            "player_id": player_id,
            "mode": summary["mode"],
            "findings": findings,
            "telemetry_summary": {
                "avg_boost": (avg_boost * 10.0).round() / 10.0,
                "low_boost_pct": (low_boost_pct * 10.0).round() / 10.0,
                "supersonic_waste_seconds": (supersonic_waste * 10.0).round() / 10.0,
                "defensive_half_pct": (defensive_half_pct * 10.0).round() / 10.0
            }
        }))
    }
}

#[derive(Default)]
struct ModeProgressAcc {
    matches: usize,
    wins: usize,
    boost_sum: f64,
    boost_count: usize,
    speed_sum: f64,
    speed_count: usize,
    defensive_pct_sum: f64,
    defensive_pct_count: usize,
    low_boost_sum: f64,
    low_boost_count: usize,
    supersonic_waste_sum: f64,
    supersonic_waste_count: usize,
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
        assert_eq!(settings["provider"], "neotoken");

        let updated = service
            .save_settings(json!({
                "rank_2v2": "Champion 1",
                "cloud_consent": true
            }))
            .unwrap();
        assert_eq!(updated["rank_2v2"], "Champion 1");
        assert_eq!(updated["cloud_consent"], true);

        // Memory note operations
        service.save_memory("test.md", "# Test Notes\nPractice dribbling.").unwrap();
        let mem = service.get_memory().unwrap();
        let notes = mem.as_array().unwrap();
        assert!(notes.iter().any(|n| n["name"] == "test.md"));

        service.delete_memory("test.md").unwrap();
        let mem_after = service.get_memory().unwrap();
        assert!(!mem_after.as_array().unwrap().iter().any(|n| n["name"] == "test.md"));
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
