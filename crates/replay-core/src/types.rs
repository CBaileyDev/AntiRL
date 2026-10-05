use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub team: u8,
    pub platform: Option<String>,
    pub is_bot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Body {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub velocity: Option<[f32; 3]>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Car {
    pub player_id: String,
    #[serde(flatten)]
    pub body: Body,
    pub boost: Option<f32>,
    pub discontinuity: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub time: f64,
    pub ball: Option<Body>,
    pub cars: Vec<Car>,
    pub match_clock_seconds: Option<i32>,
    pub live_play: bool,
    /// Frame marks the beginning of a new continuous motion segment.
    pub discontinuity: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayAnalysis {
    pub summary: ReplaySummary,
    pub players: Vec<Player>,
    pub frames: Vec<Frame>,
    pub metrics: Vec<Metric>,
    pub events: Vec<Event>,
    pub coverage: Coverage,
}
