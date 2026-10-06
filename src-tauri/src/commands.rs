use crate::{dto::*, errors::AppError, ingest, AppState};
use serde_json::Value;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| AppError::Internal("Background operation failed".into()))?
        .map_err(AppError::from)
}
async fn blocking_dto<T: serde::de::DeserializeOwned + Send + 'static>(
    work: impl FnOnce() -> Result<Value, String> + Send + 'static,
) -> Result<T, AppError> {
    decode(blocking(work).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_library(state: State<'_, AppState>) -> Result<LibraryDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_library()).await
}
#[tauri::command]
#[specta::specta]
pub async fn import_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: Option<String>,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    let configured = blocking(move || s.get_settings()).await?;
    let folder = folder.unwrap_or_else(|| {
        configured["replay_folder"]
            .as_str()
            .unwrap_or_default()
            .into()
    });
    let result = ingest::import(&app, &state, &folder).await?;
    let s = state.service.clone();
    blocking(move || {
        if let Ok(canonical) = std::fs::canonicalize(&folder) {
            s.save_settings(serde_json::json!({"replay_folder":canonical.to_string_lossy()}))?;
        }
        Ok(())
    })
    .await?;
    Ok(result)
}
#[tauri::command]
#[specta::specta]
pub async fn import_single_file(
    app: AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> Result<Value, AppError> {
    ingest::import_single_file(&app, &state, &file_path)
        .await
        .map_err(AppError::from)
}
#[tauri::command]
#[specta::specta]
pub async fn get_import_status(state: State<'_, AppState>) -> Result<Vec<ImportEntry>, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_import_status()).await
}
#[tauri::command]
#[specta::specta]
pub async fn retry_failed_imports(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: String,
) -> Result<Value, AppError> {
    ingest::retry_failed(&app, &state, &folder)
        .await
        .map_err(AppError::from)
}
#[tauri::command]
#[specta::specta]
pub async fn get_replay(
    state: State<'_, AppState>,
    id: String,
) -> Result<replay_core::ReplayAnalysis, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_replay(&id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_coach_replay(state: State<'_, AppState>, id: String) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.get_coach_replay(&id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn delete_replay(
    state: State<'_, AppState>,
    id: String,
    remove_snapshot: Option<bool>,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.delete_replay_with_snapshot(&id, remove_snapshot.unwrap_or(true))).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_progress(
    state: State<'_, AppState>,
    player_id: Option<String>,
) -> Result<ProgressDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_progress(player_id.as_deref())).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_teammates(
    state: State<'_, AppState>,
    player_id: String,
) -> Result<Vec<TeammateDto>, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_teammates(&player_id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_settings()).await
}
#[tauri::command]
#[specta::specta]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: Value,
) -> Result<SettingsDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.save_settings(settings)).await
}
#[tauri::command]
#[specta::specta]
pub async fn list_models(
    state: State<'_, AppState>,
    provider: String,
) -> Result<ModelCatalog, AppError> {
    decode(state.service.list_models(&provider).await?)
}
#[tauri::command]
#[specta::specta]
pub async fn set_api_key(
    state: State<'_, AppState>,
    provider: String,
    key: String,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.set_api_key(&provider, &key)).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_ai_status(state: State<'_, AppState>) -> Result<AiStatusDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_ai_status()).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_cloud_preview(
    state: State<'_, AppState>,
    message: String,
    replay_id: Option<String>,
    player_id: Option<String>,
    conversation_id: Option<String>,
) -> Result<CloudPreviewDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || {
        s.get_cloud_preview(
            &message,
            replay_id.as_deref(),
            player_id.as_deref(),
            conversation_id.as_deref(),
        )
    })
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn chat(
    state: State<'_, AppState>,
    message: String,
    replay_id: Option<String>,
    player_id: Option<String>,
    conversation_id: Option<String>,
    on_update: tauri::ipc::Channel<String>,
) -> Result<ChatResultDto, AppError> {
    decode(
        state
            .service
            .chat_stream(
                &message,
                replay_id.as_deref(),
                player_id.as_deref(),
                conversation_id.as_deref(),
                Some(Box::new(move |delta| {
                    let _ = on_update.send(delta);
                })),
            )
            .await?,
    )
}
#[tauri::command]
#[specta::specta]
pub async fn analyze_with_ai(
    state: State<'_, AppState>,
    replay_id: String,
    player_id: String,
) -> Result<Value, AppError> {
    state
        .service
        .analyze_with_ai(&replay_id, &player_id)
        .await
        .map_err(AppError::from)
}
#[tauri::command]
#[specta::specta]
pub async fn get_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<ConversationDto>, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_conversations()).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<MessageDto>, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_messages(&conversation_id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_memory(state: State<'_, AppState>) -> Result<Vec<MemoryDto>, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_memory()).await
}
#[tauri::command]
#[specta::specta]
pub async fn save_memory(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.save_memory(&name, &content)).await
}
#[tauri::command]
#[specta::specta]
pub async fn delete_memory(state: State<'_, AppState>, name: String) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.delete_memory(&name)).await
}
#[tauri::command]
#[specta::specta]
pub async fn start_chatgpt_sign_in(state: State<'_, AppState>) -> Result<Value, AppError> {
    state
        .service
        .start_chatgpt_sign_in()
        .await
        .map_err(AppError::from)
}
#[tauri::command]
#[specta::specta]
pub async fn sign_out_chatgpt(state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .service
        .sign_out_chatgpt()
        .await
        .map_err(AppError::from)
}
#[tauri::command]
#[specta::specta]
pub async fn cancel_import(state: State<'_, AppState>) -> Result<(), AppError> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn get_player_candidates(
    state: State<'_, AppState>,
) -> Result<Vec<IdentityCandidate>, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_player_candidates().map(Value::Array)).await
}
#[tauri::command]
#[specta::specta]
pub async fn resolve_identity(state: State<'_, AppState>) -> Result<IdentityDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || Ok(s.resolve_identity())).await
}
#[tauri::command]
#[specta::specta]
pub async fn cancel_ai(state: State<'_, AppState>) -> Result<(), AppError> {
    state.service.cancel_ai();
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn create_conversation(
    state: State<'_, AppState>,
    mode: String,
    preset: String,
) -> Result<ConversationDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.create_conversation(&mode, &preset)).await
}
#[tauri::command]
#[specta::specta]
pub async fn update_conversation(
    state: State<'_, AppState>,
    id: String,
    title: String,
    archived: bool,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.update_conversation(&id, &title, archived)).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_context_manifest(
    state: State<'_, AppState>,
    mode: String,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || {
        let id = s.resolve_player_id(None);
        s.analytics_context(id.as_deref(), &mode)
    })
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn rebuild_analytics(state: State<'_, AppState>) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.rebuild_analytics()).await
}
#[tauri::command]
#[specta::specta]
pub async fn search_training_packs(
    state: State<'_, AppState>,
    query: String,
    mode: String,
) -> Result<TrainingPackCatalogDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.search_training_packs(&query, &mode, 10)).await
}
#[tauri::command]
#[specta::specta]
pub async fn get_practice(
    state: State<'_, AppState>,
    mode: String,
) -> Result<PracticeDataDto, AppError> {
    let s = state.service.clone();
    blocking_dto(move || s.get_practice(&mode)).await
}
#[tauri::command]
#[specta::specta]
pub async fn save_practice_plan(
    state: State<'_, AppState>,
    mode: String,
    body: PracticePlanInput,
) -> Result<PracticePlanDto, AppError> {
    let s = state.service.clone();
    let body = serde_json::to_value(body)
        .map_err(|_| AppError::Validation("Invalid practice plan".into()))?;
    blocking_dto(move || s.save_practice_plan(&mode, &body)).await
}
#[tauri::command]
#[specta::specta]
pub async fn record_training(
    state: State<'_, AppState>,
    mode: String,
    plan_id: String,
    minutes: f64,
    difficulty: String,
    notes: String,
    completed_at: Option<String>,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || {
        s.record_training_at(
            &mode,
            &plan_id,
            minutes,
            &difficulty,
            &notes,
            completed_at.as_deref(),
        )
    })
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn start_transfer(
    state: State<'_, AppState>,
    mode: String,
    plan_id: String,
    metric_key: Option<String>,
    reference_replay_id: Option<String>,
    replay_offset_minutes: Option<i32>,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || {
        s.start_transfer(
            &mode,
            &plan_id,
            metric_key.as_deref(),
            reference_replay_id.as_deref(),
            replay_offset_minutes,
        )
    })
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn save_transfer_checkin(
    state: State<'_, AppState>,
    mode: String,
    cycle_id: String,
    replay_id: String,
    state_value: String,
    notes: String,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.save_transfer_checkin(&mode, &cycle_id, &replay_id, &state_value, &notes))
        .await
}
#[tauri::command]
#[specta::specta]
pub async fn archive_practice(
    state: State<'_, AppState>,
    mode: String,
    id: String,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.archive_practice(&mode, &id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn evidence_tool(
    state: State<'_, AppState>,
    tool: String,
    mode: String,
    args: Value,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.evidence_tool(&tool, &mode, &args)).await
}
#[tauri::command]
#[specta::specta]
pub async fn export_conversation(
    app: AppHandle,
    format: String,
    snapshot: Value,
) -> Result<bool, AppError> {
    use tauri_plugin_dialog::DialogExt;
    if !["md", "txt", "json"].contains(&format.as_str()) {
        return Err(AppError::Validation("Unsupported export format".into()));
    }
    blocking(move || {
        let messages = snapshot["messages"].as_array().ok_or("Missing visible messages")?;
        if messages.len() > 10000 { return Err("Conversation too large".into()); }
        let safe = serde_json::json!({"title":snapshot["title"],"mode":snapshot["mode"],"preset":snapshot["preset"],"messages":messages.iter().map(|m|serde_json::json!({"role":m["role"],"content":m["content"],"timestamp":m["timestamp"],"status":m["status"],"replay_id":m["replay_id"],"evidence_ids":m["evidence_ids"],"context_manifest":m["context_manifest"],"legacy_warning":m["legacy_warning"]})).collect::<Vec<_>>()});
        let text = if format == "json" { serde_json::to_string_pretty(&safe).map_err(|e|e.to_string())? } else {
            let mut text = format!("{}\nMode: {} | Focus: {}\n\n",safe["title"].as_str().unwrap_or("AntiRL chat"),safe["mode"].as_str().unwrap_or("All"),safe["preset"].as_str().unwrap_or("Balanced"));
            for m in messages { text.push_str(&format!("{} · {} · {}\n{}\nEvidence: {}\nScope: {}\n\n",m["role"].as_str().unwrap_or(""),m["timestamp"].as_str().unwrap_or(""),m["status"].as_str().unwrap_or("complete"),m["content"].as_str().unwrap_or(""),m["evidence_ids"],m["context_manifest"])); }
            text
        };
        if text.len() > 10_000_000 { return Err("Export exceeds 10 MB".into()); }
        let selected = app.dialog().file().add_filter("Conversation", &[format.as_str()]).set_file_name(format!("AntiRL-chat.{format}")).blocking_save_file();
        if let Some(path) = selected { std::fs::write(path.into_path().map_err(|e|e.to_string())?, text).map_err(|e|e.to_string())?; Ok(true) } else { Ok(false) }
    }).await
}

#[tauri::command]
#[specta::specta]
pub async fn camera_profile(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.camera_profile()).await
}
#[tauri::command]
#[specta::specta]
pub async fn reset_camera_profile(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.reset_camera_profile()).await
}
#[tauri::command]
#[specta::specta]
pub async fn detector_reports(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.detector_reports()).await
}
#[tauri::command]
#[specta::specta]
pub async fn save_camera_profile(
    state: State<'_, AppState>,
    body: Value,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.save_camera_profile(&body)).await
}
#[tauri::command]
#[specta::specta]
pub async fn review_situation(
    state: State<'_, AppState>,
    mode: String,
    replay_id: String,
    event_id: String,
    verdict: String,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.review_situation(&mode, &replay_id, &event_id, &verdict)).await
}
#[tauri::command]
#[specta::specta]
pub async fn drill_from_fingerprint(
    state: State<'_, AppState>,
    mode: String,
    fingerprint: String,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.drill_from_fingerprint(&mode, &fingerprint)).await
}
#[tauri::command]
#[specta::specta]
pub async fn save_detector_report(
    state: State<'_, AppState>,
    replay_id: String,
    player_id: String,
    body: Value,
) -> Result<(), AppError> {
    let s = state.service.clone();
    blocking(move || s.save_detector_report(&replay_id, &player_id, &body)).await
}

