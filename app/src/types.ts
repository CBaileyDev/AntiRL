export interface Player {
  id: string;
  name: string;
  team: number;
  platform?: string | null;
  is_bot: boolean;
}

export interface ReplaySummary {
  id: string;
  file_hash: string;
  file_name: string;
  replay_name: string;
  played_at?: string | null;
  mode: string;
  duration_seconds: number;
  blue_score?: number | null;
  orange_score?: number | null;
  players: Player[];
  status: string;
  error?: string | null;
  source_path: string;
  match_type?: string | null;
  playlist_id?: number | null;
  recorder_name?: string | null;
  recorder_player_id?: string | null;
  content_hash: string;
  map_name?: string | null;
}

export interface Body {
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number] | null;
}

export interface Car {
  player_id: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number] | null;
  boost?: number | null;
  discontinuity: boolean;
}

export interface Frame {
  time: number;
  ball?: Body | null;
  cars: Car[];
  match_clock_seconds?: number | null;
  live_play: boolean;
  discontinuity: boolean;
}

export interface Metric {
  player_id: string;
  key: string;
  label: string;
  value?: number | null;
  unit: string;
  sample_count: number;
  confidence: string;
  description: string;
}

export interface Event {
  id: string;
  player_id?: string | null;
  team?: number | null;
  time: number;
  end_time: number;
  category: string;
  title: string;
  description: string;
  severity: "review" | "strength" | "critical" | string;
  confidence: string;
  metric_keys: string[];
}

export interface Coverage {
  metadata: boolean;
  positions: boolean;
  boost: boolean;
  goals: boolean;
  touches: boolean;
  decoded_frames: number;
  render_frames: number;
  live_play_seconds: number;
  notes: string[];
}

export interface ReplayAnalysis {
  summary: ReplaySummary;
  players: Player[];
  frames: Frame[];
  metrics: Metric[];
  events: Event[];
  coverage: Coverage;
}

export interface Settings {
  replay_folder: string;
  player_id?: string | null;
  player_name?: string | null;
  modes: string[];
  focus: string[];
  provider: "neotoken" | "openai" | "chatgpt";
  chat_model: string;
  analysis_model: string;
  auto_import: boolean;
  cloud_consent: boolean;
  rank_1v1?: string | null;
  rank_2v2?: string | null;
  rank_3v3?: string | null;
  playstyle?: string | null;
  coach_persona?: string | null;
  onboarding_status?: "completed" | "skipped";
  primary_mode?: string;
  team_preference?: "unknown" | "solo" | "fixed";
  mode_profiles?: Record<string,{current_rank?:string|null;target_rank?:string|null;long_term_rank?:string|null;practice_hours?:number|null;match_hours?:number|null}>;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  mode?: string;
  preset?: string;
  prompt_version?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  body: {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
    status?:string;
    legacy_warning?:string;
    context_manifest?:any;
    evidence_ids?: string[];
    replay_id?: string | null;
  };
}

export interface MemoryNote {
  legacy_warning?: string | null;
  name: string;
  content: string;
  updated_at: string;
}

export interface ProgressReport {
  player_id?: string | null;
  player_name?: string | null;
  matches_analyzed: number;
  modes: {
    [mode: string]: {
      matches: number;
      wins?: number;
      win_rate: number;
      avg_boost: number;
      avg_speed: number;
      defensive_half_pct: number;
      low_boost_pct: number;
      boost_active_at_supersonic_speed_s: number;
    };
  };
  recurring_strengths: string[];
  recurring_priorities: string[];
  goals: { id: string; title: string; target: string; current: string; status: string }[];
}

export interface TeammateStats {
  player_id: string;
  name: string;
  platform?: string | null;
  shared_matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  last_played?: string | null;
}
