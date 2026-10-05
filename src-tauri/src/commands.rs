use crate::{ingest, AppState};
use serde_json::Value;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_library(state: State<'_, AppState>) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_library())
        .await
        .map_err(|_| "Library task failed".to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn import_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: Option<String>,
) -> Result<Value, String> {
    let configured = state.service.get_settings()?;
    let folder = folder.unwrap_or_else(|| {
        configured["replay_folder"]
            .as_str()
            .unwrap_or_default()
            .to_string()
    });
    let library = ingest::import(&app, &state, &folder).await?;
    if let Ok(canonical) = std::fs::canonicalize(&folder) {
        let _ = state.service.save_settings(
            serde_json::json!({"replay_folder": canonical.to_string_lossy().to_string()}),
        );
    }
    Ok(library)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn import_single_file(
    app: AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> Result<Value, String> {
    ingest::import_single_file(&app, &state, &file_path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_replay(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_replay(&id))
        .await
        .map_err(|_| "Replay loading task failed".to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_replay(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.delete_replay(&id))
        .await
        .map_err(|_| "Delete replay task failed".to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_progress(
    state: State<'_, AppState>,
    player_id: Option<String>,
) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_progress(player_id.as_deref()))
        .await
        .map_err(|_| "Progress task failed".to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_teammates(
    state: State<'_, AppState>,
    player_id: String,
) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_teammates(&player_id))
        .await
        .map_err(|_| "Teammates task failed".to_string())?
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Value, String> {
    state.service.get_settings()
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Value) -> Result<Value, String> {
    state.service.save_settings(settings)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_models(state: State<'_, AppState>, provider: String) -> Result<Value, String> {
    state.service.list_models(&provider).await
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_api_key(state: State<AppState>, provider: String, key: String) -> Result<(), String> {
    state.service.set_api_key(&provider, &key)
}

#[tauri::command]
pub fn get_ai_status(state: State<AppState>) -> Result<Value, String> {
    state.service.get_ai_status()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn chat(
    state: State<'_, AppState>,
    message: String,
    replay_id: Option<String>,
    player_id: Option<String>,
    conversation_id: Option<String>,
) -> Result<Value, String> {
    state
        .service
        .chat(
            &message,
            replay_id.as_deref(),
            player_id.as_deref(),
            conversation_id.as_deref(),
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn analyze_with_ai(
    state: State<'_, AppState>,
    replay_id: String,
    player_id: String,
) -> Result<Value, String> {
    state.service.analyze_with_ai(&replay_id, &player_id).await
}

#[tauri::command]
pub fn get_conversations(state: State<AppState>) -> Result<Value, String> {
    state.service.get_conversations()
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_messages(state: State<AppState>, conversation_id: String) -> Result<Value, String> {
    state.service.get_messages(&conversation_id)
}

#[tauri::command]
pub fn get_memory(state: State<AppState>) -> Result<Value, String> {
    state.service.get_memory()
}

#[tauri::command(rename_all = "snake_case")]
pub fn save_memory(state: State<AppState>, name: String, content: String) -> Result<(), String> {
    state.service.save_memory(&name, &content)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_memory(state: State<AppState>, name: String) -> Result<(), String> {
    state.service.delete_memory(&name)
}

#[tauri::command]
pub async fn start_chatgpt_sign_in(state: State<'_, AppState>) -> Result<Value, String> {
    state.service.start_chatgpt_sign_in().await
}

#[tauri::command]
pub fn sign_out_chatgpt(state: State<AppState>) -> Result<(), String> {
    state.service.sign_out_chatgpt()
}

#[tauri::command]
pub fn cancel_import(state: State<AppState>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn cancel_ai(state: State<AppState>) -> Result<(), String> {
    state.service.cancel_ai();
    Ok(())
}
