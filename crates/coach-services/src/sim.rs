//! What-if bridge to the user's own RLTRAIN_2 engine (`rl-engine rollout`).
//!
//! Honesty rules (see docs/REPLAY_INTELLIGENCE.md): a rollout is "a trained RLTRAIN_2 policy
//! (unknown skill, not a model of any player), simulation not prediction". Nothing here is
//! a probability. Every missing input is `unknown` and an essential unknown refuses the run; the
//! ball-only reconstruction check must pass against the recorded ball path before any what-if
//! is produced. The engine is only ever spawned with an argument vector (no shell), a timeout
//! and an output cap. Checkpoints, libtorch and CUDA stay in RLTRAIN_2; `metrics.jsonl` is never
//! read. Nexto/Necto weights and RLTRAIN_2's `engine/src/reference` are never touched.
use super::*;
use std::{
    ffi::OsString,
    io::Read,
    process::{Command, Stdio},
    sync::{Arc, Mutex as StdMutex},
    time::Instant,
};

/// Default location; configurable (`rltrain_path` setting) because several copies exist. A run
/// that used this default says so (`path_source`), it is never silently assumed to be right.
pub const DEFAULT_RLTRAIN_PATH: &str = r"C:\Users\barke\Desktop\Projects\RLTRAIN_2";
/// Reconstruction gate: the engine's free-flight ball must stay within these distances (uu) of
/// the recorded ball over the validated leg. Engineering thresholds (about 1.6 and 0.65 ball
/// radii) chosen to cover quantised replay velocities and 30 Hz sampling, not statistically
/// calibrated. Above either, the what-if is refused.
pub const BALL_MAX_ERROR_UU: f64 = 150.0;
pub const BALL_MEAN_ERROR_UU: f64 = 60.0;
const MIN_WINDOW_S: f64 = 0.75;
const MAX_WINDOW_S: f64 = 2.0;
/// Car-ball centre distance under which the ball is treated as in contact (touch proxy).
const CONTACT_UU: f64 = 300.0;
const MAX_FRAME_GAP_S: f64 = 0.25;
const ENGINE_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_ENGINE_OUTPUT: usize = 8 * 1024 * 1024;
const MAX_STEPS: u64 = 300;
const REQUIRED_DLLS: [&str; 2] = ["c10.dll", "torch_cpu.dll"];
pub const WHAT_IF_LABEL: &str = "A trained RLTRAIN_2 policy (unknown skill, not a model of any player). Simulation, not a prediction.";

fn unavailable(reason: impl Into<String>) -> Value {
    json!({"status":"unavailable","reason":reason.into(),"label":WHAT_IF_LABEL})
}
fn refused(reasons: Vec<String>) -> Value {
    json!({"status":"refused","reasons":reasons,"label":WHAT_IF_LABEL})
}
fn f(v: &Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite())
}
fn vec3(v: &Value) -> Option<[f64; 3]> {
    let a = v.as_array().filter(|a| a.len() == 3)?;
    Some([f(&a[0])?, f(&a[1])?, f(&a[2])?])
}
fn quat(v: &Value) -> Option<[f64; 4]> {
    let a = v.as_array().filter(|a| a.len() == 4)?;
    let q = [f(&a[0])?, f(&a[1])?, f(&a[2])?, f(&a[3])?];
    let n: f64 = q.iter().map(|x| x * x).sum();
    (0.8..1.2).contains(&n).then_some(q)
}
fn dist(a: [f64; 3], b: [f64; 3]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}
pub fn mode_team_size(mode: &str) -> Option<u64> {
    match mode {
        "1v1" => Some(1),
        "2v2" => Some(2),
        "3v3" => Some(3),
        _ => None,
    }
}

// ---------------------------------------------------------------- discovery

#[derive(Debug, Clone)]
pub struct CheckpointInfo {
    pub run_id: String,
    pub dir: PathBuf,
    pub iteration: i64,
    pub team_size: Option<u64>,
    pub observation: Option<String>,
    /// Expected observation width for this observation id and team size (RLTRAIN_2 ObsBuilder).
    pub observation_width: Option<u64>,
    pub architecture: String,
    pub action_version: Option<String>,
    pub problems: Vec<String>,
    modified: u64,
}
impl CheckpointInfo {
    pub fn compatible(&self) -> bool {
        self.problems.is_empty()
    }
    fn to_value(&self) -> Value {
        json!({"run_id":self.run_id,"path":self.dir.to_string_lossy(),"iteration":self.iteration,"team_size":self.team_size,"observation":self.observation,"observation_width":self.observation_width,"architecture":self.architecture,"action_version":self.action_version,"compatible":self.compatible(),"problems":self.problems})
    }
}
fn read_small_json(path: &Path) -> Option<Value> {
    fs::metadata(path)
        .ok()
        .filter(|m| m.is_file() && m.len() <= 1024 * 1024)?;
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}
/// Reads only config.json and metadata.json of a checkpoint directory (never metrics.jsonl).
pub fn parse_checkpoint(run_id: &str, dir: &Path) -> CheckpointInfo {
    let config = read_small_json(&dir.join("config.json"));
    let meta = read_small_json(&dir.join("metadata.json"));
    let mut problems = vec![];
    if config.is_none() {
        problems.push("config.json missing or unreadable".to_string());
    }
    if meta.is_none() {
        problems.push("metadata.json missing or unreadable".to_string());
    }
    if !dir.join("model.pt").is_file() {
        problems.push("model.pt missing".into());
    }
    let team_size = config.as_ref().and_then(|c| c["teamSize"].as_u64());
    if config.is_some() && team_size.is_none() {
        problems.push("config.json has no teamSize".into());
    }
    let observation = config
        .as_ref()
        .and_then(|c| c["observation"].as_str().map(String::from));
    if config.is_some() && observation.is_none() {
        problems.push("config.json has no observation layout".into());
    }
    // Observation layouts the engine knows (RLTRAIN_2 ObsBuilder): width = f(id, cars per arena).
    // An unknown id, or a missing team size, cannot be checked and is refused before the engine runs.
    let observation_width = match (observation.as_deref(), team_size) {
        (Some("advanced_v1"), Some(t)) if (1..=3).contains(&t) => Some(81 + 27 * (2 * t - 1)),
        (Some("basic_v1"), Some(t)) if (1..=3).contains(&t) => Some(47),
        _ => None,
    };
    if let (Some(o), Some(_)) = (&observation, team_size) {
        if observation_width.is_none() {
            problems.push(format!(
                "observation layout {o:?} is not one this app knows how to check"
            ));
        }
    }
    let action_version = meta
        .as_ref()
        .and_then(|m| m["actionVersion"].as_str().map(String::from));
    if let Some(m) = &meta {
        if action_version.as_deref() != Some("discrete90_v1") || m["formatVersion"] != 1 {
            problems.push("action version is not discrete90_v1 (format 1)".into());
        }
    }
    let modified = fs::metadata(dir)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());
    CheckpointInfo {
        run_id: run_id.into(),
        dir: dir.to_path_buf(),
        iteration: meta
            .as_ref()
            .and_then(|m| m["iteration"].as_i64())
            .or_else(|| dir.file_name()?.to_str()?.parse().ok())
            .unwrap_or(-1),
        team_size,
        observation,
        observation_width,
        architecture: config
            .as_ref()
            .and_then(|c| c["architecture"].as_str())
            .unwrap_or("shared_v1")
            .into(),
        action_version,
        problems,
        modified,
    }
}
/// Newest checkpoint (highest iteration) of every run under `<root>/runs`.
pub fn discover_checkpoints(root: &Path) -> Vec<CheckpointInfo> {
    let mut out = vec![];
    let Ok(runs) = fs::read_dir(root.join("runs")) else {
        return out;
    };
    for run in runs.flatten().take(500) {
        let Some(id) = run.file_name().to_str().map(String::from) else {
            continue;
        };
        let Ok(entries) = fs::read_dir(run.path().join("checkpoints")) else {
            continue;
        };
        let newest = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| Some((e.file_name().to_str()?.parse::<i64>().ok()?, e.path())))
            .max_by_key(|(n, _)| *n);
        if let Some((_, dir)) = newest {
            out.push(parse_checkpoint(&id, &dir));
        }
    }
    out.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then(b.iteration.cmp(&a.iteration))
            .then(a.run_id.cmp(&b.run_id))
    });
    out
}
#[derive(Debug)]
pub struct EngineInfo {
    pub path: PathBuf,
    pub missing_dlls: Vec<String>,
}
fn engine_names() -> Vec<&'static str> {
    #[allow(unused_mut)]
    let mut names = vec!["rl-engine.exe"];
    #[cfg(test)]
    names.splice(0..0, ["rl-engine.cmd", "rl-engine.sh"]);
    names
}
/// First `rl-engine` found in the known build directories, with the DLLs it needs beside it.
pub fn discover_engine(root: &Path) -> Option<EngineInfo> {
    for dir in ["build/bin", "build-rollout/bin", "build/Release"] {
        for name in engine_names() {
            let path = root.join("engine").join(dir).join(name);
            if path.is_file() {
                let beside = path.parent().unwrap_or(root).to_path_buf();
                let exe = name.ends_with(".exe");
                let missing_dlls = if exe {
                    REQUIRED_DLLS
                        .iter()
                        .filter(|d| !beside.join(d).is_file())
                        .map(|d| d.to_string())
                        .collect()
                } else {
                    vec![]
                };
                return Some(EngineInfo { path, missing_dlls });
            }
        }
    }
    None
}
/// A checkpoint is only usable for a mode whose team size it was trained for.
pub fn select_checkpoint<'a>(
    found: &'a [CheckpointInfo],
    mode: &str,
    explicit_run: Option<&str>,
) -> Result<&'a CheckpointInfo, String> {
    let size =
        mode_team_size(mode).ok_or_else(|| format!("Mode {mode:?} has no supported team size"))?;
    let mut sizes: Vec<u64> = found
        .iter()
        .filter(|c| c.compatible())
        .filter_map(|c| c.team_size)
        .collect();
    sizes.sort_unstable();
    sizes.dedup();
    let pick = |c: &&CheckpointInfo| c.compatible() && c.team_size == Some(size);
    let chosen = match explicit_run {
        Some(run) => {
            let c = found
                .iter()
                .find(|c| c.run_id == run)
                .ok_or_else(|| format!("Run {run} was not found"))?;
            if !c.compatible() {
                return Err(format!("Run {run} is unusable: {}", c.problems.join("; ")));
            }
            pick(&c).then_some(c)
        }
        None => found.iter().find(pick),
    };
    chosen.ok_or_else(|| {
        let have: Vec<_> = sizes.iter().map(|s| format!("{s}v{s}")).collect();
        format!(
            "No compatible checkpoint trained for {mode} (team size {size}); available: {}",
            if have.is_empty() {
                "none".into()
            } else {
                have.join(", ")
            }
        )
    })
}
/// Shared validation of the RLTRAIN_2 location, used by `set_sim_path` and by `save_settings`.
/// Must be absolute (no relative paths, no UNC / network shares), canonicalised, and look like
/// the repository: an `engine/build*/bin/rl-engine` plus a `runs` directory. Returns the
/// canonical path (without the Windows verbatim prefix).
pub fn validate_rltrain_root(path: &str) -> Result<PathBuf, String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err("The RLTRAIN_2 folder is empty".into());
    }
    if raw.starts_with(r"\\") || raw.starts_with("//") {
        return Err("Network (UNC) paths are not accepted for the RLTRAIN_2 folder".into());
    }
    let p = PathBuf::from(raw);
    if !p.is_absolute() {
        return Err("The RLTRAIN_2 folder must be an absolute path".into());
    }
    let canon =
        fs::canonicalize(&p).map_err(|e| format!("The RLTRAIN_2 folder cannot be opened: {e}"))?;
    let text = canon.to_string_lossy().to_string();
    if text.starts_with(r"\\?\UNC\") {
        return Err("Network (UNC) paths are not accepted for the RLTRAIN_2 folder".into());
    }
    let canon = match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => canon,
    };
    if !canon.join("engine").is_dir() {
        return Err("That folder does not contain an RLTRAIN_2 engine directory".into());
    }
    if !canon.join("runs").is_dir() {
        return Err("That folder does not contain an RLTRAIN_2 runs directory".into());
    }
    if discover_engine(&canon).is_none() {
        return Err("No rl-engine was found under engine/build*/bin; build RLTRAIN_2 first".into());
    }
    Ok(canon)
}