// Detector, xG and simulation. The backend computes everything; the UI only sends ids, times and
// bounded options. Results are flexible documents with explicit status/limitation fields.
#[tauri::command]
#[specta::specta]
pub async fn bot_likeness(
    state: State<'_, AppState>,
    replay_id: String,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.bot_likeness(&replay_id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn set_bot_label(
    state: State<'_, AppState>,
    replay_id: String,
    player_id: String,
    confirmed_bot: Option<bool>,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.set_bot_label(&replay_id, &player_id, confirmed_bot)).await
}
#[tauri::command]
#[specta::specta]
pub async fn bot_labels(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.bot_labels()).await
}
#[tauri::command]
#[specta::specta]
pub async fn bot_calibration_report(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.bot_calibration_report()).await
}
#[tauri::command]
#[specta::specta]
pub async fn xg_model_status(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.xg_model_status()).await
}
#[tauri::command]
#[specta::specta]
pub async fn xg_replay_shots(
    state: State<'_, AppState>,
    replay_id: String,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.xg_replay_shots(&replay_id)).await
}
#[tauri::command]
#[specta::specta]
pub async fn xg_player_summary(state: State<'_, AppState>) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.xg_player_summary()).await
}
#[tauri::command]
#[specta::specta]
pub async fn sim_status(state: State<'_, AppState>, probe: bool) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.sim_status(probe)).await
}
#[tauri::command]
#[specta::specta]
pub async fn set_sim_path(state: State<'_, AppState>, path: String) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.set_sim_path(&path)).await
}
#[tauri::command]
#[specta::specta]
pub async fn sim_reconstruct_state(
    state: State<'_, AppState>,
    replay_id: String,
    time: f64,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.sim_reconstruct_state(&replay_id, time)).await
}
#[tauri::command]
#[specta::specta]
pub async fn sim_validate_ball(
    state: State<'_, AppState>,
    replay_id: String,
    time: f64,
) -> Result<Value, AppError> {
    let s = state.service.clone();
    blocking(move || s.sim_validate_ball(&replay_id, time)).await
}
#[tauri::command]
#[specta::specta]
pub async fn sim_what_if(
    state: State<'_, AppState>,
    replay_id: String,
    time: f64,
    options: SimOptionsInput,
) -> Result<Value, AppError> {
    if !time.is_finite() || time < 0.0 {
        return Err(AppError::Validation("Time must be a non-negative number".into()));
    }
    let s = state.service.clone();
    let options = options.into_value();
    blocking(move || s.sim_what_if(&replay_id, time, &options)).await
}
