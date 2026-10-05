//! Local-only replay decoding and evidence extraction. Coordinates are Rocket League
//! Unreal units, Z-up, with Blue defending negative Y. No game process access is used.
mod types;
pub use types::*;

use boxcars::{HeaderProp, ParserBuilder, RemoteId};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use subtr_actor::{
    Collector, ProcessorView, ReplayProcessor, StatsCollector, SubtrActorResult, TimeAdvance,
};

pub const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_FRAMES: usize = 180_000;
pub const RENDER_INTERVAL: f64 = 1.0 / 15.0;

fn prop<'a>(props: &'a [(String, HeaderProp)], key: &str) -> Option<&'a HeaderProp> {
    props
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value)
}

fn string(props: &[(String, HeaderProp)], key: &str) -> Option<String> {
    match prop(props, key)? {
        HeaderProp::Str(v) | HeaderProp::Name(v) => Some(v.clone()),
        _ => None,
    }
}

fn int(props: &[(String, HeaderProp)], key: &str) -> Option<i32> {
    prop(props, key).and_then(HeaderProp::as_i32)
}

/// Stable IDs retain platform namespaces and all 64-bit bits as strings.
pub fn player_id(id: &RemoteId, match_id: &str) -> (String, String) {
    match id {
        RemoteId::Steam(n) => (format!("steam:{n}"), "Steam".into()),
        RemoteId::Epic(n) => (format!("epic:{n}"), "Epic".into()),
        RemoteId::Xbox(n) => (format!("xbox:{n}"), "Xbox".into()),
        RemoteId::PlayStation(n) => (format!("psn:{}", n.online_id), "PlayStation".into()),
        RemoteId::PsyNet(n) => (format!("psynet:{}", n.online_id), "PsyNet".into()),
        RemoteId::Switch(n) => (format!("switch:{}", n.online_id), "Switch".into()),
        RemoteId::QQ(n) => (format!("qq:{n}"), "QQ".into()),
        RemoteId::SplitScreen(n) => (format!("local:{match_id}:{n}"), "Local".into()),
    }
}