/// Removes state files left behind by an engine run that was interrupted (app closed or crashed).
pub fn clean_sim_tmp(data_dir: &Path) {
    let _ = fs::remove_dir_all(data_dir.join("sim-tmp"));
}
/// Deletes its file when dropped, including on early return or panic.
struct TempFile(PathBuf);
impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn root_from_settings(settings: &Value) -> (PathBuf, &'static str) {
    match settings["rltrain_path"].as_str().filter(|s| !s.is_empty()) {
        Some(p) => (PathBuf::from(p), "settings"),
        None => (
            PathBuf::from(DEFAULT_RLTRAIN_PATH),
            "default (not configured)",
        ),
    }
}

// ------------------------------------------------------------ reconstruction

fn up_z(q: [f64; 4]) -> f64 {
    1.0 - 2.0 * (q[0] * q[0] + q[1] * q[1])
}
/// Some(true): wheels on the floor. Some(false): clearly in the air. None: ambiguous (walls,
/// ceiling, ramps, mid-hop), which is unknown and never guessed.
fn grounded(pos: [f64; 3], rot: [f64; 4]) -> Option<bool> {
    if pos[2] <= 22.0 && up_z(rot) >= 0.95 {
        Some(true)
    } else if pos[2] >= 150.0
        && pos[2] <= 1700.0
        && pos[0].abs() <= 3700.0
        && pos[1].abs() <= 4700.0
    {
        Some(false)
    } else {
        None
    }
}
fn frame_car<'a>(frame: &'a Value, player: &str) -> Option<&'a Value> {
    frame["cars"]
        .as_array()?
        .iter()
        .find(|c| c["player_id"] == player && c["discontinuity"] != true)
}
#[derive(Debug)]
pub struct Reconstruction {
    #[allow(dead_code)]
    pub frame_index: usize,
    pub frame_time: f64,
    pub state: Value,
    /// Player ids in the order the cars appear in `state` (blue first, then orange).
    pub players: Vec<String>,
    pub limitations: Vec<String>,
}
fn nearest_frame(frames: &[Value], time: f64) -> Option<usize> {
    frames
        .iter()
        .enumerate()
        .filter_map(|(i, fr)| Some((i, (f(&fr["time"])? - time).abs())))
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .filter(|(_, gap)| *gap <= MAX_FRAME_GAP_S)
        .map(|(i, _)| i)
}
/// Builds the rollout start state from one recorded frame. Every unknown that the simulator
/// needs is a reason; there are no neutral defaults.
pub fn reconstruct(a: &Value, team_size: u64, time: f64) -> Result<Reconstruction, Vec<String>> {
    let frames: Vec<Value> = a["frames"].as_array().cloned().unwrap_or_default();
    let mut why = vec![];
    if a["analysis_version"] != replay_core::ANALYSIS_VERSION {
        why.push(format!(
            "Replay was captured before {} (no angular velocity or jump flags); re-enrich it from its snapshot or re-import it",
            replay_core::ANALYSIS_VERSION
        ));
    }
    let Some(idx) = nearest_frame(&frames, time) else {
        why.push(format!(
            "No recorded frame within {MAX_FRAME_GAP_S} s of {time} s"
        ));
        return Err(why);
    };
    let frame = &frames[idx];
    let ft = f(&frame["time"]).unwrap_or(time);
    if frame["live_play"] != true || frame["discontinuity"] == true {
        why.push(
            "Frame is not continuous live play (kickoff countdown, replay, or a data gap)".into(),
        );
    }
    let ball = &frame["ball"];
    let (bp, bv, bw) = (
        vec3(&ball["position"]),
        vec3(&ball["velocity"]),
        vec3(&ball["angular_velocity"]),
    );
    if bp.is_none() {
        why.push("Ball position is unknown".into());
    }
    if bv.is_none() {
        why.push("Ball velocity is unknown".into());
    }
    if bw.is_none() {
        why.push("Ball angular velocity is unknown".into());
    }
    let mut players: Vec<(u64, String)> = a["players"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|p| Some((p["team"].as_u64()?, p["id"].as_str()?.to_string())))
        .collect();
    players.sort_by_key(|p| p.0);
    let per_team = |t: u64| players.iter().filter(|p| p.0 == t).count() as u64;
    if per_team(0) != team_size || per_team(1) != team_size || players.len() as u64 != team_size * 2
    {
        why.push(format!(
            "Replay has {} blue and {} orange players; the {team_size}v{team_size} checkpoint needs exactly {team_size} each",
            per_team(0),
            per_team(1)
        ));
    }
    let mut cars = vec![];
    for (team, id) in &players {
        let Some(c) = frame_car(frame, id) else {
            why.push(format!(
                "Player {id} has no valid car in this frame (demolished, gap or discontinuity)"
            ));
            continue;
        };
        let (p, q, v, w) = (
            vec3(&c["position"]),
            quat(&c["rotation"]),
            vec3(&c["velocity"]),
            vec3(&c["angular_velocity"]),
        );
        let boost = f(&c["boost"]).filter(|b| (0.0..=100.0).contains(b));
        let mut missing = vec![];
        for (name, ok) in [
            ("position", p.is_some()),
            ("rotation", q.is_some()),
            ("velocity", v.is_some()),
            ("angular velocity", w.is_some()),
            ("boost", boost.is_some()),
        ] {
            if !ok {
                missing.push(name);
            }
        }
        if !missing.is_empty() {
            why.push(format!("Player {id}: unknown {}", missing.join(", ")));
            continue;
        }
        let (p, q, v, w, boost) = (
            p.unwrap(),
            q.unwrap(),
            v.unwrap(),
            w.unwrap(),
            boost.unwrap(),
        );
        let mut car = json!({"team":team,"pos":p,"vel":v,"angVel":w,"rotation":q,"boost":boost});
        match grounded(p, q) {
            Some(true) => car["onGround"] = json!(true),
            Some(false) => match air_time(&frames, idx, id) {
                Ok(t) => {
                    car["airborne"] = json!(true);
                    car["airTimeSinceJump"] = json!(t);
                }
                Err(e) => {
                    why.push(format!("Player {id}: {e}"));
                    continue;
                }
            },
            None => {
                why.push(format!("Player {id}: ground/air state is ambiguous (wall, ceiling, ramp or mid-hop) and is not guessed"));
                continue;
            }
        }
        cars.push((id.clone(), car));
    }
    if !why.is_empty() {
        return Err(why);
    }
    Ok(Reconstruction {
        frame_index: idx,
        frame_time: ft,
        state: json!({"ball":{"pos":bp,"vel":bv,"angVel":bw},"cars":cars.iter().map(|c|c.1.clone()).collect::<Vec<_>>()}),
        players: cars.into_iter().map(|c| c.0).collect(),
        limitations: vec![
            "Boost pad availability is not applied: the simulator starts with every pad available (pad pickups are recorded but not reconstructed into a pad state).".into(),
            "Previous controller input, handbrake and jump-hold history are not reconstructed; the previous action is the no-op.".into(),
            "Time since a car's jump is estimated from the last grounded frame (about 30 Hz) minus the 0.2 s jump hold; a car that left the ground without jumping is treated as having jumped.".into(),
            "The recorded replay is an observation of what happened; the policy's actions are its own choices and do not predict what any player would do.".into(),
        ],
    })
}
/// Seconds since the car's jump ended, from the last grounded frame; flips already used count
/// as expired. Unknown when the history cannot say.
fn air_time(frames: &[Value], idx: usize, player: &str) -> Result<f64, String> {
    let now = f(&frames[idx]["time"]).ok_or("frame has no time")?;
    let mut spent = false;
    let mut unknown_flags = false;
    let mut i = idx;
    loop {
        let fr = &frames[i];
        let t = f(&fr["time"]).ok_or("history frame has no time")?;
        if now - t > 3.0 {
            return Err("no grounded frame in the last 3 s, so time since jump is unknown".into());
        }
        let car =
            frame_car(fr, player).ok_or("car history has a gap, so time since jump is unknown")?;
        if i < idx {
            if let (Some(p), Some(q)) = (vec3(&car["position"]), quat(&car["rotation"])) {
                if grounded(p, q) == Some(true) {
                    let air = now - t;
                    let expired = air - 0.2 >= 1.25;
                    if !(spent || expired || !unknown_flags) {
                        return Err(
                            "jump/dodge flags are unavailable, so the flip state is unknown".into(),
                        );
                    }
                    return Ok(if spent || expired {
                        1.25
                    } else {
                        (air - 0.2).max(0.0)
                    });
                }
            }
        }
        for key in ["dodge_active", "double_jump_active"] {
            match car[key].as_bool() {
                Some(true) => spent = true,
                Some(false) => {}
                None => unknown_flags = true,
            }
        }
        if i == 0 {
            return Err("no grounded frame before this one, so time since jump is unknown".into());
        }
        i -= 1;
    }
}

