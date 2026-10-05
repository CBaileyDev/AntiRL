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
pub async fn get_coach_replay(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_coach_replay(&id))
        .await.map_err(|_| "Coaching evidence task failed".to_string())?
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
    on_update: tauri::ipc::Channel<String>,
) -> Result<Value, String> {
    state
        .service
        .chat_stream(
            &message,
            replay_id.as_deref(),
            player_id.as_deref(),
            conversation_id.as_deref(),
            Some(Box::new(move |text| { let _ = on_update.send(text); })),
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
pub async fn get_player_candidates(state: State<'_, AppState>) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_player_candidates().map(Value::Array))
        .await
        .map_err(|_| "Player candidates task failed".to_string())?
}

#[tauri::command]
pub async fn resolve_identity(state: State<'_, AppState>) -> Result<Value, String> {
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.resolve_identity())
        .await
        .map_err(|_| "Identity task failed".to_string())
}

#[tauri::command]
pub fn cancel_ai(state: State<AppState>) -> Result<(), String> {
    state.service.cancel_ai();
    Ok(())
}

#[tauri::command(rename_all="snake_case")]
pub fn create_conversation(state:State<AppState>, mode:String,preset:String)->Result<Value,String>{state.service.create_conversation(&mode,&preset)}
#[tauri::command(rename_all="snake_case")]
pub fn update_conversation(state:State<AppState>,id:String,title:String,archived:bool)->Result<(),String>{state.service.update_conversation(&id,&title,archived)}
#[tauri::command(rename_all="snake_case")]
pub async fn get_context_manifest(state:State<'_,AppState>,mode:String)->Result<Value,String>{
 let s=state.service.clone(); tokio::task::spawn_blocking(move || {let id=s.resolve_player_id(None);s.analytics_context(id.as_deref(),&mode)}).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn rebuild_analytics(state:State<'_,AppState>)->Result<(),String>{let s=state.service.clone();tokio::task::spawn_blocking(move ||s.rebuild_analytics()).await.map_err(|e|e.to_string())?}
#[tauri::command(rename_all="snake_case")]
pub fn search_training_packs(state:State<AppState>,query:String,mode:String)->Result<Value,String>{state.service.search_training_packs(&query,&mode,10)}
#[tauri::command(rename_all="snake_case")]
pub async fn export_conversation(app:AppHandle,format:String,snapshot:Value)->Result<bool,String>{
 use tauri_plugin_dialog::DialogExt;
 if !["md","txt","json"].contains(&format.as_str()){return Err("Unsupported export format".into());}
 // Snapshot contains visible messages and scope only, never hidden prompts/settings/credentials.
 let messages=snapshot["messages"].as_array().ok_or("Missing visible messages")?;
 if messages.len()>10000{return Err("Conversation too large".into());}
 let safe=serde_json::json!({"title":snapshot["title"],"mode":snapshot["mode"],"preset":snapshot["preset"],"messages":messages.iter().map(|m|serde_json::json!({"role":m["role"],"content":m["content"],"timestamp":m["timestamp"],"status":m["status"],"replay_id":m["replay_id"],"evidence_ids":m["evidence_ids"],"context_manifest":m["context_manifest"],"legacy_warning":m["legacy_warning"]})).collect::<Vec<_>>()});
 let text=if format=="json"{serde_json::to_string_pretty(&safe).map_err(|e|e.to_string())?}else{
  let mut text=format!("{}\nMode: {} | Focus: {}\n\n",safe["title"].as_str().unwrap_or("AntiRL chat"),safe["mode"].as_str().unwrap_or("All"),safe["preset"].as_str().unwrap_or("Balanced"));
  for m in safe["messages"].as_array().unwrap(){text.push_str(&format!("{} · {} · {}\n{}\nEvidence: {}\nScope: {}\n\n",m["role"].as_str().unwrap_or(""),m["timestamp"].as_str().unwrap_or(""),m["status"].as_str().unwrap_or("complete"),m["content"].as_str().unwrap_or(""),m["evidence_ids"],m["context_manifest"]));}text
 };
 if text.len()>10_000_000{return Err("Export exceeds 10 MB".into());}
 tokio::task::spawn_blocking(move ||{let selected=app.dialog().file().add_filter("Conversation",&[format.as_str()]).set_file_name(format!("AntiRL-chat.{format}")).blocking_save_file();
 if let Some(path)=selected {let path=path.into_path().map_err(|e|e.to_string())?;std::fs::write(path,text).map_err(|e|e.to_string())?;Ok(true)}else{Ok(false)}}).await.map_err(|e|e.to_string())?
}