pub fn read_replay(path: &Path) -> Result<Vec<u8>, String> {
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("replay"))
    {
        return Err("Select a .replay file".into());
    }
    let mut file =
        fs::File::open(path).map_err(|_| "Replay file could not be opened".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "Replay metadata could not be read".to_string())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_FILE_BYTES {
        return Err("Replay must be a regular nonempty file no larger than 64 MiB".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    (&mut file)
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Replay read failed".to_string())?;
    if bytes.len() as u64 != metadata.len() {
        return Err("Replay changed during import; retry once the game finishes saving it".into());
    }
    Ok(bytes)
}

/// Decode an immutable in-memory snapshot and compute native-rate metrics before
/// sampling playback. Call from a bounded worker process, never the UI thread.
pub fn parse_replay(path: &Path) -> Result<ReplayAnalysis, String> {
    let bytes = read_replay(path)?;
    std::panic::catch_unwind(|| decode(path, &bytes)).map_err(|_| {
        "Replay decoder failed safely; this file may be malformed or unsupported".to_string()
    })?
}

pub fn decode(path: &Path, bytes: &[u8]) -> Result<ReplayAnalysis, String> {
    let replay = ParserBuilder::new(bytes)
        .must_parse_network_data()
        .always_check_crc()
        .parse()
        .map_err(|_| {
            "Replay decoding failed: corrupt file or unsupported replay version".to_string()
        })?;
    let net = replay
        .network_frames
        .as_ref()
        .ok_or("No gameplay network frames available")?;
    if net.frames.is_empty() || net.frames.len() > MAX_FRAMES {
        return Err("Replay frame count exceeds supported limits or contains no frames".into());
    }
    let mut last = -1.0f32;
    for frame in &net.frames {
        if !frame.time.is_finite() || frame.time < 0.0 || frame.time < last || frame.time > 7_200.0
        {
            return Err("Replay contains invalid or unsupported timing".into());
        }
        last = frame.time;
    }
    let hash = format!("{:x}", Sha256::digest(bytes));
    let id = ["MatchGUID", "MatchGuid", "Id"]
        .into_iter()
        .find_map(|key| string(&replay.properties, key))
        .filter(|v| {
            !v.is_empty()
                && v.len() <= 160
                && v.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
        .unwrap_or_else(|| hash.clone());
    let mut processor = ReplayProcessor::new(&replay)
        .map_err(|_| "World reconstruction failed: unsupported actor metadata".to_string())?;
    let mut collector = EvidenceCollector::new(&id);
    let mut contact_collector = StatsCollector::with_builtin_module_names(["touch"])
        .map_err(|_| "Contact analysis graph unavailable".to_string())?;
    processor
        .process_all(&mut [&mut collector, &mut contact_collector])
        .map_err(|_| "World reconstruction failed: unsupported actor state".to_string())?;
    let contact_stats = contact_collector
        .into_stats()
        .ok()
        .and_then(|s| serde_json::to_value(s).ok());
    let contact_entries = contact_stats
        .as_ref()
        .and_then(|s| s["modules"]["touch"]["player_stats"].as_array());
    let contacts_available = contact_entries.is_some_and(|entries| {
        entries
            .iter()
            .any(|p| p["stats"]["touch_count"].as_u64().is_some_and(|n| n > 0))
    });
    let meta = processor
        .get_replay_meta()
        .map_err(|_| "Player metadata unavailable".to_string())?;
    let mut players = Vec::new();
    let mut metrics = Vec::new();
    for (team, infos) in [(0u8, &meta.team_zero), (1u8, &meta.team_one)] {
        for info in infos {
            let (pid, platform) = player_id(&info.remote_id, &id);
            let is_bot = info
                .stats
                .as_ref()
                .and_then(|s| s.get("bBot"))
                .and_then(HeaderProp::as_bool)
                .unwrap_or(false);
            players.push(Player {
                id: pid.clone(),
                name: info.name.clone(),
                team,
                platform: Some(platform),
                is_bot,
            });
            if let Some(stats) = &info.stats {
                for (key, label) in [
                    ("Score", "Scoreboard points"),
                    ("Goals", "Goals"),
                    ("Assists", "Assists"),
                    ("Saves", "Saves"),
                    ("Shots", "Shots"),
                ] {
                    metrics.push(Metric {
                        player_id: pid.clone(),
                        key: key.to_lowercase(),
                        label: label.into(),
                        value: stats.get(key).and_then(HeaderProp::as_i32).map(f64::from),
                        unit: "count".into(),
                        sample_count: 1,
                        confidence: if stats.contains_key(key) {
                            "measured"
                        } else {
                            "unavailable"
                        }
                        .into(),
                        description:
                            "Replay-reported scoreboard value; points are not a measure of responsibility."
                                .into(),
                    });
                }
            }
            metrics.extend(collector.metrics(&pid));
        }
    }
    if players.len() > 16 {
        return Err("Replay has more participants than supported".into());
    }
    let recorder_name = string(&replay.properties, "PlayerName");
    let recorder_team = int(&replay.properties, "PrimaryPlayerTeam");
    let candidates: Vec<_> = players
        .iter()
        .filter(|p| {
            Some(&p.name) == recorder_name.as_ref()
                && recorder_team.is_none_or(|t| t == i32::from(p.team))
        })
        .collect();
    let recorder_player_id = if candidates.len() == 1 {
        Some(candidates[0].id.clone())
    } else {
        None
    };
    let playlist = meta.game_type.playlist_id;
    let standard_playlist = playlist.is_none_or(|id| matches!(id, 1 | 2 | 3 | 10 | 11 | 13));
    let mode = if standard_playlist {
        match int(&replay.properties, "TeamSize") {
            Some(1) => "1v1",
            Some(2) => "2v2",
            Some(3) => "3v3",
            _ => "unknown",
        }
    } else {
        "unknown"
    }
    .to_string();
    let mut notes = vec![
        "Positions are reconstructed from replay actor updates. Playback is sampled at approximately 15 Hz; metrics use native network frames.".into(),
        "No whiff, hesitation, blame percentage or MMR estimate is asserted. Tactical review markers are uncalibrated positional heuristics.".into(),
    ];
    if !contacts_available {
        notes.push(
            "Per-player ball contact attribution is unavailable; zero contacts is not asserted."
                .into(),
        );
    }
    if mode == "unknown" {
        notes.push(
            "Unsupported team size; competitive tactical detectors may be unavailable.".into(),
        );
    }
    let mut events = collector.events;
    if mode == "unknown" {
        events.retain(|e| e.category != "rotation");
    }
    let mut goal_count = 0usize;
    if let Some(HeaderProp::Array(goals)) = prop(&replay.properties, "Goals") {
        for (idx, goal) in goals.iter().enumerate() {
            let Some(frame_idx) = int(goal, "frame").and_then(|v| usize::try_from(v).ok()) else {
                continue;
            };
            let Some(frame) = net.frames.get(frame_idx) else {
                notes.push("A header goal references an unavailable frame.".into());
                continue;
            };
            let name = string(goal, "PlayerName");
            let team = int(goal, "PlayerTeam");
            let scorers: Vec<_> = players
                .iter()
                .filter(|p| {
                    Some(&p.name) == name.as_ref() && team.is_none_or(|t| t == i32::from(p.team))
                })
                .collect();
            let scorer = if scorers.len() == 1 {
                Some(scorers[0].id.clone())
            } else {
                None
            };
            events.push(Event {
                id: format!("{id}:goal:{idx}"),
                player_id: scorer,
                team: team
                    .and_then(|t| u8::try_from(t).ok())
                    .filter(|t| *t <= 1),
                time: f64::from(frame.time),
                end_time: f64::from(frame.time),
                category: "goal".into(),
                title: format!("Goal · {}", name.as_deref().unwrap_or("Unknown scorer")),
                description:
                    "Goal recorded in the replay header, anchored to its native network frame. Review the preceding play before assigning responsibility."
                        .into(),
                severity: "strength".into(),
                confidence: "measured".into(),
                metric_keys: vec!["goals".into()],
            });
            goal_count += 1;
        }
    }
    for (idx, demo) in processor.demolishes().iter().enumerate() {
        let attacker_pid = player_id(&demo.attacker, &id).0;
        let attacker_team = players.iter().find(|p| p.id == attacker_pid).map(|p| p.team);
        events.push(Event {
            id: format!("{id}:demo:{idx}"),
            player_id: Some(attacker_pid),
            team: attacker_team,
            time: demo.time.into(),
            end_time: demo.time.into(),
            category: "demo".into(),
            title: "Demolition".into(),
            description:
                "Explicit replay demolition event. Its tactical value depends on the surrounding play."
                    .into(),
            severity: "review".into(),
            confidence: "measured".into(),
            metric_keys: vec![],
        });
    }
    for player in &players {
        let count = if contacts_available {
            contact_entries
                .and_then(|entries| {
                    entries.iter().find(|entry| {
                        serde_json::from_value::<RemoteId>(entry["player_id"].clone())
                            .ok()
                            .is_some_and(|remote| player_id(&remote, &id).0 == player.id)
                    })
                })
                .and_then(|entry| entry["stats"]["touch_count"].as_u64())
        } else {
            None
        };
        metrics.push(Metric {
            player_id: player.id.clone(),
            key: "touches".into(),
            label: "Estimated ball contacts".into(),
            value: count.map(|n| n as f64),
            unit: "count".into(),
            sample_count: count.unwrap_or(0) as usize,
            confidence: if count.is_some() {
                "heuristic"
            } else {
                "unavailable"
            }
            .into(),
            description:
                "subtr-actor's contact graph attributes ball trajectory changes using car/hitbox proximity and native team-touch signals. Contacts can be missed or misattributed; this is not a contact accuracy or whiff score."
                    .into(),
        });
    }
    events.sort_by(|a, b| a.time.total_cmp(&b.time).then(a.id.cmp(&b.id)));
    let positions = collector
        .frames
        .iter()
        .any(|f| f.ball.is_some() && !f.cars.is_empty());
    let boost = collector
        .frames
        .iter()
        .any(|f| f.cars.iter().any(|c| c.boost.is_some()));
    let observed_scores = processor.get_team_scores().ok();
    let summary = ReplaySummary {
        id,
        file_name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        replay_name: string(&replay.properties, "ReplayName")
            .unwrap_or_else(|| "Untitled replay".into()),
        played_at: string(&replay.properties, "Date"),
        mode,
        duration_seconds: f64::from(last),
        blue_score: int(&replay.properties, "Team0Score").or(observed_scores.map(|s| s.0)),
        orange_score: int(&replay.properties, "Team1Score").or(observed_scores.map(|s| s.1)),
        players: players.clone(),
        status: "ready".into(),
        error: None,
        source_path: path.to_string_lossy().into_owned(),
        match_type: meta.game_type.header_match_type,
        playlist_id: meta.game_type.playlist_id,
        recorder_name,
        recorder_player_id,
        content_hash: hash,
        map_name: string(&replay.properties, "MapName"),
    };
    let render_frames = collector.frames.len();
    let analysis = ReplayAnalysis {
        summary,
        players,
        frames: collector.frames,
        metrics,
        events,
        coverage: Coverage {
            metadata: true,
            positions,
            boost,
            goals: goal_count > 0
                || int(&replay.properties, "Team0Score")
                    .zip(int(&replay.properties, "Team1Score"))
                    .is_some_and(|(a, b)| a + b == 0),
            touches: contacts_available,
            decoded_frames: net.frames.len(),
            render_frames,
            live_play_seconds: collector.live_seconds,
            notes,
        },
    };
    validate_analysis(&analysis)?;
    Ok(analysis)
}

/// Re-check typed worker output in the parent process before storing or rendering.
pub fn validate_analysis(a: &ReplayAnalysis) -> Result<(), String> {
    use std::collections::HashSet;
    let ids: HashSet<_> = a.players.iter().map(|p| p.id.as_str()).collect();
    if a.summary.id.is_empty()
        || a.summary.id.len() > 512
        || a.players.is_empty()
        || a.players.len() > 16
        || ids.len() != a.players.len()
        || a.frames.is_empty()
        || a.frames.len() > MAX_FRAMES
    {
        return Err("Analysis identity or collection limits invalid".into());
    }
    if !a.summary.duration_seconds.is_finite()
        || !(0.0..=7200.0).contains(&a.summary.duration_seconds)
    {
        return Err("Analysis duration invalid".into());
    }
    if a.players
        .iter()
        .any(|p| p.id.len() > 512 || p.name.len() > 2048 || p.team > 1)
    {
        return Err("Analysis player metadata invalid".into());
    }
    let valid_body = |b: &Body| {
        b.position
            .iter()
            .all(|v| v.is_finite() && v.abs() < 200_000.0)
            && b.rotation.iter().all(|v| v.is_finite())
            && b.rotation.iter().map(|v| v * v).sum::<f32>() > 0.8
            && b.rotation.iter().map(|v| v * v).sum::<f32>() < 1.2
            && b.velocity
                .is_none_or(|v| v.iter().all(|n| n.is_finite() && n.abs() < 200_000.0))
    };
    let mut previous = -1.0;
    for f in &a.frames {
        if !f.time.is_finite()
            || f.time < previous
            || f.time < 0.0
            || f.time > a.summary.duration_seconds + 0.1
            || f.cars.len() > 16
            || f.ball.as_ref().is_some_and(|b| !valid_body(b))
        {
            return Err("Analysis timeline or body invalid".into());
        }
        let mut seen = HashSet::new();
        for c in &f.cars {
            if !ids.contains(c.player_id.as_str())
                || !seen.insert(&c.player_id)
                || !valid_body(&c.body)
                || c.boost
                    .is_some_and(|b| !b.is_finite() || !(0.0..=100.0).contains(&b))
            {
                return Err("Analysis car state invalid".into());
            }
        }
        previous = f.time;
    }
    let mut events = HashSet::new();
    for e in &a.events {
        if !events.insert(&e.id)
            || e.team.is_some_and(|t| t > 1)
            || e.id.len() > 2048
            || e.player_id
                .as_ref()
                .is_some_and(|p| !ids.contains(p.as_str()))
            || !e.time.is_finite()
            || !e.end_time.is_finite()
            || e.time < 0.0
            || e.end_time < e.time
            || e.end_time > a.summary.duration_seconds + 0.1
        {
            return Err("Analysis event references or time invalid".into());
        }
    }
    for m in &a.metrics {
        if !ids.contains(m.player_id.as_str()) || m.value.is_some_and(|v| !v.is_finite()) {
            return Err("Analysis metric invalid".into());
        }
    }
    Ok(())
}

fn body(r: boxcars::RigidBody) -> Option<Body> {
    let position = [r.location.x, r.location.y, r.location.z];
    let rotation = [r.rotation.x, r.rotation.y, r.rotation.z, r.rotation.w];
    if !position
        .iter()
        .chain(rotation.iter())
        .all(|v| v.is_finite())
    {
        return None;
    }
    let velocity = r
        .linear_velocity
        .map(|v| [v.x, v.y, v.z])
        .filter(|v| v.iter().all(|n| n.is_finite()));
    Some(Body {
        position,
        rotation,
        velocity,
    })
}

#[derive(Default)]
struct Accumulator {
    seconds: f64,
    samples: usize,
    boost_seconds: f64,
    boost_samples: usize,
    boost_integral: f64,
    low_seconds: f64,
    speed_seconds: f64,
    speed_integral: f64,
    supersonic_boost_seconds: f64,
    defending_seconds: f64,
    ahead_seconds: f64,
    ball_distance_integral: f64,
    position_seconds: f64,
    waste_samples: usize,
    waste_start: Option<f64>,
    waste_duration: f64,
    low_start: Option<f64>,
    low_duration: f64,
}

struct EvidenceCollector {
    match_id: String,
    frames: Vec<Frame>,
    events: Vec<Event>,
    acc: HashMap<String, Accumulator>,
    previous: Option<Frame>,
    last_render_time: f64,
    pending_discontinuity: bool,
    post_goal: bool,
    previous_score: Option<(i32, i32)>,
    live_seconds: f64,
    exposure_start: Option<f64>,
    exposure_duration: f64,
    exposure_team: Option<u8>,
}

impl EvidenceCollector {
    fn new(match_id: &str) -> Self {
        Self {
            match_id: match_id.into(),
            frames: vec![],
            events: vec![],
            acc: HashMap::new(),
            previous: None,
            last_render_time: -1.0,
            pending_discontinuity: true,
            post_goal: false,
            previous_score: None,
            live_seconds: 0.0,
            exposure_start: None,
            exposure_duration: 0.0,
            exposure_team: None,
        }
    }
    fn metrics(&self, pid: &str) -> Vec<Metric> {
        let Some(a) = self.acc.get(pid) else {
            return vec![];
        };
        let ratio = |sum: f64, seconds: f64| {
            if seconds > 0.0 {
                Some(sum / seconds)
            } else {
                None
            }
        };
        [
            (
                "tracked_seconds",
                "Measured active play",
                Some(a.seconds),
                "s",
                a.samples,
                "measured",
                "Observed active-play duration with available car state; excludes countdown and goal celebration.",
            ),
            (
                "avg_boost",
                "Average boost",
                ratio(a.boost_integral, a.boost_seconds),
                "%",
                a.boost_samples,
                "measured",
                "Time-weighted observed boost during active play; unavailable boost is excluded.",
            ),
            (
                "low_boost_pct",
                "Time below 10 boost",
                ratio(a.low_seconds * 100.0, a.boost_seconds),
                "%",
                a.boost_samples,
                "measured",
                "A resource-state measurement, not proof of poor play. Consider pressure, recovery and small-pad routes.",
            ),
            (
                "avg_speed",
                "Average speed",
                ratio(a.speed_integral, a.speed_seconds),
                "uu/s",
                a.samples,
                "measured",
                "Time-weighted replicated linear velocity during active play. Speed alone does not measure good decisions.",
            ),
            (
                "supersonic_boost_seconds",
                "Boosting at supersonic speed",
                if a.waste_samples > 0 {
                    Some(a.supersonic_boost_seconds)
                } else {
                    None
                },
                "s",
                a.waste_samples,
                "measured",
                "Observed active boost at >=2200 uu/s. Aerial control and speed maintenance can justify some use.",
            ),
            (
                "defensive_half_pct",
                "Time in defensive half",
                ratio(a.defending_seconds * 100.0, a.position_seconds),
                "%",
                a.samples,
                "measured",
                "Time-weighted Y position relative to team orientation, not a rotation quality score.",
            ),
            (
                "ahead_ball_pct",
                "Time ahead of ball",
                ratio(a.ahead_seconds * 100.0, a.position_seconds),
                "%",
                a.samples,
                "measured",
                "More than 200 uu farther upfield than the ball; can be correct when supporting or receiving a pass.",
            ),
            (
                "avg_ball_distance",
                "Average distance to ball",
                ratio(a.ball_distance_integral, a.position_seconds),
                "uu",
                a.samples,
                "measured",
                "Measured separation while car and ball are available; there is no universal ideal distance.",
            ),
        ]
        .into_iter()
        .map(
            |(key, label, value, unit, sample_count, confidence, description)| Metric {
                player_id: pid.into(),
                key: key.into(),
                label: label.into(),
                value,
                unit: unit.into(),
                sample_count,
                confidence: if value.is_some() {
                    confidence
                } else {
                    "unavailable"
                }
                .into(),
                description: description.into(),
            },
        )
        .collect()
    }
}

fn distance(a: [f32; 3], b: [f32; 3]) -> f64 {
    a.into_iter()
        .zip(b)
        .map(|(x, y)| f64::from(x - y).powi(2))
        .sum::<f64>()
        .sqrt()
}

fn speed(velocity: Option<[f32; 3]>) -> Option<f64> {
    velocity.map(|v| {
        v.into_iter()
            .map(|n| f64::from(n).powi(2))
            .sum::<f64>()
            .sqrt()
    })
}

impl Collector for EvidenceCollector {
    fn process_frame(
        &mut self,
        p: &dyn ProcessorView,
        _frame: &boxcars::Frame,
        _number: usize,
        time: f32,
    ) -> SubtrActorResult<TimeAdvance> {
        let time = f64::from(time);
        let scores = p.get_team_scores().ok();
        let countdown = p
            .get_replicated_game_state_time_remaining()
            .ok()
            .is_some_and(|t| (1..=3).contains(&t))
            || p.get_game_state() == Some(53);
        let hit = p.get_ball_has_been_hit().ok();
        if !p.current_frame_goal_events().is_empty()
            || scores
                .zip(self.previous_score)
                .is_some_and(|((a, b), (x, y))| a > x || b > y)
        {
            self.post_goal = true;
        }
        if countdown || hit == Some(false) {
            self.post_goal = false;
        }
        if scores.is_some() {
            self.previous_score = scores;
        }
        let live =
            hit == Some(true) && !countdown && !self.post_goal && p.get_game_state() != Some(67);
        let ball = if p.get_ignore_ball_syncing().ok() == Some(true) {
            None
        } else {
            p.get_normalized_ball_rigid_body().ok().and_then(body)
        };
        let mut cars = Vec::new();
        let mut flags = HashMap::new();
        let mut teams = HashMap::new();
        for id in p.iter_player_ids_in_order() {
            let pid = player_id(id, &self.match_id).0;
            let Some(b) = p.get_normalized_player_rigid_body(id).ok().and_then(body) else {
                continue;
            };
            let boost = p
                .get_player_boost_level(id)
                .ok()
                .filter(|b| b.is_finite() && *b >= 0.0 && *b <= 255.1)
                .map(|b| (b / 2.55).clamp(0.0, 100.0));
            flags.insert(pid.clone(), p.get_boost_active(id).ok().map(|b| b % 2 == 1));
            teams.insert(pid.clone(), p.get_player_is_team_0(id).ok());
            cars.push(Car {
                player_id: pid,
                body: b,
                boost,
                discontinuity: false,
            });
        }
        let dt = self.previous.as_ref().map(|f| time - f.time).unwrap_or(0.0);
        let gap = !(0.0..=0.25).contains(&dt);
        let phase_change = self.previous.as_ref().is_some_and(|f| f.live_play != live);
        let ball_jump = self
            .previous
            .as_ref()
            .is_some_and(|f| match (&f.ball, &ball) {
                (Some(a), Some(b)) => distance(a.position, b.position) > 1500.0,
                (None, None) => false,
                _ => true,
            });
        let discontinuity = self.previous.is_none()
            || gap
            || phase_change
            || ball_jump
            || !p.current_frame_goal_events().is_empty();
        self.pending_discontinuity |= discontinuity;
        for car in &mut cars {
            let prev = self
                .previous
                .as_ref()
                .and_then(|f| f.cars.iter().find(|c| c.player_id == car.player_id));
            car.discontinuity = discontinuity
                || prev.is_none_or(|c| distance(c.body.position, car.body.position) > 700.0);
        }
        let continuity =
            live && !discontinuity && self.previous.as_ref().is_some_and(|f| f.live_play);
        if continuity {
            self.live_seconds += dt;
        }
        for car in &cars {
            let a = self.acc.entry(car.player_id.clone()).or_default();
            if !continuity || car.discontinuity {
                flush_segments(
                    &mut self.events,
                    &self.match_id,
                    &car.player_id,
                    a,
                    self.previous.as_ref().map(|f| f.time).unwrap_or(time),
                );
                continue;
            }
            a.seconds += dt;
            a.samples += 1;
            if let Some(boost) = car.boost {
                a.boost_integral += f64::from(boost) * dt;
                a.boost_seconds += dt;
                a.boost_samples += 1;
                if boost < 10.0 {
                    a.low_seconds += dt;
                }
            }
            let velocity = speed(car.body.velocity);
            if let Some(s) = velocity {
                a.speed_integral += s * dt;
                a.speed_seconds += dt;
            }
            if velocity.is_some() && flags.get(&car.player_id).is_some_and(|f| f.is_some()) {
                a.waste_samples += 1;
            }
            let wasting = velocity.is_some_and(|s| s >= 2200.0)
                && flags.get(&car.player_id) == Some(&Some(true));
            if wasting {
                a.supersonic_boost_seconds += dt;
                a.waste_duration += dt;
                a.waste_start.get_or_insert(time - dt);
            } else {
                if a.waste_duration >= 1.0 {
                    self.events.push(segment_event(
                        &self.match_id,
                        &car.player_id,
                        "boost",
                        "Review supersonic boost",
                        a.waste_start.unwrap_or(time),
                        time,
                        "Boost remained active while the car was already supersonic for at least one second. Check whether aerial control or speed maintenance justified it; otherwise release boost and conserve it.",
                        "supersonic_boost_seconds",
                    ));
                }
                a.waste_start = None;
                a.waste_duration = 0.0;
            }
            if car.boost.is_some_and(|b| b < 10.0) {
                a.low_duration += dt;
                a.low_start.get_or_insert(time - dt);
            } else {
                if a.low_duration >= 5.0 {
                    self.events.push(segment_event(
                        &self.match_id,
                        &car.player_id,
                        "boost",
                        "Extended low-boost window",
                        a.low_start.unwrap_or(time),
                        time,
                        "Observed boost stayed below 10 for at least five seconds. Review available small-pad routes and team pressure; low boost by itself is not a mistake.",
                        "low_boost_pct",
                    ));
                }
                a.low_duration = 0.0;
                a.low_start = None;
            }
            if let (Some(ball), Some(Some(blue))) = (&ball, teams.get(&car.player_id)) {
                let sign = if *blue { 1.0 } else { -1.0 };
                a.position_seconds += dt;
                if car.body.position[1] * sign < 0.0 {
                    a.defending_seconds += dt;
                }
                if car.body.position[1] * sign > ball.position[1] * sign + 200.0 {
                    a.ahead_seconds += dt;
                }
                a.ball_distance_integral += distance(car.body.position, ball.position) * dt;
            }
        }
        let exposed = if continuity {
            ball.as_ref().and_then(|b| {
                [true, false].into_iter().find_map(|blue| {
                    let team: Vec<_> = cars
                        .iter()
                        .filter(|c| teams.get(&c.player_id) == Some(&Some(blue)))
                        .collect();
                    let expected = p.current_in_game_team_player_counts()[usize::from(!blue)];
                    let sign = if blue { 1.0 } else { -1.0 };
                    if expected >= 2
                        && team.len() == expected
                        && b.position[1] * sign < -500.0
                        && team
                            .iter()
                            .all(|c| c.body.position[1] * sign > b.position[1] * sign + 400.0)
                    {
                        Some(if blue { 0u8 } else { 1u8 })
                    } else {
                        None
                    }
                })
            })
        } else {
            None
        };
        if exposed != self.exposure_team {
            if let Some(team) = self.exposure_team.filter(|_| self.exposure_duration >= 1.0) {
                self.events.push(coverage_event(
                    &self.match_id,
                    team,
                    self.exposure_start.unwrap_or(time),
                    time,
                ));
            }
            self.exposure_start = None;
            self.exposure_duration = 0.0;
            self.exposure_team = exposed;
        }
        if exposed.is_some() {
            self.exposure_duration += dt;
            self.exposure_start.get_or_insert(time - dt);
        }
        let frame = Frame {
            time,
            ball,
            cars,
            match_clock_seconds: p.get_seconds_remaining().ok(),
            live_play: live,
            discontinuity,
        };
        let car_change = frame.cars.iter().any(|c| c.discontinuity)
            || self
                .previous
                .as_ref()
                .is_some_and(|f| f.cars.len() != frame.cars.len());
        if time - self.last_render_time >= RENDER_INTERVAL || discontinuity || car_change {
            let mut sampled = frame.clone();
            sampled.discontinuity |= self.pending_discontinuity;
            self.frames.push(sampled);
            self.last_render_time = time;
            self.pending_discontinuity = false;
        }
        self.previous = Some(frame);
        Ok(TimeAdvance::NextFrame)
    }
    fn finish_replay(&mut self, _processor: &dyn ProcessorView) -> SubtrActorResult<()> {
        if let Some(last) = &self.previous {
            if let Some(team) = self.exposure_team.filter(|_| self.exposure_duration >= 1.0) {
                self.events.push(coverage_event(
                    &self.match_id,
                    team,
                    self.exposure_start.unwrap_or(last.time),
                    last.time,
                ));
            }
            for (pid, a) in &mut self.acc {
                flush_segments(&mut self.events, &self.match_id, pid, a, last.time);
            }
            if self.frames.last().is_none_or(|f| f.time < last.time) {
                self.frames.push(last.clone());
            }
        }
        Ok(())
    }
}

fn coverage_event(match_id: &str, team: u8, start: f64, end: f64) -> Event {
    let name = if team == 0 { "Blue" } else { "Orange" };
    Event {
        id: format!("{match_id}:coverage:{team}:{start:.3}"),
        player_id: None,
        team: Some(team),
        time: start,
        end_time: end,
        category: "rotation".into(),
        title: format!("{name} defensive exposure"),
        description: format!(
            "Observed {name} players were all further upfield than the ball while defending deep in their half. Verify individual recovery paths and challenging opportunities."
        ),
        severity: "review".into(),
        confidence: "heuristic".into(),
        metric_keys: vec!["ahead_ball_pct".into(), "defensive_half_pct".into()],
    }
}

fn segment_event(
    match_id: &str,
    player_id: &str,
    category: &str,
    title: &str,
    start: f64,
    end: f64,
    description: &str,
    metric_key: &str,
) -> Event {
    Event {
        id: format!("{match_id}:{category}:{player_id}:{start:.3}"),
        player_id: Some(player_id.to_string()),
        team: None,
        time: start,
        end_time: end,
        category: category.into(),
        title: title.into(),
        description: description.into(),
        severity: "review".into(),
        confidence: "heuristic".into(),
        metric_keys: vec![metric_key.into()],
    }
}

fn flush_segments(
    events: &mut Vec<Event>,
    match_id: &str,
    pid: &str,
    a: &mut Accumulator,
    time: f64,
) {
    if a.waste_duration >= 1.0 {
        events.push(segment_event(
            match_id,
            pid,
            "boost",
            "Review supersonic boost",
            a.waste_start.unwrap_or(time),
            time,
            "Boost remained active while the car was already supersonic for at least one second. Check whether aerial control or speed maintenance justified it; otherwise release boost and conserve it.",
            "supersonic_boost_seconds",
        ));
    }
    if a.low_duration >= 5.0 {
        events.push(segment_event(
            match_id,
            pid,
            "boost",
            "Extended low-boost window",
            a.low_start.unwrap_or(time),
            time,
            "Observed boost stayed below 10 for at least five seconds. Review available small-pad routes and team pressure; low boost by itself is not a mistake.",
            "low_boost_pct",
        ));
    }
    a.waste_start = None;
    a.waste_duration = 0.0;
    a.low_start = None;
    a.low_duration = 0.0;
}

pub fn replay_paths(folder: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = fs::read_dir(folder).map_err(|_| "Folder could not be read".to_string())?;
    let mut paths = vec![];
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("replay"))
            && path.is_file()
        {
            paths.push(path);
        }
    }
    paths.sort();
    Ok(paths)
}

pub fn discover_replays(folder: &Path) -> Result<serde_json::Value, String> {
    let paths = replay_paths(folder)?;
    let mut summaries = vec![];
    for path in &paths {
        let Ok(bytes) = read_replay(path) else {
            continue;
        };
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let Ok(replay) = ParserBuilder::new(&bytes).parse() else {
            continue;
        };
        let id = ["MatchGUID", "MatchGuid", "Id"]
            .into_iter()
            .find_map(|key| string(&replay.properties, key))
            .unwrap_or_else(|| hash.clone());
        let mode = match int(&replay.properties, "TeamSize") {
            Some(1) => "1v1",
            Some(2) => "2v2",
            Some(3) => "3v3",
            _ => "unknown",
        };
        summaries.push(serde_json::json!({
            "id": id,
            "file_name": path.file_name().unwrap_or_default().to_string_lossy(),
            "replay_name": string(&replay.properties, "ReplayName").unwrap_or_else(|| "Untitled".into()),
            "played_at": string(&replay.properties, "Date"),
            "mode": mode,
            "content_hash": hash,
            "source_path": path.to_string_lossy(),
            "blue_score": int(&replay.properties, "Team0Score"),
            "orange_score": int(&replay.properties, "Team1Score"),
        }));
    }
    Ok(serde_json::json!({
        "folder": folder.to_string_lossy(),
        "count": summaries.len(),
        "replays": summaries,
    }))
}

pub fn verify_corpus(folder: &Path) -> Result<serde_json::Value, String> {
    let paths = replay_paths(folder)?;
    let mut rows = vec![];
    for (index, path) in paths.iter().enumerate() {
        let started = std::time::Instant::now();
        rows.push(match parse_replay(path) {
            Ok(a) => serde_json::json!({
                "index": index,
                "file": path.file_name().unwrap_or_default().to_string_lossy(),
                "status": "pass",
                "mode": a.summary.mode,
                "players": a.players.len(),
                "decoded_frames": a.coverage.decoded_frames,
                "render_frames": a.frames.len(),
                "positions": a.coverage.positions,
                "boost": a.coverage.boost,
                "goal_events": a.events.iter().filter(|e| e.category == "goal").count(),
                "reported_goals": a.summary.blue_score.zip(a.summary.orange_score).map(|(x, y)| x + y),
                "live_seconds": a.coverage.live_play_seconds,
                "milliseconds": started.elapsed().as_millis(),
            }),
            Err(e) => serde_json::json!({
                "index": index,
                "file": path.file_name().unwrap_or_default().to_string_lossy(),
                "status": "fail",
                "error": e,
                "milliseconds": started.elapsed().as_millis(),
            }),
        });
    }
    Ok(serde_json::json!({
        "files": paths.len(),
        "passed": rows.iter().filter(|r| r["status"] == "pass").count(),
        "results": rows,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_rejects_empty_players() {
        let analysis = ReplayAnalysis {
            summary: ReplaySummary {
                id: "test".into(),
                file_name: "test.replay".into(),
                replay_name: "Test".into(),
                played_at: None,
                mode: "2v2".into(),
                duration_seconds: 300.0,
                blue_score: Some(1),
                orange_score: Some(0),
                players: vec![],
                status: "ready".into(),
                error: None,
                source_path: "test.replay".into(),
                match_type: None,
                playlist_id: Some(2),
                recorder_name: None,
                recorder_player_id: None,
                content_hash: "hash".into(),
                map_name: None,
            },
            players: vec![],
            frames: vec![],
            metrics: vec![],
            events: vec![],
            coverage: Coverage {
                metadata: true,
                positions: true,
                boost: true,
                goals: true,
                touches: true,
                decoded_frames: 100,
                render_frames: 10,
                live_play_seconds: 50.0,
                notes: vec![],
            },
        };
        assert!(validate_analysis(&analysis).is_err());
    }

    #[test]
    fn test_validation_validates_good_analysis() {
        let player = Player {
            id: "steam:123".into(),
            name: "Tester".into(),
            team: 0,
            platform: Some("Steam".into()),
            is_bot: false,
        };
        let frame = Frame {
            time: 0.0,
            ball: Some(Body {
                position: [0.0, 0.0, 100.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                velocity: Some([0.0, 0.0, 0.0]),
            }),
            cars: vec![Car {
                player_id: "steam:123".into(),
                body: Body {
                    position: [100.0, 200.0, 17.0],
                    rotation: [0.0, 0.0, 0.0, 1.0],
                    velocity: Some([0.0, 0.0, 0.0]),
                },
                boost: Some(33.0),
                discontinuity: false,
            }],
            match_clock_seconds: Some(300),
            live_play: true,
            discontinuity: false,
        };
        let analysis = ReplayAnalysis {
            summary: ReplaySummary {
                id: "test-match".into(),
                file_name: "test.replay".into(),
                replay_name: "Test Match".into(),
                played_at: Some("2026-10-05".into()),
                mode: "1v1".into(),
                duration_seconds: 300.0,
                blue_score: Some(1),
                orange_score: Some(0),
                players: vec![player.clone()],
                status: "ready".into(),
                error: None,
                source_path: "test.replay".into(),
                match_type: None,
                playlist_id: Some(1),
                recorder_name: Some("Tester".into()),
                recorder_player_id: Some("steam:123".into()),
                content_hash: "abcd1234".into(),
                map_name: Some("dfh_stadium".into()),
            },
            players: vec![player],
            frames: vec![frame],
            metrics: vec![Metric {
                player_id: "steam:123".into(),
                key: "avg_boost".into(),
                label: "Average boost".into(),
                value: Some(33.0),
                unit: "%".into(),
                sample_count: 1,
                confidence: "measured".into(),
                description: "Test metric".into(),
            }],
            events: vec![Event {
                id: "test-match:goal:0".into(),
                player_id: Some("steam:123".into()),
                team: Some(0),
                time: 10.0,
                end_time: 10.0,
                category: "goal".into(),
                title: "Goal".into(),
                description: "Test goal".into(),
                severity: "strength".into(),
                confidence: "measured".into(),
                metric_keys: vec!["goals".into()],
            }],
            coverage: Coverage {
                metadata: true,
                positions: true,
                boost: true,
                goals: true,
                touches: true,
                decoded_frames: 1,
                render_frames: 1,
                live_play_seconds: 1.0,
                notes: vec![],
            },
        };
        assert!(validate_analysis(&analysis).is_ok());
    }
}