// ------------------------------------------------------- ball-only validation

fn free_frame(fr: &Value) -> bool {
    if fr["live_play"] != true || fr["discontinuity"] == true {
        return false;
    }
    let Some(ball) = vec3(&fr["ball"]["position"]) else {
        return false;
    };
    if vec3(&fr["ball"]["velocity"]).is_none() || vec3(&fr["ball"]["angular_velocity"]).is_none() {
        return false;
    }
    fr["cars"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| vec3(&c["position"]))
        .all(|p| dist(p, ball) > CONTACT_UU)
}
/// The free-flight leg that ENDS at frame `idx` (the requested state frame): (first simulated
/// frame, last compared frame == idx, trimmed to the last MAX_WINDOW_S). None when `idx` itself is
/// not a free-flight frame (mid-contact, gap, non-live), or the leg is shorter than MIN_WINDOW_S.
pub fn free_flight_window(frames: &[Value], idx: usize) -> Option<(usize, usize)> {
    let t = |i: usize| f(&frames[i]["time"]);
    if idx >= frames.len() || !free_frame(&frames[idx]) {
        return None;
    }
    let end = idx;
    let mut start = end;
    while start > 0 && free_frame(&frames[start - 1]) {
        let (a, b) = (f(&frames[start - 1]["time"])?, t(start)?);
        let jump = dist(
            vec3(&frames[start - 1]["ball"]["position"])?,
            vec3(&frames[start]["ball"]["position"])?,
        );
        if b <= a || jump / (b - a) > 7000.0 {
            break;
        }
        start -= 1;
    }
    let tend = t(end)?;
    let first = (start + 1..end).find(|&i| t(i).is_some_and(|x| tend - x <= MAX_WINDOW_S))?;
    (tend - t(first)? >= MIN_WINDOW_S).then_some((first, end))
}
/// Compares the engine's ball path (time since start, position) with the recorded one by linear
/// interpolation between recorded frames. Returns (max, mean, samples) in uu.
pub fn compare_ball_path(
    engine: &[(f64, [f64; 3])],
    frames: &[Value],
    first: usize,
    last: usize,
) -> Option<(f64, f64, usize)> {
    let t0 = f(&frames[first]["time"])?;
    let (mut max, mut sum, mut n) = (0.0f64, 0.0f64, 0usize);
    for (dt, pos) in engine {
        let at = t0 + dt;
        let hi = (first..=last).find(|&i| f(&frames[i]["time"]).is_some_and(|t| t >= at));
        let Some(hi) = hi else { continue };
        let b = vec3(&frames[hi]["ball"]["position"])?;
        let th = f(&frames[hi]["time"])?;
        let rec = if hi == first || (th - at).abs() < 1e-9 {
            b
        } else {
            let a = vec3(&frames[hi - 1]["ball"]["position"])?;
            let tl = f(&frames[hi - 1]["time"])?;
            let k = ((at - tl) / (th - tl)).clamp(0.0, 1.0);
            [
                a[0] + (b[0] - a[0]) * k,
                a[1] + (b[1] - a[1]) * k,
                a[2] + (b[2] - a[2]) * k,
            ]
        };
        let e = dist(*pos, rec);
        max = max.max(e);
        sum += e;
        n += 1;
    }
    (n >= 8).then(|| (max, sum / n as f64, n))
}

