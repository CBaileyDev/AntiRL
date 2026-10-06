//! Validated, generated desktop contracts. Flexible analytical documents remain JSON.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use std::collections::BTreeMap;

pub fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, crate::errors::AppError> {
    serde_json::from_value(value).map_err(|_| {
        crate::errors::AppError::Internal("Backend response did not match its IPC contract".into())
    })
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ModeProfile {
    pub current_rank: Option<String>,
    pub target_rank: Option<String>,
    pub long_term_rank: Option<String>,
    pub practice_hours: Option<f64>,
    pub match_hours: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct SettingsDto {
    pub replay_folder: String,
    pub player_id: Option<String>,
    pub player_name: Option<String>,
    pub modes: Vec<String>,
    pub focus: Vec<String>,
    pub provider: String,
    pub chat_model: String,
    pub analysis_model: String,
    pub auto_import: bool,
    pub cloud_consent: bool,
    pub cloud_consent_provider: Option<String>,
    pub rank_1v1: Option<String>,
    pub rank_2v2: Option<String>,
    pub rank_3v3: Option<String>,
    pub playstyle: Option<String>,
    pub coach_persona: Option<String>,
    pub onboarding_status: Option<String>,
    pub primary_mode: Option<String>,
    pub team_preference: Option<String>,
    pub mode_profiles: Option<BTreeMap<String, ModeProfile>>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct IdentityCandidate {
    pub player_id: String,
    pub name: String,
    pub matches: u32,
    pub platform: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct IdentityDto {
    pub player_id: Option<String>,
    pub player_name: Option<String>,
    pub auto: bool,
    pub suggested_player_id: Option<String>,
    pub suggested_player_name: Option<String>,
}

#[derive(Serialize, Deserialize, Type)]
pub struct LibraryDto {
    pub count: u32,
    pub replays: Vec<replay_core::ReplaySummary>,
    pub identity_candidates: Vec<IdentityCandidate>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ConversationDto {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub mode: Option<String>,
    pub preset: Option<String>,
    pub prompt_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct MessageBody {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
    pub status: Option<String>,
    pub legacy_warning: Option<String>,
    pub replay_id: Option<String>,
    pub evidence_ids: Option<Vec<String>>,
    pub context_manifest: Option<Value>,
    pub source: Option<String>,
    pub error: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub preset: Option<String>,
    pub prompt_version: Option<String>,
    pub metric_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct MessageDto {
    pub id: String,
    pub conversation_id: String,
    pub body: MessageBody,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct MemoryDto {
    pub name: String,
    pub content: String,
    pub updated_at: String,
    pub legacy_warning: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TeammateDto {
    pub player_id: String,
    pub name: String,
    pub platform: Option<String>,
    pub shared_matches: u32,
    pub wins: u32,
    pub losses: u32,
    pub win_rate: f64,
    pub last_played: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ImportEntry {
    pub path: String,
    pub file_name: String,
    pub size: f64,
    pub mtime_ns: String,
    pub file_hash: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PracticePlanInput {
    pub title: String,
    pub drill: String,
    pub success_criterion: String,
    pub next_match_cue: String,
    pub intended_minutes: Option<f64>,
    pub pack_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ModeProgress {
    pub matches: u32,
    pub wins: Option<u32>,
    pub win_rate: Option<f64>,
    pub avg_boost: Option<f64>,
    pub avg_speed: Option<f64>,
    pub defensive_half_pct: Option<f64>,
    pub low_boost_pct: Option<f64>,
    pub boost_active_at_supersonic_speed_s: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct GoalDto {
    pub id: String,
    pub title: String,
    pub target: String,
    pub current: String,
    pub status: String,
    pub legacy_warning: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ProgressDto {
    pub player_id: Option<String>,
    pub player_name: Option<String>,
    pub matches_analyzed: u32,
    pub modes: BTreeMap<String, ModeProgress>,
    pub recurring_strengths: Vec<String>,
    pub recurring_priorities: Vec<String>,
    pub goals: Vec<GoalDto>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ModelDto {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ModelCatalog {
    pub provider: String,
    pub models: Vec<ModelDto>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ProviderStatus {
    pub configured: Option<bool>,
    pub endpoint: Option<String>,
    pub default_model: Option<String>,
    pub status: Option<String>,
    pub reason: Option<String>,
    pub email: Option<String>,
    pub supported: Option<bool>,
    pub expires_at: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct AiStatusDto {
    pub current_provider: String,
    pub cloud_consent: bool,
    pub chat_model: String,
    pub analysis_model: String,
    pub providers: BTreeMap<String, ProviderStatus>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct CloudPreviewDto {
    pub provider: String,
    pub endpoint: Option<String>,
    pub model: String,
    pub characters: u32,
    pub upper_bound_characters: u32,
    pub approx_tokens: u32,
    pub estimated: bool,
    pub cost_label: String,
    pub categories: Vec<String>,
    pub estimate_note: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ChatResultDto {
    pub conversation_id: String,
    pub response: String,
    pub status: String,
    pub error: Option<String>,
    pub evidence_ids: Option<Vec<String>>,
    pub replay_id: Option<String>,
    pub context_chars: Option<u32>,
    pub context_manifest: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PracticePlanBodyDto {
    pub title: String,
    pub drill: String,
    pub success_criterion: String,
    pub next_match_cue: String,
    pub intended_minutes: Option<f64>,
    pub pack_id: Option<String>,
    pub provenance: String,
    pub prompt_version: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PracticePlanDto {
    pub id: String,
    pub mode: String,
    pub body: PracticePlanBodyDto,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TrainingSessionBodyDto {
    pub completed_minutes: f64,
    pub difficulty: String,
    pub notes: String,
    pub provenance: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TrainingSessionDto {
    pub plan_id: String,
    pub body: TrainingSessionBodyDto,
    pub completed_at: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PracticeDataDto {
    pub plans: Vec<PracticePlanDto>,
    pub sessions: Vec<TrainingSessionDto>,
    pub source: String,
    pub forecast: String,
    pub reassessment: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TrainingPackDto {
    pub id: String,
    pub code: String,
    pub title: String,
    pub creator: String,
    pub difficulty: String,
    pub skill_tags: Vec<String>,
    pub modes: Vec<String>,
    pub source_url: String,
    pub source_date: String,
    pub last_checked: String,
    pub verification: String,
    pub in_game_tested: bool,
    pub source_excerpt: String,
    pub source_hash: String,
    pub prerequisites: String,
    pub drill_protocol: String,
    pub license_notes: String,
    pub success_criterion: String,
    pub regression: String,
    pub progression: String,
    pub next_match_cue: String,
    pub freeplay_alternative: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TrainingPackCatalogDto {
    pub records: Vec<TrainingPackDto>,
    pub source: String,
    pub live_search: String,
    pub verification: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn practice_and_catalog_contracts_match_service_payloads() {
        let data = tempfile::tempdir().unwrap();
        let service = coach_services::CoachService::open(data.path()).unwrap();
        service
            .save_settings(serde_json::json!({"player_id":"synthetic:contract"}))
            .unwrap();
        let plan: PracticePlanDto = decode(service.save_practice_plan("2v2", &serde_json::json!({
            "title":"Synthetic recovery", "drill":"Land on wheels", "success_criterion":"Five clean attempts",
            "next_match_cue":"Review one recovery", "intended_minutes":5
        })).unwrap()).unwrap();
        assert_eq!(plan.body.intended_minutes, Some(5.0));
        assert!(plan.body.provenance.contains("user-authored"));
        service
            .record_training("2v2", &plan.id, 4.0, "appropriate", "Synthetic session")
            .unwrap();
        let practice: PracticeDataDto = decode(service.get_practice("2v2").unwrap()).unwrap();
        assert_eq!(practice.plans.len(), 1);
        assert_eq!(practice.sessions[0].body.completed_minutes, 4.0);
        assert_eq!(practice.sessions[0].plan_id, plan.id);
        assert_eq!(practice.source, "self_report");
        let other: PracticeDataDto = decode(service.get_practice("1v1").unwrap()).unwrap();
        assert!(other.plans.is_empty() && other.sessions.is_empty());
        let catalog: TrainingPackCatalogDto =
            decode(service.search_training_packs("", "2v2", 10).unwrap()).unwrap();
        assert!(!catalog.records.is_empty());
        assert!(catalog
            .records
            .iter()
            .all(|pack| !pack.source_url.is_empty() && !pack.source_hash.is_empty()));
        assert!(decode::<PracticePlanDto>(
            serde_json::json!({"id":"broken","mode":"2v2","created_at":"2026-10-05","body":null})
        )
        .is_err());
    }
}
