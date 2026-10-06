use serde::{Deserialize, Serialize};

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub team: u8,
    pub platform: Option<String>,
    pub is_bot: bool,
    #[serde(default)]
    pub camera: Option<CameraProfile>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize)]
pub struct ReplaySummary {
    pub id: String,
    pub file_hash: String,
    pub file_name: String,
    pub replay_name: String,
    pub played_at: Option<String>,
    pub mode: String,
    pub duration_seconds: f64,
    pub blue_score: Option<i32>,
    pub orange_score: Option<i32>,
    pub players: Vec<Player>,
    pub status: String,
    pub error: Option<String>,
    pub source_path: String,
    pub match_type: Option<String>,
    pub playlist_id: Option<i32>,
    pub recorder_name: Option<String>,
    pub recorder_player_id: Option<String>,
    pub content_hash: String,
    pub map_name: Option<String>,
}

#[derive(specta::Type, Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Body {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub velocity: Option<[f32; 3]>,
    /// rad/s, quantized to 0.01. Absent in frames stored before analysis-3.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub angular_velocity: Option<[f32; 3]>,
}

#[derive(specta::Type, Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Car {
    pub player_id: String,
    #[serde(flatten)]
    pub body: Body,
    pub boost: Option<f32>,
    pub discontinuity: bool,
    /// Raw replicated controller bytes, 128 neutral. None means not replicated/unavailable
    /// (including every frame stored before analysis-3), never "neutral".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub throttle: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steer: Option<u8>,
    /// Replicated component parity bits (odd = active). None = unavailable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub boost_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jump_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub double_jump_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dodge_active: Option<bool>,
    /// Replicated handbrake/powerslide boolean.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handbrake: Option<bool>,
    /// Only recorded while dodge_active is true; quantized to 0.01.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dodge_torque: Option<[f32; 3]>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub time: f64,
    pub ball: Option<Body>,
    pub cars: Vec<Car>,
    pub match_clock_seconds: Option<i32>,
    #[serde(default)]
    pub overtime: Option<bool>,
    pub live_play: bool,
    /// Frame marks the beginning of a new continuous motion segment.
    pub discontinuity: bool,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize)]
pub struct Metric {
    #[serde(default)]
    pub numerator: Option<f64>,
    #[serde(default)]
    pub denominator: Option<f64>,
    #[serde(default)]
    pub metric_version: Option<String>,
    pub player_id: String,
    pub key: String,
    pub label: String,
    pub value: Option<f64>,
    pub unit: String,
    pub sample_count: usize,
    pub confidence: String,
    pub description: String,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub player_id: Option<String>,
    #[serde(default)]
    pub team: Option<u8>,
    pub time: f64,
    pub end_time: f64,
    pub category: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub confidence: String,
    pub metric_keys: Vec<String>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize)]
pub struct Coverage {
    pub metadata: bool,
    pub positions: bool,
    pub boost: bool,
    pub goals: bool,
    pub touches: bool,
    pub decoded_frames: usize,
    pub render_frames: usize,
    pub live_play_seconds: f64,
    pub notes: Vec<String>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize)]
pub struct ReplayAnalysis {
    pub summary: ReplaySummary,
    pub players: Vec<Player>,
    pub frames: Vec<Frame>,
    pub metrics: Vec<Metric>,
    pub events: Vec<Event>,
    pub coverage: Coverage,
    /// Version of the frame/event capture schema. None = captured before analysis-3.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_version: Option<String>,
    /// Boost pad pickups at native frame rate (not render-sampled).
    #[serde(default)]
    pub pad_events: Vec<PadEvent>,
    /// Replay-reported shot/save/assist events with the player and ball state at the event.
    #[serde(default)]
    pub shots: Vec<StatSample>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PadEvent {
    pub time: f64,
    pub frame: usize,
    pub pad_id: String,
    pub player_id: Option<String>,
    pub player_position: Option<[f32; 3]>,
    pub sequence: u8,
}

/// Replay-reported statistic event. `kind` is shot | save | assist. Shot geometry is the
/// decoder's measurement at the touch; it is not a probability or an expected-goals value.
#[derive(specta::Type, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StatSample {
    pub time: f64,
    pub frame: usize,
    pub kind: String,
    pub player_id: String,
    pub team: u8,
    pub player_position: Option<[f32; 3]>,
    #[serde(default)]
    pub shot: Option<ShotSample>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShotSample {
    pub touch_position: [f32; 3],
    pub ball_position: [f32; 3],
    pub ball_velocity: Option<[f32; 3]>,
    pub ball_speed: Option<f32>,
    pub player_velocity: Option<[f32; 3]>,
    pub player_speed: Option<f32>,
    pub player_distance_to_ball: Option<f32>,
    pub distance_to_goal_center: f32,
    pub distance_to_goal_line: f32,
    pub ball_goal_alignment: Option<f32>,
    pub ball_speed_toward_goal: Option<f32>,
}

#[derive(specta::Type, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CameraProfile {
    pub fov: f32,
    pub distance: f32,
    pub height: f32,
    pub angle: f32,
    pub stiffness: f32,
}
impl CameraProfile {
    pub fn is_valid(&self) -> bool {
        [
            (self.fov, 60., 110.),
            (self.distance, 100., 400.),
            (self.height, 40., 200.),
            (self.angle, -15., 0.),
            (self.stiffness, 0., 1.),
        ]
        .iter()
        .all(|(v, lo, hi)| v.is_finite() && v >= lo && v <= hi)
    }
}