// -------------------------------------------------------------- engine runner

pub struct EngineRun {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub code: Option<i32>,
}
/// Runs `exe` with an argument vector (never a shell string), a wall-clock timeout and an output
/// cap. The child is killed on timeout or when stdout exceeds `max_out`.
pub fn run_engine(
    exe: &Path,
    cwd: &Path,
    args: &[OsString],
    timeout: Duration,
    max_out: usize,
) -> Result<EngineRun, String> {
    let mut child = Command::new(exe)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Engine could not be started: {e}"))?;
    let out = Arc::new(StdMutex::new((Vec::<u8>::new(), false)));
    let errs = Arc::new(StdMutex::new(Vec::<u8>::new()));
    let mut pipe_out = child.stdout.take().ok_or("no stdout")?;
    let mut pipe_err = child.stderr.take().ok_or("no stderr")?;
    let o = out.clone();
    let t1 = std::thread::spawn(move || {
        let mut buf = [0u8; 16384];
        while let Ok(n) = pipe_out.read(&mut buf) {
            if n == 0 {
                break;
            }
            let mut g = o.lock().unwrap();
            g.0.extend_from_slice(&buf[..n]);
            if g.0.len() > max_out {
                g.1 = true;
                break;
            }
        }
    });
    let e = errs.clone();
    let t2 = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = pipe_err.read(&mut buf) {
            if n == 0 {
                break;
            }
            let mut g = e.lock().unwrap();
            if g.len() < 16 * 1024 {
                g.extend_from_slice(&buf[..n]);
            }
        }
    });
    let start = Instant::now();
    let mut failure = None;
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break Some(s);
        }
        if out.lock().unwrap().1 {
            failure = Some(format!(
                "Engine output exceeded {max_out} bytes and was stopped"
            ));
        } else if start.elapsed() > timeout {
            failure = Some(format!(
                "Engine timed out after {} s and was stopped",
                timeout.as_secs()
            ));
        }
        if failure.is_some() {
            kill_tree(child.id());
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(15));
    };
    // After a kill the readers are left to end on their own: a grandchild process could still
    // hold the pipes, and a stopped run must not block on it.
    if let Some(f) = failure {
        return Err(f);
    }
    let _ = t1.join();
    if out.lock().unwrap().1 {
        return Err(format!(
            "Engine output exceeded {max_out} bytes and was discarded"
        ));
    }
    let _ = t2.join();
    let stdout = std::mem::take(&mut out.lock().unwrap().0);
    let stderr = String::from_utf8_lossy(&errs.lock().unwrap())
        .chars()
        .take(2000)
        .collect();
    Ok(EngineRun {
        stdout,
        stderr,
        code: status.and_then(|s| s.code()),
    })
}
/// Best effort: ends the child and everything it started. std has no process groups on Windows,
/// so `taskkill /T` is used instead of a job object; a grandchild that detaches itself escapes.
fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    let _ = pid;
}
pub enum EngineOutcome {
    Ok(Vec<Value>),
    /// The engine reported an error line (gate refusal or invalid state): (code, gate, message).
    Refused(String, bool, String),
}
pub fn parse_engine_output(run: &EngineRun) -> Result<EngineOutcome, String> {
    let text = String::from_utf8_lossy(&run.stdout);
    let lines: Vec<Value> = text
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        .filter(|v| v.is_object())
        .collect();
    if let Some(e) = lines.iter().find(|l| l["type"] == "error") {
        return Ok(EngineOutcome::Refused(
            e["code"].as_str().unwrap_or("engine_error").into(),
            e["gate"] == true,
            e["message"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(500)
                .collect(),
        ));
    }
    if run.code != Some(0) {
        return Err(format!(
            "Engine exited with code {:?}: {}",
            run.code,
            run.stderr.trim()
        ));
    }
    let start = lines.iter().any(|l| l["type"] == "rollout_start");
    let end = lines.iter().any(|l| l["type"] == "rollout_end");
    if !start || !end {
        return Err("Engine output was incomplete (no rollout_start/rollout_end)".into());
    }
    Ok(EngineOutcome::Ok(lines))
}

// ------------------------------------------------------------------- service

struct Setup {
    root: PathBuf,
    engine: PathBuf,
    checkpoints: Vec<CheckpointInfo>,
}
impl CoachService {
    /// Persists the RLTRAIN_2 location after checking it looks like the repository.
    pub fn set_sim_path(&self, path: &str) -> ServiceResult<Value> {
        let p = validate_rltrain_root(path)?;
        self.save_settings(json!({"rltrain_path": p.to_string_lossy()}))?;
        self.sim_status(false)
    }
    /// Engine/DLL/checkpoint discovery. With `probe`, runs the engine once to confirm it starts
    /// and offers the `rollout` command.
    pub fn sim_status(&self, probe: bool) -> ServiceResult<Value> {
        let (root, source) = root_from_settings(&self.get_settings()?);
        let mut status =
            json!({"path":root.to_string_lossy(),"path_source":source,"label":WHAT_IF_LABEL});
        if !root.join("engine").is_dir() {
            status["status"] = "unavailable".into();
            status["reason"] = format!(
                "RLTRAIN_2 was not found at {}; set its location in Settings",
                root.display()
            )
            .into();
            return Ok(status);
        }
        let checkpoints = discover_checkpoints(&root);
        status["checkpoints"] = checkpoints.iter().map(CheckpointInfo::to_value).collect();
        let mut modes: Vec<u64> = checkpoints
            .iter()
            .filter(|c| c.compatible())
            .filter_map(|c| c.team_size)
            .collect();
        modes.sort_unstable();
        modes.dedup();
        status["supported_modes"] = modes
            .iter()
            .map(|s| format!("{s}v{s}"))
            .collect::<Vec<_>>()
            .into();
        match discover_engine(&root) {
            None => {
                status["status"] = "unavailable".into();
                status["reason"] =
                    "rl-engine was not found in engine/build/bin; build RLTRAIN_2 first".into();
            }
            Some(e) if !e.missing_dlls.is_empty() => {
                status["engine"] = e.path.to_string_lossy().into();
                status["status"] = "unavailable".into();
                status["reason"] = format!(
                    "Engine DLLs missing beside rl-engine: {}",
                    e.missing_dlls.join(", ")
                )
                .into();
            }
            Some(e) => {
                status["engine"] = e.path.to_string_lossy().into();
                if modes.is_empty() {
                    status["status"] = "unavailable".into();
                    status["reason"] =
                        "No compatible discrete90_v1 checkpoint was found under runs/".into();
                } else {
                    status["status"] = "ready".into();
                }
                if probe && status["status"] == "ready" {
                    match run_engine(&e.path, &root, &[], Duration::from_secs(15), 64 * 1024) {
                        Ok(r)
                            if r.code == Some(0)
                                && String::from_utf8_lossy(&r.stdout).contains("rollout") => {}
                        Ok(r) => {
                            status["status"] = "unavailable".into();
                            status["reason"] = format!("Engine started but does not offer `rollout` (exit {:?}); rebuild it", r.code).into();
                        }
                        Err(e) => {
                            status["status"] = "unavailable".into();
                            status["reason"] = e.into();
                        }
                    }
                }
            }
        }
        Ok(status)
    }
    fn sim_setup(&self) -> Result<Setup, Value> {
        let (root, _) = root_from_settings(&self.get_settings().map_err(unavailable)?);
        if !root.join("engine").is_dir() {
            return Err(unavailable(format!(
                "RLTRAIN_2 was not found at {}",
                root.display()
            )));
        }
        let engine = discover_engine(&root)
            .ok_or_else(|| unavailable("rl-engine was not found; build RLTRAIN_2 first"))?;
        if !engine.missing_dlls.is_empty() {
            return Err(unavailable(format!(
                "Engine DLLs missing beside rl-engine: {}",
                engine.missing_dlls.join(", ")
            )));
        }
        Ok(Setup {
            checkpoints: discover_checkpoints(&root),
            engine: engine.path,
            root,
        })
    }
    fn sim_replay(&self, id: &str) -> Result<(Value, String), Value> {
        let a = self.get_replay(id).map_err(unavailable)?;
        let mode = a["summary"]["mode"].as_str().unwrap_or("").to_string();
        Ok((a, mode))
    }
    fn run_state(
        &self,
        setup: &Setup,
        state: &Value,
        extra: Vec<OsString>,
    ) -> Result<EngineOutcome, Value> {
        let dir = self.dir.join("sim-tmp");
        fs::create_dir_all(&dir)
            .map_err(|e| unavailable(format!("Cannot create a temp folder: {e}")))?;
        let file = dir.join(format!("{}.json", ident()));
        let _guard = TempFile(file.clone());
        fs::write(&file, state.to_string())
            .map_err(|e| unavailable(format!("Cannot write the state file: {e}")))?;
        let mut args: Vec<OsString> = vec![
            "rollout".into(),
            "--state".into(),
            file.clone().into_os_string(),
        ];
        args.extend(extra);
        let run = run_engine(
            &setup.engine,
            &setup.root,
            &args,
            ENGINE_TIMEOUT,
            MAX_ENGINE_OUTPUT,
        );
        parse_engine_output(&run.map_err(unavailable)?).map_err(unavailable)
    }
    /// Reconstructs the start state at `time` and says exactly what is unknown.
    pub fn sim_reconstruct_state(&self, replay_id: &str, time: f64) -> ServiceResult<Value> {
        let (a, mode) = match self.sim_replay(replay_id) {
            Ok(v) => v,
            Err(v) => return Ok(v),
        };
        let Some(size) = mode_team_size(&mode) else {
            return Ok(unavailable(format!("Mode {mode:?} is not supported")));
        };
        Ok(match reconstruct(&a, size, time) {
            Ok(r) => {
                json!({"status":"ok","frame_time":r.frame_time,"state":r.state,"players":r.players,"limitations":r.limitations})
            }
            Err(why) => refused(why),
        })
    }
    /// Free-flight ball-only check of the reconstruction against the recorded ball path.
    pub fn sim_validate_ball(&self, replay_id: &str, time: f64) -> ServiceResult<Value> {
        let setup = match self.sim_setup() {
            Ok(s) => s,
            Err(v) => return Ok(v),
        };
        let (a, _) = match self.sim_replay(replay_id) {
            Ok(v) => v,
            Err(v) => return Ok(v),
        };
        Ok(self.validate_ball(&setup, &a, time).unwrap_or_else(|v| v))
    }
    fn validate_ball(&self, setup: &Setup, a: &Value, time: f64) -> Result<Value, Value> {
        let frames: Vec<Value> = a["frames"].as_array().cloned().unwrap_or_default();
        if a["analysis_version"] != replay_core::ANALYSIS_VERSION {
            return Err(refused(vec![
                "Ball angular velocity is unknown: replay predates the current capture version"
                    .into(),
            ]));
        }
        let idx = nearest_frame(&frames, time)
            .ok_or_else(|| unavailable("No recorded frame near that time"))?;
        if !free_frame(&frames[idx]) {
            return Err(unavailable("The requested state frame is not free flight (a car is within contact distance of the ball, or the frame is not continuous live play), so the ball-only reconstruction check cannot be applied here"));
        }
        let (first, last) = free_flight_window(&frames, idx).ok_or_else(|| {
            unavailable(format!("No free-flight ball leg of at least {MIN_WINDOW_S} s (ball away from every car) ending at the requested state frame; the reconstruction cannot be validated"))
        })?;
        let b = &frames[first]["ball"];
        let state = json!({"ball":{"pos":b["position"],"vel":b["velocity"],"angVel":b["angular_velocity"]},"cars":[]});
        let span =
            f(&frames[last]["time"]).unwrap_or(0.0) - f(&frames[first]["time"]).unwrap_or(0.0);
        let steps = ((span / (8.0 / 120.0)).ceil() as u64 + 1).min(60);
        let lines = match self.run_state(
            setup,
            &state,
            vec![
                "--ball-only".into(),
                "--steps".into(),
                steps.to_string().into(),
            ],
        )? {
            EngineOutcome::Ok(l) => l,
            EngineOutcome::Refused(code, _, m) => {
                return Err(refused(vec![format!(
                    "Engine refused ball-only validation ({code}): {m}"
                )]))
            }
        };
        let sps = lines
            .iter()
            .find(|l| l["type"] == "rollout_start")
            .and_then(|l| f(&l["secondsPerStep"]))
            .unwrap_or(8.0 / 120.0);
        let engine: Vec<(f64, [f64; 3])> = lines
            .iter()
            .filter(|l| l["type"] == "decision")
            .filter_map(|l| Some((l["step"].as_f64()? * sps, vec3(&l["ball"]["pos"])?)))
            .collect();
        let (max, mean, n) = compare_ball_path(&engine, &frames, first, last).ok_or_else(|| {
            unavailable("Too few comparable samples to validate the reconstruction")
        })?;
        let pass = max <= BALL_MAX_ERROR_UU && mean <= BALL_MEAN_ERROR_UU;
        Ok(
            json!({"status":if pass {"validated"} else {"failed"},"max_error_uu":max,"mean_error_uu":mean,"samples":n,
            "window_start":frames[first]["time"],"window_end":frames[last]["time"],
            "thresholds":{"max_uu":BALL_MAX_ERROR_UU,"mean_uu":BALL_MEAN_ERROR_UU,"calibrated":false,
                "note":"Engineering thresholds, not statistically calibrated. Validation covers free-flight ball motion only; it says nothing about car state or about the policy."},
            "ball_contact_proxy_uu":CONTACT_UU}),
        )
    }
    /// The what-if: validated reconstruction, then the checkpoint's own decisions in simulation.
    /// `options`: steps (1..=300, default 90), deterministic (default true), run (explicit run id).
    pub fn sim_what_if(&self, replay_id: &str, time: f64, options: &Value) -> ServiceResult<Value> {
        let setup = match self.sim_setup() {
            Ok(s) => s,
            Err(v) => return Ok(v),
        };
        let (a, mode) = match self.sim_replay(replay_id) {
            Ok(v) => v,
            Err(v) => return Ok(v),
        };
        let steps = options["steps"].as_u64().unwrap_or(90);
        if !(1..=MAX_STEPS).contains(&steps) {
            return Err(format!("steps must be between 1 and {MAX_STEPS}"));
        }
        let deterministic = options["deterministic"].as_bool().unwrap_or(true);
        let Some(size) = mode_team_size(&mode) else {
            return Ok(unavailable(format!("Mode {mode:?} is not supported")));
        };
        let ck = match select_checkpoint(&setup.checkpoints, &mode, options["run"].as_str()) {
            Ok(c) => c,
            Err(reason) => return Ok(unavailable(reason)),
        };
        let recon = match reconstruct(&a, size, time) {
            Ok(r) => r,
            Err(why) => return Ok(refused(why)),
        };
        let validation = match self.validate_ball(&setup, &a, recon.frame_time) {
            Ok(v) if v["status"] == "validated" => v,
            Ok(v) => {
                return Ok(
                    json!({"status":"refused","reasons":[format!("Ball-only reconstruction check failed: max {:.0} uu, mean {:.0} uu (limits {BALL_MAX_ERROR_UU} / {BALL_MEAN_ERROR_UU})",
                    v["max_error_uu"].as_f64().unwrap_or(f64::NAN), v["mean_error_uu"].as_f64().unwrap_or(f64::NAN))],"validation":v,"label":WHAT_IF_LABEL}),
                )
            }
            Err(v) => {
                return Ok(
                    json!({"status":v["status"],"reasons":[v["reason"].clone()],"reason":format!("Reconstruction could not be validated: {}", v["reason"].as_str().unwrap_or("see reasons")),"validation":v,"label":WHAT_IF_LABEL}),
                )
            }
        };
        let mut args: Vec<OsString> = vec![
            "--checkpoint".into(),
            ck.dir.clone().into_os_string(),
            "--steps".into(),
            steps.to_string().into(),
        ];
        if deterministic {
            args.push("--deterministic".into());
        }
        let lines = match self.run_state(&setup, &recon.state, args) {
            Ok(EngineOutcome::Ok(l)) => l,
            Ok(EngineOutcome::Refused(code, gate, message)) => {
                return Ok(
                    json!({"status":"refused","reasons":[format!("Engine refused ({code}): {message}")],"gate":gate,"label":WHAT_IF_LABEL}),
                )
            }
            Err(v) => return Ok(v),
        };
        let start = lines
            .iter()
            .find(|l| l["type"] == "rollout_start")
            .cloned()
            .unwrap_or(Value::Null);
        let end = lines
            .iter()
            .find(|l| l["type"] == "rollout_end")
            .cloned()
            .unwrap_or(Value::Null);
        let sps = f(&start["secondsPerStep"]).unwrap_or(8.0 / 120.0);
        let mut decisions: Vec<Value> = vec![];
        for l in lines.iter().filter(|l| l["type"] == "decision") {
            let mut cars: Vec<Value> = vec![];
            for c in l["cars"].as_array().into_iter().flatten() {
                let player = c["id"].as_u64().and_then(|i| recon.players.get(i as usize));
                let Some(player) = player else {
                    return Ok(refused(vec![format!(
                        "Engine reported car id {} but the reconstructed state has {} cars; the output cannot be mapped to players",
                        c["id"], recon.players.len()
                    )]));
                };
                cars.push(json!({"player_id":player,"pos":c["pos"],"vel":c["vel"],"forward":c["forward"],"up":c["up"],"boost":c["boost"],"on_ground":c["onGround"]}));
            }
            decisions.push(json!({"step":l["step"],"time":l["step"].as_f64().map(|s| s*sps),"ball":{"pos":l["ball"]["pos"],"vel":l["ball"]["vel"]},"cars":cars,"actions":l["actions"]}));
        }
        if let (Some(w), Some(want)) = (start["observationWidth"].as_u64(), ck.observation_width) {
            if w != want {
                return Ok(refused(vec![format!("Engine observation width {w} does not match the {want} expected for {:?} at this team size", ck.observation)]));
            }
        }
        Ok(json!({
            "status":"ok","version":"whatif-1","label":WHAT_IF_LABEL,
            "replay_id":replay_id,"mode":mode,"from_replay_time":recon.frame_time,
            "policy":{"run_id":ck.run_id,"checkpoint":ck.dir.to_string_lossy(),"iteration":ck.iteration,"team_size":ck.team_size,
                "observation":ck.observation,"deterministic":deterministic,"selected":if options["run"].is_null() {"newest compatible checkpoint for this mode (automatic)"} else {"requested run"},
                "measured_skill":"none","claims":"Not a higher-ranked player and not a model of any person."},
            "reconstruction_validation":validation,
            "end":{"reason":end["reason"],"goal_by":end["goalBy"],"steps":end["steps"]},
            "decisions":decisions,
            "assumptions":start["assumptions"],"limitations":recon.limitations,
            "uncertainty":"Unquantified: no counterfactual uncertainty evaluation exists. Sampled policies differ run to run; physics is RocketSim, not Rocket League."
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(p: &Path, s: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, s).unwrap();
    }
    fn checkpoint(root: &Path, run: &str, n: u32, team: u64, action: &str) {
        let d = root
            .join("runs")
            .join(run)
            .join("checkpoints")
            .join(n.to_string());
        write(
            &d.join("config.json"),
            &format!(
                r#"{{"teamSize":{team},"observation":"advanced_v1","architecture":"split_v2"}}"#
            ),
        );
        write(
            &d.join("metadata.json"),
            &format!(r#"{{"formatVersion":1,"actionVersion":"{action}","iteration":{n}}}"#),
        );
        write(&d.join("model.pt"), "x");
        // Never read: a directory would make any read fail.
        fs::create_dir_all(root.join("runs").join(run).join("metrics.jsonl")).unwrap();
    }
    fn fake_root(dlls: bool) -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        let bin = t.path().join("engine/build/bin");
        write(&bin.join("rl-engine.exe"), "");
        if dlls {
            for d in REQUIRED_DLLS {
                write(&bin.join(d), "");
            }
        }
        checkpoint(t.path(), "run-1v1", 10, 1, "discrete90_v1");
        checkpoint(t.path(), "run-3v3", 5, 3, "discrete90_v1");
        checkpoint(t.path(), "run-3v3", 20, 3, "discrete90_v1");
        checkpoint(t.path(), "run-old", 7, 3, "continuous_v0");
        t
    }

    #[test]
    fn discovery_reads_newest_checkpoint_and_flags_problems() {
        let t = fake_root(true);
        let found = discover_checkpoints(t.path());
        assert_eq!(found.len(), 3);
        let r3 = found.iter().find(|c| c.run_id == "run-3v3").unwrap();
        assert_eq!(
            (r3.iteration, r3.team_size, r3.compatible()),
            (20, Some(3), true)
        );
        let old = found.iter().find(|c| c.run_id == "run-old").unwrap();
        assert!(!old.compatible() && old.problems[0].contains("discrete90_v1"));
        assert!(discover_engine(t.path()).unwrap().missing_dlls.is_empty());
        let no_dll = fake_root(false);
        assert_eq!(
            discover_engine(no_dll.path()).unwrap().missing_dlls.len(),
            2
        );
        assert!(discover_engine(tempfile::tempdir().unwrap().path()).is_none());
    }

    #[test]
    fn observation_layout_is_checked_before_the_engine_runs() {
        let t = fake_root(true);
        let found = discover_checkpoints(t.path());
        assert_eq!(
            found
                .iter()
                .find(|c| c.run_id == "run-3v3")
                .unwrap()
                .observation_width,
            Some(81 + 27 * 5)
        );
        assert_eq!(
            found
                .iter()
                .find(|c| c.run_id == "run-1v1")
                .unwrap()
                .observation_width,
            Some(108)
        );
        let d = t.path().join("runs/run-1v1/checkpoints/10");
        write(
            &d.join("config.json"),
            r#"{"teamSize":1,"observation":"mystery_v9"}"#,
        );
        let c = parse_checkpoint("run-1v1", &d);
        assert!(!c.compatible() && c.problems.iter().any(|p| p.contains("mystery_v9")));
    }

    #[test]
    fn mode_gate_requires_matching_team_size() {
        let t = fake_root(true);
        let found = discover_checkpoints(t.path());
        assert_eq!(
            select_checkpoint(&found, "3v3", None).unwrap().run_id,
            "run-3v3"
        );
        assert_eq!(
            select_checkpoint(&found, "1v1", None).unwrap().run_id,
            "run-1v1"
        );
        let e = select_checkpoint(&found, "2v2", None).unwrap_err();
        assert!(e.contains("2v2") && e.contains("1v1, 3v3"), "{e}");
        assert!(select_checkpoint(&found, "3v3", Some("run-1v1")).is_err());
        assert!(select_checkpoint(&found, "3v3", Some("run-old"))
            .unwrap_err()
            .contains("unusable"));
        assert!(select_checkpoint(&found, "Hoops", None).is_err());
    }

    fn car(id: &str, x: f64, y: f64, z: f64, extra: Value) -> Value {
        let mut c = json!({"player_id":id,"position":[x,y,z],"rotation":[0.0,0.0,0.0,1.0],"velocity":[0.0,0.0,0.0],"angular_velocity":[0.0,0.0,0.0],"boost":40.0,"discontinuity":false,"dodge_active":false,"double_jump_active":false});
        for (k, v) in extra.as_object().into_iter().flatten() {
            c[k] = v.clone();
        }
        c
    }
    fn analysis(frames: Vec<Value>) -> Value {
        json!({"analysis_version":"analysis-3","summary":{"mode":"1v1"},"players":[{"id":"a","team":0},{"id":"b","team":1}],"frames":frames})
    }
    fn frame(t: f64, ball: [f64; 3], cars: Vec<Value>) -> Value {
        json!({"time":t,"live_play":true,"discontinuity":false,"ball":{"position":ball,"rotation":[0.0,0.0,0.0,1.0],"velocity":[300.0,0.0,0.0],"angular_velocity":[0.0,0.0,0.0]},"cars":cars})
    }

    #[test]
    fn reconstruction_refuses_unknowns_and_never_defaults() {
        let ok = analysis(vec![frame(
            1.0,
            [0.0, 0.0, 500.0],
            vec![
                car("a", -2000.0, -1000.0, 17.0, json!({})),
                car("b", 2000.0, 1000.0, 17.0, json!({})),
            ],
        )]);
        let r = reconstruct(&ok, 1, 1.0).unwrap();
        assert_eq!(r.players, ["a", "b"]);
        assert_eq!(r.state["cars"][0]["onGround"], true);
        assert!(r.limitations.iter().any(|l| l.contains("pad")));
        // 3v3 checkpoint vs a 1v1 replay
        assert!(reconstruct(&ok, 3, 1.0).unwrap_err()[0].contains("1 blue and 1 orange"));
        // missing car angular velocity
        let mut bad = ok.clone();
        bad["frames"][0]["cars"][0]["angular_velocity"] = Value::Null;
        assert!(reconstruct(&bad, 1, 1.0)
            .unwrap_err()
            .iter()
            .any(|w| w.contains("angular velocity")));
        // old capture version, ball spin unknown, wall car
        let mut old = ok.clone();
        old["analysis_version"] = Value::Null;
        old["frames"][0]["ball"]["angular_velocity"] = Value::Null;
        let why = reconstruct(&old, 1, 1.0).unwrap_err();
        assert!(
            why.iter().any(|w| w.contains("re-enrich"))
                && why.iter().any(|w| w.contains("Ball angular"))
        );
        let mut wall = ok.clone();
        wall["frames"][0]["cars"][0]["position"] = json!([-4000.0, 0.0, 600.0]);
        assert!(reconstruct(&wall, 1, 1.0)
            .unwrap_err()
            .iter()
            .any(|w| w.contains("ambiguous")));
        // time with no nearby frame
        assert!(reconstruct(&ok, 1, 9.0).is_err());
    }

    #[test]
    fn airborne_flip_state_comes_from_history() {
        let air = |t: f64, z: f64, dodge: Value| {
            frame(
                t,
                [0.0, 0.0, 500.0],
                vec![
                    car("a", 0.0, 0.0, z, json!({"dodge_active":dodge})),
                    car("b", 2000.0, 1000.0, 17.0, json!({})),
                ],
            )
        };
        let a = analysis(vec![
            air(0.0, 17.0, json!(false)),
            air(0.5, 300.0, json!(false)),
            air(0.6, 400.0, json!(false)),
        ]);
        let r = reconstruct(&a, 1, 0.6).unwrap();
        let t = r.state["cars"][0]["airTimeSinceJump"].as_f64().unwrap();
        assert!((t - 0.4).abs() < 1e-9, "{t}");
        let spent = analysis(vec![
            air(0.0, 17.0, json!(false)),
            air(0.5, 300.0, json!(true)),
            air(0.6, 400.0, json!(false)),
        ]);
        assert_eq!(
            reconstruct(&spent, 1, 0.6).unwrap().state["cars"][0]["airTimeSinceJump"],
            1.25
        );
        let unknown = analysis(vec![
            air(0.0, 17.0, json!(false)),
            air(0.5, 300.0, Value::Null),
            air(0.6, 400.0, json!(false)),
        ]);
        assert!(reconstruct(&unknown, 1, 0.6).unwrap_err()[0].contains("flip state is unknown"));
        let no_ground = analysis(vec![
            air(0.5, 300.0, json!(false)),
            air(0.6, 400.0, json!(false)),
        ]);
        assert!(reconstruct(&no_ground, 1, 0.6).unwrap_err()[0].contains("unknown"));
    }

    fn flight_frames(n: usize) -> Vec<Value> {
        (0..n)
            .map(|i| {
                let t = i as f64 / 30.0;
                frame(
                    t,
                    [300.0 * t, 0.0, 500.0],
                    vec![
                        car("a", -2000.0, -3000.0, 17.0, json!({})),
                        car("b", 2000.0, 3000.0, 17.0, json!({})),
                    ],
                )
            })
            .collect()
    }
    #[test]
    fn ball_comparison_passes_matching_path_and_fails_offsets() {
        let frames = flight_frames(90);
        let (first, last) = free_flight_window(&frames, 80).unwrap();
        assert!(first >= 1 && last > first);
        let on_path: Vec<_> = (0..30)
            .map(|k| {
                (
                    k as f64 / 15.0,
                    [
                        300.0 * (frames[first]["time"].as_f64().unwrap() + k as f64 / 15.0),
                        0.0,
                        500.0,
                    ],
                )
            })
            .collect();
        let (max, mean, _) = compare_ball_path(&on_path, &frames, first, last).unwrap();
        assert!(max < 1e-6 && mean < 1e-6);
        let off: Vec<_> = on_path
            .iter()
            .map(|(t, p)| (*t, [p[0], p[1] + 400.0, p[2]]))
            .collect();
        assert!(compare_ball_path(&off, &frames, first, last).unwrap().0 > BALL_MAX_ERROR_UU);
        // a car beside the ball is contact, not free flight; a short leg is unavailable
        let mut touched = frames.clone();
        touched[40]["cars"][0]["position"] = touched[40]["ball"]["position"].clone();
        assert!(free_flight_window(&touched[..45], 44).is_none());
        assert!(free_flight_window(&frames[..10], 9).is_none());
        // the state frame itself in contact, even with a long free leg before it: refused
        let mut late = frames.clone();
        late[80]["cars"][0]["position"] = late[80]["ball"]["position"].clone();
        assert!(free_flight_window(&late, 80).is_none());
        // a leg that ended 10 frames (0.33 s) before the state frame does not count
        assert!(free_flight_window(&late, 85).is_none());
    }

    fn stub(dir: &Path, ball: &str, policy: &str) {
        write(&dir.join("out_ball.txt"), ball);
        write(&dir.join("out_policy.txt"), policy);
        #[cfg(windows)]
        write(&dir.join("rl-engine.cmd"), "@echo off\r\necho %* | findstr /C:\"--ball-only\" >nul\r\nif %errorlevel%==0 (type \"%~dp0out_ball.txt\") else (type \"%~dp0out_policy.txt\")\r\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            write(&dir.join("rl-engine.sh"), "#!/bin/sh\ncase \"$*\" in *--ball-only*) cat \"$(dirname \"$0\")/out_ball.txt\";; *) cat \"$(dirname \"$0\")/out_policy.txt\";; esac\n");
            fs::set_permissions(dir.join("rl-engine.sh"), fs::Permissions::from_mode(0o755))
                .unwrap();
        }
    }
    fn stub_path(dir: &Path) -> PathBuf {
        dir.join(if cfg!(windows) {
            "rl-engine.cmd"
        } else {
            "rl-engine.sh"
        })
    }
    fn lines(v: &[Value]) -> String {
        v.iter().map(|x| x.to_string() + "\n").collect()
    }

    #[test]
    fn runner_parses_output_enforces_limits_and_never_uses_a_shell() {
        let t = tempfile::tempdir().unwrap();
        let good = lines(&[
            json!({"type":"rollout_start"}),
            json!({"type":"decision","step":0}),
            json!({"type":"rollout_end"}),
        ]);
        stub(t.path(), &good, &good);
        let run = run_engine(
            &stub_path(t.path()),
            t.path(),
            &["rollout".into(), "a b".into()],
            Duration::from_secs(20),
            1 << 20,
        )
        .unwrap();
        assert!(matches!(parse_engine_output(&run).unwrap(), EngineOutcome::Ok(l) if l.len() == 3));
        // output cap
        let big = "x".repeat(200_000);
        stub(t.path(), &big, &big);
        let e = run_engine(
            &stub_path(t.path()),
            t.path(),
            &[],
            Duration::from_secs(20),
            10_000,
        )
        .err()
        .unwrap();
        assert!(e.contains("exceeded"), "{e}");
        // gate error line
        let gate = lines(&[
            json!({"type":"error","gate":true,"code":"gate_team_size","message":"3 blue 1 orange"}),
        ]);
        stub(t.path(), &gate, &gate);
        let run = run_engine(
            &stub_path(t.path()),
            t.path(),
            &[],
            Duration::from_secs(20),
            1 << 20,
        )
        .unwrap();
        assert!(
            matches!(parse_engine_output(&run).unwrap(), EngineOutcome::Refused(c, true, _) if c == "gate_team_size")
        );
        // incomplete output
        stub(t.path(), "{\"type\":\"rollout_start\"}\n", "");
        let run = run_engine(
            &stub_path(t.path()),
            t.path(),
            &[],
            Duration::from_secs(20),
            1 << 20,
        )
        .unwrap();
        assert!(parse_engine_output(&run).is_err());
        assert!(run_engine(
            &t.path().join("missing.exe"),
            t.path(),
            &[],
            Duration::from_secs(5),
            1024
        )
        .is_err());
    }

    #[test]
    fn runner_times_out() {
        let t = tempfile::tempdir().unwrap();
        #[cfg(windows)]
        let (name, body) = ("slow.cmd", "@echo off\r\nping -n 20 127.0.0.1 >nul\r\n");
        #[cfg(unix)]
        let (name, body) = ("slow.sh", "#!/bin/sh\nsleep 20\n");
        write(&t.path().join(name), body);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(t.path().join(name), fs::Permissions::from_mode(0o755)).unwrap();
        }
        let start = Instant::now();
        let e = run_engine(
            &t.path().join(name),
            t.path(),
            &[],
            Duration::from_millis(400),
            1024,
        )
        .err()
        .unwrap();
        assert!(
            e.contains("timed out") && start.elapsed() < Duration::from_secs(10),
            "{e}"
        );
    }

    fn service_with_root(root: &Path) -> (tempfile::TempDir, CoachService) {
        let data = tempfile::tempdir().unwrap();
        let s = CoachService::open(data.path()).unwrap();
        s.set_sim_path(&root.to_string_lossy()).unwrap();
        (data, s)
    }

    #[test]
    fn status_degrades_to_unavailable_with_reasons() {
        let data = tempfile::tempdir().unwrap();
        let s = CoachService::open(data.path()).unwrap();
        let missing = tempfile::tempdir().unwrap();
        assert!(s
            .save_settings(json!({"rltrain_path": missing.path().join("nope").to_string_lossy()}))
            .is_err());
        assert!(s.set_sim_path(&missing.path().to_string_lossy()).is_err());
        // save_settings uses the same validation
        assert!(s
            .save_settings(json!({"rltrain_path":"relative/dir"}))
            .is_err());
        assert!(s
            .save_settings(json!({"rltrain_path":r"\\server\share\x"}))
            .is_err());
        // no DLLs, then no checkpoint
        let t = fake_root(false);
        let (_d, s) = service_with_root(t.path());
        assert!(s.sim_status(false).unwrap()["reason"]
            .as_str()
            .unwrap()
            .contains("DLLs"));
        let bare = tempfile::tempdir().unwrap();
        fs::create_dir_all(bare.path().join("engine/build/bin")).unwrap();
        fs::create_dir_all(bare.path().join("runs")).unwrap();
        for d in REQUIRED_DLLS {
            write(&bare.path().join("engine/build/bin").join(d), "");
        }
        write(&bare.path().join("engine/build/bin/rl-engine.exe"), "");
        let (_d2, s2) = service_with_root(bare.path());
        assert!(s2.sim_status(false).unwrap()["reason"]
            .as_str()
            .unwrap()
            .contains("checkpoint"));
        assert_eq!(
            s2.sim_what_if("x", 1.0, &json!({})).unwrap()["status"],
            "unavailable"
        );
        let ready = fake_root(true);
        let (_d3, s3) = service_with_root(ready.path());
        let st = s3.sim_status(false).unwrap();
        assert_eq!(
            (st["status"].as_str(), st["supported_modes"].to_string()),
            (Some("ready"), "[\"1v1\",\"3v3\"]".to_string())
        );
    }

    #[test]
    fn what_if_end_to_end_with_stub_engine_and_validation_gate() {
        let root = fake_root(true);
        let mut frames = flight_frames(120);
        // a 1v1 replay: the first frames are used for the validation leg, the state frame is the last
        for fr in &mut frames {
            fr["ball"]["angular_velocity"] = json!([0.0, 0.0, 0.0]);
        }
        let mut a = analysis(frames.clone());
        a["summary"] = json!({"id":"r1","file_hash":"","file_name":"x","mode":"1v1","played_at":"2026-01-01T00:00:00Z","blue_score":1,"orange_score":0});
        a["metrics"] = json!([]);
        let (_d, s) = service_with_root(root.path());
        s.save_replay(&a).unwrap();
        // The stub's ball path = recorded path, sampled the way the engine reports it.
        let (wfirst, _) = free_flight_window(&frames, 90).unwrap();
        let t0 = frames[wfirst]["time"].as_f64().unwrap();
        let mut ball = vec![json!({"type":"rollout_start","secondsPerStep":8.0/120.0})];
        for k in 0..30 {
            let dt = k as f64 * 8.0 / 120.0;
            ball.push(json!({"type":"decision","step":k,"ball":{"pos":[300.0*(t0+dt),0.0,500.0]},"cars":[]}));
        }
        ball.push(json!({"type":"rollout_end","reason":"steps","steps":30}));
        let policy = lines(&[
            json!({"type":"rollout_start","secondsPerStep":8.0/120.0,"assumptions":["pads"]}),
            json!({"type":"decision","step":0,"ball":{"pos":[1,2,3],"vel":[0,0,0]},"cars":[{"id":0,"pos":[0,0,17],"vel":[0,0,0],"forward":[0,1,0],"up":[0,0,1],"boost":40,"onGround":true},{"id":1,"pos":[5,5,17],"vel":[0,0,0],"forward":[0,1,0],"up":[0,0,1],"boost":40,"onGround":true}],"actions":[8,8]}),
            json!({"type":"rollout_end","reason":"steps","steps":1}),
        ]);
        stub(
            &root.path().join("engine/build/bin"),
            &lines(&ball),
            &policy,
        );
        let r = s.sim_what_if("r1", 3.0, &json!({"steps":5})).unwrap();
        assert_eq!(r["status"], "ok", "{r}");
        assert!(r["label"]
            .as_str()
            .unwrap()
            .contains("unknown skill, not a model of any player"));
        assert!(r["label"].as_str().unwrap().contains("not a prediction"));
        assert_eq!(r["policy"]["run_id"], "run-1v1");
        assert_eq!(r["policy"]["measured_skill"], "none");
        assert_eq!(r["reconstruction_validation"]["status"], "validated");
        assert_eq!(r["decisions"][0]["cars"][1]["player_id"], "b");
        assert!(r["limitations"].as_array().unwrap().len() >= 3);
        // reconstruction that disagrees with the recorded ball is refused, not shown
        let shifted: Vec<Value> = ball
            .iter()
            .map(|l| {
                let mut l = l.clone();
                if l["type"] == "decision" {
                    l["ball"]["pos"][1] = json!(500.0);
                }
                l
            })
            .collect();
        stub(
            &root.path().join("engine/build/bin"),
            &lines(&shifted),
            &policy,
        );
        let r = s.sim_what_if("r1", 3.0, &json!({"steps":5})).unwrap();
        assert_eq!(r["status"], "refused", "{r}");
        assert!(r["reasons"][0]
            .as_str()
            .unwrap()
            .contains("reconstruction check failed"));
        assert!(r.get("decisions").is_none());
        // 2v2 replay has no trained checkpoint
        let mut b = a.clone();
        b["summary"]["id"] = "r2".into();
        b["summary"]["file_hash"] = "h2".into();
        b["summary"]["mode"] = "2v2".into();
        s.save_replay(&b).unwrap();
        let r = s.sim_what_if("r2", 3.0, &json!({})).unwrap();
        assert_eq!(r["status"], "unavailable");
        assert!(r["reason"].as_str().unwrap().contains("2v2"));
        assert!(s.sim_what_if("r1", 3.0, &json!({"steps":9999})).is_err());
    }
}
